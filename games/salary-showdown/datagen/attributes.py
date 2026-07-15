"""Player generation: hidden attributes -> expected stats -> published (noisy) stats -> TrueImpact.

The integrity rule: TrueImpact is computed from NOISE-FREE expected stats; the published
columns add observation noise on top. Students regressing published stats therefore see a
strong-but-imperfect signal (by design), never a perfect leak.
"""
from dataclasses import dataclass, field
import numpy as np

import config as C

# attribute ranges per archetype: (usage, efficiency, three_pt, playmaking, ball_security, defense, age_lo, age_hi, positions)
ARCHETYPES = {
    "efficient_star": ((70, 88), (68, 88), (45, 80), (45, 70), (60, 85), (45, 70), 24, 30, "GWB"),
    "volume_trap":    ((84, 95), (26, 42), (30, 50), (35, 55), (25, 42), (20, 40), 24, 31, "GW"),
    "two_way_wing":   ((45, 65), (50, 68), (45, 70), (35, 55), (55, 75), (65, 85), 23, 31, "W"),
    "elite_defender": ((18, 35), (56, 74), (25, 55), (25, 45), (72, 92), (80, 96), 23, 32, "GWB"),
    "floor_general":  ((35, 55), (48, 65), (40, 65), (78, 95), (72, 92), (40, 60), 23, 33, "G"),
    "sharpshooter":   ((30, 52), (55, 72), (75, 95), (30, 50), (60, 80), (30, 55), 22, 32, "GW"),
    "rim_protector":  ((20, 38), (55, 75), (5, 25),  (15, 35), (55, 78), (78, 96), 23, 32, "B"),
    "aging_legend":   ((68, 85), (52, 72), (40, 70), (45, 70), (50, 72), (40, 60), 33, 37, "GWB"),
    "young_riser":    ((38, 60), (44, 62), (40, 70), (40, 65), (45, 70), (45, 70), 19, 23, "GWB"),
    "journeyman":     ((30, 60), (38, 58), (25, 60), (25, 60), (40, 70), (35, 65), 23, 34, "GWB"),
}
TRAP_ARCHETYPES = {"volume_trap", "aging_legend"}

POS_REB_BASE = {"G": 1.8, "W": 3.8, "B": 6.5}
POS_AST_F = {"G": 1.0, "W": 0.7, "B": 0.45}
POS_STL_F = {"G": 1.15, "W": 1.0, "B": 0.7}
POS_BLK_F = {"G": 0.12, "W": 0.45, "B": 1.15}
POS_FG_BONUS = {"G": 0.0, "W": 0.01, "B": 0.035}

PPS_SCALE = None   # set once from the main pool; shared by all later mini-populations


@dataclass
class Player:
    pid: int
    name: str
    archetype: str
    position: str
    age: int
    years_pro: int
    attrs: dict                 # hidden: usage, efficiency, three_pt, playmaking, ball_security, defense
    exp: dict = field(default_factory=dict)    # expected (noise-free) per-game stats
    pub: dict = field(default_factory=dict)    # published (noisy) per-game stats
    comps: dict = field(default_factory=dict)  # TI components (from expected stats)
    ti: float = 0.0             # TrueImpact for the UPCOMING season (drift applied)
    ti_raw: float = 0.0         # TrueImpact without drift (last-season truth)
    # market fields filled by market.py
    followers: int = 0
    hype: float = 0.0
    salary: float = 0.0
    scout_grade: str = ""
    personality: str = ""
    auction_round: int = 0      # 0 = free agent
    is_trap: bool = False


def _expected_stats(attrs, position):
    u, e, t3 = attrs["usage"] / 100, attrs["efficiency"] / 100, attrs["three_pt"] / 100
    pl, sec, d = attrs["playmaking"] / 100, attrs["ball_security"] / 100, attrs["defense"] / 100
    fga = 2.0 + 22.0 * u
    pps = 0.75 + 0.45 * e + 0.08 * t3            # normalized league-wide later; 3pt skill kept
                                                 # modest here so Barrage is what weaponizes it
    fg = np.clip(0.36 + 0.16 * e + POS_FG_BONUS[position] - 0.02 * t3, 0.38, 0.62)
    p3 = np.clip(0.20 + 0.21 * t3, 0.20, 0.45)
    reb = POS_REB_BASE[position] * (0.55 + 0.9 * d)
    ast = (0.5 + 8.5 * pl) * POS_AST_F[position]
    stl = (0.2 + 1.9 * d) * POS_STL_F[position]
    blk = 2.4 * d * POS_BLK_F[position]
    tov = 0.5 + 3.4 * u * (1.25 - sec)
    mins = 8.0 + 30.0 * (0.55 * u + 0.45 * (0.5 * e + 0.5 * d))
    return dict(fga=fga, pps=pps, fg_pct=fg, three_pt_pct=p3, rebounds=reb, assists=ast,
                steals=stl, blocks=blk, turnovers=tov, mins=mins)


