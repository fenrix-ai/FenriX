"""The game engine: lineups -> team strength (synergy + zero-mean playstyle deltas) -> games.

This module is the reference implementation the Cloud Functions port must match.
Playstyle constants come from calibrate_style_constants() and ship in engine_params.json.
"""
import numpy as np
import config as C


def pick_lineup(roster, metric):
    """Greedy legal lineup maximizing an additive metric: top-2 G, top-2 W, top-1 B start;
    best remaining is sixth man; rest bench."""
    srt = sorted(roster, key=metric, reverse=True)
    need = dict(C.LINEUP)
    starters = []
    for p in srt:
        if need.get(p.position, 0) > 0:
            starters.append(p)
            need[p.position] -= 1
    rest = [p for p in srt if p not in starters]
    return starters, (rest[0] if rest else None), rest[1:]


def _slots(starters, sixth, bench):
    s = [(p, C.TIER_WEIGHTS["starter"]) for p in starters]
    if sixth:
        s.append((sixth, C.TIER_WEIGHTS["sixth"]))
    s += [(p, C.TIER_WEIGHTS["bench"]) for p in bench[:2]]
    return s


def component_sums(starters, sixth, bench, use_drift=True):
    """Slot-weighted, drift-scaled component sums the style deltas operate on."""
    S = dict(score=0.0, three=0.0, interior=0.0, defense=0.0, tov=0.0,
             big_score=0.0, guard_score=0.0, big_reb=0.0, reb_total=0.0, play=0.0,
             base=0.0, security=0.0, shooting=0.0, stocks=0.0,
             shooters=float(_shooters(starters)))
    for p, w in _slots(starters, sixth, bench):
        d = (p.ti / p.ti_raw if p.ti_raw else 1.0) if use_drift else 1.0
        sc = (p.comps["sv_interior"] + p.comps["sv_three"]) * d
        S["score"] += w * sc
        S["three"] += w * p.comps["sv_three"] * d
        S["interior"] += w * p.comps["sv_interior"] * d
        S["defense"] += w * p.comps["defense"] * d
        S["tov"] += w * p.comps["tov"] * d
        S["play"] += w * p.comps["play"] * d
        S["security"] += w * p.comps["sec_value"] * d
        S["shooting"] += w * p.comps["shooting"]
        S["reb_total"] += w * p.comps["reb_only"] * d
        S["stocks"] += w * p.comps["stocks"] * d
        S["base"] += w * C.TI_BASE
        if p.position == "B":
            S["big_score"] += w * sc
            S["big_reb"] += w * p.comps["reb_only"] * d
        elif p.position == "G":
            S["guard_score"] += w * sc
    return S


def _shooters(starters):
    return sum(1 for p in starters if p.attrs["three_pt"] >= C.SHOOTER_3PT_SKILL)


def _rim_score(starters, sixth):
    best = 0.0
    for p in starters + ([sixth] if sixth else []):
        s = p.attrs["defense"] if p.position == "B" else (0.6 * p.attrs["defense"] if p.position == "W" else 0.0)
        best = max(best, s)
    return best


def raw_delta(S, style):
    d = sum(coef * S[key] for key, coef in C.STYLE_DELTA[style].items())
    if style == "3PT Barrage" and S["shooters"] < 3:
        d += C.BARRAGE_MISFIRE     # inside raw delta so calibration centers it too
    return d


def style_delta(S, style, params):
    p = params.get(style, {"scale": 1.0, "const": 0.0})
    return p["scale"] * raw_delta(S, style) + p["const"]


def team_strength(starters, sixth, bench, style="Balanced", params=None, use_drift=True):
    params = params or {}
    S = component_sums(starters, sixth, bench, use_drift)
    total = (S["base"] + C.W_SCORING * S["score"] + S["play"] + S["defense"] - S["tov"]
             + style_delta(S, style, params))
    sh = _shooters(starters)
    if sh < 2:
        total += C.SPACING_PENALTY
    elif sh >= 3:
        total += C.SPACING_BONUS
    # (Barrage misfire lives inside raw_delta so calibration keeps styles zero-mean)
    rim = _rim_score(starters, sixth)
    if rim >= C.RIM_ELITE:
        total += C.RIM_BONUS
    elif rim < C.RIM_BLOCK_SKILL:
        total += C.RIM_PENALTY
    return total


def calibrate_style_params(lineups):
    """Per style: rescale delta to TARGET_STYLE_SD and center to zero mean across the
    given population of (starters, sixth, bench) lineups. Balanced stays identity-zero."""
    raws = {s: [] for s in C.PLAYSTYLES}
    for st, sx, bn in lineups:
        S = component_sums(st, sx, bn, use_drift=False)
        for s in C.PLAYSTYLES:
            raws[s].append(raw_delta(S, s))
    params = {}
    for s, v in raws.items():
        sd = float(np.std(v))
        scale = (C.TARGET_STYLE_SD / sd) if sd > 1e-9 else 1.0
        params[s] = dict(scale=scale, const=-scale * float(np.mean(v)))
    params["Balanced"] = dict(scale=1.0, const=0.0)
    return params


def win_prob(sa, sb, style_a="Balanced", style_b="Balanced", k=None):
    k = C.LOGISTIC_K if k is None else k
    k_eff = k * C.pace_k_factor(C.PACE[style_a], C.PACE[style_b])
    return 1.0 / (1.0 + np.exp(-k_eff * (sa - sb)))
