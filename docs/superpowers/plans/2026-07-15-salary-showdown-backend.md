# Salary Showdown — Backend Game Server Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully tested Firebase backend (Cloud Functions + Firestore) that runs a complete Salary Showdown game — lobby to finale — against the emulator, with a JS engine proven bit-compatible with the Python reference.

**Architecture:** Pure-logic modules (engine, payroll, market, auction, lineup, sim) with no Firebase imports, exercised by fast unit tests; thin callable handlers wire them to Firestore transactions; the professor's `advancePhase` is the only clock. Hidden data (TrueImpact, engine params) ships INSIDE the functions bundle and never touches Firestore. Engine correctness is enforced by a parity fixture generated from the Python reference implementation.

**Tech Stack:** Node 20 ES modules, Firebase Cloud Functions v2 (callables), Firestore, anonymous Auth, Firebase emulator suite, vitest, `@firebase/rules-unit-testing`.

**Roadmap context:** Plan 2 (team-facing React client) and Plan 3 (professor panel, projector, finale UI, deploy + load drill) will be authored after this plan's Tasks 1–8 stabilize the Firestore contract. Spec: `docs/superpowers/specs/2026-07-14-salary-showdown-design.md` (authoritative). Reference engine: `games/salary-showdown/datagen/engine.py` + `datagen/private/engine_params.json`.

## Global Constraints

- Hard cap **$100.0M per round**; a signing/bid is legal only if payroll ≤ cap in **every covered round** (hardship signings are the sole cap-exempt path, §13).
- Ask price in round r = `base list rate × 1.08^(r-1)`, rounded to $0.1M. Round 1 = base.
- Contract length discounts (rate multiplier): 1rd **1.00**, 2rd **0.92**, 3rd **0.85**, 4rd **0.80**, 5rd **0.75**. Auctions have **no** length discount.
- A contract signed in round r for Y years covers rounds `r … r+Y-1`. Cut ⇒ dead money at full rate for every still-covered round including the cut round (already paid); player leaves roster immediately.
- Roster min 8 / max 10. Lineup = 2 G + 2 W + 1 B starters, 1 sixth man, bench; **exactly two bench slots count** in the engine (tier weights 1.0 / 0.6 / 0.35×2); spots 9–10 are inactive.
- Playstyle strings, verbatim everywhere (UI, Firestore, CSV): `Balanced`, `Run & Gun`, `3PT Barrage`, `Inside Attack`, `Lockdown`.
- Auction: sealed contract offers; min bid = `$2.0M × 1.08^(r-1)`, $0.1M steps; winner = highest `rate × years`; ties seeded-random; skip award if cap or roster (max 10) fails; unsold stars enter next round's FA rotation priced `2 + ((hype-1)/4)^1.35 × 24`.
- FA market rotation: round 1 draw = 75% of FA pool; rounds 2–5 = 45%; identical draw for all teams; player absent 2 consecutive rounds is forced into the next draw. FA pool is **non-exclusive** (copies); auction stars are exclusive.
- Engine constants come **only** from `engine_params.json` (k = 0.09, style scales/constants, synergy thresholds, TI weights). Never re-derive or hardcode them.
- TrueImpact, hidden attributes, and engine params must never be readable by clients; the finale reveal payload is written only after the final round resolves (§11.14/§12).
- Standings tiebreak: wins → point diff → points scored → seeded coin flip (logged).
- All randomness via seeded RNG (`rng.js`); a game's sim must be reproducible from `gameId` + round.
- Timeline: 5 rounds; round 1 has no Front Office phase. Phase order per round: FRONT_OFFICE → FREE_AGENCY → AUCTION → LINEUP → SIMULATE → RESULTS (round 1 starts at FREE_AGENCY).
- No emojis in any user-visible string the backend produces (award names, errors).

## File Structure

```
games/salary-showdown/backend/
  firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
  SCHEMA.md                      # Firestore contract (Task 6)
  functions/
    package.json  index.js       # callable exports only
    src/
      data/players.json          # public catalog  (generated, Task 2)
      data/hidden.json           # comps/TI/exp    (generated, Task 2 — NEVER to Firestore)
      data/engine_params.json    # copied verbatim (Task 2)
      rng.js  engine.js  payroll.js  market.js  auction.js  lineup.js  sim.js
      phases.js  game.js         # lifecycle + phase machine handlers
    test/
      fixtures/engine_parity.json  # generated (Task 2)
      rng.test.js  engine.test.js  payroll.test.js  market.test.js
      auction.test.js  lineup.test.js  sim.test.js
      rules.test.js  lifecycle.test.js  smoke.test.js   # emulator-backed
games/salary-showdown/datagen/
  export_runtime_bundle.py       # new (Task 2)
```

---

### Task 1: Backend scaffold + emulator boot

**Files:**
- Create: `games/salary-showdown/backend/firebase.json`, `.firebaserc`, `firestore.indexes.json`, `firestore.rules` (permissive placeholder), `functions/package.json`, `functions/index.js`, `functions/vitest.config.js`

**Interfaces:**
- Produces: `npm test` (vitest) and `npm run emu` (emulator suite) working from `backend/functions/`.

- [ ] **Step 1: Write config files**

`games/salary-showdown/backend/firebase.json`:
```json
{
  "functions": { "source": "functions", "runtime": "nodejs20" },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9199 },
    "functions": { "port": 5101 },
    "firestore": { "port": 8180 },
    "ui": { "enabled": true, "port": 4100 }
  }
}
```

`.firebaserc` (placeholder project — professor creates the real one before deploy; emulator ignores it):
```json
{ "projects": { "default": "salary-showdown-dev" } }
```

`firestore.indexes.json`:
```json
{ "indexes": [], "fieldOverrides": [] }
```

`firestore.rules` (placeholder, replaced in Task 6):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

`functions/package.json`:
```json
{
  "name": "salary-showdown-functions",
  "type": "module",
  "engines": { "node": "20" },
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --exclude '**/{rules,lifecycle,smoke}.test.js'",
    "emu": "cd .. && firebase emulators:start --project salary-showdown-dev"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@firebase/rules-unit-testing": "^3.0.0",
    "firebase-functions-test": "^3.1.0",
    "node-fetch": "^3.3.0"
  }
}
```

`functions/index.js`:
```js
// Callable exports accumulate here as tasks land.
export {};
```

`functions/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 30000, hookTimeout: 60000 } });
```

- [ ] **Step 2: Install and verify unit runner**

Run: `cd games/salary-showdown/backend/functions && npm install && npx vitest run`
Expected: "No test files found" exit 0 (or trivial pass) — toolchain works.

- [ ] **Step 3: Verify emulator boots**

Run: `cd games/salary-showdown/backend && npx firebase emulators:start --project salary-showdown-dev --only firestore,auth &` then `sleep 15 && curl -s localhost:8180 && kill %1`
Expected: emulator UI logs "All emulators ready", curl returns "Ok".

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/backend
git commit -m "feat(salary-showdown): backend scaffold — functions workspace + emulator config"
```

---

### Task 2: Runtime data bundle + engine parity fixture (Python export)

The shipped `hidden_attributes.csv` lacks the four newer engine components (`reb_only`, `sec_value`, `shooting`, `stocks`) and the expected per-game stats the runtime box-score generator needs. Export complete JSON bundles + a parity fixture from the deterministic generator. `data/players.csv` must remain byte-identical.

**Files:**
- Create: `games/salary-showdown/datagen/export_runtime_bundle.py`
- Create (generated): `backend/functions/src/data/players.json`, `backend/functions/src/data/hidden.json`, `backend/functions/src/data/engine_params.json`, `backend/functions/test/fixtures/engine_parity.json`

**Interfaces:**
- Produces: `hidden.json` = `{ "<pid>": { position, ti, ti_raw, age_drift, attrs: {three_pt, defense}, comps: {sv_interior, sv_three, play, defense, tov, reb_only, sec_value, shooting, stocks}, exp: {fga, pts, fg_pct, three_pt_pct, ft_pct, rebounds, assists, steals, blocks, turnovers, mins, fga3_share} } }`
- Produces: `players.json` = array of the 26 public CSV columns per player, plus `pid` as number.
- Produces: `engine_parity.json` = `{ "cases": [{ "starters": [pid×5], "sixth": pid, "bench": [pid,pid], "style": str, "strength": float }], "winprobs": [{ "i": int, "j": int, "p": float }], "lineup_picks": [{ "roster": [pid×8], "starters": [...], "sixth": pid }] }`

- [ ] **Step 1: Write the exporter**

`games/salary-showdown/datagen/export_runtime_bundle.py`:
```python
"""Export runtime JSON bundles + engine parity fixture for the Cloud Functions port.

Regenerates the pool deterministically (seed from config) — players.csv must remain
byte-identical, asserted below. Run:  python3 export_runtime_bundle.py
"""
import csv, json, os, subprocess
import numpy as np
import config as C
import attributes as A
import market as M
import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "backend", "functions"))
DATA_OUT = os.path.join(BACKEND, "src", "data")
FIX_OUT = os.path.join(BACKEND, "test", "fixtures")

def build_pool():
    A.reset_anchors(); M.reset_norms()
    rng = np.random.default_rng(C.SEED)
    players = A.generate_players(rng)
    M.apply_market(players, rng)
    M.assign_auction(players, rng)
    return players

def hidden_entry(p):
    fga3 = p.exp.get("fga3", p.exp["fga"] * (0.12 + 0.24 * p.attrs["three_pt"] / 100))
    return dict(
        position=p.position, ti=round(p.ti, 6), ti_raw=round(p.ti_raw, 6),
        age_drift=round(C.age_drift(p.age), 6),
        attrs=dict(three_pt=round(p.attrs["three_pt"], 3), defense=round(p.attrs["defense"], 3)),
        comps={k: round(v, 6) for k, v in p.comps.items()},
        exp=dict(fga=round(p.exp["fga"], 4), pts=round(p.exp["pts"], 4),
                 fg_pct=round(p.exp["fg_pct"], 5), three_pt_pct=round(p.exp["three_pt_pct"], 5),
                 ft_pct=round(p.pub["ft_pct"], 5), rebounds=round(p.exp["rebounds"], 4),
                 assists=round(p.exp["assists"], 4), steals=round(p.exp["steals"], 4),
                 blocks=round(p.exp["blocks"], 4), turnovers=round(p.exp["turnovers"], 4),
                 mins=round(p.exp["mins"], 3), fga3_share=round(float(fga3) / p.exp["fga"], 5)),
    )

def main():
    players = build_pool()
    # players.csv must be untouched by this exporter
    diff = subprocess.run(["git", "diff", "--stat", "--", "../data/players.csv"],
                          cwd=HERE, capture_output=True, text=True).stdout.strip()
    assert diff == "", f"players.csv changed: {diff}"

    os.makedirs(DATA_OUT, exist_ok=True); os.makedirs(FIX_OUT, exist_ok=True)
    pub_csv = os.path.join(HERE, "..", "data", "players.csv")
    with open(pub_csv) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["pid"] = int(r["player_id"])
    json.dump(rows, open(os.path.join(DATA_OUT, "players.json"), "w"))
    json.dump({str(p.pid): hidden_entry(p) for p in players},
              open(os.path.join(DATA_OUT, "hidden.json"), "w"))
    params = json.load(open(os.path.join(HERE, "private", "engine_params.json")))
    json.dump(params, open(os.path.join(DATA_OUT, "engine_params.json"), "w"), indent=1)

    # ---- parity fixture: 200 random legal lineups x 5 styles, 100 win-prob pairs
    rng = np.random.default_rng(42)
    by = {q: [p for p in players if p.position == q] for q in "GWB"}
    constants = {s: dict(v) for s, v in params["style_constants"].items()}
    cases, lineups = [], []
    for _ in range(200):
        roster = (list(rng.choice(by["G"], 3, replace=False))
                  + list(rng.choice(by["W"], 3, replace=False))
                  + list(rng.choice(by["B"], 2, replace=False)))
        st, sx, bn = E.pick_lineup(roster, metric=lambda p: p.ti)
        lineups.append((st, sx, bn))
        style = C.PLAYSTYLES[int(rng.integers(0, 5))]
        cases.append(dict(starters=[p.pid for p in st], sixth=sx.pid,
                          bench=[p.pid for p in bn[:2]], style=style,
                          strength=E.team_strength(st, sx, bn, style, constants, use_drift=True)))
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
    json.dump(dict(cases=cases, winprobs=winprobs, lineup_picks=picks),
              open(os.path.join(FIX_OUT, "engine_parity.json"), "w"))
    print(f"exported {len(rows)} players, {len(cases)} parity cases")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it (expect possible failure on missing exp keys)**

