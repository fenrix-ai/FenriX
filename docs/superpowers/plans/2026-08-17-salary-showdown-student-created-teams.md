# Salary Showdown — Student-Created Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students create their own franchises from the join screen (name + role + display name, one tap, atomic create-and-claim via a new `createTeam` callable); the professor's panel creates an EMPTY game; the 21-franchise cap moves SERVER-SIDE into `createTeam` (adjudicated amendment 2026-08-17 — enforcement site only, rationale unchanged); `startSeason` enforces the 2-team floor.

**Architecture:** Backend first (`createTeam` transaction + zero-team `createGame` path + transactional `startSeason` with the floor — all in `game.js`, registered in `index.js`), then the two client surfaces (LandingPage create card; SessionSetup zero-team create + start gating), then docs. `games/{id}.teamCount` is updated inside `createTeam`'s transaction (adjudicated delegation resolved: LobbyWall's seat counter is the only consumer, so incrementing beats making consumers derive). One commit per task on branch `salary-showdown-playtest2`.

**Adjudications (Dylan, 2026-08-17 — final):** one-step create card on the join picker; 21-cap moves server-side into createTeam with student copy "The league is full — 21 franchises is the cap." (enforcement-site amendment PRE-APPROVED — update HANDOFF §6 + CAP_COPY comment trail); `{teamNames}`/`{teamCount}` server paths stay VERBATIM as tooling contracts; `renameTeam` unchanged; duplicate names stay allowed unless a cheap check proved worth proposing (resolved: keep allowed — `renameTeam` can recreate duplicates anyway, teamId keys all correctness; ledgered as accepted).

