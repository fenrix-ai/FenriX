# Salary Showdown — Playtest Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Dylan-adjudicated playtest changes: public auction results with a team-private skip note, the Default Role Player hardship redesign, and two student-README lines.

**Architecture:** Backend first — `resolveAuction` additionally returns would-have-won skips which the AUCTION exit hook writes onto each affected team's private bid doc; hardship stops drawing real FA players and signs $0 synthetic "Default Role Player" catalog entries defined in a new backend module (merged into the in-memory CATALOG and the Firestore catalog seed; never in `players.json`, `FA_POOL`, market draws, awards, or the reveal). Then the team ResultsPage renders the public results table + the own-team-only note. Docs ride with their owning tasks.

**Tech Stack:** Existing only — Firebase Functions (plain ESM JS) + vitest against the RUNNING emulators; React 19 + TS client; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-salary-showdown-playtest-polish-design.md`

## Global Constraints

- Branch: Task 1 Step 0 creates `salary-showdown-playtest-polish` from main. VERIFY HEAD FIRST (`git rev-parse HEAD` — expect `e46500c…`; an external process races HEAD in this workspace; if different, STOP and reconcile).
- Emulators are RUNNING (Functions 5101 · Firestore 8180 · Auth 9199 · UI 4100). NEVER start/stop them. One flaky run immediately after a source edit = functions-emulator hot reload → re-run once. Backend lock-timeout failures (never assertion failures) = known degradation → re-run once, then STOP and report.
- Facts, never conclusions on team screens: the new Results section shows name/winner/price/years ONLY — no bid counts, no bidder identities, no per-dollar, no judgment words. The private note is visible ONLY to the affected team.
- No emojis in product UI (`npm run audit:ui` enforces; · — ‹ › glyphs fine).
- Synthetic pids are 9001+ and must NEVER appear in: `players.json` (datagen-owned — do not touch it), `FA_POOL`, any `drawMarket` result, any auction wave, the Bargain award, `reveal/latest` `scatter`/`perTeam`. They MUST appear in: the in-memory `CATALOG`, the Firestore `catalog/{pid}` seed, rosters/spendLog/lineups/box scores when hardship fires.
- Hardship contracts are now exactly `{ pid: <synthetic>, rate: 0, years: 1, startRound: round, viaAuction: false, hardship: true }`. Distinct pids per team; the same synthetic pid may appear on multiple teams (non-exclusive precedent).
- `hiddenData[pid]` has NO entry for synthetics — every `hiddenData[c.pid]` access over spendLog/roster MUST be guarded or filtered, or `enter:FINALE` crashes.
- Suites at start (verified on main @ e46500c): backend 23 files/154 · app unit 13/65 · integration 17/29 · tsc clean · audit:ui 64 files. Commit style `feat|fix|docs(salary-showdown): …` with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: Auction skip records (backend) + SCHEMA note

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/auction.js` (resolveAuction return)
- Modify: `games/salary-showdown/backend/functions/src/game.js` (AUCTION exit hook write)
- Modify: `games/salary-showdown/backend/functions/test/auction.test.js` (unit tests)
- Modify: `games/salary-showdown/backend/functions/test/auction-flow.test.js` (flow test)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (private/auction doc note)

**Interfaces:**
- Consumes: `resolveAuction({ bids, starPids, teams, round, seed, catalogById })` currently returns `{ awards, teamsAfter }`; awards rows are `{ pid, teamId, rate, years, guaranteed }` (nulls for unsold). The exit hook `HOOKS['AUCTION']` (game.js ~:577-610) already reads each team's `teams/{id}/private/auction` doc `{ bids, round }` and writes `results: awards` onto `auctions/{round}`.
- Produces: `resolveAuction` returns `{ awards, teamsAfter, skips }` where `skips: { pid: number, teamId: string, reason: 'cap' | 'roster' }[]` — one entry per bid that was passed over for roster/cap reasons AT A MOMENT WHEN ITS STAR WAS STILL UNSOLD (i.e. it would have won). The exit hook merge-writes onto each affected team's `teams/{teamId}/private/auction`: `{ skippedRound: round, skipped: [{ pid, reason }...] }`. Task 3 reads these two fields.

- [ ] **Step 1 — Preflight.** From `/Users/dylanmassaro/FenriX`: `git rev-parse HEAD` (expect `e46500c…`; else STOP) · `git checkout -b salary-showdown-playtest-polish` · `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4100/` (expect 200).

