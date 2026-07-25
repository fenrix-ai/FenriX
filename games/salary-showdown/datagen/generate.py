"""Salary Showdown dataset generator — main entry point.

Usage:  python3 generate.py [--force]

Pipeline: players -> market -> auction waves -> tune k (per-k provisional history + refit
student model) -> final history -> harness (11 checks + diagnostics) -> write outputs.
Fails closed: without --force nothing is written unless every check passes.
"""
import csv
import json
import os
import sys

import numpy as np

import config as C
import attributes as A
import market as M
import engine as E
import history as H
import fairness as F
import harness

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
PRIVATE = os.path.join(HERE, "private")
BACKEND_DATA = os.path.normpath(os.path.join(HERE, "..", "backend", "functions", "src", "data"))

PLAYER_COLS = ["player_id", "name", "position", "age", "years_pro", "hype", "salary_per_round",
               "auction_round", "personality", "scout_grade", "social_media_followers",
               "games_played", "mins_per_game", "pts_per_game", "fg_attempts_per_game",
               "fg_pct", "three_pt_pct", "ft_pct", "rebounds_per_game", "assists_per_game",
               "steals_per_game", "blocks_per_game", "turnovers_per_game",
               "prev_pts_per_game", "prev_fg_pct", "prev_mins_per_game"]

HISTORY_COLS = ["team_name", "season", "wins", "losses", "pts_per_game", "fg_pct", "three_pt_pct",
                "ft_pct", "rebounds_per_game", "assists_per_game", "steals_per_game",
                "blocks_per_game", "turnovers_per_game", "total_payroll", "avg_hype", "playstyle"]


def player_row(p):
    return {
        "player_id": p.pid, "name": p.name, "position": p.position, "age": p.age,
        "years_pro": p.years_pro, "hype": f"{p.hype:.1f}",
        "salary_per_round": "" if p.auction_round else f"{p.salary:.1f}",
        "auction_round": p.auction_round or "", "personality": p.personality,
        "scout_grade": p.scout_grade, "social_media_followers": p.followers,
        "games_played": p.pub["games_played"], "mins_per_game": f"{p.pub['mins']:.1f}",
        "pts_per_game": f"{p.pub['pts']:.1f}", "fg_attempts_per_game": f"{p.pub['fga']:.1f}",
        "fg_pct": f"{p.pub['fg_pct']:.3f}", "three_pt_pct": f"{p.pub['three_pt_pct']:.3f}",
        "ft_pct": f"{p.pub['ft_pct']:.3f}", "rebounds_per_game": f"{p.pub['rebounds']:.1f}",
        "assists_per_game": f"{p.pub['assists']:.1f}", "steals_per_game": f"{p.pub['steals']:.1f}",
        "blocks_per_game": f"{p.pub['blocks']:.1f}", "turnovers_per_game": f"{p.pub['turnovers']:.1f}",
        "prev_pts_per_game": f"{p.pub['prev_pts']:.1f}", "prev_fg_pct": f"{p.pub['prev_fg_pct']:.3f}",
        "prev_mins_per_game": f"{p.pub['prev_mins']:.1f}",
    }


def hidden_row(p):
    return {
        "player_id": p.pid, "name": p.name, "archetype": p.archetype, "is_trap": int(p.is_trap),
        "usage": round(p.attrs["usage"], 1), "efficiency": round(p.attrs["efficiency"], 1),
        "three_pt": round(p.attrs["three_pt"], 1), "playmaking": round(p.attrs["playmaking"], 1),
        "ball_security": round(p.attrs["ball_security"], 1), "defense": round(p.attrs["defense"], 1),
        "age_drift": round(C.age_drift(p.age), 3), "ti_raw": round(p.ti_raw, 2), "ti": round(p.ti, 2),
        "sv_interior": round(p.comps["sv_interior"], 2), "sv_three": round(p.comps["sv_three"], 2),
        "play_comp": round(p.comps["play"], 2), "defense_comp": round(p.comps["defense"], 2),
        "tov_comp": round(p.comps["tov"], 2),
    }


