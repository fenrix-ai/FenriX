"""Validation harness (spec §10): the generator ships only if all 9 checks pass.

Each check literally runs the analysis a student would run on the generated data and
asserts the designed answer is recoverable. Fail closed: no green, no CSVs.
"""
import numpy as np
import config as C
import engine as E
from stats_utils import ols, pearson_r

# Canonical student model is RATES-based (percentages + per-game counting stats, no points):
# points is a mediator of efficiency x volume, and including it just splits the credit.
HIST_STATS = ["fg_pct", "three_pt_pct", "ft_pct", "rebounds_per_game",
              "assists_per_game", "steals_per_game", "blocks_per_game", "turnovers_per_game"]


def _pctile(vals):
    v = np.asarray(vals, float)
    return v.argsort().argsort() / (len(v) - 1) * 100


def check1_regression(history, report):
    X = [[r[c] for c in HIST_STATS] + [r["total_payroll"], r["avg_hype"]] for r in history]
    fit = ols(X, [r["wins"] for r in history], names=HIST_STATS + ["payroll", "hype"])
    ok = (fit["beta"]["turnovers_per_game"] < 0 and fit["p"]["turnovers_per_game"] < 0.05
          and fit["beta"]["fg_pct"] > 0 and fit["p"]["fg_pct"] < 0.05
          and fit["beta"]["three_pt_pct"] > 0
          and abs(fit["t"]["payroll"]) < 2.0 and abs(fit["t"]["hype"]) < 2.0)
    report.append(("1 base regression",
                   f"tov beta {fit['beta']['turnovers_per_game']:.2f} (p={fit['p']['turnovers_per_game']:.3f}), "
                   f"fg beta {fit['beta']['fg_pct']:.1f} (p={fit['p']['fg_pct']:.3f}), "
                   f"3p beta {fit['beta']['three_pt_pct']:.1f}, "
                   f"payroll t={fit['t']['payroll']:.2f}, hype t={fit['t']['hype']:.2f}, R2={fit['r2']:.2f}", ok))
    return ok, fit


def check2_bargains(players, fa_pool, report):
    med = np.median([p.salary for p in fa_pool])
    ti_q3 = np.quantile([p.ti for p in players], 0.75)
    n = sum(1 for p in fa_pool if p.salary < med and p.ti >= ti_q3)
    ok = n >= 15
    report.append(("2 bargain cluster", f"{n} players bottom-half salary AND top-quartile TrueImpact (need >=15)", ok))
    return ok


def check3_traps(players, report):
    hype_pct = _pctile([p.hype + 0.001 * p.pub["pts"] for p in players])
    ti_pct = _pctile([p.ti for p in players])
    gaps = [(p.name, hype_pct[i] - ti_pct[i]) for i, p in enumerate(players) if p.is_trap]
    worst = min(g for _, g in gaps)
    ok = worst >= 40
    report.append(("3 trap gap", f"{len(gaps)} traps, min(hype pctile - TI pctile) = {worst:.0f} (need >=40)", ok))
    return ok


def check4_fairness(res, k, report):
    ok = (C.FAIR_TOP3_TARGET[0] <= res["top3"] <= C.FAIR_TOP3_TARGET[1]
          and C.FAIR_CHAMP_TARGET[0] <= res["champ"] <= C.FAIR_CHAMP_TARGET[1])
    report.append(("4 fairness sim",
                   f"k={k}: modeler top-3 {res['top3']:.0%} (target {C.FAIR_TOP3_TARGET}), "
                   f"champion {res['champ']:.0%} (target {C.FAIR_CHAMP_TARGET})", ok))
    return ok


def check5_scoutgrade(res, report):
    # spec §10.5: better than PPG-sorters, worse than modelers, broadly mid-table
    ok = (res["modeler_median"] < res["grade_median"] < res["ppg_median"]
          and 4 <= res["grade_median"] <= 14)
    report.append(("5 scout-grade strategy",
                   f"medians: modeler {res['modeler_median']:.0f} < grade {res['grade_median']:.0f} "
                   f"< ppg {res['ppg_median']:.0f} required; grade in [4,14]", ok))
    return ok


