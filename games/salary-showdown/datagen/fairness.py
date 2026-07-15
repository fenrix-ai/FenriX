"""Fairness sims (spec §10.4/10.5): does a model-following team reliably beat PPG-sorters,
without making the game deterministic? Also tunes LOGISTIC_K to hit the drama window.

Strategies build 8-man rosters from the FA pool (shared pool: copies allowed) under the cap,
then the season runs 5 rounds x round-robin through the real engine. Everyone plays Balanced
here; playstyle fairness is check 8's job.
"""
import numpy as np
import config as C
import engine as E
from stats_utils import ols

STAT_COLS = ["fg_pct", "three_pt_pct", "ft_pct", "rebounds", "assists", "steals", "blocks", "turnovers"]
HIST_COLS = ["fg_pct", "three_pt_pct", "ft_pct", "rebounds_per_game", "assists_per_game",
             "steals_per_game", "blocks_per_game", "turnovers_per_game"]


def student_model(history_rows):
    """The regression a diligent team would run: wins ~ team stats (payroll/hype dropped
    after they see the flat scatter). Returns per-stat weights."""
    X = [[r[c] for c in HIST_COLS] for r in history_rows]
    y = [r["wins"] for r in history_rows]
    fit = ols(X, y, names=HIST_COLS)
    return {c: fit["beta"][c] for c in HIST_COLS}


def model_score(p, weights):
    stats = dict(fg_pct=p.pub["fg_pct"], three_pt_pct=p.pub["three_pt_pct"],
                 ft_pct=p.pub["ft_pct"], rebounds=p.pub["rebounds"], assists=p.pub["assists"],
                 steals=p.pub["steals"], blocks=p.pub["blocks"], turnovers=p.pub["turnovers"])
    return sum(weights[h] * stats[s] for h, s in zip(HIST_COLS, STAT_COLS))


GRADE_RANK = {g: i for i, g in enumerate(C.GRADES)}   # A+ = 0 (best)


def build_roster(fa_pool, metric_vals, rng, jitter=0.12):
    """Greedy under cap + position minimums (3G/3W/2B in 8). metric_vals: {pid: score}."""
    sd = float(np.std(list(metric_vals.values()))) + 1e-9
    noisy = {p.pid: metric_vals[p.pid] + rng.normal(0, jitter * sd) for p in fa_pool}
    order = sorted(fa_pool, key=lambda p: -noisy[p.pid])
    roster, budget = [], C.CAP
    need = {"G": 3, "W": 3, "B": 2}
    cheapest = {pos: min(p.salary for p in fa_pool if p.position == pos) for pos in "GWB"}
    for p in order:
        if len(roster) == C.ROSTER_SIZE:
            break
        slots_left = C.ROSTER_SIZE - len(roster) - 1
        must_reserve = sum(max(0, n - sum(1 for q in roster if q.position == pos) - (1 if p.position == pos else 0))
                           * cheapest[pos] for pos, n in need.items())
        open_pos = sum(max(0, n - sum(1 for q in roster if q.position == pos)) for pos, n in need.items())
        if p.salary > budget - must_reserve:
            continue
        if open_pos > slots_left + 1 and sum(1 for q in roster if q.position == p.position) >= need[p.position] + (slots_left + 1 - open_pos):
            continue
        roster.append(p)
        budget -= p.salary
    # patch any unmet position minimums with cheapest options
    for pos, n in need.items():
        while sum(1 for q in roster if q.position == pos) < n:
            cands = [p for p in fa_pool if p.position == pos and p not in roster and p.salary <= budget + max((q.salary for q in roster if q.position != pos and sum(1 for r in roster if r.position == q.position) > need[q.position]), default=0)]
            if not cands:
                break
            add = min(cands, key=lambda p: p.salary)
            if add.salary > budget:
                drop = max((q for q in roster if q.position != pos and sum(1 for r in roster if r.position == q.position) > need[q.position]),
                           key=lambda q: q.salary, default=None)
                if drop is None:
                    break
                roster.remove(drop)
                budget += drop.salary
            roster.append(add)
            budget -= add.salary
    return roster


