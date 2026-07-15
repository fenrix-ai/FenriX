"""league_history.csv generation: synthetic league seasons run through the REAL engine.

Integrity guarantee (spec §7.1): this table is never hand-written. Every relationship a
student can discover in it is true in the game they are about to play.

Style assignment is RANDOMIZED with equal counts (18 team-seasons per style): flat main
effects and full moderator spread within every style cell hold by construction, and
misfit teams exist automatically. Style deltas are variance-normalized and zero-centered
on this exact population (engine.calibrate_style_params), so no style dominates.
"""
import numpy as np
import config as C
import attributes as A
import market as M
import engine as E
from names import HISTORY_TEAMS

# identity archetype-sampling biases -> creates moderator spread across teams
IDENTITIES = {
    "clean_machine":  dict(efficient_star=2, floor_general=2, elite_defender=1, sharpshooter=1, journeyman=2),
    "sloppy_runners": dict(volume_trap=2, young_riser=2, journeyman=3, sharpshooter=1),
    "shooter_stack":  dict(sharpshooter=3, floor_general=1, efficient_star=1, journeyman=3),
    "brick_squad":    dict(rim_protector=2, elite_defender=2, volume_trap=1, journeyman=3),
    "fortress":       dict(elite_defender=3, rim_protector=2, floor_general=1, journeyman=2),
    "star_vehicle":   dict(aging_legend=1, volume_trap=1, efficient_star=1, journeyman=5),
    "grab_bag":       dict(journeyman=4, young_riser=1, two_way_wing=2, sharpshooter=1),
    "wing_corps":     dict(two_way_wing=3, efficient_star=1, floor_general=1, journeyman=3),
}


def _make_roster(rng, pid_start):
    ident = list(IDENTITIES.values())[int(rng.integers(0, len(IDENTITIES)))]
    saved = dict(C.ARCHETYPE_COUNTS)
    counts = {k: 0 for k in saved}
    for arch, n in ident.items():
        counts[arch] = n
    C.ARCHETYPE_COUNTS = counts
    try:
        roster = A.generate_players(rng, id_start=pid_start)
    finally:
        C.ARCHETYPE_COUNTS = saved
    # per-team quality tilt on the market's BLIND SPOTS only (efficiency, security,
    # shooting): widens the win spread without letting payroll track quality — the
    # "money doesn't buy wins" scatter stays flat by construction.
    tilts = {key: rng.normal(0, sd) for key, sd in C.HISTORY_QUALITY_TILT.items()}
    # independent perimeter/interior defense tilts (see C.DEFENSE_TILT_SD)
    d_per, d_int = rng.normal(0, C.DEFENSE_TILT_SD), rng.normal(0, C.DEFENSE_TILT_SD)
    d_by_pos = {"G": d_per, "W": 0.5 * (d_per + d_int), "B": d_int}
    for p in roster:
        for key, t in tilts.items():
            p.attrs[key] = float(np.clip(p.attrs[key] + t, 2, 98))
        p.attrs["defense"] = float(np.clip(p.attrs["defense"] + d_by_pos[p.position], 2, 98))
        p.exp = A.finalize_expected(A._expected_stats(p.attrs, p.position))
        A._fill_components(p)
        A._fill_published(p, rng)
    for pos, need in (("G", 2), ("W", 2), ("B", 1)):
        have = sum(1 for p in roster if p.position == pos)
        if have < need:
            for p in roster:
                if sum(1 for q in roster if q.position == p.position) > 2 and p.position != pos:
                    p.position = pos
                    p.exp = A.finalize_expected(A._expected_stats(p.attrs, pos))
                    A._fill_components(p)
                    A._fill_published(p, rng)
                    break
    return roster