**Delegated calls made by this plan (flagged for approval):**
1. `teamCount` is incremented inside `createTeam`'s transaction (`teams.size + 1` — exact + self-healing); consumers untouched.
2. `startSeason` converts from batch to TRANSACTION so a racing `createTeam` serializes cleanly (lands before the flip and plays, or retries into `creation is closed`). `drawMarket` is pure/seeded (verified) — safe inside the tx.
3. Creating is LOBBY-ONLY (`creation is closed` post-start) — mid-season arrivals claim open seats via `joinGame`, matching the picker's existing "Season in progress" affordance.
4. A creator who already holds a seat MOVES to the new franchise (membership doc is uid-keyed — identical to `joinGame`'s switch-teams semantics). The abandoned franchise idles on server defaults (hardship + auto-repair, the proven passive-team path); RUNBOOK gets an honest row.
5. Picker + panel franchise lists gain the numeric-aware name sort (parity with the walls/grids collation sweep — the picker previously rendered in random doc-id order, invisible when the professor typed names but visible now that teams pop in live).
6. Panel's Start season button disables below 2 franchises (UX mirror; the server gate is authoritative).

**Tech Stack:** Firebase Cloud Functions + Firestore (emulators), React 19 + TS + Vite, vitest ×3 suites.

## Global Constraints

- **HANDOFF §6 hard rules are law.** Touched by this plan: the 21-franchise cap is now enforced SERVER-SIDE in `createTeam` (pre-approved amendment — enforcement site only; rounds/{r} ~1MiB rationale unchanged); HARD INVARIANT extends to `createTeam`: it must RESOLVE before `setGameId(...)` (it creates the caller's membership atomically, same as `joinGame`); no emojis (existing glyphs only); facts-never-conclusions; playstyle strings/blurbs untouched; timers advisory.
- **Back-compat is load-bearing:** `createGame({teamNames})` and `createGame({teamCount})` must keep working VERBATIM — seed script, itest harness, playtest CLI, prod-smoke, load-drill, and every existing test drive them. Explicit paths keep the 2-minimum (`rename.test.js` pins `teamCount: 1` → `need at least 2 teams`) and the 500 abuse ceiling. Only the bare `{}` payload creates a zero-team game.
- **actsAs/releaseSeat/SeatPanel itests seed via `teamNames`** — do not touch their harness paths.
- **NEVER touch `vitest.integration.config.ts`.**
- **`git rev-parse HEAD` before any git op** (sibling worktrees race refs; retry once on transient error).
- **No push, no deploy, no prod writes.** Emulators only.
- **Emulator flake protocol:** `Transaction lock timeout`/listener stalls → restart emulators + rerun; one red immediately after a backend source edit = functions hot-reload, rerun once.
- **CONFLICT WATCH:** two chip sessions may land on `main` mid-execution — one edits `StandingsTable/StandingsPage/ResultsPage`, one edits `LineupPage.tsx` + `lineup.itest.tsx`. NO file overlap with this plan. If they merge mid-run, re-baseline counts and rebase before the finish menu.
- **Suite baselines at plan time (Task 0 re-verifies):** backend 26 files/181 · app unit 15/78 · integration 20/36 · `npx tsc -b` clean · `npm run audit:ui` clean 66 files. Expected finals: backend **27/191** (T1 +1 file +10) · unit **15/79** (T1 +1) · integration **20/37** (T2 +1; T3 rewrites in place) · audit **66** (no new tsx files).
- **Working dirs:** backend tests from `games/salary-showdown/backend/functions`; app from `games/salary-showdown/app`; emulators `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu` from backend/functions (ports 5101/8180/9199/4100).
- **Ledger:** append one-liners to `.superpowers/sdd/progress.md`; NEVER `git add` it. Pre-existing dirty/untracked files are not yours to stage.

---

### Task 0: Baseline gate

- [ ] **Step 1:** `cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git branch --show-current` — expect `c53ee80…` on `salary-showdown-playtest2`. If HEAD moved, stop and report to the controller.
- [ ] **Step 2:** Emulators fresh (kill 5101/8180/9199/4100, `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu` from backend/functions, wait for 4100), then sequenced: backend suite (expect 26/181), app unit (15/78), integration (20/36), `npx tsc -b`, `npm run audit:ui` (66). Record actual counts as THE baseline; every later expectation shifts by the same delta if these differ.

---

### Task 1: Backend — `createTeam` + zero-team `createGame` + `startSeason` floor + error copy

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js`
- Modify: `games/salary-showdown/backend/functions/index.js`
- Modify: `games/salary-showdown/app/src/lib/errors.ts`
- Test: `games/salary-showdown/backend/functions/test/create-team.test.js` (new)
- Test: `games/salary-showdown/app/src/lib/errors.test.ts`

**Interfaces (Produces):** `createTeam({joinCode, name, role, displayName})` → `{gameId, teamId, role}` — creates the team doc AND the creator's `players/{uid}` membership in ONE transaction; lobby-only (`creation is closed`); server-side 21-cap (`league is full`); name rules mirror `renameTeam` (trim → slice 24, `BAD_NAME` on empty/formula-prefix); increments `games/{id}.teamCount` transactionally. `createGame({})` → zero-team game (`teamCount: 0`). `startSeason` rejects `need at least 2 teams`. Tasks 2/3 rely on these exact names and messages.

- [ ] **Step 1: Write the failing backend tests.** Create `test/create-team.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, createTeam, joinGame, startSeason } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('zero-team createGame', () => {
  it('an empty payload creates a game with zero teams and teamCount 0', async () => {
    const res = await call(createGame, {}, 'prof');
    expect(res.joinCode).toHaveLength(6);
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    expect(teams.size).toBe(0);
    expect((await db.doc(`games/${res.gameId}`).get()).data().teamCount).toBe(0);
  });
  it('explicit paths keep the 2-minimum (tooling contract)', async () => {
    await expect(call(createGame, { teamNames: [] }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await expect(call(createGame, { teamCount: 0 }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
  });
});

describe('createTeam', () => {
  it('creates the franchise AND claims the creator seat in one transaction', async () => {
    const g = await call(createGame, {}, 'prof');
    const res = await call(createTeam,
      { joinCode: g.joinCode, name: 'Cap Crunchers', role: 'GM', displayName: 'Founder' }, 'stu1');
    expect(res).toMatchObject({ gameId: g.gameId, role: 'GM' });
    const team = (await db.doc(`games/${g.gameId}/teams/${res.teamId}`).get()).data();
    // Exact day-zero shape parity with createGame's teams (shared newTeamDoc).
    expect(team).toEqual({
      name: 'Cap Crunchers', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
      doneRound: 0, donePhase: '', spendLog: [],
    });
    const m = (await db.doc(`games/${g.gameId}/players/stu1`).get()).data();
    expect(m).toEqual({ teamId: res.teamId, role: 'GM', displayName: 'Founder' });
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(1);
  });
  it('name rules mirror renameTeam: trim + 24-char slice; empty and formula prefixes reject', async () => {
    const g = await call(createGame, {}, 'prof');
    const res = await call(createTeam, {
      joinCode: g.joinCode, name: '  The Cap Crunchers of Silicon Valley  ',
      role: 'Scout', displayName: 'S' }, 'stu1');
    const team = (await db.doc(`games/${g.gameId}/teams/${res.teamId}`).get()).data();
    expect(team.name).toBe('The Cap Crunchers of Sil'); // trim then slice(0, 24)
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: '   ', role: 'GM', displayName: 'A' }, 'stu2'))
      .rejects.toThrow('BAD_NAME');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: '=SUM(A1:B2)', role: 'GM', displayName: 'A' }, 'stu2'))
      .rejects.toThrow('BAD_NAME');
  });
  it('duplicate names are allowed — teamId keys all correctness (accepted, ledgered)', async () => {
    const g = await call(createGame, {}, 'prof');
    const a = await call(createTeam,
      { joinCode: g.joinCode, name: 'Twins', role: 'GM', displayName: 'A' }, 'stu1');
    const b = await call(createTeam,
      { joinCode: g.joinCode, name: 'Twins', role: 'GM', displayName: 'B' }, 'stu2');
    expect(a.teamId).not.toBe(b.teamId);
    const teams = await db.collection(`games/${g.gameId}/teams`).get();
    expect(teams.docs.map((d) => d.data().name)).toEqual(['Twins', 'Twins']);
  });
  it('franchise #22 is rejected: the 21-cap is enforced HERE server-side (amended rule)', async () => {
    const names = Array.from({ length: 21 }, (_, i) => `Team ${i + 1}`);
    const g = await call(createGame, { teamNames: names }, 'prof');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'One Too Many', role: 'GM', displayName: 'X' }, 'stu1'))
      .rejects.toThrow('league is full');
    const after = await db.collection(`games/${g.gameId}/teams`).get();
    expect(after.size).toBe(21);
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(21);
  });
  it('creation closes at startSeason; join codes must resolve; roles must be real', async () => {
    const g = await call(createGame, {}, 'prof');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Alpha', role: 'GM', displayName: 'A' }, 'stu1');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Beta', role: 'GM', displayName: 'B' }, 'stu2');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'Late FC', role: 'GM', displayName: 'L' }, 'stu3'))
      .rejects.toThrow('creation is closed');
    await expect(call(createTeam,
      { joinCode: 'ZZZZZZ', name: 'Ghost', role: 'GM', displayName: 'G' }, 'stu3'))
      .rejects.toThrow('bad join code');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'Ref FC', role: 'Referee', displayName: 'R' }, 'stu3'))
      .rejects.toThrow('bad role');
  });
  it('a creator holding a seat MOVES to the new franchise (joinGame switch parity)', async () => {
    const g = await call(createGame, {}, 'prof');
    const first = await call(createTeam,
      { joinCode: g.joinCode, name: 'First Try', role: 'GM', displayName: 'A' }, 'stu1');
    const second = await call(createTeam,
      { joinCode: g.joinCode, name: 'Second Try', role: 'Coach', displayName: 'A' }, 'stu1');
    const m = (await db.doc(`games/${g.gameId}/players/stu1`).get()).data();
    expect(m).toMatchObject({ teamId: second.teamId, role: 'Coach' });
    // The abandoned franchise persists (idles on server defaults) — no orphan
    // at birth, but abandonment is possible and accepted (RUNBOOK row).
    expect((await db.doc(`games/${g.gameId}/teams/${first.teamId}`).get()).exists).toBe(true);
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(2);
  });
});