def season_ranks(fa_pool, weights, rng, k, constants, n_teams=None):
    n_teams = n_teams or C.FAIR_N_TEAMS
    # team 0: modeler (absolute modeled score; spends the cap on quality, skips traps).
    # teams 1-9: PPG sorters. 10-14: scout-grade followers. 15-19: random.
    metrics, jitters = [], []
    mscore = {p.pid: model_score(p, weights) for p in fa_pool}
    metrics.append(dict(mscore)); jitters.append(0.25)   # student models are noisy estimates
    for _ in range(6):
        metrics.append({p.pid: p.pub["pts"] for p in fa_pool}); jitters.append(0.12)
    for _ in range(3):   # efficiency-aware amateurs: points, but discounted for bricks
        metrics.append({p.pid: p.pub["pts"] * (p.pub["fg_pct"] / 0.46) for p in fa_pool}); jitters.append(0.12)
    for _ in range(5):
        metrics.append({p.pid: -GRADE_RANK[p.scout_grade] + 0.01 * p.pub["pts"] for p in fa_pool}); jitters.append(0.25)
    for _ in range(5):
        metrics.append({p.pid: rng.random() for p in fa_pool}); jitters.append(0.0)

    strengths = np.zeros(n_teams)
    for t in range(n_teams):
        roster = build_roster(fa_pool, metrics[t], rng, jitter=jitters[t])
        lineup_metric = (lambda p: mscore[p.pid]) if t == 0 else (lambda p: metrics[t][p.pid])
        st, sx, bn = E.pick_lineup(roster, lineup_metric)
        strengths[t] = E.team_strength(st, sx, bn, "Balanced", constants, use_drift=True)

    wins = np.zeros(n_teams)
    for a in range(n_teams):
        for b in range(a + 1, n_teams):
            pa = E.win_prob(strengths[a], strengths[b], k=k)
            w = rng.binomial(C.FAIR_ROUNDS, pa)
            wins[a] += w
            wins[b] += C.FAIR_ROUNDS - w
    order = np.argsort(-(wins + strengths * 1e-6))     # strength as micro-tiebreak (point diff proxy)
    ranks = np.empty(n_teams, dtype=int)
    ranks[order] = np.arange(1, n_teams + 1)
    return ranks


def run_fairness(fa_pool, weights, rng, k, constants, n_seasons=None):
    n = n_seasons or C.FAIR_N_SEASONS
    top3 = champ = 0
    grade_ranks, ppg_ranks, model_ranks = [], [], []
    for _ in range(n):
        r = season_ranks(fa_pool, weights, rng, k, constants)
        top3 += r[0] <= 3
        champ += r[0] == 1
        model_ranks.append(r[0])
        ppg_ranks += list(r[1:10])
        grade_ranks += list(r[10:15])
    return dict(top3=top3 / n, champ=champ / n,
                modeler_median=float(np.median(model_ranks)),
                ppg_median=float(np.median(ppg_ranks)),
                grade_median=float(np.median(grade_ranks)))


def tune_k(fa_pool, weights, rng, constants):
    """Pick k so the modeler's championship rate lands in the drama window."""
    best_k, best_res, best_err = C.LOGISTIC_K, None, 9e9
    for k in (0.030, 0.040, 0.045, 0.050, 0.055, 0.065, 0.075, 0.090):
        res = run_fairness(fa_pool, weights, rng, k, constants, n_seasons=150)
        lo, hi = C.FAIR_CHAMP_TARGET
        mid = (lo + hi) / 2
        err = abs(res["champ"] - mid) + (0.0 if C.FAIR_TOP3_TARGET[0] <= res["top3"] <= C.FAIR_TOP3_TARGET[1] else 1.0)
        if err <= best_err + 1e-9:      # ties go to the HIGHER k: sharper games, stronger signals
            best_err, best_k, best_res = err, k, res
    return best_k, best_res