def build_history(rng, k):
    """Returns (rows, style_params, best_styles, syn_flags)."""
    assert A.PPS_SCALE is not None and M.NORMS is not None, (
        "league anchors unset: history must REUSE the main pool's PPS_SCALE / market NORMS, "
        "never recompute them — generate the main pool first (see generate.py main())")
    n = C.N_HISTORY_TEAMS
    all_teams = []
    for season in range(1, C.N_HISTORY_SEASONS + 1):
        for t in range(n):
            roster = _make_roster(rng, pid_start=90000 + season * 1000 + t * 20)
            M.apply_market(roster, rng)
            starters, sixth, bench = E.pick_lineup(roster, metric=lambda p: p.ti_raw)
            viol = (E._shooters(starters) < 2
                    or E._rim_score(starters, sixth) < C.RIM_BLOCK_SKILL)
            all_teams.append(dict(season=season, idx=t, name=HISTORY_TEAMS[t], roster=roster,
                                  lineup=(starters, sixth, bench), syn_viol=viol))

    params = E.calibrate_style_params([tm["lineup"] for tm in all_teams])

    # record every team's best-fit style (for harness check 8b: each style must be
    # the argmax for at least a couple of plausible rosters)
    best_styles = []
    for tm in all_teams:
        st, sx, bn = tm["lineup"]
        scores = {s: E.team_strength(st, sx, bn, s, params, use_drift=False) for s in C.PLAYSTYLES}
        best_styles.append(max(scores, key=scores.get))

    # randomized, exactly-balanced style assignment across all team-seasons:
    #  * BLOCKED on pre-style (Balanced) strength — teams are sorted by talent and each
    #    consecutive block of 5 gets a random permutation of the 5 styles, so talent luck
    #    can't tilt a style's cell mean;
    #  * RERANDOMIZED on fit (Morgan & Rubin style) — among STYLE_ASSIGN_TRIES blocked
    #    draws, keep the one whose per-style cell-mean deltas are closest to zero. Cell
    #    MEANS are constrained (flat main effects by construction, check 8); within-cell
    #    delta VARIATION — what identifies the check-9 interactions — is untouched.
    base_strength = {id(tm): E.team_strength(*tm["lineup"], "Balanced", params, use_drift=False)
                     for tm in all_teams}
    by_talent = sorted(all_teams, key=lambda tm: base_strength[id(tm)])
    delta = {id(tm): {s: E.style_delta(E.component_sums(*tm["lineup"], use_drift=False), s, params)
                      for s in C.PLAYSTYLES} for tm in all_teams}
    n_styles = len(C.PLAYSTYLES)
    best_assign, best_score = None, None
    for _ in range(C.STYLE_ASSIGN_TRIES):
        assign = {}
        for b in range(0, len(by_talent), n_styles):
            block = by_talent[b: b + n_styles]
            perm = rng.permutation(n_styles)[: len(block)]
            for tm, si in zip(block, perm):
                assign[id(tm)] = C.PLAYSTYLES[int(si)]
        score = max(abs(float(np.mean([delta[tid][s] for tid, st_ in assign.items() if st_ == s])))
                    for s in C.PLAYSTYLES)
        if best_score is None or score < best_score:
            best_assign, best_score = assign, score
            if score < 0.25:
                break
    for tm in all_teams:
        st, sx, bn = tm["lineup"]
        tm["style"] = best_assign[id(tm)]
        tm["strength"] = E.team_strength(st, sx, bn, tm["style"], params, use_drift=False)

    rows, syn_flags = [], []
    for season in range(1, C.N_HISTORY_SEASONS + 1):
        teams = [tm for tm in all_teams if tm["season"] == season]

        # 82 rounds of random perfect matchings -> total wins == total losses
        wins = np.zeros(n, dtype=int)
        idx = np.arange(n)
        for _ in range(C.HISTORY_GAMES):
            perm = rng.permutation(idx)
            for i in range(0, n, 2):
                a, b = perm[i], perm[i + 1]
                pa = E.win_prob(teams[a]["strength"], teams[b]["strength"],
                                teams[a]["style"], teams[b]["style"], k=k)
                if rng.random() < pa:
                    wins[a] += 1
                else:
                    wins[b] += 1

        for tm, w in zip(teams, wins):
            st, sx, bn = tm["lineup"]
            pace = C.PACE[tm["style"]]
            slots = E._slots(st, sx, bn)   # same tier weights as the strength model (C.TIER_WEIGHTS)
            tw = sum(wt for _, wt in slots)
            syn_flags.append(dict(viol=bool(tm["syn_viol"]), wins=int(w)))
            agg = lambda key: sum(p.exp[key] * wt for p, wt in slots)
            wavg = lambda key: agg(key) / tw
            cnoise = lambda: 1 + rng.normal(0, C.TEAM_STAT_NOISE)
            pnoise = lambda: rng.normal(0, C.PCT_NOISE)
            rows.append(dict(
                team_name=tm["name"], season=season, wins=int(w), losses=C.HISTORY_GAMES - int(w),
                pts_per_game=round(1.25 * agg("pts") * pace * cnoise(), 1),
                fg_pct=round(wavg("fg_pct") + pnoise(), 3),
                three_pt_pct=round(wavg("three_pt_pct") + pnoise(), 3),
                ft_pct=round(float(np.mean([p.pub["ft_pct"] for p, _ in slots])) + pnoise(), 3),
                rebounds_per_game=round(1.25 * agg("rebounds") * pace * cnoise(), 1),
                assists_per_game=round(1.25 * agg("assists") * pace * cnoise(), 1),
                steals_per_game=round(1.25 * agg("steals") * pace * cnoise(), 1),
                blocks_per_game=round(1.25 * agg("blocks") * pace * cnoise(), 1),
                turnovers_per_game=round(1.25 * agg("turnovers") * pace * cnoise(), 1),
                total_payroll=round(sum(p.list_salary for p in tm["roster"]), 1),
                avg_hype=round(float(np.mean([p.hype for p in tm["roster"]])), 2),
                playstyle=tm["style"],
            ))
    return rows, params, best_styles, syn_flags