- [ ] **Step 2 — Failing unit test.** In `backend/functions/test/auction.test.js`, append (match the file's existing import/fixture style — read it first; it already unit-tests `resolveAuction` with plain team objects):

```js
describe('resolveAuction skip records (playtest-polish T1)', () => {
  const catalogById = {};
  const team = (teamId, roster = []) => ({ teamId, roster, spendLog: [] });
  const full = Array.from({ length: 10 }, (_, i) => ({ pid: 500 + i, rate: 1, startRound: 1, years: 5, viaAuction: false, hardship: false }));

  it('records a cap skip AND the fall-through winner for the same star', () => {
    const rich = team('rich');
    const poor = team('poor', [{ pid: 600, rate: 99.0, startRound: 1, years: 5, viaAuction: false, hardship: false }]);
    const bids = [
      { pid: 1, teamId: 'poor', rate: 30.0, years: 2 },   // highest guaranteed — cap-blocked
      { pid: 1, teamId: 'rich', rate: 5.0, years: 1 },    // falls through, wins
    ];
    const { awards, skips } = resolveAuction({ bids, starPids: [1], teams: [rich, poor],
      round: 1, seed: 's', catalogById });
    expect(skips).toEqual([{ pid: 1, teamId: 'poor', reason: 'cap' }]);
    expect(awards.find((a) => a.pid === 1)).toMatchObject({ teamId: 'rich', rate: 5.0, years: 1 });
  });

  it('records a roster skip; an already-sold star produces NO skip record', () => {
    const fullTeam = team('full', full);
    const other = team('other');
    const bids = [
      { pid: 2, teamId: 'full', rate: 20.0, years: 1 },   // roster skip (would have won)
      { pid: 2, teamId: 'other', rate: 10.0, years: 1 },  // wins
      { pid: 2, teamId: 'full', rate: 20.0, years: 1 },   // duplicate key impossible via map — keep 2 bids only
    ].slice(0, 2);
    const { skips } = resolveAuction({ bids, starPids: [2], teams: [fullTeam, other],
      round: 1, seed: 's', catalogById });
    expect(skips).toEqual([{ pid: 2, teamId: 'full', reason: 'roster' }]);
  });

  it('clean resolution yields empty skips; un-bid stars yield no skips', () => {
    const a = team('a');
    const { skips, awards } = resolveAuction({ bids: [{ pid: 3, teamId: 'a', rate: 4.0, years: 1 }],
      starPids: [3, 4], teams: [a], round: 1, seed: 's', catalogById });
    expect(skips).toEqual([]);
    expect(awards.find((x) => x.pid === 4)).toMatchObject({ teamId: null });
  });
});
```

If the file's existing fixtures differ structurally (e.g. it builds teams through a helper), adapt the fixture construction to the file's own idiom but keep the assertions verbatim.

- [ ] **Step 3 — RED.** `cd games/salary-showdown/backend/functions && npx vitest run test/auction.test.js` → the three new tests FAIL (`skips` is undefined).

- [ ] **Step 4 — Implement in `auction.js`.** Inside `resolveAuction`: add `const skips = [];` next to `const awards = [];`. Change the two skip lines so a would-have-won skip is recorded — current code:

```js
    if (active.length >= 10) continue;                                   // roster skip
```
and
```js
    if (!capOkWith(team, contract, CAP, TOTAL_ROUNDS).ok) continue;      // cap skip
```

become:

```js
    // A skip is only "you would have won" when this star is still unsold at this
    // point in the global priority walk — that is precisely the bid the affected
    // team believes won. Recorded for the team-private Results note (spec §1.2);
    // the PUBLIC results never carry these, so sealed-bid privacy holds.
    if (active.length >= 10) { skips.push({ pid: bid.pid, teamId: bid.teamId, reason: 'roster' }); continue; }
```
and
```js
    if (!capOkWith(team, contract, CAP, TOTAL_ROUNDS).ok) {
      skips.push({ pid: bid.pid, teamId: bid.teamId, reason: 'cap' });
      continue;
    }
```

(The `sold.has(bid.pid)` guard above them already `continue`s first, so only would-have-won bids reach these lines — no extra condition needed.) Change the return to `return { awards, teamsAfter, skips };` and update the contract comment above the function to mention `skips`.

- [ ] **Step 5 — GREEN.** `npx vitest run test/auction.test.js` → all pass.

- [ ] **Step 6 — Exit-hook write + flow test.** In `game.js` `HOOKS['AUCTION']` — current lines (~:595-600):

```js
  const { awards, teamsAfter } = resolveAuction({ bids, starPids: wave.stars, teams,
    round, seed: gameId, catalogById: CATALOG });
```
→
```js
  const { awards, teamsAfter, skips } = resolveAuction({ bids, starPids: wave.stars, teams,
    round, seed: gameId, catalogById: CATALOG });
```

and immediately after the existing `batch.update(auctionRef, { results: awards });` add:

```js
  // Team-private would-have-won skip notes (spec §1.2): merged onto the same
  // private bid doc the Scout wrote, so existing team-only read rules cover it.
  // Round-stamped so the client shows notes only for the round just resolved.
  const skipsByTeam = {};
  for (const s of skips) (skipsByTeam[s.teamId] ??= []).push({ pid: s.pid, reason: s.reason });
  for (const [teamId, list] of Object.entries(skipsByTeam)) {
    batch.set(db().doc(`games/${gameId}/teams/${teamId}/private/auction`),
      { skippedRound: round, skipped: list }, { merge: true });
  }
```

Then in `test/auction-flow.test.js` append a flow test in the file's existing style (read it first; it drives real callables against the emulator). The scenario: two teams; team A's Scout bids high on a star while team A is provably cap-blocked (sign contracts until headroom < the bid — the file's helpers for signing/joining apply); team B bids low on the same star; advance through AUCTION; then assert via the harness admin read: `teams/{A}/private/auction` has `skippedRound === 1` and `skipped` containing `{ pid: <star>, reason: 'cap' }`; `teams/{B}/private/auction` has NO `skipped` field; `auctions/1.results` awards the star to B at B's rate/years. If constructing a genuine cap block via callables is impractical in that file's fixtures, an admin pre-write that fills team A's roster with ten 5-year contracts (roster skip, reason `'roster'`) is an acceptable equivalent — assert `reason: 'roster'` instead, and say so in a one-line comment.

- [ ] **Step 7 — Suite + SCHEMA.** `npx vitest run` → 23 files, 154 + new tests, all green. In `backend/SCHEMA.md`, find the `teams/{teamId}/private/auction` line (documents `{ bids, round }`) and extend it: after auction resolution the doc may also carry `skippedRound: number` and `skipped: [{ pid, reason: 'cap' | 'roster' }]` — team-private would-have-won feedback rendered by the Results screen.

- [ ] **Step 8 — Commit.** `feat(salary-showdown): auction skip records — resolveAuction skips + team-private write` with body noting spec §1.2 and the would-have-won semantic. Standard trailer.

---

### Task 2: Default Role Player (backend hardship redesign)

**Files:**
- Create: `games/salary-showdown/backend/functions/src/synthetics.js`
- Modify: `games/salary-showdown/backend/functions/src/game.js` (CATALOG merge, catalog seed, FREE_AGENCY exit hook, enter:FINALE guard)
- Modify: `games/salary-showdown/backend/functions/src/market.js` (runHardship rewrite)
- Modify: `games/salary-showdown/backend/functions/src/sim.js` (bargain exclusion)
- Modify: existing hardship tests (discovered in Step 6) + Create `games/salary-showdown/backend/functions/test/synthetics.test.js`
- Modify: `games/salary-showdown/backend/SCHEMA.md` (hardship note) and `docs/superpowers/specs/2026-07-14-salary-showdown-design.md` (hardship clause wording)

**Interfaces:**
- Consumes: `runHardship({ teams, faPool, round, catalogById })` (market.js:79) currently draws cheapest real FA players, deficit-first, cap-exempt at `askPrice`. Its sole caller is `HOOKS['FREE_AGENCY']` (game.js ~:530-555) which applies `out[].signings` verbatim to roster + spendLog + `hardshipUsed`.
- Produces: `synthetics.js` exports `export const SYNTHETICS` (8 catalog-shaped rows, below) and `export const SYNTHETIC_MIN_PID = 9000`. `runHardship({ teams, synthetics, round, catalogById })` — same return shape, but signings are `{ pid: <synthetic>, rate: 0, startRound: round, years: 1, viaAuction: false, hardship: true }` with distinct pids per team, deficit positions filled first, flex slots after, still bounded by the 10-man max. `CATALOG` (game.js) contains synthetics; `FA_POOL` does not.

- [ ] **Step 1 — Read the consumers first (do not skip):** `src/engine.js` and `src/sim.js` end-to-end, listing every catalog field the engine/box path reads off a player row (e.g. `position`, `mins_per_game`, per-game stats, `fg_pct`…). The `SYNTHETICS` rows below carry every column of a `players.json` row; verify the field NAMES against `players.json`'s first row (`head -c 600 src/data/players.json`) and against your engine list — if any engine-read field is missing below, add it with a replacement-level value and note it in your report.

- [ ] **Step 2 — Create `src/synthetics.js`:**

```js
// Default Role Player (spec §2, Dylan-adjudicated 2026-07-26): hardship no longer
// drafts real FA players — every stranded slot gets one of these synthetic, $0,
// replacement-level entries instead, IDENTICAL for every team. Pids live in a
// reserved 9000+ range so they can never collide with datagen pids (players.json
// tops out far below 9000 — verified). NEVER add these to players.json (datagen-
// owned), FA_POOL, market draws, auction waves, awards, or the reveal.
// Eight rows cover the worst case (an empty roster filled to the 8-man floor)
// with DISTINCT pids: 3 G + 3 W + 2 B satisfies 2G/2W/1B + three flex slots.
const STAT_BLOCK = {
  // Replacement level: bottom-quartile minutes-earner. Identical for all three
  // positions by ruling ("they all have the same stats").
  age: '27', years_pro: '4', hype: '1.0', salary_per_round: '0.0', auction_round: '',
  personality: 'Steady', scout_grade: 'C', social_media_followers: '10000',
  games_played: '60', mins_per_game: '12.0', pts_per_game: '3.8',
  fg_attempts_per_game: '4.0', fg_pct: '0.420', three_pt_pct: '0.280', ft_pct: '0.680',
  rebounds_per_game: '2.2', assists_per_game: '1.0', steals_per_game: '0.4',
  blocks_per_game: '0.2', turnovers_per_game: '1.1',
  prev_pts_per_game: '3.8', prev_fg_pct: '0.420', prev_mins_per_game: '12.0',
};
export const SYNTHETIC_MIN_PID = 9000;
export const SYNTHETICS = [
  ...[9001, 9002, 9003].map((pid) => ({ pid, position: 'G' })),
  ...[9011, 9012, 9013].map((pid) => ({ pid, position: 'W' })),
  ...[9021, 9022].map((pid) => ({ pid, position: 'B' })),
].map(({ pid, position }) => ({
  pid, player_id: String(pid), name: 'Default Role Player', position, ...STAT_BLOCK,
}));
```

(String-typed numerics on purpose — `players.json` rows are CSV-string-typed and every consumer coerces with `Number()`/`+`; matching that shape means zero special-casing downstream. If Step 1 found extra engine-read fields, extend `STAT_BLOCK` accordingly.)

- [ ] **Step 3 — Failing unit tests.** Create `test/synthetics.test.js`:

```js
import { SYNTHETICS, SYNTHETIC_MIN_PID } from '../src/synthetics.js';
import { runHardship } from '../src/market.js';

const CAT = Object.fromEntries(SYNTHETICS.map((p) => [p.pid, p]));
const mk = (teamId, roster = []) => ({ teamId, roster });
const c = (pid, pos) => ({ pid, rate: 5, startRound: 1, years: 5, viaAuction: false, hardship: false, _pos: pos });
const catWith = (roster) => ({ ...CAT,
  ...Object.fromEntries(roster.map((r) => [r.pid, { pid: r.pid, position: r._pos }])) });

describe('Default Role Player hardship (playtest-polish T2)', () => {
  it('an empty roster fills to 8 with DISTINCT synthetic pids covering 2G/2W/1B, all $0 x 1yr hardship', () => {
    const team = mk('t1');
    const out = runHardship({ teams: [team], synthetics: SYNTHETICS, round: 3, catalogById: CAT });
    const s = out[0].signings;
    expect(s).toHaveLength(8);
    expect(new Set(s.map((x) => x.pid)).size).toBe(8);
    for (const x of s) {
      expect(x.pid).toBeGreaterThan(SYNTHETIC_MIN_PID);
      expect(x).toMatchObject({ rate: 0, years: 1, startRound: 3, viaAuction: false, hardship: true });
    }
    const pos = s.map((x) => CAT[x.pid].position);
    expect(pos.filter((p) => p === 'G').length).toBeGreaterThanOrEqual(2);
    expect(pos.filter((p) => p === 'W').length).toBeGreaterThanOrEqual(2);
    expect(pos.filter((p) => p === 'B').length).toBeGreaterThanOrEqual(1);
  });

  it('a position-deficit-only team gets exactly the deficit, position-matched', () => {
    const roster = [c(1, 'G'), c(2, 'G'), c(3, 'W'), c(4, 'W'), c(5, 'W'), c(6, 'W'), c(7, 'G'), c(8, 'G')]; // 8 active, 0 B
    const team = mk('t2', roster);
    const out = runHardship({ teams: [team], synthetics: SYNTHETICS, round: 2, catalogById: catWith(roster) });
    expect(out[0].signings).toHaveLength(1);
    expect(CAT[out[0].signings[0].pid].position).toBe('B');
  });

  it('a legal team gets nothing; the 10-man max still bounds the fill', () => {
    const legal = [c(1,'G'), c(2,'G'), c(3,'W'), c(4,'W'), c(5,'B'), c(6,'G'), c(7,'W'), c(8,'B')];
    expect(runHardship({ teams: [mk('ok', legal)], synthetics: SYNTHETICS, round: 2,
      catalogById: catWith(legal) })).toHaveLength(0);
    const nine = [c(1,'G'), c(2,'G'), c(3,'G'), c(4,'G'), c(5,'G'), c(6,'G'), c(7,'G'), c(8,'G'), c(9,'G')]; // 9 active, no W/B
    const out = runHardship({ teams: [mk('cap', nine)], synthetics: SYNTHETICS, round: 2,
      catalogById: catWith(nine) });
    expect(out[0].signings).toHaveLength(1); // 10-man max: one slot left despite 3 unmet needs
  });

  it('two stranded teams may receive the SAME synthetic pid (non-exclusive across teams)', () => {
    const out = runHardship({ teams: [mk('a'), mk('b')], synthetics: SYNTHETICS, round: 1, catalogById: CAT });
    expect(out[0].signings.map((x) => x.pid)).toEqual(out[1].signings.map((x) => x.pid));
  });
});
```

RED: `npx vitest run test/synthetics.test.js` → fails (`synthetics.js` missing / runHardship signature mismatch).

- [ ] **Step 4 — Rewrite `runHardship` in market.js.** Replace the whole function (keep `activeByPos` and the doc comment block, updating its text) with:

```js
// Legality bar unchanged (2G/2W/1B minimum + 8-man floor, hard-bounded at 10) —
// but the FILL is redesigned (spec §2, 2026-07-26): every stranded slot signs a
// synthetic $0 "Default Role Player" (synthetics.js), identical for all teams.
// No real FA is ever hardship-drafted anymore; there is nothing to farm and
// payroll displays stay at-or-under the cap. Deficit positions first, flex after;
// distinct pids per team (the same pid MAY appear on different teams).
export function runHardship({ teams, synthetics, round, catalogById }) {
  const out = [];
  for (const team of teams) {
    const { counts, total } = activeByPos(team, round, catalogById);
    const deficits = {
      G: Math.max(0, LINEUP_NEED.G - counts.G),
      W: Math.max(0, LINEUP_NEED.W - counts.W),
      B: Math.max(0, LINEUP_NEED.B - counts.B),
    };
    const need = Math.max(8 - total, deficits.G + deficits.W + deficits.B);
    const fill = Math.min(need, Math.max(0, 10 - total));   // never exceed the 10-man max
    if (fill <= 0) continue;
    const owned = new Set(team.roster.map((c) => c.pid));
    const pool = synthetics.filter((p) => !owned.has(p.pid));
    const signings = [];
    const take = (pred) => {
      const i = pool.findIndex(pred);
      if (i === -1) return false;
      const p = pool.splice(i, 1)[0];
      signings.push({ pid: p.pid, rate: 0, startRound: round,
                      years: 1, viaAuction: false, hardship: true });   // $0 by rule (spec §2)
      return true;
    };
    for (const pos of ['G', 'W', 'B'])
      for (let k = 0; k < deficits[pos] && signings.length < fill; k++) take((p) => p.position === pos);
    while (signings.length < fill) if (!take(() => true)) break;
    if (signings.length) out.push({ teamId: team.teamId, signings });
  }
  return out;
}
```

- [ ] **Step 5 — Wire game.js.** Four edits:
  1. Imports: add `import { SYNTHETICS } from './synthetics.js';` beside the other src imports.
  2. `const CATALOG = Object.fromEntries(players.map((p) => [p.pid, p]));` → `const CATALOG = Object.fromEntries([...players, ...SYNTHETICS].map((p) => [p.pid, p]));` with a one-line comment (synthetics resolvable everywhere a catalog row is read — lineup validation, sim, name lookups). `FA_POOL` stays `players.filter(...)` — synthetics structurally excluded from draws; add a half-line comment saying so.
  3. Catalog seed (createGame, ~:64-68): seed `[...players, ...SYNTHETICS]` instead of `players` (clients resolve the name "Default Role Player" from `catalog/{pid}` like any player).
  4. `HOOKS['FREE_AGENCY']` (~:544): `runHardship({ teams, faPool: FA_POOL, round, catalogById: CATALOG })` → `runHardship({ teams, synthetics: SYNTHETICS, round, catalogById: CATALOG })`, and update the neighboring "full catalog is the hardship pool" comment to the new rule.

- [ ] **Step 6 — Crash guard + award exclusion.**
  1. `sim.js` bargain loop (~:140-145): the loop over contracts gains, as its first line inside, `if (c.hardship) continue; // $0 synthetics are never bargain-eligible (spec §2.4)`. Read the loop first; place the guard so roundMvp/topScorer (box-row-derived, allowed to include DRP) are untouched.
  2. `game.js` `enter:FINALE` (~:733): `const spendLog = team.spendLog ?? [];` → 

```js
    // Synthetic hardship contracts have no hiddenData entry (they are not part of
    // the pre-released 175) — they must not reach the ti lookup below (crash) nor
    // best/worst-signing contention (a $0 contract is not a "signing" lesson).
    // totalSpend keeps the FULL log: synthetic rate*years is 0, so the sum is
    // unchanged and honest either way.
    const spendLog = (team.spendLog ?? []).filter((c) => hiddenData[c.pid]);
    const spendAll = team.spendLog ?? [];
```
  and the `const spend = spendLog.reduce(...)` line switches to `spendAll.reduce(...)`.

- [ ] **Step 7 — GREEN + repair displaced tests.** `npx vitest run test/synthetics.test.js` → 4 pass. Then the FULL suite: `npx vitest run`. EXPECT failures in tests written against the old draw-from-pool hardship (grep first: `grep -rln "hardship" test/`). Rewrite ONLY the assertions that pin the old contract (cheapest-real-player selection, askPrice rates, cap-exempt-over-100 payrolls) to the new one (synthetic pids > 9000, rate 0, name resolvable in CATALOG, position deficits filled). Behavior-neutral assertions (hardshipUsed idempotency, fill counts, 10-man bound) should pass unchanged — if one doesn't, STOP and investigate rather than editing it to green. Full suite green before proceeding.

- [ ] **Step 8 — Docs.** SCHEMA.md: update the hardship note (search `hardship`) — contracts are now `rate: 0` synthetics (pids 9001+, name "Default Role Player"), catalog carries the synthetic rows, `hardship: true` remains the marker. Parent spec `docs/superpowers/specs/2026-07-14-salary-showdown-design.md`: `grep -n "hardship"` and update the autofill clause(s): "cap-exempt hardship autofill" wording becomes the synthetic-$0 rule (cite the 2026-07-26 polish spec); do NOT touch unrelated hardship mentions (history/ledger context). Quote old → new in your report for each edited line.

- [ ] **Step 9 — Commit.** `feat(salary-showdown): Default Role Player — $0 synthetic hardship (spec §2)` + trailer.

---

### Task 3: Results screen — auction results table + private skip note (app)

**Files:**
- Modify: `games/salary-showdown/app/src/pages/ResultsPage.tsx`
- Modify: `games/salary-showdown/app/src/types/models.ts` (private-auction fields)
- Create: `games/salary-showdown/app/src/itest/auction-results.itest.tsx`

**Interfaces:**
- Consumes: `AuctionDoc` (models.ts:60) already types `results?: { pid; teamId: string | null; rate: number | null; years: number | null; … }[]` and `stars: number[]`. Task 1 produces `teams/{teamId}/private/auction` fields `skippedRound?: number`, `skipped?: { pid: number; reason: 'cap' | 'roster' }[]`. `useGame()` provides `game, team, teams, membership, catalog` (catalog: `Map<number, CatalogRow>`); `db` from `../lib/firebase`; itest harness `adminDb, driveTo, Seeded` from `./harness`.
- Produces: a `data-testid="auction-results"` card on ResultsPage; a `data-testid="auction-skip-note"` private note.

- [ ] **Step 1 — Types.** In `models.ts`, near `AuctionDoc`, add:

```ts
// teams/{teamId}/private/auction — written by submitBids (bids, round) and, since
// playtest-polish T1, merged by auction resolution with would-have-won skip
// feedback (team-private; rendered only on the own team's Results screen).
export interface PrivateAuctionDoc {
  bids?: Record<string, { rate: number; years: number }>;
  round?: number;
  skippedRound?: number;
  skipped?: { pid: number; reason: 'cap' | 'roster' }[];
}
```

- [ ] **Step 2 — ResultsPage.** Three additions (anchors from the current file — re-read it first):
  1. Imports: add `import { useState as useStateReact } from 'react';` — NO. Use the existing imports; add `import { doc, onSnapshot } from 'firebase/firestore';` and `import { db } from '../lib/firebase';` and `import type { AuctionDoc, PrivateAuctionDoc } from '../types/models';` (merge with any existing type import from that module).
  2. After the `const rd = useRoundDoc(round);` line add the two listeners:

```tsx
  // Star Auction results (spec §1): public facts for the round just played, plus
  // the OWN-team-only would-have-won skip note. Both listeners follow the same
  // §3a rule as every other listener: errors log via console.error, never silent.
  const [auction, setAuction] = useState<AuctionDoc | null>(null);
  const [privAuction, setPrivAuction] = useState<PrivateAuctionDoc | null>(null);
  useEffect(() => {
    if (!game || !membership) { setAuction(null); return; }
    return onSnapshot(doc(db, 'games', membership.gameId, 'auctions', String(round)),
      (s) => setAuction(s.exists() ? (s.data() as AuctionDoc) : null),
      (e) => console.error('[results] auction listener', e));
  }, [game, membership, round]);
  useEffect(() => {
    if (!game || !membership) { setPrivAuction(null); return; }
    return onSnapshot(doc(db, 'games', membership.gameId, 'teams', membership.teamId, 'private', 'auction'),
      (s) => setPrivAuction(s.exists() ? (s.data() as PrivateAuctionDoc) : null),
      (e) => console.error('[results] private auction listener', e));
  }, [game, membership, round]);
```

  (If `membership` lacks a `gameId` field, use the same gameId source the file's sibling listeners use — check `useRoundDoc`'s call signature and GameContext; adapt but keep behavior identical, noting the adaptation in your report.)
  3. Render the card between the awards carousel `</div>` (the one closing `data-testid="awards"`) and the `<details open>` block:

```tsx
      {auction?.results && (
        <div className="card" style={{ margin: '12px 0' }} data-testid="auction-results">
          <strong>{`Star Auction · Round ${round}`}</strong>
          <table className="table" style={{ marginTop: 6 }}>
            <thead><tr><th className="name">Star</th><th>Pos</th><th>Signed by</th><th>Rate</th><th>Years</th></tr></thead>
            <tbody>
              {auction.stars.map((pid) => {
                const r = auction.results!.find((x) => x.pid === pid);
                const won = r?.teamId != null;
                return (
                  <tr key={pid}>
                    <td className="name">{catalog.get(pid)?.name ?? pid}</td>
                    <td>{catalog.get(pid)?.position ?? '—'}</td>
                    <td>{won ? teams.get(r!.teamId!)?.name ?? '—' : 'Unsold'}</td>
                    <td className="mono">{won ? `${fmtM(r!.rate!)}/rd` : '—'}</td>
                    <td className="mono">{won ? `${r!.years} yr` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {privAuction?.skippedRound === round && (privAuction.skipped ?? []).length > 0 && (
            <p className="muted" data-testid="auction-skip-note" style={{ marginBottom: 0 }}>
              {(privAuction.skipped ?? []).map((s) =>
                `Your winning bid on ${catalog.get(s.pid)?.name ?? s.pid} couldn't be awarded (${
                  s.reason === 'cap' ? 'salary cap' : 'roster full'}).`).join(' ')}
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 3 — Failing itest.** Create `src/itest/auction-results.itest.tsx` following the harness conventions of `results.itest.tsx` (read it first — reuse its seed/join/drive pattern and its localStorage hygiene). Scenario: seed a 2-team game; drive to `R1:AUCTION`; as the OWN team's scout submit a losing low bid on star[0] via callable AND admin-prefill the roster to ten 5-year contracts so the own team's HIGH bid on star[1] roster-skips — simpler alternative (accept either, comment which): admin-write both teams' `private/auction` bid docs directly (`{ bids: { [star0]: { rate: 3.0, years: 1 } }, round: 1 }` for the rival, and for the own team a high bid plus an admin-prefilled full roster), then advance AUCTION→LINEUP→…→RESULTS via `driveTo`/professor calls; render `/game/results`; assert: `auction-results` card lists every `stars` pid with the rival's win row showing team name + `/rd` + `yr`, unsold rows showing `Unsold`; `auction-skip-note` visible with `couldn't be awarded (roster full)`; then a SECOND client for the rival team renders and asserts `queryByTestId('auction-skip-note')` is null (negative privacy check). RED first: run the file, watch it fail on the missing testid.