describe('startSeason floor', () => {
  it('refuses 0 and 1 teams; starts at 2 with the market drawn', async () => {
    const g = await call(createGame, {}, 'prof');
    await expect(call(startSeason, { gameId: g.gameId }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Solo', role: 'GM', displayName: 'A' }, 'stu1');
    await expect(call(startSeason, { gameId: g.gameId }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Duo', role: 'GM', displayName: 'B' }, 'stu2');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    const game = (await db.doc(`games/${g.gameId}`).get()).data();
    expect(game).toMatchObject({ status: 'active', round: 1, phase: 'FREE_AGENCY' });
    expect((await db.doc(`games/${g.gameId}/market/1`).get()).exists).toBe(true);
  });
  it('teamNames-created games start exactly as before (tooling regression guard)', async () => {
    const g = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    const game = (await db.doc(`games/${g.gameId}`).get()).data();
    expect(game).toMatchObject({ status: 'active', round: 1, phase: 'FREE_AGENCY' });
    expect((await db.doc(`games/${g.gameId}/market/1`).get()).exists).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`createTeam` not exported; `createGame({})` rejects; startSeason has no floor):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/create-team.test.js
```

- [ ] **Step 3: Factor the team-doc shape.** In `src/game.js`, immediately BEFORE `export const createGame = onCall(async (req) => {`, insert:

```js
// One franchise, day zero. Shared by createGame's explicit paths and
// createTeam below so the team-doc shape can never fork between them.
function newTeamDoc(name) {
  return {
    name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
    roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
    // "We're done" STATUS FLAG (markDone below): stamped {round, phase} for the
    // professor panel's submission lights. Never a lock — gates nothing.
    doneRound: 0, donePhase: '',
    // append-only ledger of every contract ever acquired (signPlayer incl. re-signs,
    // auction wins, hardship signings) — cuts never remove an entry here, since
    // committed money is never recovered. FINALE's totalSpend/best-worst signing
    // read from this, not from the live `roster`.
    spendLog: [],
  };
}
```

Then in `createGame`, replace exactly:

```js
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
      // "We're done" STATUS FLAG (markDone below): stamped {round, phase} for the
      // professor panel's submission lights. Never a lock — gates nothing.
      doneRound: 0, donePhase: '',
      // append-only ledger of every contract ever acquired (signPlayer incl. re-signs,
      // auction wins, hardship signings) — cuts never remove an entry here, since
      // committed money is never recovered. FINALE's totalSpend/best-worst signing
      // read from this, not from the live `roster`.
      spendLog: [],
    });
  }
```
with:
```js
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), newTeamDoc(name));
  }
```

- [ ] **Step 4: Zero-team createGame path.** In `src/game.js` `createGame`, replace exactly:

```js
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  // Count-first create (playtest-2 item 1): the panel sends { teamCount } and
  // students name their own franchises from the lobby (renameTeam below).
  // { teamNames } stays supported VERBATIM — the seed script, itest harness,
  // playtest CLI, prod-smoke, and every existing test drive it. The
  // 21-franchise cap stays panel-enforced (standing hard rule); the server
  // keeps only the minimum.
  const teamCount = Number.isInteger(req.data.teamCount) ? req.data.teamCount : null;
  // Abuse guard, NOT the classroom cap: the 21-franchise limit stays panel-
  // enforced (standing hard rule). This ceiling only blocks pathological
  // counts — a ~30-byte anonymous body could otherwise allocate millions of
  // placeholder teams before any validation ran.
  if (teamCount != null && teamCount > 500) {
    throw new HttpsError('invalid-argument', 'too many teams');
  }
  const teamNames = teamCount != null
    ? Array.from({ length: teamCount }, (_, i) => `Franchise ${i + 1}`)
    : (req.data.teamNames ?? []);
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
```
with:
```js
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  // Student-created franchises (2026-08-17, adjudicated): the panel now sends
  // an EMPTY payload — zero teams — and students create their own franchises
  // via createTeam below. Both explicit paths stay supported VERBATIM as
  // tooling contracts: { teamNames } drives the seed script, itest harness,
  // playtest CLI, prod-smoke, and every existing test; { teamCount } remains
  // from the count-first panel era. Explicit paths keep the 2-team minimum —
  // only the bare panel call may start empty (startSeason enforces the floor
  // at tip-off instead).
  const teamCount = Number.isInteger(req.data.teamCount) ? req.data.teamCount : null;
  // Abuse guard, NOT the classroom cap (createTeam enforces the 21): this
  // ceiling only blocks pathological counts — a ~30-byte anonymous body
  // could otherwise allocate millions of placeholder teams before any
  // validation ran.
  if (teamCount != null && teamCount > 500) {
    throw new HttpsError('invalid-argument', 'too many teams');
  }
  const teamNames = teamCount != null
    ? Array.from({ length: teamCount }, (_, i) => `Franchise ${i + 1}`)
    : (req.data.teamNames ?? []);
  if ((teamCount != null || req.data.teamNames != null) && teamNames.length < 2) {
    throw new HttpsError('invalid-argument', 'need at least 2 teams');
  }
```

- [ ] **Step 5: Implement createTeam.** In `src/game.js`, immediately after the `joinGame` callable's closing `});` and BEFORE the comment block starting `// Lobby discovery for clients that hold only a join code.`, insert:

```js
// Student-created franchises (2026-08-17, adjudicated): a student on the join
// screen creates a team AND claims their seat in ONE transaction — no orphan
// teams; every franchise starts with a member. The 21-franchise cap is
// enforced HERE, server-side (amended hard rule 2026-08-17 — the rationale is
// unchanged: rounds/{r} approaches Firestore's 1 MiB ceiling beyond 21 teams;
// only the enforcement site moved out of the professor panel, which no longer
// takes a count at all). Name validation mirrors renameTeam exactly (trim,
// 24-char cap, spreadsheet formula-prefix refusal); duplicate names stay
// allowed (teamId keys all correctness; renameTeam could recreate duplicates
// anyway). Creating is LOBBY-ONLY — mid-season arrivals claim open seats via
// joinGame instead. CLIENT CONTRACT (HARD INVARIANT, same as joinGame):
// createTeam must RESOLVE before setGameId(...) — it is what creates the
// caller's membership, and pre-membership listeners never recover.
export const createTeam = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const { role } = req.data;
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'bad role');
  const name = String(req.data.name ?? '').trim().slice(0, 24);
  if (name.length === 0 || /^[=+\-@]/.test(name)) {
    throw new HttpsError('invalid-argument', 'BAD_NAME');
  }
  const displayName = String(req.data.displayName ?? '').slice(0, 24);
  const joinCode = String(req.data.joinCode ?? '').toUpperCase();
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const gameRef = games.docs[0].ref;
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(gameRef)).data();
    if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'creation is closed');
    const teams = await tx.get(gameRef.collection('teams'));
    if (teams.size >= 21) throw new HttpsError('resource-exhausted', 'league is full');
    const teamRef = gameRef.collection('teams').doc();
    tx.set(teamRef, newTeamDoc(name));
    // Same membership write as joinGame — creating IS joining. A creator who
    // already held a seat elsewhere MOVES here (the membership doc is
    // uid-keyed), mirroring joinGame's switch-teams semantics; the abandoned
    // franchise persists and idles on server defaults.
    tx.set(gameRef.collection('players').doc(req.auth.uid), { teamId: teamRef.id, role, displayName });
    // teamCount tracks the teams collection (LobbyWall's seat counter reads
    // it); size+1 inside the tx keeps it exact and self-healing.
    tx.update(gameRef, { teamCount: teams.size + 1 });
    return { gameId: gameRef.id, teamId: teamRef.id, role };
  });
});
```

- [ ] **Step 6: startSeason floor + transaction.** In `src/game.js`, replace exactly:

```js
export const startSeason = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
  // round-1 market draw (75% of the FA catalog, seeded, identical for all teams;
  // non-exclusive per spec §4.2 — the draw is a shared catalog of signable copies).
  const d = drawMarket({ gameId, round: 1, faPool: FA_POOL, absentCounts: {}, extraPids: [] });
  const batch = db().batch();
  batch.set(db().doc(`games/${gameId}/market/1`),
    { available: d.available, absentCounts: d.absentCounts, unsoldPrices: {} });
  batch.update(db().doc(`games/${gameId}`), { status: 'active', round: 1, phase: 'FREE_AGENCY' });
  await batch.commit();
  return { phase: 'FREE_AGENCY' };
});
```
with:
```js
export const startSeason = onCall(async (req) => {
  const { gameId } = req.data;
  await assertProfessor(gameId, req.auth?.uid);
  // TRANSACTION (was a batch, 2026-08-17): createTeam also transacts on the
  // game doc, so the status flip serializes against franchise creation — a
  // create lands either before the flip (and plays normally) or after (and
  // retries into 'creation is closed'). No team can sneak in mid-start.
  const gameRef = db().doc(`games/${gameId}`);
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(gameRef)).data();
    if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
    // Students create the franchises now (createTeam), so creation no longer
    // guarantees a playable league — the start does. Same message as
    // createGame's explicit-path minimum; one student-copy entry serves both.
    if ((g.teamCount ?? 0) < 2) throw new HttpsError('failed-precondition', 'need at least 2 teams');
    // round-1 market draw (75% of the FA catalog, seeded, identical for all teams;
    // non-exclusive per spec §4.2 — the draw is a shared catalog of signable
    // copies). drawMarket is pure + seeded — safe inside the transaction.
    const d = drawMarket({ gameId, round: 1, faPool: FA_POOL, absentCounts: {}, extraPids: [] });
    tx.set(db().doc(`games/${gameId}/market/1`),
      { available: d.available, absentCounts: d.absentCounts, unsoldPrices: {} });
    tx.update(gameRef, { status: 'active', round: 1, phase: 'FREE_AGENCY' });
    return { phase: 'FREE_AGENCY' };
  });
});
```

- [ ] **Step 7: Register the export.** In `index.js`, replace exactly:

```js
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer, markDone, setRevealStep, renameTeam, releaseSeat } from './src/game.js';
```
with:
```js
export { createGame, createTeam, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer, markDone, setRevealStep, renameTeam, releaseSeat } from './src/game.js';
```

- [ ] **Step 8: Student copy.** In `app/src/lib/errors.ts`, replace exactly:

```ts
  'seat is not claimed': 'That seat is already open.',
```
with:
```ts
  'seat is not claimed': 'That seat is already open.',
  'league is full': 'The league is full — 21 franchises is the cap.',
  'creation is closed': 'The season already started — claim an open seat instead.',
  'need at least 2 teams': 'Need at least 2 franchises before the season can start.',
```

Append to `app/src/lib/errors.test.ts`:

```ts
test('student-created-team errors map to student copy', () => {
  expect(errorCopy(new Error('league is full')).headline)
    .toBe('The league is full — 21 franchises is the cap.');
  expect(errorCopy(new Error('creation is closed')).headline)
    .toBe('The season already started — claim an open seat instead.');
  expect(errorCopy(new Error('need at least 2 teams')).headline)
    .toBe('Need at least 2 franchises before the season can start.');
});
```

- [ ] **Step 9: Green.** Backend: `npx vitest run test/create-team.test.js` (10 pass), then full `npx vitest run` → **27 files / 191** (baseline 26/181 +1 file +10; `rename.test.js`'s `teamCount: 1` rejection and every `teamNames` seeder must stay green — that IS the tooling-contract guard). App: `npx vitest run src/lib/errors.test.ts`, full unit → **15/79**.
- [ ] **Step 10: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/index.js games/salary-showdown/backend/functions/test/create-team.test.js games/salary-showdown/app/src/lib/errors.ts games/salary-showdown/app/src/lib/errors.test.ts && git commit -m "feat(salary-showdown): createTeam — students create franchises; zero-team createGame + startSeason floor (student-created teams backend)"
```

---

### Task 2: Landing — "Create a franchise" card

**Files:**
- Modify: `games/salary-showdown/app/src/pages/LandingPage.tsx`
- Test: `games/salary-showdown/app/src/itest/landing.itest.tsx` (new third test)

**Interfaces (Consumes):** `createTeam({joinCode, name, role, displayName})` → `{gameId, teamId, role}` from Task 1. HARD INVARIANT: the call must RESOLVE before `setGameId(...)`.

- [ ] **Step 1: Failing itest.** In `landing.itest.tsx`, extend the harness import line to include `adminDb`:

```tsx
import { adminDb, newClient, seedToPhase } from './harness';
```

Append:

```tsx
test('create a franchise (student-created teams): one tap creates the team and claims the seat', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from prior tests' claims
  sessionStorage.clear();
  const prof = await newClient('prof-empty');
  const { gameId, joinCode } = await prof.call<{ gameId: string; joinCode: string }>(
    'createGame', {}); // zero-team game — the panel's new path
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  await user.type(screen.getByLabelText('join code'), joinCode);
  await user.type(screen.getByLabelText('display name'), 'Founder');
  await user.click(screen.getByRole('button', { name: 'Find game' }));

  // Zero teams yet — the create card is the picker's only affordance.
  const nameBox = await screen.findByLabelText('new franchise name', {}, { timeout: 15000 });
  await user.type(nameBox, 'Cap Crunchers');
  await user.click(screen.getByRole('button', { name: 'Create as GM' }));

  // createTeam resolved before setGameId (HARD INVARIANT) → PhaseRouter lands us in the lobby.
  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  expect(teamsSnap.size).toBe(1);
  expect(teamsSnap.docs[0].data().name).toBe('Cap Crunchers');
  const membership = (await adminDb().doc(
    `games/${gameId}/players/${auth.currentUser!.uid}`).get()).data()!;
  expect(membership).toMatchObject({ teamId: teamsSnap.docs[0].id, role: 'GM' });
  // LobbyWall's seat counter reads games/{id}.teamCount — the create incremented it.
  expect((await adminDb().doc(`games/${gameId}`).get()).data()!.teamCount).toBe(1);
}, 120000);
```

- [ ] **Step 2: Run — new test FAILS** at `findByLabelText('new franchise name')`; the first two tests stay green:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/landing.itest.tsx
```

- [ ] **Step 3: Implement.** In `LandingPage.tsx`:

(a) After `const [name, setName] = useState('');` insert:

```tsx
  const [newTeam, setNewTeam] = useState('');
```

(b) After the `claim` function's closing `};`, insert:

```tsx
  const createFranchise = async (role: string) => {
    setBusy(true); setErr(null);
    try {
      // HARD INVARIANT (same as claim above): createTeam RESOLVES before
      // setGameId — the callable creates the franchise AND this caller's
      // membership atomically, so the game-doc listener subscribes with
      // read access. The server owns the 21-cap and the lobby-only gate.
      const res = await call<{ gameId: string }>('createTeam', {
        joinCode: code.trim().toUpperCase(), name: newTeam.trim(), role,
        displayName: name.trim() || 'Anonymous',
      });
      setGameId(res.gameId);
    } catch (e) {
      setErr(e);              // league full / creation closed — refresh the picker
      void lookup(code, false);
    } finally { setBusy(false); }
  };
```

(c) Picker order parity with the walls/grids (the list is live now — teams pop in as classmates create them). Replace exactly:

```tsx
          {lobby.teams.map((t) => (
```
with:
```tsx
          {[...lobby.teams]
            // numeric-aware: Franchise 2 before Franchise 10 — same collation
            // as the walls and panel grids (playtest-2 sweep)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((t) => (
```
(The map body and its closing `))}` are unchanged.)

(d) The create card. Immediately after the team-cards map's closing `))}` and before the fragment's closing `</>`, insert:

```tsx
          {lobby.status === 'lobby' && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Create a franchise</strong>
              <p className="muted" style={{ margin: '4px 0 8px', fontSize: 13 }}>
                Name a new franchise and claim your seat in it — one tap.
                Teammates then join it from the list above.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="inset" style={{ color: 'inherit', fontSize: 16, flex: 1, minWidth: 140 }}
                  placeholder="Franchise name" maxLength={24} value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)} aria-label="new franchise name" />
                {ROLES.map((r) => (
                  <button key={r} className="chip on" disabled={busy || newTeam.trim().length === 0}
                    onClick={() => void createFranchise(r)}>
                    Create as {r}
                  </button>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 4: Green + collateral.** `npx vitest run -c vitest.integration.config.ts src/itest/landing.itest.tsx` (3/3); then `npx vitest run -c vitest.integration.config.ts src/itest/lobby.itest.tsx` (the lobby rename flow rides the same pages — prove it unaffected). `npx tsc -b && npm run audit:ui` (66).
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/pages/LandingPage.tsx games/salary-showdown/app/src/itest/landing.itest.tsx && git commit -m "feat(salary-showdown): landing create-a-franchise card — one-tap create + claim (student-created teams)"
```

---

### Task 3: Panel — zero-team create + start gating

**Files:**
- Modify: `games/salary-showdown/app/src/components/professor/SessionSetup.tsx`
- Test: `games/salary-showdown/app/src/itest/professor.itest.tsx` (rewrite the create test)

**Interfaces (Consumes):** `createGame({})` (zero-team) and `createTeam` (via harness clients in the itest) from Task 1.

- [ ] **Step 1: Rewrite the itest first (red).** In `professor.itest.tsx`, replace the ENTIRE test `'panel: create enforces the 21-franchise cap, lists franchises, starts the season'` (from its `test(` line through its closing `}, 240000);`) with:

```tsx
test('panel: zero-team create — franchises appear as students create them; season starts at 2+', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // beforeEach cleared ss.profGameId — the panel opens on the create/resume view.
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  // Zero-team create: no count input exists any more — the 21-cap moved
  // server-side into createTeam (amended hard rule 2026-08-17, pinned in
  // test/create-team.test.js), and the 2-franchise floor lives in startSeason.
  await user.click(await screen.findByRole('button', { name: 'Create game' }, { timeout: 20000 }));
  await waitFor(() => expect(screen.getByLabelText('Join code')).toBeInTheDocument(),
    { timeout: 30000 });
  expect(screen.getByText('No franchises yet — students create them from the join screen.'))
    .toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start season' })).toBeDisabled();

  const joinCode = screen.getByLabelText('Join code').textContent!;
  const stu1 = await newClient('creator1');
  await stu1.call('createTeam',
    { joinCode, name: 'Cap Crunchers', role: 'GM', displayName: 'A' });
  await waitFor(() => expect(screen.getByText('Cap Crunchers')).toBeInTheDocument(),
    { timeout: 20000 });
  expect(screen.getByRole('button', { name: 'Start season' })).toBeDisabled(); // 1 < 2

  const stu2 = await newClient('creator2');
  await stu2.call('createTeam',
    { joinCode, name: 'Beta Blockers', role: 'GM', displayName: 'B' });
  await waitFor(() => expect(screen.getByText('Beta Blockers')).toBeInTheDocument(),
    { timeout: 20000 });

  const start = screen.getByRole('button', { name: 'Start season' });
  await waitFor(() => expect(start).toBeEnabled(), { timeout: 15000 });
  await user.click(start);
  // startSeason lands in FREE_AGENCY R1 (Draft Night); the advance button names
  // the CONCRETE next phase from the order — Star Auction, same round.
  await screen.findByRole('button', { name: 'Advance → Star Auction · R1' }, { timeout: 30000 });
}, 240000);
```

- [ ] **Step 2: Run — the rewritten test FAILS** (`franchise count` input still rendered / "No franchises yet" copy missing); the file's other tests stay green:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
```

- [ ] **Step 3: Implement.** In `SessionSetup.tsx`, five replacements:

(a) Replace exactly:
```tsx
// HARD RULE (contracts): max 21 franchises, enforced HERE in the panel —
// count check + this exact copy — NOT server-side. The server only enforces
// the minimum of 2. Reason: rounds/{r} approaches Firestore's 1 MiB document
// ceiling beyond 21 teams (parent spec).
const CAP_COPY =
  "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.";
const MIN_COPY = 'Enter how many franchises are playing — at least 2.';
```
with:
```tsx
// AMENDED HARD RULE (2026-08-17): the 21-franchise cap is now enforced
// SERVER-SIDE in createTeam — students create their own franchises from the
// join screen, so the panel takes no count at all. The rationale is unchanged
// (rounds/{r} approaches Firestore's 1 MiB ceiling beyond 21 teams); only the
// enforcement site moved. The 2-franchise floor is server-side too
// (startSeason); the disabled Start button below is a UX mirror, not the gate.
```

(b) Replace exactly:
```tsx
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [countText, setCountText] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
```
with:
```tsx
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [resumeId, setResumeId] = useState('');
  const [error, setError] = useState<unknown>(null);
```

(c) Replace exactly:
```tsx
    const create = async () => {
      // Count-first create (playtest-2 item 1): students name their own
      // franchises from the lobby. The 21-franchise cap stays enforced HERE
      // with the exact CAP_COPY string — standing hard rule, not server-side.
      const n = Number(countText);
      if (!Number.isInteger(n) || n < 2) { setInlineError(MIN_COPY); return; }
      if (n > 21) { setInlineError(CAP_COPY); return; }
      setInlineError(null);
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>(
          'createGame', { teamCount: n });
        setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
```
with:
```tsx
    const create = async () => {
      // Zero-team create (student-created teams): the game starts empty and
      // students create their own franchises from the join screen. The 21-cap
      // and the 2-franchise floor are both server-enforced now (createTeam /
      // startSeason).
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>('createGame', {});
        setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
```

(d) Replace exactly:
```tsx
        <input aria-label="franchise count" className="mono" inputMode="numeric"
          value={countText}
          onChange={(e) => setCountText(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="How many franchises? (2 to 21)"
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 16 }} />
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Teams arrive as Franchise 1..N — students name their own from the
          lobby before you press Start season.
        </p>
        {inlineError && (
          <p className="neg" role="alert" style={{ margin: '8px 0' }}>{inlineError}</p>
        )}
        <button type="button" className="btn gold" disabled={busy}
          onClick={() => void create()}>Create game</button>
```
with:
```tsx
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Students create and name their own franchises from the join screen —
          share the join code and they appear below. The server caps the
          league at 21 franchises.
        </p>
        <button type="button" className="btn gold" disabled={busy}
          onClick={() => void create()}>Create game</button>
```

(e) Replace exactly:
```tsx
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Franchises</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...teams.entries()].map(([id, t]) => (
          <span key={id} className="chip">{t.name}</span>
        ))}
      </div>
      <button type="button" className="btn green" style={{ marginTop: 10 }} disabled={busy}
        onClick={() => void start()}>Start season</button>
```
with:
```tsx
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Franchises</h2>
      {teams.size === 0 && (
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>
          No franchises yet — students create them from the join screen.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...teams.entries()]
          // numeric-aware: Franchise 2 before Franchise 10 (collation sweep)
          .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true }))
          .map(([id, t]) => (
            <span key={id} className="chip">{t.name}</span>
          ))}
      </div>
      {teams.size < 2 && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Start season unlocks once 2 franchises exist.
        </p>
      )}
      <button type="button" className="btn green" style={{ marginTop: 10 }}
        disabled={busy || teams.size < 2}
        onClick={() => void start()}>Start season</button>
