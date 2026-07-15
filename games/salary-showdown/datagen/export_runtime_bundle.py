"""Export runtime JSON bundles + engine parity fixture for the Cloud Functions port.

Regenerates the pool deterministically (seed from config) — players.csv must remain
byte-identical, asserted below. This script only READS games/salary-showdown/data/players.csv
and regenerates the pool in-memory; it never writes to data/. Run:

    cd games/salary-showdown/datagen && python3 export_runtime_bundle.py

Re-runnable/idempotent: every output is fully overwritten from a fresh deterministic
regeneration (seed=C.SEED for the pool, seed=42 for the parity-fixture sampler), so running
this twice in a row produces byte-identical JSON both times.
"""
import csv
import json
import os
import subprocess
from types import SimpleNamespace

import numpy as np

import config as C
import attributes as A
import market as M
import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "backend", "functions"))
DATA_OUT = os.path.join(BACKEND, "src", "data")
FIX_OUT = os.path.join(BACKEND, "test", "fixtures")

REQUIRED_COMPS = ["sv_interior", "sv_three", "play", "defense", "tov",
                  "reb_only", "sec_value", "shooting", "stocks"]


def build_pool():
    """Regenerate the exact same 175-player pool generate.py produces (players -> market
    -> auction), using the reset guards so this is safe to call repeatedly / after other
    generator code has already set the module-level anchors."""
    A.reset_anchors()
    M.reset_norms()
    rng = np.random.default_rng(C.SEED)
    players = A.generate_players(rng)
    M.apply_market(players, rng)
    M.assign_auction(players, rng)
    return players


def hidden_entry(p):
    """Adapted to attributes.py's ACTUAL stored keys (read via finalize_expected / _fill_components):
    - p.exp already carries `fga3` (finalize_expected: exp["fga3"] = fga * exp["share3"]), so
      fga3_share is just fga3 / fga — no derivation needed, unlike the brief's draft fallback.
    - p.comps keys line up 1:1 with the 9 required comps (_fill_components in attributes.py).
    - p.pub carries ft_pct (published/noisy) since generate_players() already runs
      _fill_published() internally; there is no noise-free ft_pct in p.exp, so ft_pct is
      necessarily the published figure (matches the brief's own draft, which also reads
      p.pub["ft_pct"]).
    - `archetype` added per Task 2 instructions (finale reveal needs it later).
    """
    assert set(p.comps.keys()) == set(REQUIRED_COMPS), \
        f"pid {p.pid}: comps keys {sorted(p.comps.keys())} != required {sorted(REQUIRED_COMPS)}"
    fga3_share = p.exp["fga3"] / p.exp["fga"]
    return dict(
        position=p.position,
        archetype=p.archetype,
        ti=round(p.ti, 6), ti_raw=round(p.ti_raw, 6),
        age_drift=round(C.age_drift(p.age), 6),
        attrs=dict(three_pt=round(p.attrs["three_pt"], 3), defense=round(p.attrs["defense"], 3)),
        comps={k: round(v, 6) for k, v in p.comps.items()},
        exp=dict(fga=round(p.exp["fga"], 4), pts=round(p.exp["pts"], 4),
                 fg_pct=round(p.exp["fg_pct"], 5), three_pt_pct=round(p.exp["three_pt_pct"], 5),
                 ft_pct=round(p.pub["ft_pct"], 5), rebounds=round(p.exp["rebounds"], 4),
                 assists=round(p.exp["assists"], 4), steals=round(p.exp["steals"], 4),
                 blocks=round(p.exp["blocks"], 4), turnovers=round(p.exp["turnovers"], 4),
                 mins=round(p.exp["mins"], 3), fga3_share=round(float(fga3_share), 5)),
    )


