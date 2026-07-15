"""The market layer: followers, hype, salary, scout grades, personality, auction assignment.

The mispricing chain (spec §9.1):
    usage -> points -> followers/hype -> salary        (what the market pays for)
    efficiency, security, defense -> TrueImpact        (what actually wins)
Hype sees visible skill (playmaking + half-credit defense) but is blind to efficiency,
turnovers, and age. Normalization constants come from the MAIN 175-player pool and are
reused for every later mini-population (history rosters), so prices are league-anchored.
"""
import math
import numpy as np
import config as C

NORMS = None   # set once from the main pool


def _phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _features(players):
    pts = np.array([p.pub["pts"] for p in players])
    fga = np.array([p.pub["fga"] for p in players])
    ast = np.array([p.pub["assists"] for p in players])
    skill = np.array([p.comps["play"] + 0.5 * p.comps["defense"] for p in players])
    ti = np.array([p.ti_raw for p in players])
    return dict(pts=pts, fga=fga, ast=ast, skill=skill, ti=ti)


def apply_market(players, rng):
    global NORMS
    f = _features(players)

    if NORMS is None:
        NORMS = {k: (float(v.mean()), float(v.std()) + 1e-9) for k, v in f.items()}
        # fame/hype raw-score scale, computed on the main pool below (two-pass)
        fame_raw = 0.60 * _zn(f["pts"], "pts") + 0.20 * _zn(f["fga"], "fga")
        NORMS["fame"] = (float(fame_raw.mean()), float(fame_raw.std()) + 1e-9)

    fame = (0.60 * _zn(f["pts"], "pts") + 0.20 * _zn(f["fga"], "fga")
            + 0.20 * rng.normal(0, 1, len(players)))
    fame_z = (fame - NORMS["fame"][0]) / NORMS["fame"][1]
    followers = np.clip(np.exp(3.2 + 1.4 * fame_z) * 1.8e4, 1e4, 2e7).astype(int)

    hype_raw = (C.HYPE_W_PTS * _zn(f["pts"], "pts") + C.HYPE_W_FOLLOWERS * fame_z
                + C.HYPE_W_FGA * _zn(f["fga"], "fga") + C.HYPE_W_AST * _zn(f["ast"], "ast")
                + C.HYPE_W_SKILL * _zn(f["skill"], "skill")
                + C.HYPE_NOISE * rng.normal(0, 1, len(players)))
    if "hype_raw" not in NORMS:
        NORMS["hype_raw"] = (float(hype_raw.mean()), float(hype_raw.std()) + 1e-9)
    hz = (hype_raw - NORMS["hype_raw"][0]) / NORMS["hype_raw"][1]
    hype = np.clip(np.round((3.0 + 1.15 * hz) * 2) / 2, 1.0, 5.0)

    base = C.SALARY_MIN + np.clip((hype - 1.0) / 4.0, 0, 1) ** 1.35 * (26.0 - C.SALARY_MIN)
    salary = np.clip(base * (1 + rng.normal(0, C.SALARY_NOISE_SD, len(players))),
                     C.SALARY_MIN, C.SALARY_MAX)

    r = C.SCOUT_GRADE_R
    latent = r * _zn(f["ti"], "ti") + math.sqrt(1 - r * r) * rng.normal(0, 1, len(players))
    bounds = np.cumsum([0.04, 0.07, 0.10, 0.13, 0.16, 0.15, 0.13, 0.11, 0.07, 0.04])
    grades = []
    for z in latent:
        q = _phi(float(z))
        idx = int(np.searchsorted(bounds, 1.0 - q, side="left"))
        grades.append(C.GRADES[min(idx, len(C.GRADES) - 1)])

    for i, p in enumerate(players):
        p.followers = int(followers[i])
        p.hype = float(hype[i])
        p.salary = float(round(salary[i], 1))
        p.list_salary = p.salary
        p.scout_grade = grades[i]
        p.personality = str(rng.choice(C.PERSONALITIES))


def _zn(x, key):
    mu, sd = NORMS[key]
    return (np.asarray(x, float) - mu) / sd


def assign_auction(players, rng):
    """Pick the 25 auction-class stars: mostly legit high-TI names, seeded with traps."""
    by = {a: [p for p in players if p.archetype == a] for a in
          ("volume_trap", "aging_legend", "efficient_star", "two_way_wing",
           "sharpshooter", "rim_protector", "floor_general", "elite_defender")}
    for lst in by.values():
        lst.sort(key=lambda p: -p.hype)

    picks = []
    picks += by["volume_trap"][:4]
    picks += by["aging_legend"][:2]
    legit_pool = sorted(
        (p for a in ("efficient_star", "two_way_wing", "sharpshooter", "rim_protector", "floor_general")
         for p in by[a] if p not in picks),
        key=lambda p: -(0.6 * p.ti + 0.4 * p.hype * 4))
    picks += legit_pool[:17]
    wildcards = [p for p in sorted(by["elite_defender"], key=lambda p: -p.ti) if p not in picks]
    picks += wildcards[:2]
    picks = picks[:C.N_AUCTION]

    picks.sort(key=lambda p: (-p.hype, -p.pub["pts"]))
    waves = {w: [] for w in range(1, C.AUCTION_WAVES + 1)}
    order = list(range(1, C.AUCTION_WAVES + 1)) + list(range(C.AUCTION_WAVES, 0, -1))
    for i, p in enumerate(picks):
        waves[order[i % len(order)]].append(p)
    trapless = [w for w, ps in waves.items() if not any(p.is_trap for p in ps)]
    doubled = [w for w, ps in waves.items() if sum(p.is_trap for p in ps) > 1]
    for w in trapless:
        if not doubled:
            break
        src = doubled.pop()
        trap = next(p for p in waves[src] if p.is_trap)
        give = next(p for p in waves[w] if not p.is_trap)
        waves[src].remove(trap); waves[w].remove(give)
        waves[src].append(give); waves[w].append(trap)

    for w, ps in waves.items():
        for p in ps:
            p.auction_round = w
            p.salary = 0.0
    return picks