```

- [ ] **Step 4: Green + collateral.** `npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx src/itest/professor-fixes.itest.tsx src/itest/professor-seats.itest.tsx src/itest/bigscreen.itest.tsx` (the seats/fixes/bigscreen files seed via `teamNames` — prove them unaffected). Then `npx tsc -b && npm run audit:ui` (66).
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/components/professor/SessionSetup.tsx games/salary-showdown/app/src/itest/professor.itest.tsx && git commit -m "feat(salary-showdown): panel zero-team create + start-season gating (student-created teams)"
```

---

### Task 4: Docs + the CAP_COPY comment trail

**Files:**
- Modify: `docs/superpowers/salary-showdown-RUNBOOK.md`
- Modify: `docs/superpowers/salary-showdown-HANDOFF.md` (§5, §6, §10)
- Modify: `games/salary-showdown/backend/SCHEMA.md`
- Modify: `games/salary-showdown/backend/README.md`

- [ ] **Step 1: RUNBOOK.** Three edits:

(a) Replace exactly:
```
2. Under **New session**, enter HOW MANY franchises are playing, then press
   **Create game**. Teams arrive as Franchise 1..N — students name their own
   franchises from their lobby screens; names lock when you press Start
   season. Hard cap: **21 franchises** — beyond that the per-round data
   document approaches Firestore's 1 MiB limit. The panel blocks 22+ with:
   "Cap sessions at 21 franchises — the round document approaches Firestore's
   1 MiB limit beyond that."
```
with:
```
2. Under **New session**, press **Create game**. The game starts with ZERO
   franchises: students create and name their own from the join screen
   (franchise name + role, one tap), and the panel's Franchises card fills
   in live. Names stay editable from their lobby until you press Start
   season. Hard cap: **21 franchises** — beyond that the per-round data
   document approaches Firestore's 1 MiB limit. The SERVER now blocks
   franchise #22; students see: "The league is full — 21 franchises is the
   cap." **Start season** stays locked until at least 2 franchises exist.
```