Run: `cd games/salary-showdown/datagen && python3 export_runtime_bundle.py`
Expected first run: KeyError on any `exp` key not stored by `attributes.py` (e.g. `fga3`). Read `attributes.py::finalize_expected` and adjust `hidden_entry` to the actual stored keys (the exporter adapts to the generator — never the reverse). Re-run until: `exported 175 players, 200 parity cases`.

- [ ] **Step 3: Verify integrity**

Run: `cd /Users/dylanmassaro/FenriX && git diff --stat games/salary-showdown/data/ && python3 -c "import json;h=json.load(open('games/salary-showdown/backend/functions/src/data/hidden.json'));c=h['1001']['comps'];assert all(k in c for k in ['sv_interior','sv_three','play','defense','tov','reb_only','sec_value','shooting','stocks']),c.keys();print('comps complete', len(h))"`
Expected: no diff in `data/`; `comps complete 175`.

- [ ] **Step 4: Guard the private bundle**

Append to `games/salary-showdown/backend/functions/src/data/README.md`:
```markdown
# NEVER expose hidden.json or engine_params.json to clients
These ship inside the Cloud Functions deployment only. They are the answer key.
`players.json` is the public catalog (mirrors the pre-released players.csv).
```

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/datagen/export_runtime_bundle.py games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): runtime data bundles + engine parity fixture exporter"
```

---

### Task 3: Seeded RNG

**Files:**
- Create: `backend/functions/src/rng.js`
- Test: `backend/functions/test/rng.test.js`

**Interfaces:**
- Produces: `makeRng(seedString) -> { next(): float[0,1), normal(mu, sd): float, int(lo, hi): int inclusive, shuffle(arr): arr (in place), pick(arr): item }`. Deterministic across processes.

- [ ] **Step 1: Write the failing test**

`backend/functions/test/rng.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';