def write_csv(path, cols, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def main(force=False):
    rng = np.random.default_rng(C.SEED)
    print(f"seed={C.SEED} schema=v{C.SCHEMA_VERSION}")

    # league anchors are ORDER-DEPENDENT module globals: reset explicitly, then require
    # that the main pool (and nothing else) sets them. history/mini-populations REUSE them;
    # attributes.generate_players / market.apply_market raise if a mini-population would
    # anchor them first.
    A.reset_anchors()
    M.reset_norms()
    assert A.PPS_SCALE is None and M.NORMS is None

    players = A.generate_players(rng)
    M.apply_market(players, rng)
    assert A.PPS_SCALE is not None, "main pool failed to set PPS_SCALE"
    assert M.NORMS is not None and "hype_raw" in M.NORMS, "main pool failed to set market NORMS"
    pps_scale_main, norms_main = A.PPS_SCALE, M.NORMS
    M.assign_auction(players, rng)
    fa_pool = [p for p in players if p.auction_round == 0]
    print(f"pool: {len(players)} players ({len(fa_pool)} FA, {len(players)-len(fa_pool)} auction)")

    print("tuning k (per-k provisional history + refit student model) ...")

    def fit_for_k(k):
        hist_k, constants_k, _, _ = H.build_history(rng, k)
        return F.student_model(hist_k), constants_k

    k, _ = F.tune_k(fa_pool, rng, fit_for_k)
    print(f"k={k}")

    print("final history ...")
    history, constants, best_styles, syn_flags = H.build_history(rng, k)
    weights = F.student_model(history)
    assert A.PPS_SCALE is pps_scale_main and M.NORMS is norms_main, (
        "league anchors were recomputed after the main pool — history must reuse, never recompute")

    print("fairness sims ...")
    fairness_res = F.run_fairness(fa_pool, weights, rng, k, constants)

    ok, report, wins_fit = harness.run_all(players, fa_pool, history, best_styles, syn_flags,
                                           fairness_res, k, constants, rng)
    lines = [f"Salary Showdown data harness — seed {C.SEED}, schema v{C.SCHEMA_VERSION}", ""]
    for name, detail, passed in report:
        lines.append(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")
    print("\n".join(lines[2:]))

    if not ok and not force:
        print("\nHARNESS FAILED — nothing written. Fix dials in config.py and rerun.")
        return 1

    os.makedirs(DATA, exist_ok=True)
    os.makedirs(PRIVATE, exist_ok=True)
    write_csv(os.path.join(DATA, "players.csv"), PLAYER_COLS, [player_row(p) for p in players])
    write_csv(os.path.join(DATA, "league_history.csv"), HISTORY_COLS, history)
    hidden_cols = list(hidden_row(players[0]).keys())
    write_csv(os.path.join(PRIVATE, "hidden_attributes.csv"), hidden_cols, [hidden_row(p) for p in players])
    ti_weights = dict(base=C.TI_BASE, scoring=C.W_SCORING, playmaking=C.W_PLAYMAKING,
                      steal=C.W_STEAL, block=C.W_BLOCK, rebound=C.W_REBOUND,
                      turnover=C.W_TURNOVER)
    with open(os.path.join(PRIVATE, "engine_params.json"), "w") as f:
        json.dump(dict(schema_version=C.SCHEMA_VERSION, seed=C.SEED, logistic_k=k,
                       style_constants=constants, tier_weights=C.TIER_WEIGHTS,
                       style_delta=C.STYLE_DELTA, pace=C.PACE,
                       synergy=dict(shooter_3pt_skill=C.SHOOTER_3PT_SKILL, rim_block_skill=C.RIM_BLOCK_SKILL,
                                    spacing_penalty=C.SPACING_PENALTY, spacing_bonus=C.SPACING_BONUS,
                                    rim_penalty=C.RIM_PENALTY, rim_bonus=C.RIM_BONUS, rim_elite=C.RIM_ELITE,
                                    barrage_misfire=C.BARRAGE_MISFIRE),
                       ti_weights=ti_weights), f, indent=2)
    with open(os.path.join(PRIVATE, "harness_report.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")

    # Plan 3a §4.5 — additive export: both sides of the finale's weights-comparison
    # chart. `engine` is the SAME ti_weights dict serialized into engine_params.json
    # above (shared object => the files cannot drift); `regression` is the harness's
    # OWN check-1 OLS on league_history.csv (wins_fit) — the exact analysis a student
    # would run — NEVER hand-typed numbers. Verify the designed properties before
    # shipping the card so the reveal can never overstate the data:
    assert wins_fit["p"]["turnovers_per_game"] < 0.001, (
        f"turnover p={wins_fit['p']['turnovers_per_game']:.6f} not <0.001 — "
        "reveal_weights.json turnoverP='<0.001' would overstate significance")
    assert abs(wins_fit["t"]["payroll"]) < 2.0 and abs(wins_fit["t"]["hype"]) < 2.0, (
        "payroll/hype are not null effects — check 1 should have failed before this")
    reveal_weights = dict(
        engine=ti_weights,
        regression=dict(winsR2=round(float(wins_fit["r2"]), 2),
                        turnoverCoef=round(float(wins_fit["beta"]["turnovers_per_game"]), 2),
                        turnoverP="<0.001",
                        payrollT=round(float(wins_fit["t"]["payroll"]), 2),
                        hypeT=round(float(wins_fit["t"]["hype"]), 2)))
    with open(os.path.join(PRIVATE, "reveal_weights.json"), "w") as f:
        json.dump(reveal_weights, f, indent=2)
    os.makedirs(BACKEND_DATA, exist_ok=True)
    with open(os.path.join(BACKEND_DATA, "reveal_weights.json"), "w") as f:
        json.dump(reveal_weights, f, indent=2)
    print(f"\nWrote {DATA}/players.csv, {DATA}/league_history.csv, private files -> {PRIVATE}/")
    print(f"Wrote reveal_weights.json -> {PRIVATE}/ and {BACKEND_DATA}/")
    return 0


if __name__ == "__main__":
    sys.exit(main(force="--force" in sys.argv))