def main():
    players = build_pool()

    # players.csv must be untouched by this exporter (read-only regeneration)
    diff = subprocess.run(["git", "diff", "--stat", "--", "../data/players.csv"],
                          cwd=HERE, capture_output=True, text=True).stdout.strip()
    assert diff == "", f"players.csv changed: {diff}"

    os.makedirs(DATA_OUT, exist_ok=True)
    os.makedirs(FIX_OUT, exist_ok=True)

    pub_csv = os.path.join(HERE, "..", "data", "players.csv")
    with open(pub_csv) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["pid"] = int(r["player_id"])
    assert len(rows) == 175, f"expected 175 public rows, got {len(rows)}"
    json.dump(rows, open(os.path.join(DATA_OUT, "players.json"), "w"))

    hidden = {str(p.pid): hidden_entry(p) for p in players}
    assert len(hidden) == 175, f"expected 175 hidden entries, got {len(hidden)}"
    json.dump(hidden, open(os.path.join(DATA_OUT, "hidden.json"), "w"))

    params = json.load(open(os.path.join(HERE, "private", "engine_params.json")))
    json.dump(params, open(os.path.join(DATA_OUT, "engine_params.json"), "w"), indent=1)

    # ---- parity fixture: 200 random legal lineups x 5 styles, 100 win-prob pairs
    #
    # IMPORTANT: team_strength() for the fixture must be computed from the SAME rounded
    # values that ship in hidden.json (ti/ti_raw/comps to 6dp, attrs to 3dp) — not from the
    # full-precision in-memory Player objects. The JS port can only ever read hidden.json,
    # so a fixture baked from unrounded floats is off by ~1e-5 (rounding error amplified
    # through the tier/scoring/style-scale weights) and can never be matched to 1e-9 by any
    # correct port. (Discovered during Task 4 parity debugging: the JS port reproduced the
    # rounded-input recompute bit-for-bit, proving the fixture — not the port — was wrong.)
    #
    # The fixture certifies the JS port against hidden.json's shipped (rounded) values; the
    # assertion below bounds the residual between shipped-data strengths and full-precision
    # engine truth.
    def hidden_view(pid):
        h = hidden[str(pid)]
        return SimpleNamespace(pid=pid, position=h["position"], ti=h["ti"], ti_raw=h["ti_raw"],
                                comps=h["comps"], attrs=h["attrs"])

    rng = np.random.default_rng(42)
    by = {q: [p for p in players if p.position == q] for q in "GWB"}
    constants = {s: dict(v) for s, v in params["style_constants"].items()}
    cases, lineups = [], []
    max_gap = 0.0
    for _ in range(200):
        roster = (list(rng.choice(by["G"], 3, replace=False))
                  + list(rng.choice(by["W"], 3, replace=False))
                  + list(rng.choice(by["B"], 2, replace=False)))
        st, sx, bn = E.pick_lineup(roster, metric=lambda p: p.ti)
        lineups.append((st, sx, bn))
        style = C.PLAYSTYLES[int(rng.integers(0, 5))]
        st_v, sx_v, bn_v = [hidden_view(p.pid) for p in st], hidden_view(sx.pid), [hidden_view(p.pid) for p in bn]
        strength = E.team_strength(st_v, sx_v, bn_v, style, constants, use_drift=True)
        # Full-precision truth: same style, same lineup, but the ORIGINAL in-memory Player
        # objects (pre-rounding) rather than the hidden.json-rounded views above. Measures
        # how far shipped-data (rounded) strength has drifted from engine truth.
        true_strength = E.team_strength(st, sx, bn, style, constants, use_drift=True)
        max_gap = max(max_gap, abs(true_strength - strength))
        cases.append(dict(starters=[p.pid for p in st], sixth=sx.pid,
                          bench=[p.pid for p in bn[:2]], style=style,
                          strength=strength))
    assert max_gap < 5e-4, f"hidden.json rounding drifts engine strength by {max_gap}"
    winprobs = []
    for _ in range(100):
        i, j = int(rng.integers(0, 200)), int(rng.integers(0, 200))
        winprobs.append(dict(i=i, j=j, p=float(E.win_prob(
            cases[i]["strength"], cases[j]["strength"],
            cases[i]["style"], cases[j]["style"], k=params["logistic_k"]))))
    picks = []
    for st, sx, bn in lineups[:20]:
        roster = st + [sx] + bn
        picks.append(dict(roster=[p.pid for p in roster],
                          starters=[p.pid for p in st], sixth=sx.pid))
    assert len(cases) == 200 and len(winprobs) == 100 and len(picks) == 20
    json.dump(dict(cases=cases, winprobs=winprobs, lineup_picks=picks),
              open(os.path.join(FIX_OUT, "engine_parity.json"), "w"))

    print(f"exported {len(rows)} players, {len(cases)} parity cases, "
          f"max hidden.json rounding gap: {max_gap:.3e}")


if __name__ == "__main__":
    main()