describe('rng', () => {
  it('is deterministic per seed string', () => {
    const a = makeRng('game42|round3'), b = makeRng('game42|round3');
    const seqA = [a.next(), a.next(), a.normal(0, 1), a.int(1, 6)];
    const seqB = [b.next(), b.next(), b.normal(0, 1), b.int(1, 6)];
    expect(seqA).toEqual(seqB);
  });
  it('differs across seeds and stays in range', () => {
    const a = makeRng('x'), b = makeRng('y');
    expect(a.next()).not.toBe(b.next());
    for (let i = 0; i < 1000; i++) {
      const v = a.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
      const n = a.int(3, 7); expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(7);
    }
  });
  it('shuffle is a permutation', () => {
    const r = makeRng('s'); const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle([...arr]);
    expect([...out].sort((x, y) => x - y)).toEqual(arr);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd games/salary-showdown/backend/functions && npx vitest run test/rng.test.js`
Expected: FAIL — cannot resolve `../src/rng.js`.

- [ ] **Step 3: Implement**

`backend/functions/src/rng.js`:
```js
// fnv1a string hash -> mulberry32 stream. Deterministic everywhere.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function makeRng(seedString) {
  let a = fnv1a(String(seedString)) || 1;
  let spare = null;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sd = 1) => {
    if (spare !== null) { const s = spare; spare = null; return mu + sd * s; }
    let u, v, s;
    do { u = 2 * next() - 1; v = 2 * next() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return mu + sd * u * m;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  const pick = (arr) => arr[int(0, arr.length - 1)];
  return { next, normal, int, shuffle, pick };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/rng.test.js` — Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/backend/functions/src/rng.js games/salary-showdown/backend/functions/test/rng.test.js
git commit -m "feat(salary-showdown): seeded deterministic rng"
```

---

### Task 4: Engine port with Python parity proof

**Files:**
- Create: `backend/functions/src/engine.js`
- Test: `backend/functions/test/engine.test.js`

**Interfaces:**
- Consumes: `src/data/hidden.json`, `src/data/engine_params.json`, fixture from Task 2.
- Produces: `loadEngine() -> { componentSums(starters, sixth, bench, useDrift), teamStrength(starters, sixth, bench, style, useDrift=true), winProb(sa, sb, styleA, styleB), pickLineup(rosterPids, metricFn) -> {starters, sixth, bench}, params }` where player args are pid arrays and `metricFn(pid) -> number`.

- [ ] **Step 1: Write the failing parity test**

`backend/functions/test/engine.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { loadEngine } from '../src/engine.js';
import fixture from './fixtures/engine_parity.json' with { type: 'json' };

const eng = loadEngine();

describe('engine parity vs Python reference', () => {
  it('reproduces all 200 team strengths to 1e-9', () => {
    for (const c of fixture.cases) {
      const s = eng.teamStrength(c.starters, c.sixth, c.bench, c.style, true);
      expect(Math.abs(s - c.strength)).toBeLessThan(1e-9);
    }
  });
  it('reproduces win probabilities to 1e-12', () => {
    for (const w of fixture.winprobs) {
      const a = fixture.cases[w.i], b = fixture.cases[w.j];
      const p = eng.winProb(a.strength, b.strength, a.style, b.style);
      expect(Math.abs(p - w.p)).toBeLessThan(1e-12);
    }
  });
  it('reproduces greedy lineup picks', () => {
    for (const lp of fixture.lineup_picks) {
      const { starters, sixth } = eng.pickLineup(lp.roster, (pid) => eng.hidden[pid].ti);
      expect(starters).toEqual(lp.starters);
      expect(sixth).toEqual(lp.sixth);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine.test.js` — Expected: FAIL, no `engine.js`.

- [ ] **Step 3: Implement the port (mirror `datagen/engine.py` exactly — same op order for float parity)**

`backend/functions/src/engine.js`:
```js
import hidden from './data/hidden.json' with { type: 'json' };
import params from './data/engine_params.json' with { type: 'json' };

const TIER = params.tier_weights;             // { starter, sixth, bench }
const SYN = params.synergy;
const TIW = params.ti_weights;                // { base, scoring, ... }
const DELTA = params.style_delta;             // { style: {channel: coef} }
const CONST = params.style_constants;         // { style: {scale, const} }
const PACE = params.pace;
const K = params.logistic_k;

function slots(starters, sixth, bench) {
  const out = starters.map((pid) => [pid, TIER.starter]);
  if (sixth != null) out.push([sixth, TIER.sixth]);
  for (const pid of bench.slice(0, 2)) out.push([pid, TIER.bench]);
  return out;
}

function shooters(starters) {
  return starters.filter((pid) => hidden[pid].attrs.three_pt >= SYN.shooter_3pt_skill).length;
}

function rimScore(starters, sixth) {
  let best = 0;
  for (const pid of sixth != null ? [...starters, sixth] : starters) {
    const h = hidden[pid];
    const s = h.position === 'B' ? h.attrs.defense : h.position === 'W' ? 0.6 * h.attrs.defense : 0;
    if (s > best) best = s;
  }
  return best;
}

export function componentSums(starters, sixth, bench, useDrift) {
  const S = { score: 0, three: 0, interior: 0, defense: 0, tov: 0, big_score: 0,
    guard_score: 0, big_reb: 0, reb_total: 0, play: 0, base: 0, security: 0,
    shooting: 0, stocks: 0, shooters: shooters(starters) };
  for (const [pid, w] of slots(starters, sixth, bench)) {
    const h = hidden[pid], c = h.comps;
    const d = useDrift ? (h.ti_raw ? h.ti / h.ti_raw : 1.0) : 1.0;
    const sc = (c.sv_interior + c.sv_three) * d;
    S.score += w * sc;
    S.three += w * c.sv_three * d;
    S.interior += w * c.sv_interior * d;
    S.defense += w * c.defense * d;
    S.tov += w * c.tov * d;
    S.play += w * c.play * d;
    S.security += w * c.sec_value * d;
    S.shooting += w * c.shooting;
    S.reb_total += w * c.reb_only * d;
    S.stocks += w * c.stocks * d;
    S.base += w * TIW.base;
    if (h.position === 'B') { S.big_score += w * sc; S.big_reb += w * c.reb_only * d; }
    else if (h.position === 'G') { S.guard_score += w * sc; }
  }
  return S;
}

function rawDelta(S, style) {
  let d = 0;
  for (const [key, coef] of Object.entries(DELTA[style] ?? {})) d += coef * S[key];
  if (style === '3PT Barrage' && S.shooters < 3) d += SYN.barrage_misfire;
  return d;
}

function styleDelta(S, style) {
  const p = CONST[style] ?? { scale: 1, const: 0 };
  return p.scale * rawDelta(S, style) + p.const;
}

export function teamStrength(starters, sixth, bench, style = 'Balanced', useDrift = true) {
  const S = componentSums(starters, sixth, bench, useDrift);
  let total = S.base + TIW.scoring * S.score + S.play + S.defense - S.tov + styleDelta(S, style);
  if (S.shooters < 2) total += SYN.spacing_penalty;
  else if (S.shooters >= 3) total += SYN.spacing_bonus;
  const rim = rimScore(starters, sixth);
  if (rim >= SYN.rim_elite) total += SYN.rim_bonus;
  else if (rim < SYN.rim_block_skill) total += SYN.rim_penalty;
  return total;
}

export function winProb(sa, sb, styleA = 'Balanced', styleB = 'Balanced') {
  const kEff = K * ((PACE[styleA] + PACE[styleB]) / 2);
  return 1 / (1 + Math.exp(-kEff * (sa - sb)));
}

export function pickLineup(rosterPids, metricFn) {
  const srt = [...rosterPids].sort((a, b) => metricFn(b) - metricFn(a));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of srt) {
    const pos = hidden[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = srt.filter((p) => !starters.includes(p));
  return { starters, sixth: rest[0] ?? null, bench: rest.slice(1) };
}

export function loadEngine() {
  return { componentSums, teamStrength, winProb, pickLineup, params, hidden };
}
```

- [ ] **Step 4: Run parity tests**

Run: `npx vitest run test/engine.test.js`
Expected: 3 passed. If strengths differ, diff channel-by-channel against `datagen/engine.py::component_sums` (op order matters); check `SYN` key casing against `engine_params.json` (adjust JS to the JSON's actual keys, e.g. `barrage_misfire` vs `barrageMisfire`).

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/backend/functions/src/engine.js games/salary-showdown/backend/functions/test/engine.test.js
git commit -m "feat(salary-showdown): JS engine port with Python parity proof"
```

---

### Task 5: Contract & payroll math

**Files:**
- Create: `backend/functions/src/payroll.js`
- Test: `backend/functions/test/payroll.test.js`

**Interfaces:**
- Produces:
  - `askPrice(baseRate, round) -> number` ($0.1M rounded)
  - `contractRate(ask, years) -> number` (applies DISCOUNTS, $0.1M rounded)
  - `minBid(round) -> number`
  - `hypeCurve(hype) -> number` (unsold-star pricing)
  - `coveredRounds(contract) -> [int]` for `{ rate, startRound, years }`
  - `payrollAt(team, round) -> number` for `team = { roster: [{pid, rate, startRound, years}], deadMoney: [{rate, startRound, endRound}] }`
  - `capOkWith(team, contract, cap, totalRounds) -> { ok, worstRound, worstPayroll }`
  - `cutPlayer(team, pid, currentRound) -> team'` (immutable; moves contract to deadMoney covering currentRound..end)
  - `expiringPids(team, round) -> [pid]` (contracts whose last covered round was round-1)
- Constants: `DISCOUNTS = {1:1.00, 2:0.92, 3:0.85, 4:0.80, 5:0.75}`, `CAP = 100.0`, `INFLATION = 1.08`, `TOTAL_ROUNDS = 5`.

- [ ] **Step 1: Write the failing tests (worked examples from spec §5/§13)**

`backend/functions/test/payroll.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { askPrice, contractRate, minBid, hypeCurve, payrollAt, capOkWith,
         cutPlayer, expiringPids, coveredRounds } from '../src/payroll.js';

describe('pricing', () => {
  it('inflates the ask 8% per round from a round-1 base', () => {
    expect(askPrice(10.0, 1)).toBe(10.0);
    expect(askPrice(10.0, 2)).toBe(10.8);
    expect(askPrice(10.0, 3)).toBe(11.7);   // 11.664 -> 11.7
  });
  it('applies length discounts (spec worked example: $3.0M base, 3 rounds)', () => {
    expect(contractRate(3.0, 3)).toBe(2.6);   // 3.0*0.85 = 2.55 -> 2.6 ($0.1M rounding)
    expect(contractRate(10.0, 1)).toBe(10.0);
    expect(contractRate(10.0, 5)).toBe(7.5);
  });
  it('min bid is the inflated league minimum', () => {
    expect(minBid(1)).toBe(2.0);
    expect(minBid(3)).toBe(2.3);              // 2*1.1664 -> 2.3
  });
  it('hype curve prices unsold stars', () => {
    expect(hypeCurve(5.0)).toBeCloseTo(26.0, 5);
    expect(hypeCurve(1.0)).toBeCloseTo(2.0, 5);
  });
});

describe('payroll timeline', () => {
  const team = { roster: [
      { pid: 1, rate: 10.0, startRound: 1, years: 3 },   // covers 1-3
      { pid: 2, rate: 5.0, startRound: 2, years: 2 },    // covers 2-3
    ], deadMoney: [] };
  it('covers the right rounds', () => {
    expect(coveredRounds(team.roster[0])).toEqual([1, 2, 3]);
    expect(payrollAt(team, 1)).toBe(10.0);
    expect(payrollAt(team, 2)).toBe(15.0);
    expect(payrollAt(team, 4)).toBe(0.0);
  });
  it('cut moves the contract to dead money for cut round..end', () => {
    const after = cutPlayer(team, 1, 2);
    expect(after.roster.map((c) => c.pid)).toEqual([2]);
    expect(after.deadMoney).toEqual([{ rate: 10.0, startRound: 2, endRound: 3 }]);
    expect(payrollAt(after, 2)).toBe(15.0);   // unchanged: dead money still owed
    expect(payrollAt(after, 3)).toBe(15.0);
  });
  it('cap check inspects every covered round', () => {
    const rich = { roster: [{ pid: 9, rate: 95.0, startRound: 3, years: 2 }], deadMoney: [] };
    const res = capOkWith(rich, { rate: 6.0, startRound: 2, years: 3 }, 100.0, 5);
    expect(res.ok).toBe(false);
    expect(res.worstRound).toBe(3);           // 95 + 6 = 101 in rounds 3-4
  });
  it('lists expiring contracts', () => {
    expect(expiringPids(team, 4)).toEqual([1, 2]);  // both ended in round 3
    expect(expiringPids(team, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/payroll.test.js` — Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`backend/functions/src/payroll.js`:
```js
export const CAP = 100.0;
export const TOTAL_ROUNDS = 5;
export const INFLATION = 1.08;
export const DISCOUNTS = { 1: 1.0, 2: 0.92, 3: 0.85, 4: 0.8, 5: 0.75 };

const r01 = (x) => Math.round(x * 10) / 10;

export const askPrice = (baseRate, round) => r01(baseRate * INFLATION ** (round - 1));
export const contractRate = (ask, years) => r01(ask * DISCOUNTS[years]);
export const minBid = (round) => r01(2.0 * INFLATION ** (round - 1));
export const hypeCurve = (hype) => 2.0 + ((hype - 1.0) / 4.0) ** 1.35 * 24.0;

export const coveredRounds = (c) =>
  Array.from({ length: c.years }, (_, i) => c.startRound + i);

export function payrollAt(team, round) {
  let total = 0;
  for (const c of team.roster)
    if (round >= c.startRound && round < c.startRound + c.years) total += c.rate;
  for (const d of team.deadMoney)
    if (round >= d.startRound && round <= d.endRound) total += d.rate;
  return r01(total);
}

export function capOkWith(team, contract, cap = CAP, totalRounds = TOTAL_ROUNDS) {
  for (const r of coveredRounds(contract)) {
    if (r > totalRounds) continue;
    const p = payrollAt(team, r) + contract.rate;
    if (p > cap + 1e-9) return { ok: false, worstRound: r, worstPayroll: r01(p) };
  }
  return { ok: true, worstRound: null, worstPayroll: null };
}

export function cutPlayer(team, pid, currentRound) {
  const c = team.roster.find((x) => x.pid === pid);
  if (!c) throw new Error(`cut: pid ${pid} not on roster`);
  const endRound = c.startRound + c.years - 1;
  const deadMoney = [...team.deadMoney];
  if (endRound >= currentRound)
    deadMoney.push({ rate: c.rate, startRound: currentRound, endRound });
  return { ...team, roster: team.roster.filter((x) => x.pid !== pid), deadMoney };
}

export function expiringPids(team, round) {
  return team.roster
    .filter((c) => c.startRound + c.years - 1 === round - 1)
    .map((c) => c.pid);
}
```

Note: `expiringPids` reads contracts still on the roster whose coverage ended last round — the runtime keeps expired contracts on the roster doc until the Front Office phase resolves them (re-sign or walk), then `game.js` removes walked ones. `payrollAt` naturally charges nothing for them.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/payroll.test.js` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/backend/functions/src/payroll.js games/salary-showdown/backend/functions/test/payroll.test.js
git commit -m "feat(salary-showdown): contract timeline, dead money, pricing math"
```

---

### Task 6: Firestore schema + security rules

**Files:**
- Create: `games/salary-showdown/backend/SCHEMA.md`
- Modify: `games/salary-showdown/backend/firestore.rules`
- Test: `backend/functions/test/rules.test.js`

**Interfaces:**
- Produces the Firestore contract all later tasks and Plans 2–3 build against.

- [ ] **Step 1: Write SCHEMA.md**

`games/salary-showdown/backend/SCHEMA.md`:
```markdown
# Firestore contract (server-authoritative; clients write ONLY via callables + displayName)

games/{gameId}
  joinCode, status: lobby|active|finished, phase: LOBBY|FRONT_OFFICE|FREE_AGENCY|AUCTION|LINEUP|SIMULATE|RESULTS|FINALE,
  round: 0-5, timerEndsAt: ts|null, teamCount, standingsSeed, config: {cap, totalRounds, timers{...}}
games/{gameId}/players/{uid}          # membership: { teamId, role: GM|Scout|Coach, displayName }
games/{gameId}/teams/{teamId}         # PUBLIC team state (rosters are public like real NBA):
  name, wins, losses, pointDiff, pointsFor,
  roster: [{pid, rate, startRound, years, viaAuction, hardship}],
  deadMoney: [{rate, startRound, endRound}],
  lineup: {starters[5], sixth, bench[], playstyle} | null,
  lineupLockedRound, hardshipUsed: [round]
games/{gameId}/teams/{teamId}/private/auction    # { bids: { [pid]: {rate, years} } } — Scout writes via callable
games/{gameId}/catalog/{pid}          # public player card (26 CSV cols), seeded at createGame
games/{gameId}/market/{round}         # { available: [pid], resignExempt: true }  (public, server-written)
games/{gameId}/auctions/{round}       # { stars: [pid], results: [{pid, teamId|null, rate, years, guaranteed}] } — results field added at resolution
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string, standings: [...] }
games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload)

RULES POLICY
- authenticated members of a game may READ everything under their game EXCEPT teams/*/private/* of other teams and reveal/* before status=finished.
- players/{uid}: user may create own membership (via joinGame callable in practice) and update displayName only.
- ALL other writes: server only (callables use Admin SDK, which bypasses rules).
- hidden.json / engine_params.json are NOT in Firestore at all.
```

- [ ] **Step 2: Write the failing rules test**

`backend/functions/test/rules.test.js`:
```js
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'salary-showdown-dev',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
                 host: 'localhost', port: 8180 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('games/g1').set({ status: 'active', phase: 'FREE_AGENCY', round: 1 });
    await db.doc('games/g1/players/alice').set({ teamId: 't1', role: 'GM', displayName: 'A' });
    await db.doc('games/g1/players/bob').set({ teamId: 't2', role: 'Scout', displayName: 'B' });
    await db.doc('games/g1/teams/t1').set({ name: 'Alpha', wins: 0 });
    await db.doc('games/g1/teams/t1/private/auction').set({ bids: {} });
    await db.doc('games/g1/teams/t2/private/auction').set({ bids: {} });
    await db.doc('games/g1/reveal/latest').set({ secret: true });
  });
});
afterAll(async () => { await env.cleanup(); });

describe('firestore rules', () => {
  it('member reads game + teams, cannot write them', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1').get());
    await assertSucceeds(db.doc('games/g1/teams/t1').get());
    await assertFails(db.doc('games/g1/teams/t1').set({ wins: 99 }));
    await assertFails(db.doc('games/g1').update({ phase: 'RESULTS' }));
  });
  it('own private bids readable, others blocked', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1/teams/t1/private/auction').get());
    await assertFails(db.doc('games/g1/teams/t2/private/auction').get());
  });
  it('reveal blocked while game active; unauthenticated blocked everywhere', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(db.doc('games/g1/reveal/latest').get());
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc('games/g1').get());
  });
  it('user can update only own displayName', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1/players/alice').update({ displayName: 'Al' }));
    await assertFails(db.doc('games/g1/players/alice').update({ role: 'Coach' }));
    await assertFails(db.doc('games/g1/players/bob').update({ displayName: 'X' }));
  });
});
```

- [ ] **Step 3: Run against emulator to verify failure**

Run: `cd games/salary-showdown/backend && npx firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run test/rules.test.js"`
Expected: FAIL — placeholder rules deny member reads.

- [ ] **Step 4: Write the real rules**

`games/salary-showdown/backend/firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isMember(gameId) {
      return request.auth != null
        && exists(/databases/$(database)/documents/games/$(gameId)/players/$(request.auth.uid));
    }
    function myTeam(gameId) {
      return get(/databases/$(database)/documents/games/$(gameId)/players/$(request.auth.uid)).data.teamId;
    }
    match /games/{gameId} {
      allow read: if isMember(gameId);
      allow write: if false;

      match /players/{uid} {
        allow read: if isMember(gameId);
        allow update: if request.auth != null && request.auth.uid == uid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName']);
        allow create, delete: if false;
      }
      match /teams/{teamId} {
        allow read: if isMember(gameId);
        allow write: if false;
        match /private/{doc} {
          allow read: if isMember(gameId) && myTeam(gameId) == teamId;
          allow write: if false;
        }
      }
      match /catalog/{pid}  { allow read: if isMember(gameId); allow write: if false; }
      match /market/{round} { allow read: if isMember(gameId); allow write: if false; }
      match /auctions/{round} { allow read: if isMember(gameId); allow write: if false; }
      match /rounds/{r}     { allow read: if isMember(gameId); allow write: if false; }
      match /reveal/{doc} {
        allow read: if isMember(gameId)
          && get(/databases/$(database)/documents/games/$(gameId)).data.status == 'finished';
        allow write: if false;
      }
    }
  }
}
```

- [ ] **Step 5: Run to verify pass, then commit**

Run: same `emulators:exec` command — Expected: 4 passed.

```bash
git add games/salary-showdown/backend/SCHEMA.md games/salary-showdown/backend/firestore.rules games/salary-showdown/backend/functions/test/rules.test.js
git commit -m "feat(salary-showdown): firestore schema contract + security rules with tests"
```

---

### Task 7: Game lifecycle callables (createGame / joinGame / startSeason)

**Files:**
- Create: `backend/functions/src/game.js`
- Modify: `backend/functions/index.js`
- Test: `backend/functions/test/lifecycle.test.js`

**Interfaces:**
- Consumes: `players.json` (catalog seed), SCHEMA.md contract.
- Produces callables:
  - `createGame({ professorKey, teamNames: [string] }) -> { gameId, joinCode }` — creates game doc (status lobby, round 0, phase LOBBY), one team doc per name, seeds `catalog/{pid}` from `players.json` public fields, stores `professorUid = auth.uid`, `standingsSeed = gameId`.
  - `joinGame({ joinCode, teamId, role, displayName }) -> { gameId, teamId, role }` — validates role unclaimed on that team; writes membership.
  - `startSeason({ gameId }) -> { phase }` — professor only; requires status lobby; sets round 1, phase FREE_AGENCY, computes round-1 market draw (via Task 9's `drawMarket`, wired later — until then sets `market/1` to all-FA placeholder documented in the code).
- Shared helper: `assertProfessor(db, gameId, uid)`, `loadGame(tx, gameId)`.

- [ ] **Step 1: Write the failing integration test**

`backend/functions/test/lifecycle.test.js` (runs under `emulators:exec` with functions emulator; uses `firebase-functions-test` in online mode against the emulator):
```js
import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('lifecycle', () => {
  let gameId, joinCode;
  it('createGame seeds teams and catalog', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    ({ gameId, joinCode } = res);
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g.status).toBe('lobby');
    expect(g.professorUid).toBe('prof');
    const catalog = await db.collection(`games/${gameId}/catalog`).count().get();
    expect(catalog.data().count).toBe(175);
    const teams = await db.collection(`games/${gameId}/teams`).get();
    expect(teams.size).toBe(2);
  });
  it('joinGame claims a role once', async () => {
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const teamId = teams.docs[0].id;
    await call(joinGame, { joinCode, teamId, role: 'GM', displayName: 'Dee' }, 'u1');
    const m = (await db.doc(`games/${gameId}/players/u1`).get()).data();
    expect(m).toEqual({ teamId, role: 'GM', displayName: 'Dee' });
    await expect(call(joinGame, { joinCode, teamId, role: 'GM', displayName: 'X' }, 'u2'))
      .rejects.toThrow(/role.*taken/i);
  });
  it('startSeason is professor-only and opens round 1 FA', async () => {
    await expect(call(startSeason, { gameId }, 'u1')).rejects.toThrow(/professor/i);
    await call(startSeason, { gameId }, 'prof');
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ status: 'active', round: 1, phase: 'FREE_AGENCY' });
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    expect(market.available.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd games/salary-showdown/backend && npx firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run test/lifecycle.test.js"`
Expected: FAIL — `game.js` missing.

- [ ] **Step 3: Implement**

`backend/functions/src/game.js`:
```js
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import players from './data/players.json' with { type: 'json' };
import { makeRng } from './rng.js';

const ROLES = ['GM', 'Scout', 'Coach'];
const db = () => getFirestore();

export async function assertProfessor(gameId, uid) {
  const g = await db().doc(`games/${gameId}`).get();
  if (!g.exists) throw new HttpsError('not-found', 'game not found');
  if (g.data().professorUid !== uid) throw new HttpsError('permission-denied', 'professor only');
  return g.data();
}

export const createGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const teamNames = req.data.teamNames ?? [];
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
  const gameRef = db().collection('games').doc();
  const joinCode = gameRef.id.slice(0, 6).toUpperCase();
  const batch = db().batch();
  batch.set(gameRef, {
    joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null,
    professorUid: req.auth.uid, teamCount: teamNames.length,
    standingsSeed: gameRef.id, createdAt: FieldValue.serverTimestamp(),
    config: { cap: 100.0, totalRounds: 5 },
  });
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
    });
  }
  await batch.commit();
  // catalog seed: batched in chunks of 400 (batch limit 500)
  for (let i = 0; i < players.length; i += 400) {
    const b = db().batch();
    for (const p of players.slice(i, i + 400))
      b.set(gameRef.collection('catalog').doc(String(p.pid)), p);
    await b.commit();
  }
  return { gameId: gameRef.id, joinCode };
});

export const joinGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const { joinCode, teamId, role, displayName } = req.data;
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'bad role');
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const gameRef = games.docs[0].ref;
  return db().runTransaction(async (tx) => {
    const team = await tx.get(gameRef.collection('teams').doc(teamId));
    if (!team.exists) throw new HttpsError('not-found', 'team not found');
    const taken = await tx.get(gameRef.collection('players')
      .where('teamId', '==', teamId).where('role', '==', role));
    if (!taken.empty && taken.docs[0].id !== req.auth.uid)
      throw new HttpsError('already-exists', `${role} role already taken on that team`);
    tx.set(gameRef.collection('players').doc(req.auth.uid),
      { teamId, role, displayName: String(displayName).slice(0, 24) });
    return { gameId: gameRef.id, teamId, role };
  });
});

export const startSeason = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
  // round-1 market draw (75% of FA pool, seeded, identical for all teams)
  const fa = players.filter((p) => !p.auction_round);
  const rng = makeRng(`${gameId}|market|1`);
  const drawn = rng.shuffle([...fa]).slice(0, Math.floor(fa.length * 0.75)).map((p) => p.pid);
  const batch = db().batch();
  batch.set(db().doc(`games/${gameId}/market/1`), { available: drawn });
  batch.update(db().doc(`games/${gameId}`), { status: 'active', round: 1, phase: 'FREE_AGENCY' });
  await batch.commit();
  return { phase: 'FREE_AGENCY' };
});
```

Update `functions/index.js`:
```js
import { initializeApp } from 'firebase-admin/app';
initializeApp();
export { createGame, joinGame, startSeason } from './src/game.js';
```

(`game.js` must not call `initializeApp` — tests do it; `index.js` does it in production.)

- [ ] **Step 4: Run to verify pass**

Run: same `emulators:exec` command — Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): createGame/joinGame/startSeason callables"
```

---

### Task 8: Phase machine

**Files:**
- Create: `backend/functions/src/phases.js`
- Modify: `backend/functions/src/game.js` (add `advancePhase` callable), `index.js`
- Test: `backend/functions/test/phases.test.js` (pure) + extend `lifecycle.test.js`

**Interfaces:**
- Produces: `nextPhase(round, phase, totalRounds) -> { round, phase }` pure transition table; `advancePhase({ gameId })` callable (professor-only) that applies it and fires phase-exit hooks: leaving FREE_AGENCY → `runHardship`, leaving AUCTION → `resolveAuction`, leaving LINEUP → `runSimulation` (hooks land in Tasks 9/10/12; until then `phases.js` exports a `HOOKS` registry that `game.js` populates — missing hooks are no-ops so this task tests transitions only).
- Phase orders: round 1 `FREE_AGENCY → AUCTION → LINEUP → SIMULATE → RESULTS`; rounds 2+ prepend `FRONT_OFFICE`; RESULTS of round<5 → FRONT_OFFICE of round+1; RESULTS of round 5 → FINALE (status finished).

- [ ] **Step 1: Write the failing pure test**

`backend/functions/test/phases.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { nextPhase } from '../src/phases.js';

describe('phase machine', () => {
  it('walks round 1 without front office', () => {
    expect(nextPhase(1, 'FREE_AGENCY')).toEqual({ round: 1, phase: 'AUCTION' });
    expect(nextPhase(1, 'AUCTION')).toEqual({ round: 1, phase: 'LINEUP' });
    expect(nextPhase(1, 'LINEUP')).toEqual({ round: 1, phase: 'SIMULATE' });
    expect(nextPhase(1, 'SIMULATE')).toEqual({ round: 1, phase: 'RESULTS' });
    expect(nextPhase(1, 'RESULTS')).toEqual({ round: 2, phase: 'FRONT_OFFICE' });
  });
  it('walks rounds 2-4 with front office and ends at finale', () => {
    expect(nextPhase(2, 'FRONT_OFFICE')).toEqual({ round: 2, phase: 'FREE_AGENCY' });
    expect(nextPhase(4, 'RESULTS')).toEqual({ round: 5, phase: 'FRONT_OFFICE' });
    expect(nextPhase(5, 'RESULTS')).toEqual({ round: 5, phase: 'FINALE' });
  });
  it('rejects unknown transitions', () => {
    expect(() => nextPhase(1, 'FINALE')).toThrow(/terminal/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/phases.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement**

`backend/functions/src/phases.js`:
```js
export const ORDER = ['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP', 'SIMULATE', 'RESULTS'];
export const TOTAL_ROUNDS = 5;

// Registered by game.js as resolution modules land. Keys: exit phase name.
export const HOOKS = {};

export function nextPhase(round, phase, totalRounds = TOTAL_ROUNDS) {
  if (phase === 'FINALE') throw new Error('FINALE is terminal');
  if (phase === 'RESULTS') {
    return round >= totalRounds
      ? { round, phase: 'FINALE' }
      : { round: round + 1, phase: 'FRONT_OFFICE' };
  }
  const i = ORDER.indexOf(phase);
  if (i === -1) throw new Error(`unknown phase ${phase}`);
  return { round, phase: ORDER[i + 1] };
}
```

Append to `backend/functions/src/game.js`:
```js
import { nextPhase, HOOKS } from './phases.js';

export const advancePhase = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status === 'finished') throw new HttpsError('failed-precondition', 'game over');
  const hook = HOOKS[g.phase];
  if (hook) await hook(gameId, g.round);          // resolve the phase we are LEAVING
  const nxt = nextPhase(g.round, g.phase, g.config.totalRounds);
  const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null };
  if (nxt.phase === 'FINALE') update.status = 'finished';
  const entry = HOOKS[`enter:${nxt.phase}`];
  if (entry) await entry(gameId, nxt.round);      // e.g. market draw on FREE_AGENCY entry
  await db().doc(`games/${gameId}`).update(update);
  return nxt;
});
```

Export from `index.js`: add `advancePhase` to the export list.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/phases.test.js` — Expected: 3 passed.
Run the lifecycle suite under `emulators:exec` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): phase machine with resolution hooks"
```

---

### Task 9: Free agency — rotating market, signing, cutting, re-signing, hardship

**Files:**
- Create: `backend/functions/src/market.js`
- Modify: `backend/functions/src/game.js` (callables `signPlayer`, `cutRosterPlayer`, hook registrations), `index.js`
- Test: `backend/functions/test/market.test.js`

**Interfaces:**
- Consumes: `payroll.js` (all), `players.json`, `rng.js`.
- Produces (pure, in `market.js`):
  - `drawMarket({ gameId, round, faPool, absentCounts, extraPids }) -> { available: [pid], absentCounts' }` — round 1: 75%, else 45%; `forced` = pids with absentCounts ≥ 2; `extraPids` = unsold auction stars + walked players (always included this round).
  - `validateSigning({ team, pid, years, round, marketAvailable, catalogById, isResign }) -> { contract }` or throws coded errors: `NOT_IN_MARKET`, `ROSTER_FULL` (≥10), `CAP_EXCEEDED`, `BAD_YEARS` (1..totalRounds-round+1).
  - `runHardship({ teams, faPool, round, catalogById }) -> [{ teamId, signings: [contract] }]` — for each team whose active roster (contracts covering `round+1`... see note) cannot field 2G/2W/1B+3: sign cheapest legal 1-round deals, `hardship: true`, cap-exempt.
- Produces (callables in `game.js`): `signPlayer({ gameId, pid, years })` (GM only, FREE_AGENCY phase; or FRONT_OFFICE for re-signs of own expiring pids), `cutRosterPlayer({ gameId, pid })` (GM only, FRONT_OFFICE or FREE_AGENCY).
- Registers hooks: `enter:FREE_AGENCY` → market draw; exit `FREE_AGENCY` → hardship.

- [ ] **Step 1: Write the failing tests**

`backend/functions/test/market.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { drawMarket, validateSigning, runHardship } from '../src/market.js';
import players from '../src/data/players.json' with { type: 'json' };
import { askPrice, contractRate } from '../src/payroll.js';

const fa = players.filter((p) => !p.auction_round);
const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const zeroAbsent = Object.fromEntries(fa.map((p) => [p.pid, 0]));

describe('drawMarket', () => {
  it('round 1 draws 75%, later rounds 45%, deterministically', () => {
    const d1 = drawMarket({ gameId: 'g', round: 1, faPool: fa, absentCounts: zeroAbsent, extraPids: [] });
    expect(d1.available.length).toBe(Math.floor(fa.length * 0.75));
    const again = drawMarket({ gameId: 'g', round: 1, faPool: fa, absentCounts: zeroAbsent, extraPids: [] });
    expect(again.available).toEqual(d1.available);
    const d2 = drawMarket({ gameId: 'g', round: 2, faPool: fa, absentCounts: d1.absentCounts, extraPids: [] });
    expect(d2.available.length).toBeGreaterThanOrEqual(Math.floor(fa.length * 0.45));
  });
  it('forces players absent two consecutive rounds back in', () => {
    let absent = { ...zeroAbsent };
    const missing = [];
    for (let r = 1; r <= 4; r++) {
      const d = drawMarket({ gameId: 'g2', round: r, faPool: fa, absentCounts: absent, extraPids: [] });
      absent = d.absentCounts;
      for (const [pid, n] of Object.entries(absent)) if (n > 2) missing.push(pid);
    }
    expect(missing).toEqual([]);   // nobody is ever absent 3 rounds running
  });
});

describe('validateSigning', () => {
  const cheap = fa.reduce((a, b) => (+a.salary_per_round < +b.salary_per_round ? a : b));
  const baseTeam = { roster: [], deadMoney: [] };
  it('prices with inflation and discount', () => {
    const { contract } = validateSigning({
      team: baseTeam, pid: cheap.pid, years: 3, round: 2,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false });
    expect(contract.rate).toBe(contractRate(askPrice(+cheap.salary_per_round, 2), 3));
    expect(contract.startRound).toBe(2);
  });
  it('rejects out-of-market, full roster, over-cap, bad years', () => {
    expect(() => validateSigning({ team: baseTeam, pid: cheap.pid, years: 1, round: 2,
      marketAvailable: [], catalogById: byId, isResign: false })).toThrow('NOT_IN_MARKET');
    const full = { roster: Array.from({ length: 10 }, (_, i) => ({ pid: 9000 + i, rate: 2, startRound: 1, years: 5 })), deadMoney: [] };
    expect(() => validateSigning({ team: full, pid: cheap.pid, years: 1, round: 1,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('ROSTER_FULL');
    const broke = { roster: [{ pid: 1, rate: 99.5, startRound: 1, years: 5 }], deadMoney: [] };
    expect(() => validateSigning({ team: broke, pid: cheap.pid, years: 1, round: 1,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('CAP_EXCEEDED');
    expect(() => validateSigning({ team: baseTeam, pid: cheap.pid, years: 3, round: 4,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('BAD_YEARS');
  });
});

describe('runHardship', () => {
  it('fills a stranded team to a legal 8 with cap-exempt 1-round deals', () => {
    const stranded = { teamId: 't1', roster: [], deadMoney: [{ rate: 99.0, startRound: 2, endRound: 5 }] };
    const [fix] = runHardship({ teams: [stranded], faPool: fa, round: 2, catalogById: byId });
    expect(fix.signings.length).toBe(8);
    const pos = fix.signings.map((c) => byId[c.pid].position).sort().join('');
    expect(pos.match(/G/g).length).toBeGreaterThanOrEqual(3);
    expect(pos.match(/B/g).length).toBeGreaterThanOrEqual(2);
    expect(fix.signings.every((c) => c.years === 1 && c.hardship)).toBe(true);
  });
  it('leaves healthy teams alone', () => {
    const ok = { teamId: 't2', roster: Array.from({ length: 8 }, (_, i) => ({
      pid: fa[i * 3].pid, rate: 3, startRound: 2, years: 2 })), deadMoney: [] };
    // note: force 3G/3W/2B by picking from position-sorted fa in the real test body
    const res = runHardship({ teams: [ok], faPool: fa, round: 2, catalogById: byId });
    expect(res).toEqual([]);
  });
});
```

(In Step 3, when the healthy-team test needs a legal roster, build it from position-filtered FA lists exactly as `runHardship` counts them: contracts covering `round` with ≥2 G, ≥2 W, ≥1 B and ≥8 active.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/market.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement `market.js`**

```js
import { makeRng } from './rng.js';
import { askPrice, contractRate, capOkWith, payrollAt, CAP, TOTAL_ROUNDS } from './payroll.js';

const DRAW_SHARE = { first: 0.75, later: 0.45 };
export const LINEUP_NEED = { G: 2, W: 2, B: 1 };

export function drawMarket({ gameId, round, faPool, absentCounts, extraPids = [] }) {
  const rng = makeRng(`${gameId}|market|${round}`);
  const share = round === 1 ? DRAW_SHARE.first : DRAW_SHARE.later;
  const n = Math.floor(faPool.length * share);
  const forced = faPool.filter((p) => (absentCounts[p.pid] ?? 0) >= 2).map((p) => p.pid);
  const others = rng.shuffle(faPool.filter((p) => !forced.includes(p.pid)).map((p) => p.pid));
  const available = [...new Set([...extraPids, ...forced, ...others.slice(0, Math.max(0, n - forced.length))])];
  const next = {};
  for (const p of faPool) next[p.pid] = available.includes(p.pid) ? 0 : (absentCounts[p.pid] ?? 0) + 1;
  return { available, absentCounts: next };
}

export function validateSigning({ team, pid, years, round, marketAvailable, catalogById, isResign }) {
  const p = catalogById[pid];
  if (!p) throw new Error('NOT_IN_MARKET');
  const maxYears = TOTAL_ROUNDS - round + 1;
  if (!Number.isInteger(years) || years < 1 || years > maxYears) throw new Error('BAD_YEARS');
  if (!isResign && !marketAvailable.includes(pid)) throw new Error('NOT_IN_MARKET');
  if (team.roster.some((c) => c.pid === pid && c.startRound + c.years - 1 >= round))
    throw new Error('ALREADY_SIGNED');
  const active = team.roster.filter((c) => c.startRound + c.years - 1 >= round);
  if (active.length >= 10) throw new Error('ROSTER_FULL');
  const base = Number(p.salary_per_round);
  if (!base) throw new Error('NOT_IN_MARKET');           // auction-class: no list price
  const rate = contractRate(askPrice(base, round), years);
  const contract = { pid, rate, startRound: round, years, viaAuction: false, hardship: false };
  const cap = capOkWith(team, contract, CAP, TOTAL_ROUNDS);
  if (!cap.ok) throw new Error(`CAP_EXCEEDED:${cap.worstRound}:${cap.worstPayroll}`);
  return { contract };
}

function activeByPos(team, round, catalogById) {
  const counts = { G: 0, W: 0, B: 0 }; let total = 0;
  for (const c of team.roster) {
    if (c.startRound + c.years - 1 < round) continue;
    counts[catalogById[c.pid].position] += 1; total += 1;
  }
  return { counts, total };
}

export function runHardship({ teams, faPool, round, catalogById }) {
  const out = [];
  for (const team of teams) {
    const { counts, total } = activeByPos(team, round, catalogById);
    const deficits = { G: Math.max(0, 3 - counts.G), W: Math.max(0, 3 - counts.W), B: Math.max(0, 2 - counts.B) };
    let fill = Math.max(8 - total, deficits.G + deficits.W + deficits.B);
    if (fill <= 0) continue;
    const owned = new Set(team.roster.map((c) => c.pid));
    const cheap = [...faPool].filter((p) => !owned.has(p.pid))
      .sort((a, b) => +a.salary_per_round - +b.salary_per_round);
    const signings = [];
    const take = (pred) => {
      const i = cheap.findIndex(pred);
      if (i === -1) return false;
      const p = cheap.splice(i, 1)[0];
      signings.push({ pid: p.pid, rate: askPrice(+p.salary_per_round, round), startRound: round,
                      years: 1, viaAuction: false, hardship: true });   // cap-exempt by rule
      return true;
    };
    for (const pos of ['G', 'W', 'B'])
      for (let k = 0; k < deficits[pos]; k++) take((p) => p.position === pos);
    while (signings.length < fill) if (!take(() => true)) break;
    if (signings.length) out.push({ teamId: team.teamId, signings });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/market.test.js` — Expected: all pass (adjust the healthy-roster fixture per Step 1 note).

- [ ] **Step 5: Wire callables + hooks in `game.js`** (append):

```js
import { drawMarket, validateSigning, runHardship } from './market.js';
import { cutPlayer, expiringPids } from './payroll.js';
import playersData from './data/players.json' with { type: 'json' };

const CATALOG = Object.fromEntries(playersData.map((p) => [p.pid, p]));
const FA_POOL = playersData.filter((p) => !p.auction_round);

async function memberWithRole(gameId, uid, role) {
  const m = await db().doc(`games/${gameId}/players/${uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not in this game');
  if (m.data().role !== role) throw new HttpsError('permission-denied', `${role} only`);
  return m.data();
}

export const signPlayer = onCall(async (req) => {
  const { gameId, pid, years } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    const isResign = g.phase === 'FRONT_OFFICE';
    if (!isResign && g.phase !== 'FREE_AGENCY')
      throw new HttpsError('failed-precondition', 'market is closed');
    const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
    const team = (await tx.get(teamRef)).data();
    const market = isResign ? { available: [] }
      : (await tx.get(db().doc(`games/${gameId}/market/${g.round}`))).data();
    if (isResign && !expiringPids(team, g.round).includes(pid))
      throw new HttpsError('failed-precondition', 'only expiring contracts re-sign here');
    let contract;
    try {
      ({ contract } = validateSigning({ team, pid, years, round: g.round,
        marketAvailable: market.available, catalogById: CATALOG, isResign }));
    } catch (e) { throw new HttpsError('failed-precondition', e.message); }
    const roster = team.roster.filter((c) => !(c.pid === pid)).concat(contract);
    tx.update(teamRef, { roster });
    return { contract };
  });
});

export const cutRosterPlayer = onCall(async (req) => {
  const { gameId, pid } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (!['FRONT_OFFICE', 'FREE_AGENCY'].includes(g.phase))
      throw new HttpsError('failed-precondition', 'cuts happen in front office or free agency');
    const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
    const team = (await tx.get(teamRef)).data();
    const after = cutPlayer({ ...team, roster: team.roster, deadMoney: team.deadMoney }, pid, g.round);
    tx.update(teamRef, { roster: after.roster, deadMoney: after.deadMoney });
    return { deadMoney: after.deadMoney };
  });
});

// -------- phase hooks
HOOKS['enter:FREE_AGENCY'] = async (gameId, round) => {
  if (round === 1) return; // startSeason already drew round 1
  const prev = (await db().doc(`games/${gameId}/market/${round - 1}`).get()).data();
  const auctionPrev = (await db().doc(`games/${gameId}/auctions/${round - 1}`).get()).data();
  const unsold = (auctionPrev?.results ?? []).filter((r) => !r.teamId).map((r) => r.pid);
  const d = drawMarket({ gameId, round, faPool: FA_POOL,
    absentCounts: prev?.absentCounts ?? {}, extraPids: unsold });
  await db().doc(`games/${gameId}/market/${round}`)
    .set({ available: d.available, absentCounts: d.absentCounts });
};

HOOKS['FREE_AGENCY'] = async (gameId, round) => {   // exit hook: hardship
  const teams = await db().collection(`games/${gameId}/teams`).get();
  const fixes = runHardship({
    teams: teams.docs.map((t) => ({ teamId: t.id, ...t.data() })),
    faPool: FA_POOL, round, catalogById: CATALOG });
  for (const f of fixes) {
    const ref = db().doc(`games/${gameId}/teams/${f.teamId}`);
    const cur = (await ref.get()).data();
    await ref.update({ roster: [...cur.roster, ...f.signings],
                       hardshipUsed: [...cur.hardshipUsed, round] });
  }
};
```

Also persist `absentCounts` in `startSeason`'s round-1 market write: change its `set` to include the `absentCounts` returned by a `drawMarket` call (replace the inline shuffle in Task 7 with `drawMarket({ gameId, round: 1, faPool, absentCounts: {}, extraPids: [] })`). Export new callables from `index.js`.

- [ ] **Step 6: Run full unit + lifecycle suites, then commit**

Run: `npx vitest run test/market.test.js` and the `emulators:exec` lifecycle suite — Expected: all pass.

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): rotating market, signing/cutting/re-signing, hardship rule"
```

---

### Task 10: Star auction

**Files:**
- Create: `backend/functions/src/auction.js`
- Modify: `backend/functions/src/game.js` (callable `submitBids`, hooks), `index.js`
- Test: `backend/functions/test/auction.test.js`

**Interfaces:**
- Consumes: `payroll.js` (`minBid`, `capOkWith`, `hypeCurve`), `rng.js`.
- Produces:
  - `validateBids({ bids, round, starPids }) -> void|throw` — `bids = { [pid]: {rate, years} }`; rate ≥ `minBid(round)`, multiple of 0.1; years 1..(6-round); pid in tonight's wave; one bid per star (object shape enforces).
  - `resolveAuction({ bids: [{teamId, pid, rate, years}], teams, round, seed, catalogById }) -> { awards: [{pid, teamId|null, rate, years, guaranteed}], teamsAfter }` — sort by `guaranteed = rate*years` desc, ties broken by seeded rng; award skipped if winner fails cap (all covered rounds) or roster ≥10 at that moment; losers pay nothing; unsold ⇒ `teamId: null`.
- Callable `submitBids({ gameId, bids })` — Scout only, AUCTION phase, writes `teams/{t}/private/auction`.
- Hooks: `enter:AUCTION` → write `auctions/{round} = { stars: [pids with auction_round == round] }`; exit `AUCTION` → gather private bids, resolve, append contracts (`viaAuction: true`), write `results`.

- [ ] **Step 1: Write the failing tests**

`backend/functions/test/auction.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateBids, resolveAuction } from '../src/auction.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const wave1 = players.filter((p) => +p.auction_round === 1).map((p) => p.pid);
const mkTeam = (id, roster = []) => ({ teamId: id, roster, deadMoney: [] });

describe('validateBids', () => {
  it('enforces min bid, step, years, wave membership', () => {
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 1.5, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('MIN_BID');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 5.05, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('BID_STEP');
    expect(() => validateBids({ bids: { 999999: { rate: 5, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('NOT_IN_WAVE');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 5, years: 6 } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_YEARS');
    validateBids({ bids: { [wave1[0]]: { rate: 5.0, years: 3 } }, round: 1, starPids: wave1 });
  });
});

describe('resolveAuction', () => {
  it('highest guaranteed money wins; loser pays nothing', () => {
    const bids = [
      { teamId: 'a', pid: wave1[0], rate: 8.0, years: 3 },   // 24 gtd
      { teamId: 'b', pid: wave1[0], rate: 11.5, years: 1 },  // 11.5 gtd
    ];
    const { awards, teamsAfter } = resolveAuction({ bids,
      teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 's', catalogById: byId });
    expect(awards[0]).toMatchObject({ pid: wave1[0], teamId: 'a', guaranteed: 24 });
    expect(teamsAfter.find((t) => t.teamId === 'a').roster).toHaveLength(1);
    expect(teamsAfter.find((t) => t.teamId === 'b').roster).toHaveLength(0);
  });
  it('skips winners who fail cap or roster and falls to next bid', () => {
    const broke = mkTeam('a', [{ pid: 1, rate: 95.0, startRound: 1, years: 5 }]);
    const bids = [
      { teamId: 'a', pid: wave1[1], rate: 20.0, years: 2 },  // 40 gtd but over cap
      { teamId: 'b', pid: wave1[1], rate: 3.0, years: 2 },   // 6 gtd, legal
    ];
    const { awards } = resolveAuction({ bids, teams: [broke, mkTeam('b')],
      round: 1, seed: 's', catalogById: byId });
    expect(awards.find((a) => a.pid === wave1[1]).teamId).toBe('b');
  });
  it('unsold stars resolve to teamId null; ties are deterministic per seed', () => {
    const bids = [
      { teamId: 'a', pid: wave1[2], rate: 6.0, years: 2 },
      { teamId: 'b', pid: wave1[2], rate: 4.0, years: 3 },   // both 12 gtd — tie
    ];
    const r1 = resolveAuction({ bids, teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 'z', catalogById: byId });
    const r2 = resolveAuction({ bids, teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 'z', catalogById: byId });
    expect(r1.awards).toEqual(r2.awards);
    const unsoldPid = wave1[3];
    expect(r1.awards.find((a) => a.pid === unsoldPid)).toMatchObject({ pid: unsoldPid, teamId: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/auction.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement `auction.js`**

```js
import { makeRng } from './rng.js';
import { minBid, capOkWith, CAP, TOTAL_ROUNDS } from './payroll.js';

export function validateBids({ bids, round, starPids }) {
  const maxYears = TOTAL_ROUNDS - round + 1;
  for (const [pidStr, b] of Object.entries(bids ?? {})) {
    const pid = Number(pidStr);
    if (!starPids.includes(pid)) throw new Error('NOT_IN_WAVE');
    if (!Number.isInteger(b.years) || b.years < 1 || b.years > maxYears) throw new Error('BAD_YEARS');
    if (b.rate < minBid(round) - 1e-9) throw new Error('MIN_BID');
    if (Math.abs(b.rate * 10 - Math.round(b.rate * 10)) > 1e-6) throw new Error('BID_STEP');
  }
}

export function resolveAuction({ bids, teams, round, seed, catalogById }) {
  const rng = makeRng(`${seed}|auction|${round}`);
  const teamsAfter = teams.map((t) => ({ ...t, roster: [...t.roster] }));
  const byTeam = Object.fromEntries(teamsAfter.map((t) => [t.teamId, t]));
  const expanded = bids.map((b) => ({ ...b, guaranteed: Math.round(b.rate * b.years * 10) / 10,
                                      tiebreak: rng.next() }));
  expanded.sort((a, b) => b.guaranteed - a.guaranteed || a.tiebreak - b.tiebreak);
  const starPids = [...new Set(bids.map((b) => b.pid))];
  const sold = new Set();
  const awards = [];
  for (const bid of expanded) {
    if (sold.has(bid.pid)) continue;
    const team = byTeam[bid.teamId];
    const active = team.roster.filter((c) => c.startRound + c.years - 1 >= round);
    if (active.length >= 10) continue;                                   // roster skip
    const contract = { pid: bid.pid, rate: bid.rate, startRound: round, years: bid.years,
                       viaAuction: true, hardship: false };
    if (!capOkWith(team, contract, CAP, TOTAL_ROUNDS).ok) continue;      // cap skip
    team.roster.push(contract);
    sold.add(bid.pid);
    awards.push({ pid: bid.pid, teamId: bid.teamId, rate: bid.rate, years: bid.years,
                  guaranteed: bid.guaranteed });
  }
  for (const pid of starPids) if (!sold.has(pid))
    awards.push({ pid, teamId: null, rate: null, years: null, guaranteed: null });
  return { awards, teamsAfter };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/auction.test.js`. Note the unsold test requires the wave to contain an un-bid star: assert against `wave1[3]` only after confirming resolveAuction reports ALL of tonight's stars — adjust `resolveAuction` to accept `starPids` explicitly if the test shows un-bid stars missing: signature `resolveAuction({ bids, starPids, ... })`, and unsold = starPids − sold. Make that adjustment now (it is the correct contract; the hook passes tonight's wave).

- [ ] **Step 5: Wire callable + hooks in `game.js`** (append):

```js
import { validateBids, resolveAuction } from './auction.js';
import { hypeCurve } from './payroll.js';

export const submitBids = onCall(async (req) => {
  const { gameId, bids } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'Scout');
  const g = (await db().doc(`games/${gameId}`).get()).data();
  if (g.phase !== 'AUCTION') throw new HttpsError('failed-precondition', 'auction is closed');
  const wave = (await db().doc(`games/${gameId}/auctions/${g.round}`).get()).data();
  try { validateBids({ bids, round: g.round, starPids: wave.stars }); }
  catch (e) { throw new HttpsError('invalid-argument', e.message); }
  await db().doc(`games/${gameId}/teams/${teamId}/private/auction`).set({ bids, round: g.round });
  return { accepted: Object.keys(bids).length };
});

HOOKS['enter:AUCTION'] = async (gameId, round) => {
  const stars = playersData.filter((p) => +p.auction_round === round).map((p) => p.pid);
  await db().doc(`games/${gameId}/auctions/${round}`).set({ stars });
};

HOOKS['AUCTION'] = async (gameId, round) => {
  const wave = (await db().doc(`games/${gameId}/auctions/${round}`).get()).data();
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const bids = [];
  for (const t of teams) {
    const priv = await db().doc(`games/${gameId}/teams/${t.teamId}/private/auction`).get();
    if (!priv.exists || priv.data().round !== round) continue;
    for (const [pid, b] of Object.entries(priv.data().bids))
      bids.push({ teamId: t.teamId, pid: Number(pid), rate: b.rate, years: b.years });
  }
  const { awards, teamsAfter } = resolveAuction({ bids, starPids: wave.stars, teams,
    round, seed: gameId, catalogById: CATALOG });
  const batch = db().batch();
  for (const t of teamsAfter)
    batch.update(db().doc(`games/${gameId}/teams/${t.teamId}`), { roster: t.roster });
  batch.update(db().doc(`games/${gameId}/auctions/${round}`), { results: awards });
  // unsold stars gain an FA list price for next round's rotation
  for (const a of awards.filter((x) => !x.teamId)) {
    const star = CATALOG[a.pid];
    batch.set(db().doc(`games/${gameId}/unsold/${a.pid}`),
      { pid: a.pid, listBase: Math.round(hypeCurve(+star.hype) * 10) / 10, fromRound: round + 1 });
  }
  await batch.commit();
};
```

(`enter:FREE_AGENCY` from Task 9 already pulls unsold pids from the previous auction results; extend it to read `unsold/*` list prices when validating signings for those pids — `validateSigning` gets `unsoldPrices = { pid: listBase }` and uses it when `salary_per_round` is blank. Make that small change to `market.js::validateSigning` signature now and add one test: an unsold star with `listBase 26.0` prices at `contractRate(askPrice(26.0, r), years)`.)

- [ ] **Step 6: Run everything, commit**

Run: `npx vitest run` (unit) + `emulators:exec` suites — Expected: all pass.

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): sealed-bid auction — guaranteed-money resolution, unsold fallback"
```

---

### Task 11: Lineup submission, validation, auto-repair

**Files:**
- Create: `backend/functions/src/lineup.js`
- Modify: `backend/functions/src/game.js` (callable `submitLineup`, LINEUP exit hook), `index.js`
- Test: `backend/functions/test/lineup.test.js`

**Interfaces:**
- Consumes: `engine.js::pickLineup`, catalog positions, public sticker mins (`mins_per_game`).
- Produces:
  - `PLAYSTYLES = ['Balanced', 'Run & Gun', '3PT Barrage', 'Inside Attack', 'Lockdown']`
  - `validateLineup({ lineup, activePids, catalogById }) -> void|throw` — `lineup = {starters[5], sixth, bench[], playstyle}`; starters exactly 2G/2W/1B from active roster; sixth ∉ starters; bench = remaining actives (order = client-chosen; first two count); playstyle ∈ enum; codes `BAD_TEMPLATE`, `NOT_ON_ROSTER`, `DUPLICATE_PLAYER`, `BAD_PLAYSTYLE`.
  - `autoRepair({ prevLineup, activePids, catalogById }) -> lineup` — keep still-valid assignments; fill gaps greedily by public `mins_per_game` desc (never hidden TI); playstyle carried (default `Balanced`).

- [ ] **Step 1: Write the failing tests**

`backend/functions/test/lineup.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateLineup, autoRepair, PLAYSTYLES } from '../src/lineup.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const gs = players.filter((p) => p.position === 'G').slice(0, 4).map((p) => p.pid);
const ws = players.filter((p) => p.position === 'W').slice(0, 3).map((p) => p.pid);
const bs = players.filter((p) => p.position === 'B').slice(0, 2).map((p) => p.pid);
const active = [...gs.slice(0, 3), ...ws, ...bs];           // 3G 3W 2B = 8
const legal = { starters: [gs[0], gs[1], ws[0], ws[1], bs[0]], sixth: gs[2],
                bench: [ws[2], bs[1]], playstyle: 'Lockdown' };

describe('validateLineup', () => {
  it('accepts a legal lineup', () => {
    validateLineup({ lineup: legal, activePids: active, catalogById: byId });
  });
  it('rejects bad template / duplicates / foreign players / bad style', () => {
    const threeG = { ...legal, starters: [gs[0], gs[1], gs[2], ws[0], bs[0]], sixth: ws[1] };
    expect(() => validateLineup({ lineup: threeG, activePids: active, catalogById: byId })).toThrow('BAD_TEMPLATE');
    const dup = { ...legal, sixth: gs[0] };
    expect(() => validateLineup({ lineup: dup, activePids: active, catalogById: byId })).toThrow('DUPLICATE_PLAYER');
    const foreign = { ...legal, bench: [gs[3]] };
    expect(() => validateLineup({ lineup: foreign, activePids: active, catalogById: byId })).toThrow('NOT_ON_ROSTER');
    const style = { ...legal, playstyle: 'Chaos' };
    expect(() => validateLineup({ lineup: style, activePids: active, catalogById: byId })).toThrow('BAD_PLAYSTYLE');
  });
});

describe('autoRepair', () => {
  it('repairs after roster churn using public mins only, keeps playstyle', () => {
    const churned = active.filter((p) => p !== legal.starters[0]);   // lost a starting G
    const fixed = autoRepair({ prevLineup: legal, activePids: churned, catalogById: byId });
    validateLineup({ lineup: fixed, activePids: churned, catalogById: byId });
    expect(fixed.playstyle).toBe('Lockdown');
  });
  it('builds from nothing (round 1 timeout)', () => {
    const fixed = autoRepair({ prevLineup: null, activePids: active, catalogById: byId });
    validateLineup({ lineup: fixed, activePids: active, catalogById: byId });
    expect(fixed.playstyle).toBe('Balanced');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/lineup.test.js`.

- [ ] **Step 3: Implement `lineup.js`**

```js
export const PLAYSTYLES = ['Balanced', 'Run & Gun', '3PT Barrage', 'Inside Attack', 'Lockdown'];
const TEMPLATE = { G: 2, W: 2, B: 1 };

export function validateLineup({ lineup, activePids, catalogById }) {
  const { starters, sixth, bench, playstyle } = lineup;
  if (!PLAYSTYLES.includes(playstyle)) throw new Error('BAD_PLAYSTYLE');
  const all = [...starters, sixth, ...bench].filter((p) => p != null);
  if (new Set(all).size !== all.length) throw new Error('DUPLICATE_PLAYER');
  for (const pid of all) if (!activePids.includes(pid)) throw new Error('NOT_ON_ROSTER');
  if (all.length !== activePids.length) throw new Error('NOT_ON_ROSTER'); // everyone assigned
  if (starters.length !== 5 || sixth == null) throw new Error('BAD_TEMPLATE');
  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of starters) counts[catalogById[pid].position] += 1;
  if (counts.G !== TEMPLATE.G || counts.W !== TEMPLATE.W || counts.B !== TEMPLATE.B)
    throw new Error('BAD_TEMPLATE');
}

export function autoRepair({ prevLineup, activePids, catalogById }) {
  const byMins = [...activePids].sort(
    (a, b) => +catalogById[b].mins_per_game - +catalogById[a].mins_per_game);
  const keep = (pid) => pid != null && activePids.includes(pid);
  const need = { ...TEMPLATE };
  const starters = [];
  for (const pid of prevLineup?.starters ?? []) {
    if (!keep(pid)) continue;
    const pos = catalogById[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  for (const pid of byMins) {
    if (starters.includes(pid)) continue;
    const pos = catalogById[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = byMins.filter((p) => !starters.includes(p));
  let sixth = keep(prevLineup?.sixth) && !starters.includes(prevLineup.sixth)
    ? prevLineup.sixth : rest[0];
  const bench = rest.filter((p) => p !== sixth);
  return { starters, sixth, bench, playstyle: prevLineup?.playstyle ?? 'Balanced' };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/lineup.test.js`.

- [ ] **Step 5: Wire callable + LINEUP exit hook in `game.js`** (append):

```js
import { validateLineup, autoRepair } from './lineup.js';

const activePidsOf = (team, round) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round).map((c) => c.pid);

export const submitLineup = onCall(async (req) => {
  const { gameId, lineup } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'Coach');
  const g = (await db().doc(`games/${gameId}`).get()).data();
  if (g.phase !== 'LINEUP') throw new HttpsError('failed-precondition', 'lineups are locked');
  const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
  const team = (await teamRef.get()).data();
  try { validateLineup({ lineup, activePids: activePidsOf(team, g.round), catalogById: CATALOG }); }
  catch (e) { throw new HttpsError('invalid-argument', e.message); }
  await teamRef.update({ lineup, lineupLockedRound: g.round });
  return { ok: true };
});

HOOKS['LINEUP'] = async (gameId, round) => {   // exit: repair every non-submitted lineup
  const teams = await db().collection(`games/${gameId}/teams`).get();
  for (const t of teams.docs) {
    const team = t.data();
    const active = activePidsOf(team, round);
    let lineup = team.lineup;
    try { validateLineup({ lineup, activePids: active, catalogById: CATALOG }); }
    catch { lineup = autoRepair({ prevLineup: team.lineup, activePids: active, catalogById: CATALOG }); }
    await t.ref.update({ lineup, lineupLockedRound: round });
  }
};
```

Export `submitLineup` from `index.js`.

- [ ] **Step 6: Run all suites, commit**

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): lineup validation, submission, auto-repair"
```

---

### Task 12: Simulation — round robin, box scores, awards, standings, CSV feed

**Files:**
- Create: `backend/functions/src/sim.js`
- Modify: `backend/functions/src/game.js` (SIMULATE entry hook), `index.js`
- Test: `backend/functions/test/sim.test.js`

**Interfaces:**
- Consumes: `engine.js` (teamStrength, winProb, hidden exp stats), `rng.js`.
- Produces: `simulateRound({ gameId, round, teams, catalogById }) -> { games, boxRows, awards, standings }` where
  - `teams = [{ teamId, name, lineup, wins, losses, pointDiff, pointsFor, roster }]`
  - `games = [{ home, away, homeScore, awayScore }]` — full round robin, one game per pair
  - `boxRows` = one object per player-game matching the 23-column feed contract (§7.2): `round, game_id, team, opponent, team_score, opp_score, win, player_id, player_name, position, tier, mins, pts, fgm, fga, three_pm, three_pa, rebounds, assists, steals, blocks, turnovers, playstyle`
  - `awards = { roundMvp: {pid, teamId, line}, topScorer: {...}, bargain: {pid, teamId, perDollar} }` (names: "Round MVP", "Top Scorer", "Bargain of the Round" — no emojis)
  - `standings = [{ teamId, name, wins, losses, pointDiff, pointsFor, rank }]` — tiebreak wins → pointDiff → pointsFor → seeded coin
  - `toCsv(boxRows) -> string`
- Box-score construction (arithmetically consistent by design, mirroring the datagen guarantee):
  1. minutes by tier: starters 33, sixth 24, bench[0..1] 15, inactive 0; scale so team total = 240.
  2. per player: `fga_i = exp.fga × pace × mf` (mf = mins_i / exp.mins clamped 0.5–1.6), `fga3_i = round(fga_i × exp.fga3_share)`, makes via seeded binomials at exp percentages, `ftm_i ~ Poisson(exp.ft rate)` approximated `round(max(0, normal(0.14 × fga_i, 1)))`, `pts_i = 2·(fgm_i − fgm3_i) + 3·fgm3_i + ftm_i`; rebounds/assists/steals/blocks/turnovers = `round(max(0, normal(exp.stat × pace × mf, 0.35 × sqrt(exp.stat + .2))))`.
  3. team score = Σ pts_i. Winner decided FIRST by `winProb` Bernoulli; if the summed scores contradict the winner, add baskets (one fgm2 + fga to the winner's top scorer, iterate) until `winnerScore > loserScore`.
- Determinism: rng seed `` `${gameId}|sim|${round}|${home}|${away}` ``.

- [ ] **Step 1: Write the failing tests**

`backend/functions/test/sim.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { simulateRound, toCsv } from '../src/sim.js';
import { autoRepair } from '../src/lineup.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const fa = players.filter((p) => !p.auction_round);
function mkTeam(id, offset) {
  const g = fa.filter((p) => p.position === 'G').slice(offset, offset + 3);
  const w = fa.filter((p) => p.position === 'W').slice(offset, offset + 3);
  const b = fa.filter((p) => p.position === 'B').slice(offset, offset + 2);
  const roster = [...g, ...w, ...b].map((p) => ({ pid: p.pid, rate: 5, startRound: 1, years: 5 }));
  const lineup = autoRepair({ prevLineup: null, activePids: roster.map((c) => c.pid), catalogById: byId });
  return { teamId: id, name: id, lineup, roster, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0 };
}
const teams = [mkTeam('t1', 0), mkTeam('t2', 3), mkTeam('t3', 6), mkTeam('t4', 9)];

describe('simulateRound', () => {
  const out = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
  it('plays a full round robin with consistent scores', () => {
    expect(out.games).toHaveLength(6);          // C(4,2)
    for (const g of out.games) {
      expect(g.homeScore).not.toBe(g.awayScore);
      const rows = out.boxRows.filter((r) => r.game_id === g.game_id && r.team === g.home);
      const pts = rows.reduce((s, r) => s + r.pts, 0);
      expect(pts).toBe(g.homeScore);            // box sums to score
      for (const r of rows) {
        expect(r.pts).toBeGreaterThanOrEqual(2 * (r.fgm - r.three_pm) + 3 * r.three_pm);
        expect(r.fgm).toBeLessThanOrEqual(r.fga);
        expect(r.three_pm).toBeLessThanOrEqual(r.three_pa);
      }
    }
  });
  it('is deterministic', () => {
    const again = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
    expect(again.games).toEqual(out.games);
  });
  it('produces standings with total wins = total games', () => {
    const wins = out.standings.reduce((s, t) => s + t.wins, 0);
    expect(wins).toBe(6);
    expect(out.standings[0].rank).toBe(1);
  });
  it('emits the 23-column feed and awards', () => {
    const csv = toCsv(out.boxRows);
    expect(csv.split('\n')[0].split(',')).toHaveLength(23);
    expect(csv.split('\n')[0]).toContain('playstyle');
    expect(out.awards.roundMvp.pid).toBeTruthy();
    expect(out.awards.bargain.perDollar).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim.test.js`.

- [ ] **Step 3: Implement `sim.js`**

```js
import { makeRng } from './rng.js';
import { teamStrength, winProb, loadEngine } from './engine.js';

const { hidden, params } = loadEngine();
const TIER_MINS = { starter: 33, sixth: 24, bench: 15 };

function playerSlots(lineup) {
  const out = lineup.starters.map((pid) => [pid, 'starter']);
  out.push([lineup.sixth, 'sixth']);
  lineup.bench.slice(0, 2).forEach((pid) => out.push([pid, 'bench']));
  return out;
}

function teamBox(rng, lineup, pace) {
  const slots = playerSlots(lineup);
  const rawMins = slots.map(([, tier]) => TIER_MINS[tier]);
  const scale = 240 / rawMins.reduce((a, b) => a + b, 0);
  return slots.map(([pid, tier], i) => {
    const e = hidden[pid].exp;
    const mins = Math.round(rawMins[i] * scale);
    const mf = Math.min(1.6, Math.max(0.5, mins / e.mins));
    const fga = Math.max(1, Math.round(e.fga * pace * mf + rng.normal(0, 1.1)));
    const fga3 = Math.min(fga, Math.round(fga * e.fga3_share));
    const fga2 = fga - fga3;
    const binom = (n, p) => { let k = 0; for (let t = 0; t < n; t++) if (rng.next() < p) k++; return k; };
    // split expected fg% into 2P/3P using the same shares the generator used
    const p3 = e.three_pt_pct;
    const p2 = fga2 > 0 ? Math.min(0.72, Math.max(0.3, (e.fg_pct * fga - p3 * fga3) / fga2)) : 0.5;
    const fgm3 = binom(fga3, p3);
    const fgm2 = binom(fga2, p2);
    const ftm = Math.max(0, Math.round(rng.normal(0.14 * fga, 1)));
    const stat = (x) => Math.max(0, Math.round(rng.normal(x * pace * mf, 0.35 * Math.sqrt(x + 0.2))));
    return { pid, tier, mins, fga, three_pa: fga3, fgm: fgm2 + fgm3, three_pm: fgm3,
             pts: 2 * fgm2 + 3 * fgm3 + ftm,
             rebounds: stat(e.rebounds), assists: stat(e.assists), steals: stat(e.steals),
             blocks: stat(e.blocks), turnovers: stat(e.turnovers) };
  });
}

export function simulateRound({ gameId, round, teams, catalogById }) {
  const games = [], boxRows = [];
  const totals = Object.fromEntries(teams.map((t) => [t.teamId,
    { wins: t.wins, losses: t.losses, pointDiff: t.pointDiff, pointsFor: t.pointsFor }]));
  const strength = {}, style = {};
  for (const t of teams) {
    style[t.teamId] = t.lineup.playstyle;
    strength[t.teamId] = teamStrength(t.lineup.starters, t.lineup.sixth, t.lineup.bench,
                                      t.lineup.playstyle, true);
  }
  let gnum = 0;
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const A = teams[i], B = teams[j];
    gnum += 1;
    const gameId2 = `R${round}-G${String(gnum).padStart(3, '0')}`;
    const rng = makeRng(`${gameId}|sim|${round}|${A.teamId}|${B.teamId}`);
    const p = winProb(strength[A.teamId], strength[B.teamId], style[A.teamId], style[B.teamId]);
    const aWins = rng.next() < p;
    const paceA = params.pace[style[A.teamId]], paceB = params.pace[style[B.teamId]];
    const paceAvg = (paceA + paceB) / 2;
    const boxA = teamBox(rng, A.lineup, paceAvg);
    const boxB = teamBox(rng, B.lineup, paceAvg);
    const sum = (b) => b.reduce((s, r) => s + r.pts, 0);
    const [winBox, loseBox] = aWins ? [boxA, boxB] : [boxB, boxA];
    while (sum(winBox) <= sum(loseBox)) {         // enforce the decided winner, keep box honest
      const top = winBox.reduce((a, b) => (a.pts >= b.pts ? a : b));
      top.pts += 2; top.fgm += 1; top.fga += 1;
    }
    const [as, bs] = [sum(boxA), sum(boxB)];
    games.push({ game_id: gameId2, home: A.teamId, away: B.teamId, homeScore: as, awayScore: bs });
    totals[A.teamId][as > bs ? 'wins' : 'losses'] += 1;
    totals[B.teamId][bs > as ? 'wins' : 'losses'] += 1;
    totals[A.teamId].pointDiff += as - bs; totals[A.teamId].pointsFor += as;
    totals[B.teamId].pointDiff += bs - as; totals[B.teamId].pointsFor += bs;
    const emit = (box, team, opp, ts, os) => {
      for (const r of box) boxRows.push({
        round, game_id: gameId2, team: team.name, opponent: opp.name,
        team_score: ts, opp_score: os, win: ts > os ? 1 : 0,
        player_id: r.pid, player_name: catalogById[r.pid].name,
        position: catalogById[r.pid].position, tier: r.tier, mins: r.mins, pts: r.pts,
        fgm: r.fgm, fga: r.fga, three_pm: r.three_pm, three_pa: r.three_pa,
        rebounds: r.rebounds, assists: r.assists, steals: r.steals, blocks: r.blocks,
        turnovers: r.turnovers, playstyle: team.lineup.playstyle });
    };
    emit(boxA, A, B, as, bs); emit(boxB, B, A, bs, as);
  }
  // awards
  const gamescore = (r) => r.pts + 1.2 * r.rebounds + 1.5 * r.assists + 3 * r.steals
                          + 3 * r.blocks - 2.5 * r.turnovers;
  const best = boxRows.reduce((a, b) => (gamescore(a) >= gamescore(b) ? a : b));
  const topScorerRow = boxRows.reduce((a, b) => (a.pts >= b.pts ? a : b));
  const byPlayer = {};
  for (const r of boxRows) (byPlayer[r.player_id] ??= []).push(r);
  let bargain = null;
  for (const t of teams) for (const c of t.roster) {
    const rows = byPlayer[c.pid]; if (!rows) continue;
    const perDollar = rows.reduce((s, r) => s + gamescore(r), 0) / Math.max(2, c.rate);
    if (!bargain || perDollar > bargain.perDollar)
      bargain = { pid: c.pid, teamId: t.teamId, perDollar: Math.round(perDollar * 100) / 100 };
  }
  const teamNameById = Object.fromEntries(teams.map((t) => [t.name, t.teamId]));
  const awards = {
    roundMvp: { pid: best.player_id, teamId: teamNameById[best.team],
                line: `${best.pts} pts, ${best.rebounds} reb, ${best.assists} ast` },
    topScorer: { pid: topScorerRow.player_id, teamId: teamNameById[topScorerRow.team], pts: topScorerRow.pts },
    bargain,
  };
  // standings with full tiebreak chain
  const coin = makeRng(`${gameId}|standings|${round}`);
  const standings = teams.map((t) => ({ teamId: t.teamId, name: t.name, ...totals[t.teamId],
                                        coin: coin.next() }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff
                 || b.pointsFor - a.pointsFor || a.coin - b.coin)
    .map((t, i) => { const { coin: _c, ...rest } = t; return { ...rest, rank: i + 1 }; });
  return { games, boxRows, awards, standings };
}

const FEED_COLS = ['round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
  'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga', 'three_pm',
  'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'playstyle'];

export function toCsv(rows) {
  const esc = (v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v));
  return [FEED_COLS.join(','),
          ...rows.map((r) => FEED_COLS.map((c) => esc(r[c])).join(','))].join('\n');
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/sim.test.js`.

- [ ] **Step 5: Wire SIMULATE hook in `game.js`** (append):

```js
import { simulateRound, toCsv } from './sim.js';

HOOKS['enter:SIMULATE'] = async (gameId, round) => {
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const out = simulateRound({ gameId, round, teams, catalogById: CATALOG });
  const batch = db().batch();
  for (const s of out.standings) {
    batch.update(db().doc(`games/${gameId}/teams/${s.teamId}`),
      { wins: s.wins, losses: s.losses, pointDiff: s.pointDiff, pointsFor: s.pointsFor });
  }
  batch.set(db().doc(`games/${gameId}/rounds/${round}`), {
    games: out.games, awards: out.awards, standings: out.standings,
    boxCsv: toCsv(out.boxRows),
  });
  await batch.commit();
};
```

- [ ] **Step 6: Run all suites, commit**

```bash
git add games/salary-showdown/backend/functions
git commit -m "feat(salary-showdown): round-robin sim, consistent box scores, awards, standings, CSV feed"
```

---

### Task 13: Finale reveal payload

**Files:**
- Modify: `backend/functions/src/game.js` (enter:FINALE hook)
- Test: `backend/functions/test/reveal.test.js` (emulator)

**Interfaces:**
- Produces: `games/{g}/reveal/latest` written only when the game enters FINALE:
  `{ scatter: [{pid, name, hype, ti, salary, isTrap, archetype}], perTeam: [{teamId, bestSigning: {pid, valuePerDollar}, worstSigning: {...}}], trueWeights: { narrative: string, tovPerGame: number, defenseVisible: true }, winsPerDollar: [{teamId, wins, totalSpend, ratio}] }`
- `isTrap`/`archetype`/`ti` come from `hidden.json` — this is the only moment hidden data is published, and the rules (Task 6) already gate reads on `status == finished`.

- [ ] **Step 1: Write the failing test** — `backend/functions/test/reveal.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { getFirestore } from 'firebase-admin/firestore';
// setup identical to lifecycle.test.js (fft wrap, emulator env) — copy the same 8-line preamble
// then drive a 2-team game to FINALE with advancePhase in a loop.

describe('reveal', () => {
  it('does not exist before finale, exists after with hidden truths', async () => {
    // ... create game, join, startSeason (as in lifecycle.test.js)
    // loop: while phase != FINALE: advancePhase (professor)
    // before final RESULTS->FINALE advance: expect reveal missing
    // after: expect reveal.scatter.length == 175 and reveal.scatter[0].ti to be a number
  });
});
```

Fill the test body by copying the lifecycle preamble verbatim; assertions:
```js
const before = await db.doc(`games/${gameId}/reveal/latest`).get();
expect(before.exists).toBe(false);   // checked at round 5 RESULTS
// ... advancePhase once more ...
const after = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
expect(after.scatter).toHaveLength(175);
expect(typeof after.scatter[0].ti).toBe('number');
expect(after.winsPerDollar[0].ratio).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 2: Run to verify failure** (emulators:exec) — reveal never written.

- [ ] **Step 3: Implement the hook in `game.js`** (append):

```js
import hiddenData from './data/hidden.json' with { type: 'json' };

HOOKS['enter:FINALE'] = async (gameId) => {
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const scatter = playersData.map((p) => ({
    pid: p.pid, name: p.name, hype: Number(p.hype),
    salary: p.salary_per_round === '' ? null : Number(p.salary_per_round),
    ti: hiddenData[p.pid].ti,
    isTrap: ['volume_trap', 'aging_legend'].includes(hiddenData[p.pid].archetype ?? '') || undefined,
    archetype: hiddenData[p.pid].archetype,
  }));
  const perTeam = [], winsPerDollar = [];
  for (const t of teamDocs.docs) {
    const team = t.data();
    const vals = team.roster.map((c) => ({
      pid: c.pid, valuePerDollar: Math.round((hiddenData[c.pid].ti / Math.max(2, c.rate)) * 100) / 100 }));
    vals.sort((a, b) => b.valuePerDollar - a.valuePerDollar);
    perTeam.push({ teamId: t.id, bestSigning: vals[0] ?? null, worstSigning: vals.at(-1) ?? null });
    const spend = team.roster.reduce((s, c) => s + c.rate * c.years, 0)
      + team.deadMoney.reduce((s, d) => s + d.rate * (d.endRound - d.startRound + 1), 0);
    winsPerDollar.push({ teamId: t.id, wins: team.wins, totalSpend: Math.round(spend * 10) / 10,
      ratio: Math.round((team.wins / Math.max(1, spend)) * 1000) / 1000 });
  }
  await db().doc(`games/${gameId}/reveal/latest`).set({
    scatter, perTeam, winsPerDollar,
    trueWeights: {
      narrative: 'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.',
      defenseVisible: true,
    },
  });
};
```

Note: `hidden.json` from Task 2 must include `archetype` per player — add it to `hidden_entry` in `export_runtime_bundle.py` (one line: `archetype=p.archetype`) and re-run the exporter before this task's tests.

- [ ] **Step 4: Run to verify pass** (emulators:exec) — commit.

```bash
git add games/salary-showdown/backend/functions games/salary-showdown/datagen/export_runtime_bundle.py
git commit -m "feat(salary-showdown): finale reveal payload — hidden truth published only at game end"
```

---

### Task 14: Full-game smoke test

**Files:**
- Test: `backend/functions/test/smoke.test.js`

**Interfaces:**
- Consumes every callable + hook. This is the executable proof the backend plays a whole game.

- [ ] **Step 1: Write the smoke test**

`backend/functions/test/smoke.test.js` (same emulator preamble as lifecycle):
```js
// 4 teams x 3 members each (12 uids). Script:
// createGame(teamNames x4) -> 12 joinGame calls -> startSeason.
// Round 1: each GM signs 8 players from market/1 (pick first 8 affordable by position
//          template using the public catalog); each Scout submits one legal min bid on
//          wave-1 stars; each Coach submits a lineup built with autoRepair; professor
//          advances through AUCTION, LINEUP, SIMULATE, RESULTS.
// Rounds 2-5: professor advances through every phase; one team cuts a player in
//          FRONT_OFFICE round 3 (asserts dead money appears); no other inputs — hardship
//          and auto-repair must carry silent teams.
// Final assertions:
//   game.status == 'finished', phase == 'FINALE'
//   every rounds/{1..5} doc exists with boxCsv containing 23-col header
//   sum of all teams' wins == 5 * C(4,2) == 30
//   every team: active roster >= 8 in every round it played (via hardshipUsed or signings)
//   reveal/latest exists with 175 scatter points
//   teams that never submitted lineups after round 1 still have lineupLockedRound == 5
```

Write the full body (~120 lines) following the lifecycle test's call pattern; every loop is explicit — no helper magic beyond a `signEight(gm, teamId)` function that walks `market/1` + catalog and calls `signPlayer` respecting 3G/3W/2B and the cap.

- [ ] **Step 2: Run it**

Run: `cd games/salary-showdown/backend && npx firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run test/smoke.test.js"`
Expected: PASS end-to-end. Debug failures by phase (each hook logs its round).

- [ ] **Step 3: Run the complete suite**

Run: `npx firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"`
Expected: every test file green.

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/backend/functions/test/smoke.test.js
git commit -m "test(salary-showdown): full-game smoke test — lobby to finale on the emulator"
```

---

### Task 15: Backend README + wrap-up

**Files:**
- Create: `games/salary-showdown/backend/README.md`

- [ ] **Step 1: Write README** covering: emulator quickstart (`npm run emu`, `emulators:exec` test commands), the callable API surface (one line each: createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup), SCHEMA.md pointer, the data-bundle regeneration command (`python3 datagen/export_runtime_bundle.py`), the parity-fixture rule ("if datagen/engine.py or engine_params.json changes, re-run the exporter and the engine parity suite MUST pass before deploy"), and the deploy checklist (create real Firebase project on Blaze, enable anonymous auth, `firebase deploy --only firestore:rules,functions`).

- [ ] **Step 2: Verify docs match reality** — every command in the README executed once, verbatim.

- [ ] **Step 3: Commit**

```bash
git add games/salary-showdown/backend/README.md
git commit -m "docs(salary-showdown): backend README — API surface, parity rule, deploy checklist"
```

---

## Self-Review (performed at authoring time)

**Spec coverage (backend scope):** §4 loop → Tasks 8–12; §5 economy → Tasks 5, 9, 10; §13 rules (timeline/hardship/min-bid/unsold/auto-repair/tiebreak) → Tasks 5, 9, 10, 11, 12; §7.2 feed contract → Task 12; §8 engine + engine_params binding → Tasks 2, 4; §11.14 reveal gating + §12 secrecy → Tasks 6, 13; §12 stack → Tasks 1, 7. Out of scope for this plan (deliberately): all §11 screens (Plans 2–3), Expansion Franchise ghost team and >21-team scheduling (both spec'd for classes larger than currently planned — add as a follow-up task before a 22+ team session), professor timer auto-advance (professor clicks; timers are display-only until Plan 3).

**Placeholder scan:** the two test files described partly in prose (reveal.test.js preamble, smoke.test.js body) reference a concrete, existing template (lifecycle.test.js) and enumerate exact assertions — implementer discretion is limited to mechanical copying. All other steps carry complete code.

**Type consistency:** contract shape `{pid, rate, startRound, years, viaAuction, hardship}` used identically in Tasks 5, 9, 10, 12, 13; lineup shape `{starters, sixth, bench, playstyle}` in Tasks 11, 12; `HOOKS` keys (`'FREE_AGENCY'`, `'AUCTION'`, `'LINEUP'` exits; `'enter:FREE_AGENCY'`, `'enter:AUCTION'`, `'enter:SIMULATE'`, `'enter:FINALE'` entries) consistent across Tasks 8–13.
