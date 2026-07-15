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
    """Greedy under cap + position minimums (3G/3W/2B in 8). metric_vals: {pid: score}.
    Invariant (asserted by callers): exactly ROSTER_SIZE players, >=3G/3W/2B, salary <= CAP."""
    sd = float(np.std(list(metric_vals.values()))) + 1e-9
    noisy = {p.pid: metric_vals[p.pid] + rng.normal(0, jitter * sd) for p in fa_pool}
    order = sorted(fa_pool, key=lambda p: -noisy[p.pid])
    roster, budget = [], C.CAP
    need = {"G": 3, "W": 3, "B": 2}
    pos_sorted = {pos: sorted((p for p in fa_pool if p.position == pos), key=lambda p: p.salary)
                  for pos in "GWB"}
    have = {"G": 0, "W": 0, "B": 0}
    in_roster = set()

    def reserve(pos, k, skip_pid):
        """Total salary of the k cheapest AVAILABLE players at pos (pool-global cheapest may
        already be on the roster — that was the old off-by-a-few-dollars bug)."""
        total = got = 0
        for q in pos_sorted[pos]:
            if q.pid in in_roster or q.pid == skip_pid:
                continue
            total += q.salary
            got += 1
            if got == k:
                break
        return total

    for p in order:
        if len(roster) == C.ROSTER_SIZE:
            break
        # direct feasibility: after adding p, the unmet minimums must fit the open slots
        deficit = {pos: max(0, n - have[pos] - (1 if p.position == pos else 0))
                   for pos, n in need.items()}
        if sum(deficit.values()) > C.ROSTER_SIZE - len(roster) - 1:
            continue
        must_reserve = sum(reserve(pos, k, p.pid) for pos, k in deficit.items() if k)
        if p.salary > budget - must_reserve + 1e-9:
            continue
        roster.append(p)
        in_roster.add(p.pid)
        have[p.position] += 1
        budget -= p.salary
    # patch any unmet position minimums; never exceed ROSTER_SIZE (swap, don't append)
    for pos, n in need.items():
        while sum(1 for q in roster if q.position == pos) < n:
            cands = [p for p in fa_pool if p.position == pos and p not in roster]
            if not cands:
                break
            add = min(cands, key=lambda p: p.salary)
            if len(roster) == C.ROSTER_SIZE or add.salary > budget + 1e-9:
                drop = max((q for q in roster
                            if sum(1 for r in roster if r.position == q.position) > need[q.position]),
                           key=lambda q: q.salary, default=None)
                if drop is None:
                    break
                roster.remove(drop)
                budget += drop.salary
                affordable = [p for p in cands if p.salary <= budget + 1e-9]
                if not affordable:
                    break
                add = min(affordable, key=lambda p: p.salary)
            roster.append(add)
            budget -= add.salary
    return roster


def _assert_legal(roster, tag):
    counts = {pos: sum(1 for p in roster if p.position == pos) for pos in "GWB"}
    total = sum(p.salary for p in roster)
    if (len(roster) != C.ROSTER_SIZE or counts["G"] < 3 or counts["W"] < 3 or counts["B"] < 2
            or total > C.CAP + 1e-6):
        raise AssertionError(
            f"illegal roster from build_roster ({tag}): size={len(roster)} counts={counts} "
            f"salary={total:.1f} (need exactly {C.ROSTER_SIZE}, >=3G/3W/2B, <= {C.CAP})")


def season_ranks(fa_pool, weights, rng, k, constants, n_teams=None):
    n_teams = n_teams or C.FAIR_N_TEAMS
    # team 0: modeler (absolute modeled score; spends the cap on quality, skips traps).
    # teams 1-9: PPG sorters. 10-14: scout-grade followers. 15-19: random.
    metrics, jitters = [], []
    mscore = {p.pid: model_score(p, weights) for p in fa_pool}
    metrics.append(dict(mscore)); jitters.append(0.20)   # student models are noisy estimates
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
        _assert_legal(roster, tag=f"team {t}")
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


def tune_k(fa_pool, rng, fit_for_k):
    """Pick k so the modeler's championship rate lands in the drama window.

    fit_for_k(k) -> (weights, constants) must REFIT the student model on a history built
    at that k: scoring every k with one stale provisional weight vector made the tuner see
    a uniformly weak modeler and degenerate to the lowest k (which then starved the
    interaction/defense signals of steepness)."""
    best_k, best_res, best_err = C.LOGISTIC_K, None, 9e9
    # grid floored at 0.05: interaction detectability (check 9) needs k >= ~0.05, and the
    # champ window (0.30, 0.62) is wide enough to absorb the modeler's edge at these k
    for k in (0.050, 0.055, 0.065, 0.075, 0.090):
        weights, constants = fit_for_k(k)
        res = run_fairness(fa_pool, weights, rng, k, constants, n_seasons=150)
        lo, hi = C.FAIR_CHAMP_TARGET
        mid = (lo + hi) / 2
        err = abs(res["champ"] - mid) + (0.0 if C.FAIR_TOP3_TARGET[0] <= res["top3"] <= C.FAIR_TOP3_TARGET[1] else 1.0)
        if err <= best_err + 1e-9:      # ties go to the HIGHER k: sharper games, stronger signals
            best_err, best_k, best_res = err, k, res
    return best_k, best_res