- [ ] **Step 4 — GREEN + suites.** New itest green → then from `app/`: `npx tsc -b` · `npx vitest run` (unit ≥65) · `npm run audit:ui` (clean; count grows only if new non-test src files — none here, expect 64) · `npx vitest run -c vitest.integration.config.ts` (17+1 files / 29+N tests green) · backend `npx vitest run` untouched-green.

- [ ] **Step 5 — Commit.** `feat(salary-showdown): Results screen — Star Auction results table + private skip note (spec §1)` + trailer.

---

### Task 4: Student README lines + exit battery + ledger

**Files:**
- Modify: `games/salary-showdown/data/README.md`
- Append: `.superpowers/sdd/progress.md` (root ledger — NEVER `git add` it; `.superpowers/` is gitignored)

- [ ] **Step 1 — README.** Read `data/README.md` (48 lines). In the section describing the game/market rules (place adjacent to existing roster/market prose, matching the file's voice and list style), add exactly these two lines as bullets:

```
- Rosters hold a maximum of 10 players; only 8 dress for a game.
- Not every free agent is on the market every night — scout a deep board before class.
```

Nothing else changes; tier minutes, collinearity, and every discoverable pattern stay unmentioned (ruled).

- [ ] **Step 2 — Exit battery** (emulators running; flake rules as in Global Constraints): backend `npx vitest run` · app `npx vitest run` · `npx vitest run -c vitest.integration.config.ts` · `npx tsc -b` · `npm run audit:ui`. Record exact counts. All green or STOP and report the owning task.

- [ ] **Step 3 — Commit + ledger.** Commit README alone: `docs(salary-showdown): student README — roster cap + deep-board lines` + trailer. Append to the ROOT ledger (`/Users/dylanmassaro/FenriX/.superpowers/sdd/progress.md`, append-only) a `PLAYTEST POLISH COMPLETE` block: per-task commit ranges, battery counts, and the note that prod redeploy is deferred to Dylan's schedule.

---

## Self-review (done at authoring)

Spec coverage: §1.1 public table → T3; §1.2 skip note → T1 (write) + T3 (render); §1.3 scope guard → T3 (no wall/panel files); §2.1 synthetics → T2 S2; §2.2 $0 signing → T2 S4; §2.3 sim flow-through → CATALOG merge (T2 S5) + no sim special-case; §2.4 exclusions → T2 S6 (+ market-draw exclusion structural via FA_POOL, asserted in T2 S5 comment); §2.5 rules sync + test rewrite → T2 S7/S8; §3 README → T4; §5 verification → per-task suites + T4 battery. Placeholders: none (two deliberate adapt-to-idiom instructions carry explicit report-back requirements). Type consistency: `skips` reason union `'cap' | 'roster'` matches models.ts addition and T3 copy branches; `runHardship` new signature consistent across T2 steps and tests.