(b) In the "If something breaks" table, find the row whose fix cell contains `Release the seat from the panel's` (the Seats-card row) and insert immediately AFTER it:
```
| A stray or mistaken franchise sits in the lobby | Leave it or have its creator rename it — there is no delete. An unstaffed franchise plays on server defaults (hardship signings + auto-filled lineups) and hurts nobody; don't press Start season until the room looks right. |
```
(If the anchor row's wording has drifted, match on the Seats-card row by content and keep the insertion position; report the drift in the task report.)

(c) Verify step 6 ("When seats are filled…") still reads true with student-created franchises — it does (no count reference); leave unchanged. Confirm no other RUNBOOK line references the panel count input or the old CAP_COPY string (grep `Cap sessions at 21`).

- [ ] **Step 2: HANDOFF.** Four edits:

(a) §5 — replace exactly:
```
- **Cap sessions at 21 franchises.** The `rounds/{r}` doc approaches Firestore's 1 MiB limit around
  28+ teams, and the >21-team balanced partial round-robin scheduler is **descoped**. A 70-student
  class at 3/team ≈ 23 franchises — so this is a real operational instruction for the professor
  material, not a footnote.
```
with:
```
- **21-franchise cap — now SERVER-enforced (2026-08-17).** The `rounds/{r}` doc approaches
  Firestore's 1 MiB limit around 28+ teams, and the >21-team balanced partial round-robin scheduler
  is **descoped**. Students create franchises themselves (`createTeam`), so the cap moved out of
  the professor material and into the callable: franchise #22 is rejected server-side
  (`league is full`; student copy: "The league is full — 21 franchises is the cap."). No professor
  action needed.
```

(b) §6 — insert a new bullet immediately AFTER the bullet:
```
- **Config knobs `config.cap` / `config.totalRounds` are decorative** — never expose as editable.
```
New bullet:
```
- **21-franchise cap, enforced SERVER-SIDE in `createTeam` (enforcement site amended 2026-08-17).**
  Students create franchises themselves; the 22nd create is rejected with `league is full` (student
  copy: "The league is full — 21 franchises is the cap."). Rationale unchanged: `rounds/{r}`
  approaches Firestore's 1 MiB ceiling beyond 21 teams. The professor panel no longer takes a count
  at all; `createGame`'s explicit tooling paths keep only the 500 abuse ceiling, and `startSeason`
  refuses to start with fewer than 2 franchises.
```

(c) §6 — replace exactly:
```
- **HARD INVARIANT:** `joinGame` must RESOLVE before `setGameId(...)`. The game-doc listener never
  recovers from a `permission-denied`, so setting gameId pre-membership permanently strands the tab.
```
with:
```
- **HARD INVARIANT:** `joinGame` — and `createTeam`, which claims the creator's seat the same
  way — must RESOLVE before `setGameId(...)`. The game-doc listener never recovers from a
  `permission-denied`, so setting gameId pre-membership permanently strands the tab.
```

(d) §10 — replace exactly:
```
`createGame({teamNames} | {teamCount})` · `getLobby({joinCode})` · `joinGame({joinCode, teamId, role, displayName})` ·
`renameTeam({gameId, name})` (member, lobby-only, own team) · `releaseSeat({gameId, teamId, role})` (professor-only) ·
```
with:
```
`createGame({teamNames} | {teamCount} | {})` (empty payload = ZERO-team game for student-created
franchises; explicit paths keep the 2-minimum and the 500 abuse ceiling) · `getLobby({joinCode})` ·
`joinGame({joinCode, teamId, role, displayName})` ·
`createTeam({joinCode, name, role, displayName})` (any signed-in student, lobby-only: creates the
franchise AND claims the creator's seat in one transaction — no orphan teams; 21-cap enforced here;
duplicate names allowed; `startSeason` refuses <2 teams) ·
`renameTeam({gameId, name})` (member, lobby-only, own team) · `releaseSeat({gameId, teamId, role})` (professor-only) ·
```

- [ ] **Step 3: SCHEMA.md.** Replace exactly:
```
games/{gameId}/teams/{teamId}         # PUBLIC team state (rosters are public like real NBA):
```
with:
```
games/{gameId}/teams/{teamId}         # PUBLIC team state (rosters are public like real NBA):
                                      # createTeam (any signed-in student, lobby-only callable,
                                      # 2026-08-17) creates a franchise AND the creator's
                                      # players/{uid} membership in ONE transaction — no orphan
                                      # teams. The 21-franchise cap is enforced there server-side
                                      # (amended rule; rounds/{r} ~1MiB rationale unchanged), and
                                      # games/{gameId}.teamCount is updated in the same transaction
                                      # (LobbyWall's seat counter reads it). createGame with an
                                      # EMPTY payload seeds zero teams; startSeason refuses <2.
```

- [ ] **Step 4: backend/README.md.** Two edits:

(a) Replace exactly:
```
| `createGame({ teamNames } \| { teamCount })` | Professor creates a game, seeds teams + the full player catalog, returns `{ gameId, joinCode }`. `teamCount` seeds `Franchise 1..N` placeholders for students to rename via `renameTeam`; `teamNames` seeds those names directly and stays byte-unchanged for the seed script, itest harness, playtest CLI, and prod-smoke. |
```
with:
```
| `createGame({ teamNames } \| { teamCount } \| {})` | Professor creates a game, seeds the full player catalog, returns `{ gameId, joinCode }`. An EMPTY payload seeds ZERO teams — students create their own franchises via `createTeam` (2026-08-17). Explicit paths keep the 2-team minimum: `teamCount` seeds `Franchise 1..N` placeholders; `teamNames` seeds names directly and stays byte-unchanged for the seed script, itest harness, playtest CLI, and prod-smoke. |
| `createTeam({ joinCode, name, role, displayName })` | Any signed-in student, lobby-only: creates a franchise AND claims the creator's seat in one transaction (no orphan teams). The 21-franchise cap is enforced HERE (`league is full` — amended hard rule 2026-08-17); name rules mirror `renameTeam` (trim, 24-char cap, formula-prefix refusal, `BAD_NAME`); duplicate names allowed. Updates `games/{id}.teamCount` transactionally. |
```

(b) Replace exactly:
```
| `startSeason({ gameId })` | Professor-only: locks the lobby, draws the round-1 free-agency market, moves `LOBBY → FREE_AGENCY`. |
```
with:
```
| `startSeason({ gameId })` | Professor-only: locks the lobby, draws the round-1 free-agency market, moves `LOBBY → FREE_AGENCY`. Refuses fewer than 2 teams (`need at least 2 teams`) — creation no longer guarantees a playable league. Transactional against `createTeam`: a racing create lands before the flip (and plays) or retries into `creation is closed`. |
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add docs/superpowers/salary-showdown-RUNBOOK.md docs/superpowers/salary-showdown-HANDOFF.md games/salary-showdown/backend/SCHEMA.md games/salary-showdown/backend/README.md && git commit -m "docs(salary-showdown): student-created teams — cap enforcement-site amendment + contract truth (RUNBOOK, HANDOFF, SCHEMA, README)"
```

---

### Task 5: Exit battery + browser checks + ledger + finish

- [ ] **Step 1: Exit battery** (FRESH emulators — restart before measuring): backend **27/191** · unit **15/79** · integration **20/37** · `npx tsc -b` clean · `npm run audit:ui` (66) — adjusted by Task 0's recorded baseline deltas. Also refresh HANDOFF §2's suite-count row to the final figures and amend it into the Task 4 docs commit (or a tiny follow-up docs commit).
- [ ] **Step 2: Browser checks (controller, preview pane, dev server 5176; drive with `javascript_tool` + `element.click()` — raw coordinate clicks are unreliable):**
  1. Panel: Create game (no count input) → join code renders; "No franchises yet" line; Start season disabled.
  2. Landing tab: enter code → create card → "Cap Crunchers" as GM → lands in the lobby with the rename row present.
  3. Second franchise created via a harness/CLI client → panel chip appears, Start season enables; `/bigscreen` LobbyWall counter reads "2 of 6 seats filled".
  4. Start season → Draft Night reachable; one signing lands (sanity).
  5. Cap copy end-to-end: script a `createGame({teamNames: [21 names]})` game, open the landing picker, create franchise #22 → alert shows "The league is full — 21 franchises is the cap."
  6. Post-start: picker for an active game shows NO create card (only "Season in progress — you can still claim an open seat.").
- [ ] **Step 3:** Ledger one-liner to `.superpowers/sdd/progress.md` (battery figures + browser checks + the accepted duplicate-name/abandoned-franchise ledger notes). NEVER `git add` it.
- [ ] **Step 4:** `superpowers:finishing-a-development-branch` — present Dylan the ONE combined decision: merge `salary-showdown-playtest2` → `main` + push + rebuild the hosting bundle + hand him the deploy command (`cd games/salary-showdown/backend && firebase deploy --only hosting,functions --project prod`). If the chip branches landed on main mid-run, rebase/merge and re-run the battery BEFORE the menu. No merge/push/deploy without his explicit go.

---

## Out of scope

- Auto-routing a released client to `/` (existing ledgered follow-up — untouched).
- Team deletion / professor-side franchise removal (RUNBOOK documents the honest "leave it" path).
- Uniqueness or profanity filtering on franchise names (same trust level as display names; duplicates ledgered as accepted).
- Any change to `renameTeam`, `joinGame`, `getLobby`, actsAs/releaseSeat/SeatPanel, walls other than none needed (LobbyWall reads `teamCount` and needs no edit).
- The two chip fixes (Standings W/$ '—', Coach remount) — separate sessions own them.

## Self-review notes (applied)

- **Tooling contract:** `createGame({teamNames})`/`({teamCount})` behavior byte-identical for every existing caller; only the previously-rejected bare `{}` gains meaning. `rename.test.js`'s `teamCount: 1` rejection stays green; new test pins `{teamNames: []}` and `{teamCount: 0}` rejections.
- **Atomicity:** team doc + membership + `teamCount` all inside one transaction; `newTeamDoc` shares the day-zero shape with `createGame` so the shapes cannot fork (test asserts deep equality).
- **Race:** `startSeason` batch→transaction closes the create-during-start window; both sides transact on the game doc. `drawMarket` verified pure/seeded (`src/market.js:9` — RNG from gameId, no Firestore ops).
- **HARD INVARIANT:** `createFranchise` awaits `createTeam` before `setGameId` — same shape as `claim`; the landing itest's lobby-arrival assertion is the behavioral pin; HANDOFF §6 invariant text extended.
- **Type consistency:** `createTeam` return `{gameId, teamId, role}` used by Task 2 (`res.gameId` only); message strings (`league is full`, `creation is closed`, `need at least 2 teams`, `BAD_NAME`, `bad role`, `bad join code`) identical across game.js, errors.ts, and every test.
- **Counts:** backend 26/181 → 27/191 (+1 file, +10); unit 15/78 → 15/79 (+1); integration 20/36 → 20/37 (landing +1, professor rewritten in place); audit stays 66 (no new tsx files).
- **No emojis** in any new copy; no derived metrics; sealed-bid surfaces untouched.