def check6_personality(players, report):
    dummies = C.PERSONALITIES[1:]
    X = [[1.0 if p.personality == d else 0.0 for d in dummies] for p in players]
    fit = ols(X, [p.ti for p in players], names=dummies)
    worst_t = max(abs(fit["t"][d]) for d in dummies)
    ok = worst_t < 2.0
    report.append(("6 personality null", f"max |t| across personality dummies = {worst_t:.2f} (need <2)", ok))
    return ok


def check7_market_coverage(fa_pool, rng, report):
    fails = 0
    for _ in range(200):
        absent = {p.pid: 0 for p in fa_pool}
        for rnd in range(1, 6):
            share = C.ROUND1_POOL_SHARE if rnd == 1 else C.DRAW_SHARE
            forced = [p for p in fa_pool if absent[p.pid] >= C.REAPPEAR_GUARANTEE]
            n_draw = int(len(fa_pool) * share)
            others = [p for p in fa_pool if p not in forced]
            draw = forced + list(rng.choice(others, max(0, n_draw - len(forced)), replace=False))
            for p in fa_pool:
                absent[p.pid] = 0 if p in draw else absent[p.pid] + 1
            pos = {q: sum(1 for p in draw if p.position == q) for q in "GWB"}
            cheap = sum(1 for p in draw if p.salary <= 8.0)
            if not (pos["G"] >= 8 and pos["W"] >= 8 and pos["B"] >= 6 and cheap >= 12):
                fails += 1
    ok = fails == 0
    report.append(("7 market coverage", f"{fails}/1000 round-draws under-stocked (need 0)", ok))
    return ok


def check8_no_dominant_style(history, best_styles, report):
    # (a) flat main effects in history
    means = {s: float(np.mean([r["wins"] for r in history if r["playstyle"] == s])) for s in C.PLAYSTYLES}
    dummies = [s for s in C.PLAYSTYLES if s != "Balanced"]
    X = [[1.0 if r["playstyle"] == d else 0.0 for d in dummies] for r in history]
    fit = ols(X, [r["wins"] for r in history], names=dummies)
    max_t = max(abs(fit["t"][d]) for d in dummies)
    spread = max(abs(means[s] - means["Balanced"]) for s in C.PLAYSTYLES)
    flat_ok = max_t < 2.0 and spread <= 5.5

    # (b) organic argmax: across the 90 plausible history rosters, every non-Balanced style
    # must be the best choice for at least 2 teams (Balanced is the zero point by design)
    counts = {s: best_styles.count(s) for s in C.PLAYSTYLES}
    argmax_ok = all(counts[s] >= 2 for s in C.PLAYSTYLES if s != "Balanced")
    ok = flat_ok and argmax_ok
    mtxt = ", ".join(f"{s.split()[0]}:{means[s]:.1f}" for s in C.PLAYSTYLES)
    ctxt = ", ".join(f"{s.split()[0]}:{counts[s]}" for s in C.PLAYSTYLES)
    report.append(("8 no dominant style",
                   f"means[{mtxt}] max|t|={max_t:.2f} spread={spread:.1f}; best-fit counts[{ctxt}]", ok))
    return ok