def generate_players(rng: np.random.Generator, id_start=1001):
    players, pid = [], id_start
    order = []
    for arch, n in C.ARCHETYPE_COUNTS.items():
        order += [arch] * n
    rng.shuffle(order)

    # position bookkeeping to respect global mix on flexible archetypes
    target = {p: int(round(share * len(order))) for p, share in C.POSITION_MIX.items()}
    count = {"G": 0, "W": 0, "B": 0}

    used_names = set()
    from names import FIRST, LAST
    for arch in order:
        (ulo, uhi), (elo, ehi), (tlo, thi), (plo, phi), (slo, shi), (dlo, dhi), alo, ahi, poss = ARCHETYPES[arch]
        attrs = dict(
            usage=rng.uniform(ulo, uhi), efficiency=rng.uniform(elo, ehi),
            three_pt=rng.uniform(tlo, thi), playmaking=rng.uniform(plo, phi),
            ball_security=rng.uniform(slo, shi), defense=rng.uniform(dlo, dhi),
        )
        # position: pick allowed position with the largest remaining deficit
        cands = sorted(poss, key=lambda p: count[p] - target[p])
        position = cands[0]
        count[position] += 1
        age = int(rng.integers(alo, ahi + 1))
        years_pro = max(0, age - 19 - int(rng.integers(0, 3)))
        while True:
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if name not in used_names:
                used_names.add(name)
                break
        p = Player(pid=pid, name=name, archetype=arch, position=position, age=age,
                   years_pro=years_pro, attrs=attrs, is_trap=arch in TRAP_ARCHETYPES)
        p.exp = _expected_stats(attrs, position)
        players.append(p)
        pid += 1

    # normalize pps so the FGA-weighted league mean is exactly PPS_LEAGUE_AVG.
    # The scale is computed ONCE (main 175-player pool) and reused for every later
    # mini-population (history rosters) — otherwise each roster would be re-centered
    # to its own average and roster quality differences would vanish.
    global PPS_SCALE
    if PPS_SCALE is None:
        tot_fga = sum(p.exp["fga"] for p in players)
        mean_pps = sum(p.exp["fga"] * p.exp["pps"] for p in players) / tot_fga
        PPS_SCALE = C.PPS_LEAGUE_AVG / mean_pps
    for p in players:
        p.exp["pps"] *= PPS_SCALE
        p.exp["pts"] = p.exp["fga"] * p.exp["pps"]

    for p in players:
        _fill_components(p)
        _fill_published(p, rng)
    return players


def _fill_components(p: Player):
    e = p.exp
    t3 = p.attrs["three_pt"] / 100
    sv_total = e["fga"] * (e["pps"] - C.PPS_LEAGUE_AVG) + C.W_CREATION * e["fga"]
    sv_three = e["fga"] * 0.08 * t3 * 0.9          # the 3pt slice of scoring value
    sv_interior = sv_total - sv_three
    play = C.W_PLAYMAKING * e["assists"]
    dfc = C.W_STEAL * e["steals"] + C.W_BLOCK * e["blocks"] + C.W_REBOUND * e["rebounds"]
    tov = C.W_TURNOVER * e["turnovers"]
    # security value: turnovers BELOW expectation for this usage level (league-avg security
    # ~0.55). Rewards clean handling without rewarding low volume — Run & Gun's true moderator.
    u = p.attrs["usage"] / 100
    tov_expected = 0.5 + 3.4 * u * (1.25 - 0.55)
    sec_value = C.W_TURNOVER * (tov_expected - e["turnovers"])
    p.comps = dict(sv_interior=sv_interior, sv_three=sv_three, play=play, defense=dfc, tov=tov,
                   reb_only=C.W_REBOUND * e["rebounds"], sec_value=sec_value,
                   shooting=0.04 * p.attrs["three_pt"],   # pure 3pt skill (Barrage's moderator)
                   stocks=C.W_STEAL * e["steals"] + C.W_BLOCK * e["blocks"])  # Lockdown's moderator
    p.ti_raw = C.TI_BASE + C.W_SCORING * (sv_interior + sv_three) + play + dfc - tov
    p.ti = p.ti_raw * C.age_drift(p.age)


def _fill_published(p: Player, rng):
    e = p.exp
    n = lambda sd: rng.normal(0, sd)
    pub = {}
    pub["fga"] = float(np.clip(e["fga"] + n(0.7), 2, 24))
    pub["pts"] = float(np.clip(e["pts"] + n(0.9), 2, 30))
    pub["fg_pct"] = float(np.clip(e["fg_pct"] + n(0.012), 0.38, 0.62))
    pub["three_pt_pct"] = float(np.clip(e["three_pt_pct"] + n(0.012), 0.20, 0.45))
    pub["ft_pct"] = float(np.clip(0.55 + 0.30 * rng.random() + 0.10 * p.attrs["efficiency"] / 100, 0.55, 0.95))
    pub["rebounds"] = float(np.clip(e["rebounds"] + n(0.35), 1, 13))
    pub["assists"] = float(np.clip(e["assists"] + n(0.30), 0.5, 10))
    pub["steals"] = float(np.clip(e["steals"] + n(0.08), 0.2, 2.5))
    pub["blocks"] = float(np.clip(e["blocks"] + n(0.08), 0.0, 2.8))
    pub["turnovers"] = float(np.clip(e["turnovers"] + n(0.15), 0.5, 4.5))
    pub["mins"] = float(np.clip(e["mins"] + n(1.2), 8, 38))
    pub["games_played"] = int(82 - 42 * rng.random() ** 2)
    g = C.yoy_growth(p.age)
    pub["prev_pts"] = float(np.clip(pub["pts"] / (1 + g) + n(0.6), 1.5, 32))
    pub["prev_fg_pct"] = float(np.clip(pub["fg_pct"] / (1 + 0.5 * g) + n(0.010), 0.36, 0.64))
    pub["prev_mins"] = float(np.clip(pub["mins"] / (1 + 0.6 * g) + n(0.8), 6, 40))
    p.pub = pub