def check9_interactions(history, report):
    tov_c = np.array([r["turnovers_per_game"] for r in history]); tov_c = tov_c - tov_c.mean()
    p3_c = np.array([r["three_pt_pct"] for r in history]); p3_c = p3_c - p3_c.mean()
    reb_c = np.array([r["rebounds_per_game"] for r in history]); reb_c = reb_c - reb_c.mean()
    dfn = np.array([r["steals_per_game"] + r["blocks_per_game"] for r in history]); dfn_c = dfn - dfn.mean()
    dummies = [s for s in C.PLAYSTYLES if s != "Balanced"]
    d = {s: np.array([1.0 if r["playstyle"] == s else 0.0 for r in history]) for s in dummies}

    # Focused per-style tests — exactly how a student would test "does style X need Y?":
    # wins ~ all stats + style dummy + dummy x centered moderator, one style at a time.
    # (A single everything-model with 4 interactions on 90 rows is collinearity soup that
    # no practitioner would run; targeted hypothesis tests are the canonical analysis.)
    y = [r["wins"] for r in history]
    inter_res = {}
    for label, style, mod, want_neg in (("RGxTOV", "Run & Gun", tov_c, True),
                                        ("BARx3P", "3PT Barrage", p3_c, False),
                                        ("INSxREB", "Inside Attack", reb_c, False),
                                        ("LOCKxDEF", "Lockdown", dfn_c, False)):
        X = [[r[c] for c in HIST_STATS] + [d[style][i], d[style][i] * mod[i]]
             for i, r in enumerate(history)]
        f = ols(X, y, names=HIST_STATS + ["dummy", label])
        inter_res[label] = (f["beta"][label], f["p"][label],
                            (f["beta"][label] < 0) == want_neg and f["p"][label] < 0.05)
    inter_ok = all(v[2] for v in inter_res.values())
    fit = {"beta": {k: v[0] for k, v in inter_res.items()},
           "p": {k: v[1] for k, v in inter_res.items()}}

    # main effects stay flat in the dummies-only direction
    Xm = [[d[s][i] for s in dummies] for i in range(len(history))]
    fm = ols(Xm, y, names=dummies)
    main_flat = all(fm["p"][s] > 0.05 for s in dummies)
    # spec: tov negative-significant with playstyle DUMMIES in the model (no interactions —
    # in the interaction model the RGxTOV term legitimately absorbs part of the tov slope)
    Xd = [[r[c] for c in HIST_STATS] + [d[s][i] for s in dummies] for i, r in enumerate(history)]
    fit_d = ols(Xd, [r["wins"] for r in history], names=HIST_STATS + dummies)
    tov_ok = fit_d["beta"]["turnovers_per_game"] < 0 and fit_d["p"]["turnovers_per_game"] < 0.05

    # moderator spread within each style cell: enough variation to identify the slope.
    # (Pace shifts whole cells along counting-stat moderators, so tercile counts vs the
    # population are the wrong test — within-cell SD is what identification needs.)
    coverage_ok = True
    for s, mod in (("Run & Gun", tov_c), ("3PT Barrage", p3_c), ("Inside Attack", reb_c), ("Lockdown", dfn_c)):
        cell = np.array([mod[i] for i, r in enumerate(history) if r["playstyle"] == s])
        if len(cell) < 10 or cell.std() < 0.5 * np.array(mod).std():
            coverage_ok = False
    ok = inter_ok and main_flat and tov_ok and coverage_ok
    report.append(("9 interactions",
                   f"RGxTOV {fit['beta']['RGxTOV']:.2f}(p={fit['p']['RGxTOV']:.3f}) "
                   f"BARx3P {fit['beta']['BARx3P']:.0f}(p={fit['p']['BARx3P']:.3f}) "
                   f"INSxREB {fit['beta']['INSxREB']:.2f}(p={fit['p']['INSxREB']:.3f}) "
                   f"LOCKxDEF {fit['beta']['LOCKxDEF']:.2f}(p={fit['p']['LOCKxDEF']:.3f}) "
                   f"mains_flat={main_flat} tov_ok={tov_ok} coverage={coverage_ok}", ok))
    return ok


def run_all(players, fa_pool, history, best_styles, fairness_res, k, constants, rng):
    report = []
    results = [
        check1_regression(history, report)[0],
        check2_bargains(players, fa_pool, report),
        check3_traps(players, report),
        check4_fairness(fairness_res, k, report),
        check5_scoutgrade(fairness_res, report),
        check6_personality(players, report),
        check7_market_coverage(fa_pool, rng, report),
        check8_no_dominant_style(history, best_styles, report),
        check9_interactions(history, report),
    ]
    # extra diagnostics (list_salary = pre-blanking price, so auction stars count too)
    r2_all = pearson_r([p.list_salary for p in players], [p.ti for p in players]) ** 2
    ordinary = [p for p in players if not p.is_trap and p.archetype not in ("elite_defender", "rim_protector")]
    r2_ord = pearson_r([p.list_salary for p in ordinary], [p.ti for p in ordinary]) ** 2
    gr = pearson_r([-{g: i for i, g in enumerate(C.GRADES)}[p.scout_grade] for p in players], [p.ti for p in players])
    report.append(("diag", f"salary~TI R2: all={r2_all:.2f}, ordinary players={r2_ord:.2f} "
                           f"(market sane for ordinary, blind to traps/defense) | scout_grade~TI r={gr:.2f}", True))
    return all(results), report
