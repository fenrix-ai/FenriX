# Salary Showdown Plan 3a — Classroom Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Salary Showdown runnable in a classroom: professor control panel (`/professor`), projector view (`/bigscreen`), the Finale/Reveal, and the small backend additions they need — emulator-only, ending fully demoable on one laptop.

**Architecture:** Two new professor-authorized surfaces share a new `ProfessorProvider` data layer (the membership-gated team client is untouched). Three new callables (`setTimer`, `markDone`, `setRevealStep`) plus two data enrichments (`previousRank` on standings, extended `trueWeights` with datagen-provenance regression numbers) complete the server side. The projector is pure playback: every animation consumes data that is already final before the phase renders (guaranteed by the transition gate).

**Tech Stack:** Firebase Cloud Functions + Firestore (emulators), React 19 + TypeScript + Vite, vitest (unit + emulator-backed integration), hand-rolled SVG for charts (no new dependencies), Python datagen (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-24-salary-showdown-plan3-classroom-design.md` — the design authority for every task below. Parent game spec: `docs/superpowers/specs/2026-07-14-salary-showdown-design.md`.

## Global Constraints

- `advancePhase` and `setTimer` callers ALWAYS send `expectedPhase` + `expectedRound`. `submitBids` always sends a plain object, never `null`.
- NO emojis anywhere in product UI (`npm run audit:ui` enforces). Glyphs `★ ▲ ▼ ● ○ ½ ‹ ›` are fine. Hype renders only as ★ glyphs, never numerically.
- Facts, never conclusions on in-game team screens. **The FINALE is the sanctioned reveal** (parent spec §11.14): value-per-dollar, wins-per-dollar, trap/bargain labels, and the weights comparison are exactly what it exists to show — do not "sanitize" them there. The in-game Results bargain award still never renders `perDollar`.
- Playstyle strings and blurbs verbatim; no synergy meters on team screens. Free agency is non-exclusive; only auction stars are exclusive. Only `bench[0..1]` play.
- Timers are advisory pacing (parent spec §13): expiry never blocks a submission server-side; advancing the phase is what closes it.
- Config `cap`/`totalRounds` are decorative — display read-only, never editable. Timer defaults are panel-local (localStorage), never game config.
- Max 21 franchises: enforced in the panel create-game UI only (count check + copy), not server-side.
- Backend error style: `throw new HttpsError(kind, 'CODE')` with the bare code in the message; clients match on the message. New codes in 3a: `BAD_TIMER`, `BAD_STEP`; reuse `PHASE_MISMATCH`.
- No new npm or Python dependencies anywhere in 3a. Charts are hand-rolled SVG.
- Mockup sample numbers are never authoritative — recompute everything.
- Emulators: `cd games/salary-showdown/backend/functions && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu` (Functions 5101 · Firestore 8180 · Auth 9199 · UI 4100, project `salary-showdown-dev`). Run suites against the long-lived emulator; the functions emulator hot-reloads on edit — one flaky run right after an edit is expected, re-run before investigating.
- Suites that must stay green after every task: backend `npx vitest run` (19 files / 115 tests + additions), app unit `npx vitest run` (30 + additions), app integration `npx vitest run -c vitest.integration.config.ts` (14 + additions; needs live emulators), `npx tsc -b`, `npm run audit:ui`.
- Commit style: `feat(salary-showdown): …` / `fix(…)` / `docs(…)`.

---

---

### Task 1: setTimer callable + timerPausedMs

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js`
  - line 2 (the `firebase-admin/firestore` import)
  - line 34 (createGame's `batch.set(gameRef, {...})` — game-doc seed)
  - line 190 (advancePhase's flip `update` object)
  - insertion after line 201 (the `});` closing `advancePhase`, immediately before `async function memberWithRole`)
- Modify: `games/salary-showdown/backend/functions/index.js` (line 4 export list — the contracts require every new callable "export via index")
- Modify: `games/salary-showdown/backend/SCHEMA.md` (line 5 game-doc field list + new timer-states block after it)
- Test (new): `games/salary-showdown/backend/functions/test/timer.test.js`

**Interfaces:**
- Consumes (already exist in `src/game.js`):
  - `export async function assertProfessor(gameId, uid)` (game.js:19) — throws `HttpsError('not-found', 'game not found')` / `HttpsError('permission-denied', 'professor only')`, returns the game doc data.
  - `onCall`, `HttpsError` from `firebase-functions/v2/https`; `getFirestore`, `FieldValue` from `firebase-admin/firestore` (game.js:1-2); `const db = () => getFirestore()` (game.js:14).
  - advancePhase's error convention: bare code string as the HttpsError MESSAGE, e.g. `throw new HttpsError('failed-precondition', 'PHASE_MISMATCH')` (game.js:168). Clients match errors on the MESSAGE, not the kind.
- Produces (later tasks rely on these exactly):
  - Callable `setTimer({gameId, action, seconds?, expectedPhase, expectedRound})` → returns `{timerEndsAt: <millis|null>, timerPausedMs: <number|null>}`. Professor-only. Actions: `start` | `pause` | `resume` | `extend` | `clear`. New error code `BAD_TIMER` (as `invalid-argument` for bad `seconds`/unknown action, `failed-precondition` for wrong-state pause/resume/extend). Consumed by T8 (`TimerStrip`, panel auto-arm) and mapped in `app/src/lib/errors.ts` in Task 14.
  - Game-doc field `games/{id}.timerPausedMs: number|null` — running: `timerEndsAt` set / `timerPausedMs` null · paused: `timerEndsAt` null / `timerPausedMs` set · off: both null. Consumed by T6 (`GameDoc.timerPausedMs` type) and T8 (`LedTimer pausedMs` prop).
  - advancePhase flip now nulls BOTH timer fields on every transition.

Hard rules restated for this task (do not "improve" on them):
- `advancePhase` / `setTimer` callers ALWAYS send `expectedPhase` + `expectedRound`; the server check stays null-tolerant (identical shape to game.js:166-168) so expectation-less old-test callers behave the same across both callables.
- Timers are advisory pacing (parent spec §13): expiry NEVER blocks a submission server-side. `setTimer` only moves two display fields; do not add any enforcement, and do not make any submission path read them.
- The advancePhase flip update gains `timerPausedMs: null` as an ADDITIVE KEY ONLY — do not restructure, reorder, or otherwise touch the hardened flip transaction, the mismatch-before-adoption ordering, or the hook flow.
- Backend errors carry the bare code string in the message (`'BAD_TIMER'`, `'PHASE_MISMATCH'`), nothing else.

- [ ] **Step 1: Verify the emulators are up (do not start a second copy)**

  The backend tests run in-process (firebase-functions-test wraps the handlers) against the live Firestore emulator on port 8180. Check it:

  ```bash
  nc -z localhost 8180 && echo EMULATOR_UP || echo EMULATOR_DOWN
  ```

  Expected outcome: `EMULATOR_UP`. If it prints `EMULATOR_DOWN`, start the long-lived emulator stack in a SEPARATE terminal and leave it running for the whole task:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npm run emu
  ```

  then re-run the `nc` check until it prints `EMULATOR_UP`. Note: the functions emulator hot-reloads on edit — one flaky run right after an edit is expected; re-run before investigating.

- [ ] **Step 2: Write the failing test file**

  Create `games/salary-showdown/backend/functions/test/timer.test.js` with EXACTLY this content (harness lines copied from `test/advance-race.test.js` / `test/lifecycle.test.js`):

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

  const { createGame, startSeason, advancePhase, setTimer } = await import('../src/game.js');
  const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

  // Panel contract (Plan 3a hard rule): setTimer callers ALWAYS send
  // expectedPhase + expectedRound, same as advancePhase. Every call below does.
  const exp = { expectedPhase: 'FREE_AGENCY', expectedRound: 1 };

  // Timer state machine under test (SCHEMA.md):
  //   running: timerEndsAt set,  timerPausedMs null
  //   paused:  timerEndsAt null, timerPausedMs set
  //   off:     both null
  // Tests run in declaration order and walk the machine deliberately:
  // off -> (rejections) -> running -> paused -> running -> off.
  describe('setTimer', () => {
    let gameId;

    beforeAll(async () => {
      const res = await call(createGame, { teamNames: ['Ticks', 'Tocks'] }, 'prof-timer');
      gameId = res.gameId;
      await call(startSeason, { gameId }, 'prof-timer'); // -> FREE_AGENCY round 1
    });

    it('createGame seeds timerPausedMs: null alongside timerEndsAt: null', async () => {
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBeNull();
    });

    it('rejects non-professor callers', async () => {
      await expect(call(setTimer, { gameId, action: 'start', seconds: 60, ...exp }, 'not-prof'))
        .rejects.toMatchObject({
          code: 'permission-denied', message: expect.stringContaining('professor') });
    });

    it('rejects stale expectations with PHASE_MISMATCH without touching the timer', async () => {
      await expect(call(setTimer, { gameId, action: 'start', seconds: 60,
        expectedPhase: 'AUCTION', expectedRound: 1 }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
      await expect(call(setTimer, { gameId, action: 'start', seconds: 60,
        expectedPhase: 'FREE_AGENCY', expectedRound: 2 }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).toBeNull();   // nothing landed
      expect(g.timerPausedMs).toBeNull();
    });

    it('start validates seconds as integer 1..3600 (BAD_TIMER invalid-argument)', async () => {
      for (const seconds of [0, -5, 3601, 2.5, 'abc', undefined]) {
        await expect(call(setTimer, { gameId, action: 'start', seconds, ...exp }, 'prof-timer'))
          .rejects.toMatchObject({
            code: 'invalid-argument', message: expect.stringContaining('BAD_TIMER') });
      }
    });

    it('pause while off rejects BAD_TIMER failed-precondition', async () => {
      await expect(call(setTimer, { gameId, action: 'pause', ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('BAD_TIMER') });
    });

    it('resume while off rejects BAD_TIMER failed-precondition', async () => {
      await expect(call(setTimer, { gameId, action: 'resume', ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('BAD_TIMER') });
    });

    it('extend while off (neither running nor paused) rejects BAD_TIMER failed-precondition', async () => {
      await expect(call(setTimer, { gameId, action: 'extend', seconds: 30, ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('BAD_TIMER') });
    });

    it('unknown action rejects BAD_TIMER invalid-argument', async () => {
      await expect(call(setTimer, { gameId, action: 'snooze', ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'invalid-argument', message: expect.stringContaining('BAD_TIMER') });
    });

    it('start writes endsAt = now + seconds and pausedMs null; returns millis', async () => {
      const before = Date.now();
      const out = await call(setTimer, { gameId, action: 'start', seconds: 120, ...exp }, 'prof-timer');
      const after = Date.now();
      expect(out.timerPausedMs).toBeNull();
      expect(out.timerEndsAt).toBeGreaterThanOrEqual(before + 120_000);
      expect(out.timerEndsAt).toBeLessThanOrEqual(after + 120_000);
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt.toMillis()).toBe(out.timerEndsAt); // stored as Timestamp
      expect(g.timerPausedMs).toBeNull();
    });

    it('resume while running rejects BAD_TIMER failed-precondition', async () => {
      await expect(call(setTimer, { gameId, action: 'resume', ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('BAD_TIMER') });
    });

    it('extend while running pushes endsAt out by exactly seconds*1000', async () => {
      const before = (await db.doc(`games/${gameId}`).get()).data().timerEndsAt.toMillis();
      const out = await call(setTimer, { gameId, action: 'extend', seconds: 30, ...exp }, 'prof-timer');
      expect(out.timerEndsAt).toBe(before + 30_000);
      expect(out.timerPausedMs).toBeNull();
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt.toMillis()).toBe(before + 30_000);
    });

    it('extend validates seconds as integer 1..600 (BAD_TIMER invalid-argument)', async () => {
      const before = (await db.doc(`games/${gameId}`).get()).data().timerEndsAt.toMillis();
      for (const seconds of [0, 601, 1.5, undefined]) {
        await expect(call(setTimer, { gameId, action: 'extend', seconds, ...exp }, 'prof-timer'))
          .rejects.toMatchObject({
            code: 'invalid-argument', message: expect.stringContaining('BAD_TIMER') });
      }
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt.toMillis()).toBe(before); // rejections changed nothing
    });

    it('pause freezes the remaining ms and nulls endsAt', async () => {
      const endsAt = (await db.doc(`games/${gameId}`).get()).data().timerEndsAt.toMillis();
      const before = Date.now();
      const out = await call(setTimer, { gameId, action: 'pause', ...exp }, 'prof-timer');
      expect(out.timerEndsAt).toBeNull();
      expect(out.timerPausedMs).toBeGreaterThan(0);
      expect(out.timerPausedMs).toBeLessThanOrEqual(endsAt - before);
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBe(out.timerPausedMs);
    });

    it('pause while already paused rejects BAD_TIMER failed-precondition', async () => {
      await expect(call(setTimer, { gameId, action: 'pause', ...exp }, 'prof-timer'))
        .rejects.toMatchObject({
          code: 'failed-precondition', message: expect.stringContaining('BAD_TIMER') });
    });

    it('extend while paused adds seconds*1000 to pausedMs (endsAt stays null)', async () => {
      const before = (await db.doc(`games/${gameId}`).get()).data().timerPausedMs;
      const out = await call(setTimer, { gameId, action: 'extend', seconds: 45, ...exp }, 'prof-timer');
      expect(out.timerEndsAt).toBeNull();
      expect(out.timerPausedMs).toBe(before + 45_000);
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBe(before + 45_000);
    });

    it('resume restarts the countdown from pausedMs', async () => {
      const pausedMs = (await db.doc(`games/${gameId}`).get()).data().timerPausedMs;
      const before = Date.now();
      const out = await call(setTimer, { gameId, action: 'resume', ...exp }, 'prof-timer');
      const after = Date.now();
      expect(out.timerPausedMs).toBeNull();
      expect(out.timerEndsAt).toBeGreaterThanOrEqual(before + pausedMs);
      expect(out.timerEndsAt).toBeLessThanOrEqual(after + pausedMs);
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt.toMillis()).toBe(out.timerEndsAt);
      expect(g.timerPausedMs).toBeNull();
    });

    it('clear nulls both fields and is idempotent (always succeeds post-expectation-check)', async () => {
      const out = await call(setTimer, { gameId, action: 'clear', ...exp }, 'prof-timer');
      expect(out).toEqual({ timerEndsAt: null, timerPausedMs: null });
      // clear on an already-off timer still succeeds
      const again = await call(setTimer, { gameId, action: 'clear', ...exp }, 'prof-timer');
      expect(again).toEqual({ timerEndsAt: null, timerPausedMs: null });
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBeNull();
    });
  });

  // Hard rule: the advancePhase flip nulls BOTH timer fields — a timer, running or
  // paused, never survives a phase change. timerPausedMs is an ADDITIVE key in the
  // existing hardened flip update; this test proves it landed there.
  describe('advancePhase flip clears both timer fields', () => {
    it('running and paused timers are both wiped by the flip', async () => {
      const res = await call(createGame, { teamNames: ['Flip1', 'Flip2'] }, 'prof-timer-flip');
      const gameId = res.gameId;
      await call(startSeason, { gameId }, 'prof-timer-flip'); // -> FREE_AGENCY round 1

      // running timer, then advance FREE_AGENCY(1) -> AUCTION(1)
      await call(setTimer, { gameId, action: 'start', seconds: 300,
        expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'prof-timer-flip');
      let g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerEndsAt).not.toBeNull();
      await call(advancePhase,
        { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'prof-timer-flip');
      g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 1, phase: 'AUCTION' });
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBeNull();

      // paused timer, then advance AUCTION(1) -> LINEUP(1)
      await call(setTimer, { gameId, action: 'start', seconds: 300,
        expectedPhase: 'AUCTION', expectedRound: 1 }, 'prof-timer-flip');
      await call(setTimer, { gameId, action: 'pause',
        expectedPhase: 'AUCTION', expectedRound: 1 }, 'prof-timer-flip');
      g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.timerPausedMs).toBeGreaterThan(0);
      await call(advancePhase,
        { gameId, expectedPhase: 'AUCTION', expectedRound: 1 }, 'prof-timer-flip');
      g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 1, phase: 'LINEUP' });
      expect(g.timerEndsAt).toBeNull();
      expect(g.timerPausedMs).toBeNull();
    });
  });
  ```

- [ ] **Step 3: Run the new test — it must FAIL**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/timer.test.js
  ```

  Expected outcome: the file runs, all 18 tests FAIL. The first test fails with `expected null, received undefined` (createGame does not write `timerPausedMs` yet); every test that calls `setTimer` fails with a TypeError from `t.wrap(setTimer)` because `setTimer` is not exported from `../src/game.js` yet; the flip test fails on the same missing export. If instead the run errors before any test executes, re-check that the emulator is up (Step 1) and re-run once (hot-reload flake).

- [ ] **Step 4: game.js — import Timestamp**

  In `games/salary-showdown/backend/functions/src/game.js`, line 2, replace:

  ```js
  import { getFirestore, FieldValue } from 'firebase-admin/firestore';
  ```

  with:

  ```js
  import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
  ```

- [ ] **Step 5: game.js — createGame seeds timerPausedMs: null**

  In the `createGame` callable (game.js:33-38), replace:

  ```js
    batch.set(gameRef, {
      joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null,
      professorUid: req.auth.uid, teamCount: teamNames.length,
  ```

  with:

  ```js
    batch.set(gameRef, {
      joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null, timerPausedMs: null,
      professorUid: req.auth.uid, teamCount: teamNames.length,
  ```

  (Only that one line changes; the rest of the object — `standingsSeed`, `createdAt`, `config` — stays byte-identical.)

- [ ] **Step 6: game.js — advancePhase flip additionally nulls timerPausedMs (additive key ONLY)**

  In `advancePhase` (game.js:190), replace:

  ```js
      const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null, transition };
  ```

  with:

  ```js
      const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null, timerPausedMs: null, transition };
  ```

  Do NOT restructure the hardened flip: the mismatch-check-before-adoption ordering, the `transition` marker, the `if (nxt.phase === 'FINALE') update.status = 'finished'` line, and the hook flow after the transaction all stay exactly as they are. This is one added key in one existing object literal.

- [ ] **Step 7: game.js — add the setTimer callable**

  Insert the following block immediately AFTER the `});` that closes `advancePhase` (line 201, right after `return { round: t.toRound, phase: t.toPhase };` / `});`) and BEFORE the line `async function memberWithRole(gameId, uid, role) {`:

  ```js
  // Timers are ADVISORY pacing only (parent spec §13): expiry never blocks a
  // submission server-side — advancing is what closes a phase. This callable moves
  // exactly two display fields on the game doc and nothing anywhere enforces them.
  // State machine: running (timerEndsAt set, timerPausedMs null) · paused (endsAt
  // null, pausedMs set) · off (both null). Every advancePhase flip nulls BOTH.
  //
  // Callers ALWAYS send expectedPhase + expectedRound (panel contract, same as
  // advancePhase): a mismatch against the live doc means the phase advanced under
  // the caller's feet, so the stale timer command must not land — PHASE_MISMATCH,
  // identical semantics and null-tolerant check shape as advancePhase (game.js:166).
  // Errors carry the bare code string as the message (clients match on MESSAGE):
  // BAD_TIMER as invalid-argument for a bad `seconds` or unknown action, and as
  // failed-precondition for a pause/resume/extend against the wrong timer state.
  export const setTimer = onCall(async (req) => {
    const { gameId, action, expectedPhase, expectedRound } = req.data;
    await assertProfessor(gameId, req.auth?.uid);
    const gameRef = db().doc(`games/${gameId}`);
    return db().runTransaction(async (tx) => {
      const g = (await tx.get(gameRef)).data();
      if ((expectedPhase != null && expectedPhase !== g.phase)
          || (expectedRound != null && expectedRound !== g.round))
        throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
      const running = g.timerEndsAt != null;
      const paused = g.timerPausedMs != null;
      let endsAt = g.timerEndsAt ?? null;      // Timestamp | null
      let pausedMs = g.timerPausedMs ?? null;  // number | null
      // Coerce at the callable boundary (same posture as signPlayer's `years`):
      // Number(undefined) and non-numeric strings become NaN, which the integer
      // range checks below reject as BAD_TIMER — no client-supplied non-number
      // ever reaches the Timestamp arithmetic.
      const seconds = Number(req.data.seconds);
      if (action === 'start') {
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
          throw new HttpsError('invalid-argument', 'BAD_TIMER');
        endsAt = Timestamp.fromMillis(Date.now() + seconds * 1000);
        pausedMs = null;
      } else if (action === 'pause') {
        if (!running) throw new HttpsError('failed-precondition', 'BAD_TIMER');
        pausedMs = Math.max(0, endsAt.toMillis() - Date.now());
        endsAt = null;
      } else if (action === 'resume') {
        if (!paused) throw new HttpsError('failed-precondition', 'BAD_TIMER');
        endsAt = Timestamp.fromMillis(Date.now() + pausedMs);
        pausedMs = null;
      } else if (action === 'extend') {
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600)
          throw new HttpsError('invalid-argument', 'BAD_TIMER');
        if (running) endsAt = Timestamp.fromMillis(endsAt.toMillis() + seconds * 1000);
        else if (paused) pausedMs = pausedMs + seconds * 1000;
        else throw new HttpsError('failed-precondition', 'BAD_TIMER');
      } else if (action === 'clear') {
        endsAt = null;   // always succeeds (post-expectation-check)
        pausedMs = null;
      } else {
        throw new HttpsError('invalid-argument', 'BAD_TIMER');
      }
      tx.update(gameRef, { timerEndsAt: endsAt, timerPausedMs: pausedMs });
      return { timerEndsAt: endsAt ? endsAt.toMillis() : null, timerPausedMs: pausedMs };
    });
  });
  ```

- [ ] **Step 8: index.js — export setTimer**

  In `games/salary-showdown/backend/functions/index.js`, replace line 4:

  ```js
  export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby } from './src/game.js';
  ```

  with:

  ```js
  export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer } from './src/game.js';
  ```

- [ ] **Step 9: Run the new test — it must PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/timer.test.js
  ```

  Expected outcome: `Test Files  1 passed (1)` · `Tests  18 passed (18)`. If a single run flakes right after the edit (functions emulator hot-reload), re-run once before investigating.

- [ ] **Step 10: SCHEMA.md — document the timer state machine**

  In `games/salary-showdown/backend/SCHEMA.md`, replace line 5:

  ```
    round: 0-5, timerEndsAt: ts|null, teamCount, standingsSeed, config: {cap, totalRounds, timers{...}},
  ```

  with:

  ```
    round: 0-5, timerEndsAt: ts|null, timerPausedMs: number|null, teamCount, standingsSeed, config: {cap, totalRounds},
                                        # timerEndsAt/timerPausedMs — the setTimer state machine (professor-only callable):
                                        #   running: timerEndsAt = ts,   timerPausedMs = null
                                        #   paused:  timerEndsAt = null, timerPausedMs = remaining ms (number)
                                        #   off:     both null
                                        # Every advancePhase flip nulls BOTH fields — a timer never survives a phase change.
                                        # CLIENT CONTRACT: timers are ADVISORY pacing only (spec §13). Expiry never blocks a
                                        # submission server-side; advancing is what closes a phase. Clients render these
                                        # fields, nothing enforces them. There is NO config.timers — per-phase defaults live
                                        # in the professor panel's localStorage, not in the game doc.
  ```

  (Note: this also corrects the stale `timers{...}` inside `config` — createGame writes `config: { cap: 100.0, totalRounds: 5 }` only, and the Plan 3 spec §1.5 states "No `config.timers` plumbing".)

- [ ] **Step 11: Run the full backend suite**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
  ```

  Expected outcome: every pre-existing test still passes and the 18 new ones pass — `Tests  133 passed (133)` (115 pre-existing + 18 new), 0 failed. One flaky run immediately after an edit is a known emulator hot-reload artifact: re-run before investigating any failure.

- [ ] **Step 12: Commit**

  ```bash
  cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git status --short games/salary-showdown/backend
  ```

  Confirm HEAD is where you expect (an external process races HEAD in this workspace) and that ONLY these files are modified/added: `games/salary-showdown/backend/functions/src/game.js`, `games/salary-showdown/backend/functions/index.js`, `games/salary-showdown/backend/SCHEMA.md`, `games/salary-showdown/backend/functions/test/timer.test.js`. Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/index.js games/salary-showdown/backend/SCHEMA.md games/salary-showdown/backend/functions/test/timer.test.js && git commit -m "feat(salary-showdown): setTimer callable + timerPausedMs timer state machine

  Professor-only setTimer({gameId, action, seconds?, expectedPhase, expectedRound})
  with start/pause/resume/extend/clear over the new games/{id}.timerPausedMs field:
  running (endsAt set) / paused (pausedMs set) / off (both null). Expectation
  mismatch rejects PHASE_MISMATCH (advancePhase semantics); bad seconds or unknown
  action rejects BAD_TIMER invalid-argument; wrong-state pause/resume/extend
  rejects BAD_TIMER failed-precondition. createGame seeds timerPausedMs: null and
  the hardened advancePhase flip nulls it alongside timerEndsAt (additive key
  only). Timers stay advisory pacing per spec: nothing server-side enforces them.

  18 emulator tests in test/timer.test.js cover the full state machine, both
  BAD_TIMER kinds, the professor gate, stale expectations, and flip-clears-both."
  ```

  Expected outcome: commit succeeds on `main` with exactly the four files above in the diff.

---

### Task 2: markDone callable + team-doc done fields

**Files:**
- Create: `games/salary-showdown/backend/functions/test/done.test.js`
- Modify: `games/salary-showdown/backend/functions/src/game.js` (createGame team-doc init, ~line 40-48; new callable after `cutRosterPlayer`, ~line 286)
- Modify: `games/salary-showdown/backend/functions/index.js` (export list, line 4)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (teams doc block, ~line 31-32)
- Test: `games/salary-showdown/backend/functions/test/done.test.js`

**Interfaces:**
- Consumes (already in `backend/functions/src/game.js`, do not re-implement):
  - `async function memberWithRole(gameId, uid, role)` (game.js:203) — throws `HttpsError('unauthenticated', 'sign in first')` when uid is missing, `HttpsError('permission-denied', 'not in this game')` for non-members, `HttpsError('permission-denied', '<role> only')` on role mismatch; returns the membership doc data `{ teamId, role, displayName }`.
  - House error convention: bare code string in the message — `throw new HttpsError('failed-precondition', 'PHASE_MISMATCH')` (game.js:168 style). Clients match on the MESSAGE, not the kind.
- Produces (later tasks rely on these exactly):
  - Callable `markDone({gameId})` → `{ok: true}` — exported from `backend/functions/index.js`. GM-only via `memberWithRole(gameId, uid, 'GM')`. Transaction: game phase must be `FRONT_OFFICE` or `FREE_AGENCY` else `HttpsError('failed-precondition', 'PHASE_MISMATCH')`. Updates the caller's own team doc with `{doneRound: g.round, donePhase: g.phase}`.
  - Team-doc fields `doneRound: number` (init `0`) and `donePhase: string` (init `''`) on `games/{gameId}/teams/{teamId}`, written by `createGame`. T6 adds them to the app's `TeamDoc` type; T9's panel submission lights read `doneRound === round && donePhase === phase`; T9's team-client "We're done" button calls this callable.

**HARD RULE (restate wherever tempted to "improve"):** `markDone` is a STATUS FLAG, NEVER a lock. Pressing it stamps the team doc for the professor panel's submission lights and does NOTHING else. GMs can keep signing and cutting after pressing it — signing/cutting stays open until the professor closes the phase. Do NOT gate `signPlayer`, `cutRosterPlayer`, or ANY other callable on `doneRound`/`donePhase`, now or in any later task. Re-pressing is a harmless idempotent overwrite of the same values.

Prerequisite for every test run below: the long-lived emulators are running (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`) — the same emulators every existing suite in `backend/functions/test/` uses. Do not start/stop them per test; use the long-lived instance. Note: the functions emulator hot-reloads on edit, so one flaky run right after an edit is expected — re-run once before investigating.

- [ ] **Step 1: Write the failing test file**

Create `games/salary-showdown/backend/functions/test/done.test.js` with exactly this content (harness pattern copied from `test/advance-race.test.js`):

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

const { createGame, joinGame, startSeason, advancePhase, signPlayer, markDone } =
  await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

// markDone is a STATUS FLAG, never a lock (plan-3 design spec §4.2): it stamps
// {doneRound, donePhase} on the caller's team doc for the professor panel's
// submission lights, and gates NOTHING — signing/cutting stays open until the
// professor closes the phase. The "not a lock" test below is the canary for that
// rule: if anyone ever gates signPlayer on doneRound/donePhase, it fails.
describe('markDone — GM "we\'re done" status flag (never a lock)', () => {
  let gameId, teamA, teamB;
  const prof = 'prof-done', gm = 'gm-done', scout = 'scout-done', coach = 'coach-done';

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Iota', 'Kappa'] }, prof);
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM',    displayName: 'G' }, gm);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'S' }, scout);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Coach', displayName: 'C' }, coach);
    await call(startSeason, { gameId }, prof);   // -> FREE_AGENCY, round 1
  });

  it('createGame initializes doneRound: 0 / donePhase: "" on every team doc', async () => {
    for (const id of [teamA, teamB]) {
      const team = (await db.doc(`games/${gameId}/teams/${id}`).get()).data();
      expect(team.doneRound).toBe(0);
      expect(team.donePhase).toBe('');
    }
  });

  it('GM in FREE_AGENCY stamps {doneRound: 1, donePhase: FREE_AGENCY} on the caller team only', async () => {
    const out = await call(markDone, { gameId }, gm);
    expect(out).toEqual({ ok: true });
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(a.doneRound).toBe(1);
    expect(a.donePhase).toBe('FREE_AGENCY');
    // the other team is untouched
    const b = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(b.doneRound).toBe(0);
    expect(b.donePhase).toBe('');
  });

  it('re-press is idempotent — same stamp, same result', async () => {
    const out = await call(markDone, { gameId }, gm);
    expect(out).toEqual({ ok: true });
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(a.doneRound).toBe(1);
    expect(a.donePhase).toBe('FREE_AGENCY');
  });

  it('Scout is denied', async () => {
    await expect(call(markDone, { gameId }, scout)).rejects.toMatchObject({
      code: 'permission-denied', message: expect.stringContaining('GM only') });
  });

  it('Coach is denied', async () => {
    await expect(call(markDone, { gameId }, coach)).rejects.toMatchObject({
      code: 'permission-denied', message: expect.stringContaining('GM only') });
  });

  it('non-member is denied', async () => {
    await expect(call(markDone, { gameId }, 'stranger-done')).rejects.toMatchObject({
      code: 'permission-denied', message: expect.stringContaining('not in this game') });
  });

  it('is a status flag, NOT a lock: signPlayer still succeeds after marking done', async () => {
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    const { contract } = await call(signPlayer,
      { gameId, pid: market.available[0], years: 1 }, gm);
    expect(contract).toMatchObject({ pid: market.available[0], years: 1 });
  });

  it('wrong phase (AUCTION) rejects with PHASE_MISMATCH', async () => {
    await call(advancePhase,
      { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, prof); // -> AUCTION 1
    await expect(call(markDone, { gameId }, gm)).rejects.toMatchObject({
      code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
  });

  it('GM in FRONT_OFFICE (round 2) stamps {doneRound: 2, donePhase: FRONT_OFFICE}', async () => {
    // No bids / no lineups submitted: auction resolves with unsold stars, LINEUP's
    // exit hook auto-repairs — same expectation-carrying drive advance-race uses.
    await call(advancePhase, { gameId, expectedPhase: 'AUCTION',  expectedRound: 1 }, prof); // -> LINEUP 1
    await call(advancePhase, { gameId, expectedPhase: 'LINEUP',   expectedRound: 1 }, prof); // -> SIMULATE 1
    await call(advancePhase, { gameId, expectedPhase: 'SIMULATE', expectedRound: 1 }, prof); // -> RESULTS 1
    await call(advancePhase, { gameId, expectedPhase: 'RESULTS',  expectedRound: 1 }, prof); // -> FRONT_OFFICE 2
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 2, phase: 'FRONT_OFFICE' });

    const out = await call(markDone, { gameId }, gm);
    expect(out).toEqual({ ok: true });
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(a.doneRound).toBe(2);
    expect(a.donePhase).toBe('FRONT_OFFICE');
  });
});
```

- [ ] **Step 2: Run the new test — expect failure**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/done.test.js
```

Expected outcome: the suite FAILS. `markDone` does not exist yet, so the destructured import is `undefined` and every test that calls it dies inside `t.wrap(markDone)` with a `TypeError` (e.g. `Cannot read properties of undefined`); the first test (`createGame initializes doneRound...`) also fails because team docs do not yet carry `doneRound`/`donePhase` (`expect(team.doneRound).toBe(0)` receives `undefined`). If instead the failures are connection errors (ECONNREFUSED on 8180), the emulators are not running — start them and re-run; do not change the test.

- [ ] **Step 3: Add `doneRound`/`donePhase` init to createGame**

In `games/salary-showdown/backend/functions/src/game.js`, inside `createGame`'s team-doc loop (~line 39), make exactly this edit:

Old:
```js
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
```

New:
```js
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
      // "We're done" STATUS FLAG (markDone below): stamped {round, phase} for the
      // professor panel's submission lights. Never a lock — gates nothing.
      doneRound: 0, donePhase: '',
```

(The lines that follow — the `spendLog` comment block and `spendLog: [],` — stay exactly as they are.)

- [ ] **Step 4: Add the `markDone` callable**

In `games/salary-showdown/backend/functions/src/game.js`, immediately AFTER the closing of `cutRosterPlayer` (~line 286) and BEFORE the `// Scout-only. teamId comes from the caller's own membership doc...` comment that precedes `submitBids`, insert exactly:

```js
// GM-only "We're done" STATUS FLAG — NEVER a lock (plan-3 design spec §4.2). It
// stamps the caller's team doc with the game's current {round, phase} so the
// professor panel's submission lights can show who considers themselves finished,
// and it gates NOTHING: signPlayer / cutRosterPlayer / every other callable stays
// fully open until the professor closes the phase. No callable may ever read
// doneRound/donePhase as a precondition. Re-pressing is a harmless idempotent
// overwrite of the same values. Transactional so the phase check and the stamp are
// one atomic unit against advancePhase's flip-first transaction (same pattern as
// submitBids/submitLineup): a press racing the flip either lands before it or is
// retried by the SDK, re-reads the closed phase, and throws PHASE_MISMATCH.
export const markDone = onCall(async (req) => {
  const { gameId } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (g.phase !== 'FRONT_OFFICE' && g.phase !== 'FREE_AGENCY')
      throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
    tx.update(db().doc(`games/${gameId}/teams/${teamId}`),
      { doneRound: g.round, donePhase: g.phase });
    return { ok: true };
  });
});
```

Notes for the transcriber: `onCall`, `HttpsError`, `db`, and `memberWithRole` all already exist in this file — import nothing new. The error message is the bare code string `PHASE_MISMATCH` (house convention: clients match errors on the MESSAGE).

- [ ] **Step 5: Export `markDone` from index.js**

In `games/salary-showdown/backend/functions/index.js`, the single export line from `./src/game.js` currently ends with ` } from './src/game.js';`. Append `markDone` to that brace list. If no earlier task has touched the line, the exact edit is:

Old:
```js
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby } from './src/game.js';
```

New:
```js
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, markDone } from './src/game.js';
```

If a prior task (e.g. Task 1's `setTimer`) already added names to this list, KEEP them and simply add `, markDone` before the closing ` }` — one export line, all names in one brace list.

- [ ] **Step 6: Run the new test — expect pass**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/done.test.js
```

Expected outcome: 1 test file, 9 tests, all passing. (If the run right after the edits flakes once against the hot-reloading functions emulator, re-run once before investigating.)

- [ ] **Step 7: Document the fields in SCHEMA.md**

In `games/salary-showdown/backend/SCHEMA.md`, inside the `games/{gameId}/teams/{teamId}` block, make exactly this edit:

Old:
```
  lineup: {starters[5], sixth, bench[], playstyle} | null,
  lineupLockedRound, hardshipUsed: [round]
```

New:
```
  lineup: {starters[5], sixth, bench[], playstyle} | null,
  lineupLockedRound, hardshipUsed: [round],
  doneRound: 0-5, donePhase: ''|FRONT_OFFICE|FREE_AGENCY   # "We're done" STATUS FLAG, NEVER a lock:
                                      # markDone (GM-only callable, valid only in FRONT_OFFICE/FREE_AGENCY)
                                      # stamps the game's current {round, phase} here. Professor-panel
                                      # submission lights read doneRound === round && donePhase === phase.
                                      # Initialized 0 / '' at createGame. Gates NOTHING — signing/cutting
                                      # stays open until the professor closes the phase, and no callable
                                      # may ever read these fields as a precondition.
```

- [ ] **Step 8: Run the full backend suite**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
```

Expected outcome: every suite green — the 115 pre-existing tests plus this task's 9 (plus any added by earlier 3a tasks already landed), 0 failures. The createGame change is additive (two new fields), so no existing test should be affected; if anything unrelated fails, re-run once (emulator hot-reload flake) before investigating.

- [ ] **Step 9: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git add \
  games/salary-showdown/backend/functions/src/game.js \
  games/salary-showdown/backend/functions/index.js \
  games/salary-showdown/backend/functions/test/done.test.js \
  games/salary-showdown/backend/SCHEMA.md && \
git commit -m "feat(salary-showdown): markDone callable — GM 'we're done' status flag for FO/FA

- createGame team docs now init doneRound: 0 / donePhase: ''
- markDone({gameId}): GM-only via memberWithRole; transaction gates phase to
  FRONT_OFFICE/FREE_AGENCY else PHASE_MISMATCH; stamps {doneRound: round,
  donePhase: phase} on the caller's team doc; returns {ok: true}
- STATUS FLAG, never a lock: gates nothing, no callable reads it as a
  precondition; test canary proves signPlayer still succeeds after pressing
- covers: role gate (Scout/Coach/non-member denied), phase gate (AUCTION ->
  PHASE_MISMATCH), idempotent re-press, FO round-2 stamp
- SCHEMA.md documents the new team-doc fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected outcome: one commit containing exactly the four files above.

---

### Task 3: setRevealStep callable + revealStep field

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js` (one edit: a new callable inserted immediately before `async function memberWithRole` — currently line 203. ADJUDICATED: do NOT touch the `advancePhase` flip — spec §4.3 wins over the contracts file: `revealStep` is written ONLY by `setRevealStep`, never initialized by the flip)
- Modify: `games/salary-showdown/backend/functions/index.js` (line 4 export list)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (insert one field into the `games/{gameId}` block, anchored on the `transition:` line, currently line 6)
- Test (new): `games/salary-showdown/backend/functions/test/reveal-step.test.js`

**Interfaces:**
- Consumes (all pre-existing, quoted from current source):
  - `assertProfessor(gameId, uid)` — game.js:19, returns the game doc data; throws `HttpsError('not-found', 'game not found')` / `HttpsError('permission-denied', 'professor only')`.
  - `HttpsError`, `onCall` from `firebase-functions/v2/https` (already imported at game.js:1).
- Produces (later tasks rely on these EXACTLY):
  - Callable `setRevealStep({gameId, step})` — professor-only. Phase must be `FINALE` else `HttpsError('failed-precondition', 'PHASE_MISMATCH')`. `step` must be an integer 0..8 else `HttpsError('invalid-argument', 'BAD_STEP')` (no coercion: `'3'`, `1.5`, `-1`, `9`, `NaN`, `null`, missing → all `BAD_STEP`). Updates `games/{gameId}` with `{revealStep: step}`. Returns `{revealStep: step}`. Exported from `index.js`. (Consumed by T13 RevealStepper via `call('setRevealStep', …)`; T13 clamps to its own 0..4 wall-step list client-side — the server range stays 0..8 per contract.)
  - Schema field `games/{id}.revealStep: number` — written ONLY by `setRevealStep`; ABSENT from the game doc until the first `setRevealStep` call. ADJUDICATED: spec §4.3 wins over the contracts file here — the RESULTS(5)->FINALE flip does NOT initialize it; the wall/stepper default a missing value via `?? 0`. (Consumed by T6 `GameDoc.revealStep?: number` and T13 FinaleWall.)

House conventions restated (do not deviate): backend errors are thrown with the BARE code string as the message — `throw new HttpsError('failed-precondition', 'PHASE_MISMATCH')` (game.js:168 style) — because clients match errors on the MESSAGE, not the kind. `BAD_STEP` is one of the two new codes 3a introduces. Professor gating reuses `assertProfessor`, never a reimplementation.

- [ ] **Step 1: Confirm the emulators are up (precondition, no repo change)**

  Backend tests run as plain vitest against the live emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`). This suite needs Firestore on 8180.

  ```bash
  nc -z localhost 8180 && echo "firestore emulator up" || echo "START THE EMULATORS FIRST"
  ```

  Expected output: `firestore emulator up`. If not, start the long-lived emulators the way the existing suites expect (from `games/salary-showdown/backend`: `npx firebase emulators:start`) in a separate terminal and re-check before continuing.

- [ ] **Step 2: Write the failing test file**

  Create `games/salary-showdown/backend/functions/test/reveal-step.test.js` with EXACTLY this content (harness lines copied from `test/reveal.test.js`; the drive-to-round-5-RESULTS loop is the same passive-team pattern — hardship autofill and lineup auto-repair carry both teams, no signings/bids/lineups needed):

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

  const { createGame, startSeason, advancePhase, setRevealStep } = await import('../src/game.js');
  const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

  // setRevealStep is the professor's projector remote for the FINALE reveal walk.
  // Tests run IN ORDER within this describe (vitest default): the first two pin the
  // pre-FINALE gate and that the FINALE flip leaves revealStep ABSENT (spec §4.3:
  // setRevealStep is the field's ONLY writer; walls default a missing value via
  // `?? 0`), the rest exercise the callable in the finished game.
  describe('setRevealStep + revealStep field', () => {
    let gameId;

    beforeAll(async () => {
      const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
      gameId = res.gameId;
      await call(startSeason, { gameId }, 'prof');
      // Drive to round 5 RESULTS — the last stop before FINALE (reveal.test.js
      // pattern: passive teams progress on hardship autofill + lineup auto-repair).
      let g = (await db.doc(`games/${gameId}`).get()).data();
      let iterations = 0;
      while (!(g.round === 5 && g.phase === 'RESULTS')) {
        await call(advancePhase, { gameId }, 'prof');
        g = (await db.doc(`games/${gameId}`).get()).data();
        iterations += 1;
        if (iterations > 40) throw new Error('safety cap exceeded — game never reached round 5 RESULTS');
      }
    }, 120000);

    it('rejects before FINALE with PHASE_MISMATCH (failed-precondition), even with a valid step', async () => {
      await expect(call(setRevealStep, { gameId, step: 1 }, 'prof'))
        .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 5, phase: 'RESULTS' });
      expect(g.revealStep).toBeUndefined(); // field never exists before the first setRevealStep call
    });

    it('RESULTS(5) -> FINALE flip does NOT write revealStep — the field stays absent', async () => {
      const res = await call(advancePhase, { gameId, expectedPhase: 'RESULTS', expectedRound: 5 }, 'prof');
      expect(res).toEqual({ round: 5, phase: 'FINALE' });
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ status: 'finished', round: 5, phase: 'FINALE' });
      expect(g.revealStep).toBeUndefined(); // ABSENT until the first setRevealStep call (spec §4.3)
    });

    it('is professor-only', async () => {
      await expect(call(setRevealStep, { gameId, step: 1 }, 'not-the-prof'))
        .rejects.toMatchObject({ code: 'permission-denied', message: expect.stringContaining('professor') });
      expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBeUndefined(); // rejected call must not create the field
    });

    it('rejects -1, 9, 1.5, and non-numbers with BAD_STEP (invalid-argument), leaving the doc untouched', async () => {
      for (const step of [-1, 9, 1.5, '3', NaN, null, undefined]) {
        await expect(call(setRevealStep, { gameId, step }, 'prof'))
          .rejects.toMatchObject({ code: 'invalid-argument', message: expect.stringContaining('BAD_STEP') });
      }
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g.revealStep).toBeUndefined(); // still absent — no valid write has happened yet
    });

    it('the first setRevealStep call creates the field with the written value; later writes visible too (0 and 8 boundaries included)', async () => {
      const res = await call(setRevealStep, { gameId, step: 3 }, 'prof');
      expect(res).toEqual({ revealStep: 3 });
      // first successful write — revealStep now exists and equals the written value
      expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(3);

      expect(await call(setRevealStep, { gameId, step: 8 }, 'prof')).toEqual({ revealStep: 8 });
      expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(8);

      expect(await call(setRevealStep, { gameId, step: 0 }, 'prof')).toEqual({ revealStep: 0 });
      expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(0);
    });
  });
  ```

- [ ] **Step 3: Run the new suite — expect failure**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/reveal-step.test.js
  ```

  Expected outcome: the file FAILS. `setRevealStep` does not exist yet, so the destructured import is `undefined` and every test that calls it fails at `t.wrap(setRevealStep)` (firebase-functions-test rejects a non-function) — that is 4 of the 5 tests. The flip-absence test does not call the callable and passes already (it pins existing behavior: `advancePhase` never writes `revealStep`). If instead the failure is a connection error to localhost:8180, go back to Step 1. Note: the functions emulator hot-reloads on edit — one flaky run right after an edit is expected; re-run before investigating.

- [ ] **Step 4: game.js — add the setRevealStep callable**

  In the same file, insert the new callable immediately BEFORE the existing helper `async function memberWithRole(gameId, uid, role) {` (currently game.js:203; Tasks 1/2 may have inserted `setTimer`/`markDone` nearby — the `memberWithRole` function line is still the anchor). Exact edit:

  Old:
  ```js
  async function memberWithRole(gameId, uid, role) {
  ```

  New:
  ```js
  // Professor's projector remote: which FINALE reveal step the bigscreen shows.
  // Professor-only; phase must be FINALE (PHASE_MISMATCH otherwise — bare code
  // string in the message, game.js house style: clients match on the MESSAGE).
  // step is a hard integer 0..8 with NO coercion: a numeric-string '3' is BAD_STEP,
  // same for 1.5 / -1 / 9 / NaN / missing. This callable is revealStep's ONLY
  // writer (spec §4.3): the field is ABSENT from the game doc until the first
  // successful call here — the FINALE flip does not initialize it, and the
  // wall/stepper default a missing value via `?? 0`. The phase check lives
  // inside a transaction so a stale call racing some hypothetical future phase
  // change still reads the committed phase, mirroring the flip-first discipline
  // of advancePhase.
  export const setRevealStep = onCall(async (req) => {
    const { gameId, step } = req.data;
    await assertProfessor(gameId, req.auth?.uid);
    if (!Number.isInteger(step) || step < 0 || step > 8)
      throw new HttpsError('invalid-argument', 'BAD_STEP');
    const gameRef = db().doc(`games/${gameId}`);
    return db().runTransaction(async (tx) => {
      const g = (await tx.get(gameRef)).data();
      if (g.phase !== 'FINALE')
        throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
      tx.update(gameRef, { revealStep: step });
      return { revealStep: step };
    });
  });

  async function memberWithRole(gameId, uid, role) {
  ```

  Do NOT add any import: `onCall`, `HttpsError` (game.js:1) and `getFirestore` via `db()` (game.js:2,14) are already in scope. `Number.isInteger` rejects every non-number (`'3'`, `NaN`, `null`, `undefined`) as well as fractions, so no separate typeof check is needed.

- [ ] **Step 5: index.js — export the callable**

  Current `games/salary-showdown/backend/functions/index.js` line 4:
  ```js
  export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby } from './src/game.js';
  ```

  Append `setRevealStep` to the list:
  ```js
  export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setRevealStep } from './src/game.js';
  ```

  Anchoring note: if Tasks 1/2 already added `setTimer` and/or `markDone` to this list, do not remove them — just append `, setRevealStep` before the closing `}` of the export list.

- [ ] **Step 6: SCHEMA.md — document the field**

  In `games/salary-showdown/backend/SCHEMA.md`, insert one entry into the `games/{gameId}` block, directly ABOVE the `transition:` line. Task 3 lands AFTER Task 1, and Task 1's Step 10 rewrites this region (it adds `timerPausedMs`, DELETES `timers{...}` from `config`, and inserts an 8-line comment block before the `transition:` line) — so anchor on Task 1's POST-edit text, quoted here exactly. Current text after Task 1 (the `config:` line, its 8 comment lines, then the `transition:` line):

  ```
    round: 0-5, timerEndsAt: ts|null, timerPausedMs: number|null, teamCount, standingsSeed, config: {cap, totalRounds},
                                        # timerEndsAt/timerPausedMs — the setTimer state machine (professor-only callable):
                                        #   running: timerEndsAt = ts,   timerPausedMs = null
                                        #   paused:  timerEndsAt = null, timerPausedMs = remaining ms (number)
                                        #   off:     both null
                                        # Every advancePhase flip nulls BOTH fields — a timer never survives a phase change.
                                        # CLIENT CONTRACT: timers are ADVISORY pacing only (spec §13). Expiry never blocks a
                                        # submission server-side; advancing is what closes a phase. Clients render these
                                        # fields, nothing enforces them. There is NO config.timers — per-phase defaults live
                                        # in the professor panel's localStorage, not in the game doc.
    transition: {fromRound, fromPhase, toRound, toPhase}  # OPTIONAL — present only while an advancePhase's
  ```

  New — insert the `revealStep` entry between Task 1's comment block and the `transition:` line; every quoted Task-1 line (including `timerPausedMs` and the `config: {cap, totalRounds}` form WITHOUT `timers{...}`) stays byte-identical, and the `transition:` line and everything after it are unchanged:

  ```
    round: 0-5, timerEndsAt: ts|null, timerPausedMs: number|null, teamCount, standingsSeed, config: {cap, totalRounds},
                                        # timerEndsAt/timerPausedMs — the setTimer state machine (professor-only callable):
                                        #   running: timerEndsAt = ts,   timerPausedMs = null
                                        #   paused:  timerEndsAt = null, timerPausedMs = remaining ms (number)
                                        #   off:     both null
                                        # Every advancePhase flip nulls BOTH fields — a timer never survives a phase change.
                                        # CLIENT CONTRACT: timers are ADVISORY pacing only (spec §13). Expiry never blocks a
                                        # submission server-side; advancing is what closes a phase. Clients render these
                                        # fields, nothing enforces them. There is NO config.timers — per-phase defaults live
                                        # in the professor panel's localStorage, not in the game doc.
    revealStep: number                  # FINALE projector step (integer 0..8). ABSENT until the first setRevealStep
                                        # call: the RESULTS(5)->FINALE flip does NOT write it (spec §4.3 — setRevealStep
                                        # is its only writer; walls/steppers default a missing value via `?? 0`).
                                        # setRevealStep is professor-only, FINALE-only. Member-readable like the rest of the doc.
    transition: {fromRound, fromPhase, toRound, toPhase}  # OPTIONAL — present only while an advancePhase's
  ```

  Fallback anchoring note: if for some reason Task 1 has NOT landed yet (do not expect this), still insert the same 4-line `revealStep` entry directly above the `transition:` line and leave the line above it — whatever it currently says — untouched. Never re-add `timers{...}` and never drop `timerPausedMs`.

- [ ] **Step 7: Run the new suite — expect pass**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/reveal-step.test.js
  ```

  Expected outcome: 1 file, 5 tests, all passing (the beforeAll drive takes a while — it advances through all 5 rounds; the 120s beforeAll timeout covers it). If the first run right after editing flakes, re-run once before investigating (functions-emulator hot-reload convention).

- [ ] **Step 8: Run the full backend suite**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
  ```

  Expected outcome: every suite green — the 115 pre-3a tests, whatever Tasks 1-2 added if they already landed, plus these 5 new tests. Zero failures. In particular `reveal.test.js` and `advance-race.test.js` must still pass untouched (this task does not modify `advancePhase` at all; anything else is a regression to fix before committing).

- [ ] **Step 9: Commit**

  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short games/salary-showdown/backend
  ```

  Expected: exactly four paths — `M games/salary-showdown/backend/functions/src/game.js`, `M games/salary-showdown/backend/functions/index.js`, `M games/salary-showdown/backend/SCHEMA.md`, `?? games/salary-showdown/backend/functions/test/reveal-step.test.js` (plus any unrelated pre-existing noise, which you must NOT stage). Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/backend/functions/src/game.js \
    games/salary-showdown/backend/functions/index.js \
    games/salary-showdown/backend/SCHEMA.md \
    games/salary-showdown/backend/functions/test/reveal-step.test.js \
  && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): setRevealStep callable + revealStep field

  - setRevealStep({gameId, step}): professor-only, FINALE-only (PHASE_MISMATCH),
    step must be an integer 0..8 with no coercion (BAD_STEP, invalid-argument),
    writes {revealStep: step} and returns it; exported via index.js
  - games/{id}.revealStep: written ONLY by setRevealStep — absent from the game
    doc until the first call (the FINALE flip does not initialize it, per spec
    §4.3; walls default a missing value via ?? 0); documented in SCHEMA.md
  - test/reveal-step.test.js: drives a seeded 2-team game to round 5 RESULTS,
    pins the pre-FINALE gate, the field's absence through the FINALE flip,
    professor gate, step validation matrix, and visible writes incl. 0/8
    boundaries

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Expected outcome: one commit containing exactly those four files.

---

### Task 4: previousRank on standings rows

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js` (HOOKS['enter:SIMULATE'], lines 533–549)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (the `games/{gameId}/rounds/{r}` entry, lines 51–57)
- Test (create): `games/salary-showdown/backend/functions/test/previous-rank.test.js`

**Interfaces:**
- Consumes: nothing from earlier 3a tasks — this is a self-contained backend change to the existing `HOOKS['enter:SIMULATE'] = async (gameId, round)` hook in `backend/functions/src/game.js`.
- Produces: every row of `games/{gameId}/rounds/{r}.standings` gains `previousRank: number | null` — the team's `rank` in `rounds/{r-1}.standings`, or `null` for round 1. Later tasks rely on this exact shape: T6 adds `previousRank: number | null` to `StandingsRow` in `app/src/types/models.ts`, and T11's `computeShuffleSteps(standings)` consumes it (delta glyphs ▲/▼/—/NEW on the bigscreen standings shuffle).

Hard rules restated for this task:
- The `rounds/{round}` doc-exists guard at the top of the hook is the hook's OWN idempotency marker (beyond runHookOnce's hooklog). Do not add ANY write outside the one existing batch, and do not add writes before the guard — a retry that lost the hooklog write must still bail on `roundRef.get().exists` before touching team records (team-doc win/loss updates are `+=`-style increments computed fresh each run; a second run would double-count). Reading `rounds/{round-1}` is a read, not a write — it is safe after the guard.
- Everything this task writes stays inside the ONE existing `db().batch()` — the team-doc updates and the `batch.set(roundRef, …)` commit atomically, and `previousRank` rides along on the standings rows inside that same `batch.set`.
- Do NOT restructure the hardened advancePhase flow, the hook signature, or the guard. This is a surgical insertion between the `simulateRound` call and the batch construction.

All commands below run from `/Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions` against the live emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`). The functions emulator hot-reloads on edit: one flaky run right after an edit is expected — re-run before investigating.

- [ ] **Step 1: Write the failing test** — create `games/salary-showdown/backend/functions/test/previous-rank.test.js` with exactly this content (harness pattern copied from `test/sim-flow.test.js` / `test/reveal.test.js`):

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

const { createGame, startSeason, advancePhase } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

// Drives the game forward one advancePhase at a time until it reaches the given
// (round, phase). Same passive-team driver as reveal.test.js: no signings, bids, or
// lineups are needed — hardship autofill (FREE_AGENCY exit) and lineup autoRepair
// (LINEUP exit) cover everything a passive team needs to progress.
async function driveTo(gameId, round, phase) {
  let g = (await db.doc(`games/${gameId}`).get()).data();
  let iterations = 0;
  while (!(g.round === round && g.phase === phase)) {
    await call(advancePhase, { gameId }, 'prof-prevrank');
    g = (await db.doc(`games/${gameId}`).get()).data();
    iterations += 1;
    if (iterations > 40) throw new Error(`safety cap exceeded — game never reached round ${round} ${phase}`);
  }
}

describe('previousRank on rounds/{r}.standings rows', () => {
  let gameId, teamIds;
  let round2FirstRead; // JSON snapshot of rounds/2.standings captured on first read (stability check)

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta', 'Gamma'] }, 'prof-prevrank');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    teamIds = teams.docs.map((d) => d.id);
    await call(startSeason, { gameId }, 'prof-prevrank');
  });

  it('round 1: every standings row carries previousRank: null (there is no prior round)', async () => {
    await driveTo(gameId, 1, 'SIMULATE');
    const round1 = (await db.doc(`games/${gameId}/rounds/1`).get()).data();
    expect(round1.standings).toHaveLength(3);
    for (const row of round1.standings) {
      // explicit null, never undefined — Firestore's admin SDK rejects undefined
      // field values in set(), and the T11 shuffle treats null as "NEW"
      expect(row.previousRank).toBeNull();
    }
  });

  it('round 2: each row.previousRank equals that team\'s stored rank in rounds/1', async () => {
    await driveTo(gameId, 2, 'SIMULATE');
    const [round1, round2] = await Promise.all([
      db.doc(`games/${gameId}/rounds/1`).get(),
      db.doc(`games/${gameId}/rounds/2`).get(),
    ]);
    const prevRankByTeam = new Map(round1.data().standings.map((r) => [r.teamId, r.rank]));

    const rows = round2.data().standings;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(teamIds).toContain(row.teamId);
      expect(row.previousRank).toBe(prevRankByTeam.get(row.teamId));
      expect(Number.isInteger(row.previousRank)).toBe(true);
      expect(row.previousRank).toBeGreaterThanOrEqual(1);
      expect(row.previousRank).toBeLessThanOrEqual(3);
    }
    // rounds/1 itself was not retroactively touched: its rows still say null
    for (const row of round1.data().standings) expect(row.previousRank).toBeNull();

    // capture rounds/2.standings exactly as first read — the full-season test below
    // re-reads it after FINALE and asserts byte-equality (no retroactive mutation).
    round2FirstRead = JSON.stringify(rows);
  });

  it('full season: rounds 2..5 each carry previousRank = the stored rank in rounds/{r-1}, and earlier round docs are never retroactively mutated', async () => {
    // Drive the same seeded game all the way to FINALE (round 5). Same passive-team
    // driver as reveal.test.js: hardship autofill + lineup autoRepair carry bot teams
    // through every phase with zero submissions.
    await driveTo(gameId, 5, 'FINALE');

    // spec §9 previousRank bar: for EVERY round r in 2..5, each rounds/{r}.standings
    // row's previousRank equals the rank that same teamId holds in rounds/{r-1}.
    for (let r = 2; r <= 5; r += 1) {
      const [prev, cur] = await Promise.all([
        db.doc(`games/${gameId}/rounds/${r - 1}`).get(),
        db.doc(`games/${gameId}/rounds/${r}`).get(),
      ]);
      const prevRankByTeam = new Map(prev.data().standings.map((row) => [row.teamId, row.rank]));
      const rows = cur.data().standings;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.previousRank).toBe(prevRankByTeam.get(row.teamId));
        expect(Number.isInteger(row.previousRank)).toBe(true);
      }
    }

    // Stability: rounds/2.standings is byte-equal to what the round-2 test first read —
    // the enter:SIMULATE idempotency guard was never disturbed by later rounds' sims.
    const round2Again = (await db.doc(`games/${gameId}/rounds/2`).get()).data();
    expect(JSON.stringify(round2Again.standings)).toBe(round2FirstRead);
  });
});
```

- [ ] **Step 2: Run the new test — expect FAILURE.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/previous-rank.test.js
```

Expected outcome: all three tests FAIL on their first `previousRank` assertion because the field does not exist yet — the round-1 test fails with `expected undefined to be null` at `expect(row.previousRank).toBeNull()`, and the round-2 and full-season tests fail with `expected undefined to be <number>` (vitest reports `AssertionError` for each). If instead the failure is a connection error (`ECONNREFUSED localhost:8180` or similar), the emulators are not running — start them per the repo's emulator setup before proceeding; do NOT change the test.

- [ ] **Step 3: Implement — stamp previousRank inside HOOKS['enter:SIMULATE'].** In `games/salary-showdown/backend/functions/src/game.js`, make exactly this edit (the old text is the current hook body at lines 533–549):

Old:

```js
HOOKS['enter:SIMULATE'] = async (gameId, round) => {
  const roundRef = db().doc(`games/${gameId}/rounds/${round}`);
  if ((await roundRef.get()).exists) return;
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const out = simulateRound({ gameId, round, teams, catalogById: CATALOG });
  const batch = db().batch();
```

New:

```js
HOOKS['enter:SIMULATE'] = async (gameId, round) => {
  const roundRef = db().doc(`games/${gameId}/rounds/${round}`);
  if ((await roundRef.get()).exists) return;
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const out = simulateRound({ gameId, round, teams, catalogById: CATALOG });
  // previousRank: the rank each team held after LAST round's sim, read from
  // rounds/{round-1}.standings; null on every row in round 1 (no prior round).
  // Explicit null, never undefined — Firestore's admin SDK rejects undefined
  // field values in set() (same constraint as isTrap in enter:FINALE). This is
  // a READ only: the stamped rows still land via the single batch.set below,
  // and the rounds/{round} existence guard above remains this hook's sole
  // idempotency marker — no writes are added outside the one existing batch.
  const prevRanks = new Map();
  if (round > 1) {
    const prev = await db().doc(`games/${gameId}/rounds/${round - 1}`).get();
    for (const row of prev.data()?.standings ?? []) prevRanks.set(row.teamId, row.rank);
  }
  for (const s of out.standings) s.previousRank = prevRanks.get(s.teamId) ?? null;
  const batch = db().batch();
```

Do not touch anything after `const batch = db().batch();` — the team-doc update loop and the `batch.set(roundRef, { games: out.games, awards: out.awards, standings: out.standings, boxCsv: toCsv(out.boxRows) })` already persist `out.standings` by reference, so the stamped rows flow into the round doc with zero further changes.

- [ ] **Step 4: Run the new test — expect PASS.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/previous-rank.test.js
```

Expected outcome: `Test Files  1 passed (1)` / `Tests  3 passed (3)`. (The emulator hot-reloads on edit — if the first run after the edit flakes, re-run once before investigating.)

- [ ] **Step 5: Document the field in SCHEMA.md.** In `games/salary-showdown/backend/SCHEMA.md`, make exactly this edit (the old text is the current `rounds/{r}` entry at lines 51–52):

Old:

```
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string,
                                      #   standings: [{teamId, name, wins, losses, pointDiff, pointsFor, tiebreakCoin, rank}] }
```

New:

```
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string,
                                      #   standings: [{teamId, name, wins, losses, pointDiff, pointsFor, tiebreakCoin, rank,
                                      #                previousRank}] }
                                      # previousRank: number|null — this team's rank in rounds/{r-1}.standings, null for
                                      # r=1 (no prior round exists). Stamped by enter:SIMULATE inside the same single
                                      # batch that writes the round doc; consumed by the bigscreen standings shuffle
                                      # (delta glyphs: up/down/flat, NEW when null).
```

Leave the `tiebreakCoin` comment block that follows (lines 53–57, starting `# tiebreakCoin is the seeded per-round coin-flip value…`) completely untouched.

- [ ] **Step 6: Run the full backend suite — everything stays green** (the charter's explicit bar: advance-race + sim-flow included; sim-flow's standings assertions check `rank`/`tiebreakCoin` presence and are unaffected by the added field).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
```

Expected outcome: all test files pass — the 115 pre-existing tests plus this task's 3 new ones (plus any tests added by earlier 3a tasks already merged), 0 failures.

- [ ] **Step 7: Commit.**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/test/previous-rank.test.js games/salary-showdown/backend/SCHEMA.md && git commit -m "feat(salary-showdown): stamp previousRank on rounds/{r}.standings rows

enter:SIMULATE now reads rounds/{round-1} (round > 1 only), builds a
teamId->rank map from its standings, and stamps previousRank on every
out.standings row before the single existing batch.set; round 1 rows get
an explicit previousRank: null (never undefined — the admin SDK rejects
undefined in set()). No writes were added outside the one batch, and the
rounds/{round} existence guard stays the hook's sole internal idempotency
marker. Feeds the bigscreen standings shuffle's delta glyphs (Plan 3a).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(The `git rev-parse HEAD` first is deliberate — an external process races HEAD in this workspace; confirm you are on the commit you expect before committing.)

---

### Task 5: reveal_weights.json (datagen) + trueWeights extension

**Files:**
- Modify: `games/salary-showdown/datagen/harness.py` (function `run_all`, lines 228–261)
- Modify: `games/salary-showdown/datagen/generate.py` (lines 24–26 path constants; line 117 `run_all` call; lines 134–147 output-writing block)
- Create (GENERATED by `generate.py`, then committed — never hand-typed): `games/salary-showdown/backend/functions/src/data/reveal_weights.json` and `games/salary-showdown/datagen/private/reveal_weights.json`
- Modify: `games/salary-showdown/backend/functions/src/game.js` (import block line 5; `enter:FINALE` hook trueWeights write, lines 595–608)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (the `games/{gameId}/reveal/latest` line, line 58)
- Modify: `games/salary-showdown/backend/functions/src/data/README.md` (add one provenance line)
- Test: `games/salary-showdown/backend/functions/test/reveal.test.js` (extend the existing first test — do NOT create a new test file)

**Interfaces:**
- Consumes: `stats_utils.ols` fit dict `{beta: {name: float}, se, t, p, r2}` as produced by `harness.check1_regression` (regressor names: the 8 `HIST_STATS` plus `"payroll"` and `"hype"`); `config.py` constants `TI_BASE=6.0, W_SCORING=1.60, W_PLAYMAKING=0.55, W_STEAL=1.05, W_BLOCK=1.00, W_REBOUND=0.25, W_TURNOVER=1.50`; existing `enter:FINALE` hook in `game.js` and its `engineParams.ti_weights` import.
- Produces (later tasks T6/T12/T13 rely on these EXACT shapes):
  - File `backend/functions/src/data/reveal_weights.json`:
    `{engine: {base, scoring, playmaking, steal, block, rebound, turnover}, regression: {winsR2, turnoverCoef, turnoverP, payrollT, hypeT}}` — all numbers 2dp; `turnoverP` is the STRING `'<0.001'`.
  - `games/{gameId}/reveal/latest.trueWeights` extended to
    `{narrative, defenseVisible, turnoverWeight, engine: {...}, regression: {...}}` — `narrative`, `defenseVisible`, `turnoverWeight` kept unchanged for compatibility.
  - `harness.run_all(...)` now returns a 3-tuple `(ok: bool, report: list, wins_fit: dict)` (was 2-tuple; only caller is `generate.py`).

Hard rules restated for this task (contracts win over your instincts):
- The regression numbers in `reveal_weights.json` come from the harness's OWN check-1 computation — the datagen writer VERIFIES against harness output and never invents or hand-types values. For seed 310 they land at ≈ 0.70 / −3.84 / −0.03 / 1.37.
- `python3 generate.py` must keep every PRE-EXISTING output file byte-identical (`data/players.csv`, `data/league_history.csv`, `datagen/private/hidden_attributes.csv`, `datagen/private/engine_params.json`, `datagen/private/harness_report.txt`). Only the new `reveal_weights.json` files may appear.
- No new Python dependencies. Run `python3` directly — `pip install` is PEP-668 blocked on this machine and nothing new is needed anyway.
- THE FINALE IS THE SANCTIONED REVEAL: shipping the true engine weights and the regression truth to the reveal doc is exactly what it exists for — do not "safety-trim" fields. The reveal doc stays server-written and member-readable only once `status: 'finished'` (rules already enforce this; touch no rules).
- Backend errors/conventions untouched: this task adds no callables and must not restructure the hardened `enter:FINALE` idempotency flow (`revealRef` existing = completion marker).

- [ ] **Step 1: Plumb the check-1 fit out of `harness.run_all`**

  In `games/salary-showdown/datagen/harness.py`, the wins-model OLS (R², turnover coefficient/p, payroll/hype t-stats) is ALREADY computed by `check1_regression`, which returns `(ok, fit)` — but `run_all` currently discards the fit. Make `run_all` return it.

  Edit 1 — top of `run_all` (line 228). Replace:
  ```python
  def run_all(players, fa_pool, history, best_styles, syn_flags, fairness_res, k, constants, rng):
      report = []
      results = [
          check1_regression(history, report)[0],
          check2_bargains(players, fa_pool, report),
  ```
  with:
  ```python
  def run_all(players, fa_pool, history, best_styles, syn_flags, fairness_res, k, constants, rng):
      report = []
      # check 1's fit is also the provenance for reveal_weights.json (Plan 3a §4.5):
      # keep the fit object and hand it back so generate.py exports the SAME numbers
      # the harness gated on — never a re-typed copy.
      ok1, wins_fit = check1_regression(history, report)
      results = [
          ok1,
          check2_bargains(players, fa_pool, report),
  ```

  Edit 2 — the return at the end of `run_all` (line 261). Replace:
  ```python
      report.append(("diag", f"salary~TI R2: all={r2_all:.2f}, ordinary players={r2_ord:.2f} "
                             f"(market sane for ordinary, blind to traps/defense) | scout_grade~TI r={gr:.2f}", True))
      return all(results), report
  ```
  with:
  ```python
      report.append(("diag", f"salary~TI R2: all={r2_all:.2f}, ordinary players={r2_ord:.2f} "
                             f"(market sane for ordinary, blind to traps/defense) | scout_grade~TI r={gr:.2f}", True))
      return all(results), report, wins_fit
  ```

  Nothing else in `harness.py` changes. `run_all` has exactly one caller (`generate.py:117`) — verified by `grep -rn "run_all" games/salary-showdown/datagen/`.

- [ ] **Step 2: Teach `generate.py` to write `reveal_weights.json` (additive; every pre-existing output stays byte-identical)**

  Three edits in `games/salary-showdown/datagen/generate.py`. None of them touch RNG consumption or any computed value, so all pre-existing outputs remain byte-for-byte identical.

  Edit 1 — path constant. Replace (lines 24–26):
  ```python
  HERE = os.path.dirname(os.path.abspath(__file__))
  DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
  PRIVATE = os.path.join(HERE, "private")
  ```
  with:
  ```python
  HERE = os.path.dirname(os.path.abspath(__file__))
  DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
  PRIVATE = os.path.join(HERE, "private")
  BACKEND_DATA = os.path.normpath(os.path.join(HERE, "..", "backend", "functions", "src", "data"))
  ```

  Edit 2 — receive the fit. Replace (line 117):
  ```python
      ok, report = harness.run_all(players, fa_pool, history, best_styles, syn_flags,
                                   fairness_res, k, constants, rng)
  ```
  with:
  ```python
      ok, report, wins_fit = harness.run_all(players, fa_pool, history, best_styles, syn_flags,
                                             fairness_res, k, constants, rng)
  ```

  Edit 3 — factor the `ti_weights` dict (so `engine_params.json` and `reveal_weights.json` share one source and cannot drift) and append the new writer. Replace (lines 134–148):
  ```python
      with open(os.path.join(PRIVATE, "engine_params.json"), "w") as f:
          json.dump(dict(schema_version=C.SCHEMA_VERSION, seed=C.SEED, logistic_k=k,
                         style_constants=constants, tier_weights=C.TIER_WEIGHTS,
                         style_delta=C.STYLE_DELTA, pace=C.PACE,
                         synergy=dict(shooter_3pt_skill=C.SHOOTER_3PT_SKILL, rim_block_skill=C.RIM_BLOCK_SKILL,
                                      spacing_penalty=C.SPACING_PENALTY, spacing_bonus=C.SPACING_BONUS,
                                      rim_penalty=C.RIM_PENALTY, rim_bonus=C.RIM_BONUS, rim_elite=C.RIM_ELITE,
                                      barrage_misfire=C.BARRAGE_MISFIRE),
                         ti_weights=dict(base=C.TI_BASE, scoring=C.W_SCORING, playmaking=C.W_PLAYMAKING,
                                         steal=C.W_STEAL, block=C.W_BLOCK, rebound=C.W_REBOUND,
                                         turnover=C.W_TURNOVER)), f, indent=2)
      with open(os.path.join(PRIVATE, "harness_report.txt"), "w") as f:
          f.write("\n".join(lines) + "\n")
      print(f"\nWrote {DATA}/players.csv, {DATA}/league_history.csv, private files -> {PRIVATE}/")
      return 0
  ```
  with:
  ```python
      ti_weights = dict(base=C.TI_BASE, scoring=C.W_SCORING, playmaking=C.W_PLAYMAKING,
                        steal=C.W_STEAL, block=C.W_BLOCK, rebound=C.W_REBOUND,
                        turnover=C.W_TURNOVER)
      with open(os.path.join(PRIVATE, "engine_params.json"), "w") as f:
          json.dump(dict(schema_version=C.SCHEMA_VERSION, seed=C.SEED, logistic_k=k,
                         style_constants=constants, tier_weights=C.TIER_WEIGHTS,
                         style_delta=C.STYLE_DELTA, pace=C.PACE,
                         synergy=dict(shooter_3pt_skill=C.SHOOTER_3PT_SKILL, rim_block_skill=C.RIM_BLOCK_SKILL,
                                      spacing_penalty=C.SPACING_PENALTY, spacing_bonus=C.SPACING_BONUS,
                                      rim_penalty=C.RIM_PENALTY, rim_bonus=C.RIM_BONUS, rim_elite=C.RIM_ELITE,
                                      barrage_misfire=C.BARRAGE_MISFIRE),
                         ti_weights=ti_weights), f, indent=2)
      with open(os.path.join(PRIVATE, "harness_report.txt"), "w") as f:
          f.write("\n".join(lines) + "\n")

      # Plan 3a §4.5 — additive export: both sides of the finale's weights-comparison
      # chart. `engine` is the SAME ti_weights dict serialized into engine_params.json
      # above (shared object => the files cannot drift); `regression` is the harness's
      # OWN check-1 OLS on league_history.csv (wins_fit) — the exact analysis a student
      # would run — NEVER hand-typed numbers. Verify the designed properties before
      # shipping the card so the reveal can never overstate the data:
      assert wins_fit["p"]["turnovers_per_game"] < 0.001, (
          f"turnover p={wins_fit['p']['turnovers_per_game']:.6f} not <0.001 — "
          "reveal_weights.json turnoverP='<0.001' would overstate significance")
      assert abs(wins_fit["t"]["payroll"]) < 2.0 and abs(wins_fit["t"]["hype"]) < 2.0, (
          "payroll/hype are not null effects — check 1 should have failed before this")
      reveal_weights = dict(
          engine=ti_weights,
          regression=dict(winsR2=round(float(wins_fit["r2"]), 2),
                          turnoverCoef=round(float(wins_fit["beta"]["turnovers_per_game"]), 2),
                          turnoverP="<0.001",
                          payrollT=round(float(wins_fit["t"]["payroll"]), 2),
                          hypeT=round(float(wins_fit["t"]["hype"]), 2)))
      with open(os.path.join(PRIVATE, "reveal_weights.json"), "w") as f:
          json.dump(reveal_weights, f, indent=2)
      os.makedirs(BACKEND_DATA, exist_ok=True)
      with open(os.path.join(BACKEND_DATA, "reveal_weights.json"), "w") as f:
          json.dump(reveal_weights, f, indent=2)
      print(f"\nWrote {DATA}/players.csv, {DATA}/league_history.csv, private files -> {PRIVATE}/")
      print(f"Wrote reveal_weights.json -> {PRIVATE}/ and {BACKEND_DATA}/")
      return 0
  ```
  Notes for the transcriber:
  - `float(...)` wrappers are REQUIRED: `wins_fit` values are numpy `float64`, which `json.dump` rejects.
  - `turnoverP` is the literal STRING `"<0.001"` (contract). The assert directly above is what licenses it.
  - The writer runs only after the `if not ok and not force: return 1` gate (unchanged, line 124–126), so a failing harness still writes nothing.

- [ ] **Step 3: Run datagen — 11 checks pass, new file appears**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/datagen && python3 generate.py
  ```
  Expected output: `seed=310 schema=v1.0`, the tuning/`k=...` lines, then 12 `[PASS]` lines (checks 1–11 plus `diag box arithmetic` — no `[FAIL]` anywhere), the `diag` line, and finally:
  ```
  Wrote .../games/salary-showdown/data/players.csv, .../games/salary-showdown/data/league_history.csv, private files -> .../datagen/private/
  Wrote reveal_weights.json -> .../datagen/private/ and .../backend/functions/src/data/
  ```
  Exit code 0. (Do NOT pass `--force`. Do NOT `pip install` anything — PEP-668 blocked and unnecessary.)

- [ ] **Step 4: Verify pre-existing outputs are byte-identical and inspect the new file**

  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short -- games/salary-showdown/data games/salary-showdown/datagen games/salary-showdown/backend/functions/src/data
  ```
  Expected output — EXACTLY these five lines (order may vary; `M` for the two edited scripts, `??` for the two generated files; any other `M` line means a pre-existing output changed and the step FAILS):
  ```
   M games/salary-showdown/datagen/generate.py
   M games/salary-showdown/datagen/harness.py
  ?? games/salary-showdown/backend/functions/src/data/reveal_weights.json
  ?? games/salary-showdown/datagen/private/reveal_weights.json
  ```
  Then confirm zero content drift in every pre-existing output:
  ```bash
  cd /Users/dylanmassaro/FenriX && git diff --stat -- games/salary-showdown/data games/salary-showdown/datagen/private games/salary-showdown/backend/functions/src/data/players.json games/salary-showdown/backend/functions/src/data/hidden.json games/salary-showdown/backend/functions/src/data/engine_params.json
  ```
  Expected output: EMPTY (no diff at all).
  Then:
  ```bash
  cat /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions/src/data/reveal_weights.json
  ```
  Expected content for seed 310 (this exact JSON; the regression digits must agree with the check-1 line already committed in `datagen/private/harness_report.txt` — `tov beta -3.84 ... payroll t=-0.03, hype t=1.37, R2=0.70`. If any digit differs, the generator output is authoritative — investigate the code edit; NEVER hand-edit the JSON):
  ```json
  {
    "engine": {
      "base": 6.0,
      "scoring": 1.6,
      "playmaking": 0.55,
      "steal": 1.05,
      "block": 1.0,
      "rebound": 0.25,
      "turnover": 1.5
    },
    "regression": {
      "winsR2": 0.7,
      "turnoverCoef": -3.84,
      "turnoverP": "<0.001",
      "payrollT": -0.03,
      "hypeT": 1.37
    }
  }
  ```
  Also diff the two copies — they must be identical:
  ```bash
  diff /Users/dylanmassaro/FenriX/games/salary-showdown/datagen/private/reveal_weights.json /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions/src/data/reveal_weights.json && echo IDENTICAL
  ```
  Expected output: `IDENTICAL`.

- [ ] **Step 5: Extend the reveal test with shape+value assertions (failing first)**

  In `games/salary-showdown/backend/functions/test/reveal.test.js`:

  Edit 1 — imports. Replace (line 5):
  ```js
  import hiddenData from '../src/data/hidden.json' with { type: 'json' };
  ```
  with:
  ```js
  import hiddenData from '../src/data/hidden.json' with { type: 'json' };
  import engineParamsData from '../src/data/engine_params.json' with { type: 'json' };
  import revealWeightsFile from '../src/data/reveal_weights.json' with { type: 'json' };
  ```

  Edit 2 — assertions. In the first test (`'does not exist before finale, exists after with hidden truths'`), replace (lines 82–87):
  ```js
      // trueWeights: narrative verbatim, no emojis, defense-visible flag set
      expect(after.trueWeights.narrative).toBe(
        'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.'
      );
      expect(after.trueWeights.defenseVisible).toBe(true);
      expect(typeof after.trueWeights.turnoverWeight).toBe('number');
  ```
  with:
  ```js
      // trueWeights: narrative verbatim, no emojis, defense-visible flag set
      expect(after.trueWeights.narrative).toBe(
        'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.'
      );
      expect(after.trueWeights.defenseVisible).toBe(true);
      expect(typeof after.trueWeights.turnoverWeight).toBe('number');

      // trueWeights extension (Plan 3a §4.5): both sides of the finale comparison
      // chart land verbatim from src/data/reveal_weights.json — a GENERATED file
      // (datagen: engine = ti_weights; regression = the harness's own check-1 OLS
      // on league_history.csv). The finale is the sanctioned reveal: these values
      // are supposed to ship here.
      expect(after.trueWeights.engine).toEqual(revealWeightsFile.engine);
      expect(after.trueWeights.regression).toEqual(revealWeightsFile.regression);
      // the committed file itself: engine mirrors engine_params.json exactly
      // (generate.py serializes the same dict into both) and carries the designed
      // seed-310 vector...
      expect(revealWeightsFile.engine).toEqual(engineParamsData.ti_weights);
      expect(revealWeightsFile.engine).toEqual({
        base: 6.0, scoring: 1.6, playmaking: 0.55, steal: 1.05,
        block: 1.0, rebound: 0.25, turnover: 1.5,
      });
      // ...and the regression block has the contract shape and designed properties:
      // turnoverP is the STRING '<0.001'; turnover coefficient is negative (the
      // poison shows up); payroll/hype are null effects (|t| < 2 by harness check 1).
      expect(Object.keys(revealWeightsFile.regression).sort()).toEqual(
        ['hypeT', 'payrollT', 'turnoverCoef', 'turnoverP', 'winsR2']);
      expect(revealWeightsFile.regression.turnoverP).toBe('<0.001');
      expect(revealWeightsFile.regression.winsR2).toBeGreaterThan(0);
      expect(revealWeightsFile.regression.winsR2).toBeLessThan(1);
      expect(revealWeightsFile.regression.turnoverCoef).toBeLessThan(0);
      expect(Math.abs(revealWeightsFile.regression.payrollT)).toBeLessThan(2);
      expect(Math.abs(revealWeightsFile.regression.hypeT)).toBeLessThan(2);
      // compat: the old turnoverWeight field survives and agrees with the new vector
      expect(after.trueWeights.turnoverWeight).toBe(after.trueWeights.engine.turnover);
  ```
  (Leave everything after this — the idempotency block from line 89 down — untouched. The final `expect(still).toEqual(after)` keeps guarding the extended doc too.)

- [ ] **Step 6: Run the reveal suite — expect the new assertions to FAIL (backend not yet extended)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run test/reveal.test.js"
  ```
  Expected: 1 failed / 1 passed within `reveal.test.js`. The failure is the first new assertion:
  `AssertionError: expected undefined to deeply equal { base: 6, scoring: 1.6, … }` at `expect(after.trueWeights.engine).toEqual(revealWeightsFile.engine)` — because `enter:FINALE` does not write `engine` yet. If instead you see an import/module-not-found error for `reveal_weights.json`, Steps 2–3 were not completed — go back.
  (If a long-lived emulator from `npm run emu` is already up, `cd functions && npx vitest run test/reveal.test.js` against it is fine; the functions emulator hot-reloads on edit, so one flaky run right after an edit is expected — re-run before investigating.)

- [ ] **Step 7: Merge the file into `trueWeights` in the `enter:FINALE` hook**

  In `games/salary-showdown/backend/functions/src/game.js`:

  Edit 1 — import (line 5). Replace:
  ```js
  import engineParams from './data/engine_params.json' with { type: 'json' };
  ```
  with:
  ```js
  import engineParams from './data/engine_params.json' with { type: 'json' };
  import revealWeights from './data/reveal_weights.json' with { type: 'json' };
  ```

  Edit 2 — the `trueWeights` object inside the `revealRef.set({...})` at the end of `HOOKS['enter:FINALE']` (lines 597–606). Replace:
  ```js
      trueWeights: {
        narrative: 'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.',
        // the engine's actual turnover weight (ti_weights.turnover, engine_params.json)
        // — what the students' own league_history.csv regression is being checked
        // against. Documented in the Produces interface; the brief's Step 3 code
        // sample omitted it, so this is filled from the same params engine.js already
        // treats as the single source of truth for the TrueImpact formula.
        turnoverWeight: engineParams.ti_weights.turnover,
        defenseVisible: true,
      },
  ```
  with:
  ```js
      trueWeights: {
        narrative: 'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.',
        // the engine's actual turnover weight (ti_weights.turnover, engine_params.json)
        // — what the students' own league_history.csv regression is being checked
        // against. Documented in the Produces interface; the brief's Step 3 code
        // sample omitted it, so this is filled from the same params engine.js already
        // treats as the single source of truth for the TrueImpact formula.
        // KEPT for compatibility (Plan 3a §4.5) — the full vector ships below.
        turnoverWeight: engineParams.ti_weights.turnover,
        defenseVisible: true,
        // Plan 3a §4.5: both sides of the finale weights-comparison chart, merged
        // verbatim from src/data/reveal_weights.json — a file GENERATED by
        // datagen/generate.py (engine = ti_weights; regression = the harness's own
        // check-1 OLS on league_history.csv). Never hand-type these numbers here.
        // regression.turnoverP is the STRING '<0.001' by contract.
        engine: revealWeights.engine,
        regression: revealWeights.regression,
      },
  ```
  Do NOT touch anything else in the hook — `revealRef` existing is the idempotency completion marker and the scatter/perTeam/winsPerDollar computations are hardened as-is.

- [ ] **Step 8: Re-run the reveal suite — expect green**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run test/reveal.test.js"
  ```
  Expected: `Test Files  1 passed`, `Tests  2 passed` (both reveal tests, including the untouched dead-money test and the idempotency `expect(still).toEqual(after)` over the extended doc).

- [ ] **Step 9: Document the extended shape (SCHEMA.md + data README)**

  Edit 1 — `games/salary-showdown/backend/SCHEMA.md` (line 58). Replace:
  ```
  games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload)
  ```
  with:
  ```
  games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload):
                                        # { scatter, perTeam, winsPerDollar, trueWeights }
                                        # trueWeights: { narrative, defenseVisible, turnoverWeight (kept for compat),
                                        #   engine: {base, scoring, playmaking, steal, block, rebound, turnover},
                                        #   regression: {winsR2, turnoverCoef, turnoverP, payrollT, hypeT} }
                                        # turnoverP is the STRING '<0.001'. engine/regression are merged verbatim from
                                        # functions/src/data/reveal_weights.json, GENERATED by datagen/generate.py
                                        # (engine = ti_weights; regression = the harness's own check-1 OLS on
                                        # league_history.csv) — regenerate via `python3 generate.py`, never hand-edit.
  ```
  Edit 2 — `games/salary-showdown/backend/functions/src/data/README.md`. Replace:
  ```
  # NEVER expose hidden.json or engine_params.json to clients
  These ship inside the Cloud Functions deployment only. They are the answer key.
  `players.json` is the public catalog (mirrors the pre-released players.csv).
  ```
  with:
  ```
  # NEVER expose hidden.json or engine_params.json to clients
  These ship inside the Cloud Functions deployment only. They are the answer key.
  `players.json` is the public catalog (mirrors the pre-released players.csv).
  `reveal_weights.json` is GENERATED by `datagen/generate.py` (never hand-edit); it is
  answer-key data too, but the enter:FINALE hook deliberately publishes it into
  games/{id}/reveal/latest.trueWeights — the finale is the sanctioned reveal.
  ```

- [ ] **Step 10: Full backend suite**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"
  ```
  Expected: every test file passes, `0 failed`. (This suite is the pre-commit gate; no app/tsc run is needed — this task touches no `app/` file.)

  Then re-confirm the byte-identity invariant one last time before committing:
  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short -- games/salary-showdown
  ```
  Expected: exactly the files this task touched —
  ```
   M games/salary-showdown/backend/SCHEMA.md
   M games/salary-showdown/backend/functions/src/data/README.md
   M games/salary-showdown/backend/functions/src/game.js
   M games/salary-showdown/backend/functions/test/reveal.test.js
   M games/salary-showdown/datagen/generate.py
   M games/salary-showdown/datagen/harness.py
  ?? games/salary-showdown/backend/functions/src/data/reveal_weights.json
  ?? games/salary-showdown/datagen/private/reveal_weights.json
  ```
  (Ignore unrelated pre-existing noise outside `games/salary-showdown/` — e.g. `quant_finance/`, `games/bakery-bash/` — it belongs to other work; do not stage it.)

- [ ] **Step 11: Commit**

  This workspace has an external process that can race HEAD — verify HEAD is where you expect before committing:
  ```bash
  cd /Users/dylanmassaro/FenriX && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
  ```
  Expected: `main` plus the commit hash of the previous task's commit. Then:
  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/datagen/harness.py \
    games/salary-showdown/datagen/generate.py \
    games/salary-showdown/datagen/private/reveal_weights.json \
    games/salary-showdown/backend/functions/src/data/reveal_weights.json \
    games/salary-showdown/backend/functions/src/game.js \
    games/salary-showdown/backend/functions/test/reveal.test.js \
    games/salary-showdown/backend/SCHEMA.md \
    games/salary-showdown/backend/functions/src/data/README.md \
    && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): datagen reveal_weights.json export + trueWeights engine/regression

  Plan 3a §4.5. datagen: harness.run_all now also returns the check-1 wins-model
  fit; generate.py writes reveal_weights.json (engine = the same ti_weights dict
  serialized into engine_params.json; regression = the harness's own OLS numbers
  rounded to 2dp, turnoverP the string '<0.001') to datagen/private/ and
  backend/functions/src/data/. The writer asserts tov p < 0.001 and
  |payrollT|,|hypeT| < 2, so the card can never overstate the data. Every
  pre-existing generate.py output stays byte-identical (verified via git diff).

  backend: enter:FINALE merges the file into reveal trueWeights as
  {engine, regression}; narrative/defenseVisible/turnoverWeight unchanged for
  compatibility. SCHEMA.md + src/data README document shape and provenance;
  reveal.test.js asserts shape + values against the committed JSON.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected: one commit, 8 files changed (2 new). Do not push.

---

### Task 6: App types + phaseNames + ProfessorProvider + /professor route + panel shell

**Files:**
- Modify: `games/salary-showdown/app/src/types/models.ts` (GameDoc at lines 27-32, TeamDoc at lines 13-17, StandingsRow at lines 63-66, new interfaces appended after RoundDoc at line 69)
- Create: `games/salary-showdown/app/src/lib/phaseNames.ts`
- Create: `games/salary-showdown/app/src/contexts/ProfessorContext.tsx`
- Create: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx`
- Modify: `games/salary-showdown/app/src/App.tsx` (imports at lines 1-13, routes block at lines 29-40)
- Test: `games/salary-showdown/app/src/itest/professor.itest.tsx` (new)

**Interfaces:**
- Consumes (all pre-existing; nothing from Tasks 1-5 is required at runtime — the shell only reads fields that are optional or defaulted):
  - Callables `createGame({teamNames}) → {gameId, joinCode}`, `startSeason({gameId})`, `advancePhase({gameId, expectedPhase, expectedRound})` (backend, already shipped).
  - `app/src/lib/firebase.ts`: `export const db`, `export const auth`, `export const functions`.
  - `app/src/contexts/AuthContext.tsx`: `useAuth(): { uid: string | null; ready: boolean }`.
  - itest harness `app/src/itest/harness.ts`: `adminDb()`, `newClient(name)`, `driveTo(seeded, to)`, `export interface Seeded`, `export type Client`.
- Produces (later tasks import these, NEVER redefine them):
  - `src/types/models.ts`: `GameDoc.timerPausedMs: number | null`, `GameDoc.revealStep?: number`, `TeamDoc.doneRound: number`, `TeamDoc.donePhase: string`, `StandingsRow.previousRank: number | null`, `export interface PlayerSeat { teamId: string; role: Role; displayName: string }`, `export interface RevealDoc` (full shape below).
  - `src/lib/phaseNames.ts`: `export const PHASE_NAMES: Record<Phase, string>`.
  - `src/contexts/ProfessorContext.tsx`: `export function ProfessorProvider({children})`, `export const useProfessor: () => ProfessorCtx` with

    ```ts
    interface ProfessorCtx {
      gameId: string | null;
      setGameId(id: string | null): void;      // persists localStorage 'ss.profGameId'
      game: GameDoc | null;                    // transition-GATED view
      settling: boolean;                       // raw doc has transition != null
      teams: Map<string, TeamDoc>;
      players: Map<string, PlayerSeat>;        // key = uid
      round: RoundDoc | null;                  // rounds/{game.round}, round >= 1
      auctionWave: AuctionDoc | null;          // auctions/{game.round}
      bidsSubmitted: Set<string>;              // teamIds with private/auction.round === game.round
      reveal: RevealDoc | null;                // only fetched when phase === 'FINALE'
      call<T = unknown>(name: string, data: unknown): Promise<T>;
    }
    ```
  - `src/pages/professor/ProfessorPage.tsx`: default export; T7 (SessionSetup, AdvanceControl), T8 (TimerStrip), T9 (SubmissionGrid), T13 (RevealStepper) extend this page.
  - Route `/professor` in App.tsx, element wrapped in `ProfessorProvider`.
  - `src/itest/professor.itest.tsx` — T7/T8/T9 extend this file.

**Deliberate deviations from the contracts file-map (charter-directed, note for the reviewer):**
1. This task adds the `/professor` route ONLY. `/bigscreen` is added by T10 together with `BigscreenPage` — route ownership follows page ownership (the contracts list both under T6; T10 must wrap its route in this same `ProfessorProvider`).
2. `src/itest/professor.itest.tsx` is CREATED here (smoke test); the contracts' file-map says T7 creates it. T7 extends it instead.

**perTeam nullability verification (contract §App type additions asked T6 to check):** the actual `enter:FINALE` writer (`backend/functions/src/game.js`, `HOOKS['enter:FINALE']`, ~line 590) writes `perTeam.push({ teamId: t.id, bestSigning: vals[0] ?? null, worstSigning: vals.at(-1) ?? null })` where `vals` is derived from `team.spendLog ?? []`. A team whose GM never signed anyone has an empty spendLog, so the server provably CAN write `null`. The nullable type in the contracts is therefore kept exactly as written.

**Hard rules restated for this task (do not "improve" on them):**
- `advancePhase` / `setTimer` callers ALWAYS send `expectedPhase` + `expectedRound`. (The itest drives via the harness, which already does; every future panel call built on `useProfessor().call` must too.)
- NO emojis anywhere in product UI. `npm run audit:ui` scans every non-test file under `app/src` and fails the build on one. `…` (U+2026) and `·` (U+00B7) are fine.
- Clients gate phase rendering on the transition marker (§3a): while `games/{id}.transition` is set, present `fromRound`/`fromPhase` — the destination phase's data may not exist yet.
- Every Firestore listener passes an error callback that logs via `console.error` — never a silent `() => {}` (§3a lesson; the older GameContext predates this rule, do NOT copy its silent callbacks).
- The professor has NO `players/{uid}` membership doc — do not call `joinGame` for the professor, in code or in tests. All listeners ride the professor's rule rights (`games/{id}.professorUid == auth.uid`).
- `bidsSubmitted` is PRESENCE only (`private/auction.round === game.round`) — bid contents are never surfaced.
- Facts, never conclusions, on all UI strings.

All commands below run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app` unless stated otherwise. The integration tests need the long-lived emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`); if they are not already up, start them in a separate terminal first:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && npx firebase emulators:start --project salary-showdown-dev
```

- [ ] **Step 1: Write the failing itest (professor panel smoke test)**

  READ `src/itest/season.itest.tsx` and `src/itest/harness.ts` first — this test copies their exact patterns (sign in the default app explicitly before render; drive the game via harness bots; regex text matchers with generous timeouts). Key difference from every existing itest: the app-under-test uid IS the professor (the `createGame` caller gets `professorUid`), and the professor does NOT `joinGame`.

  Create `src/itest/professor.itest.tsx` with exactly:

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { MemoryRouter } from 'react-router-dom';
  import { httpsCallable } from 'firebase/functions';
  import { signInAnonymously } from 'firebase/auth';
  import { adminDb, driveTo, newClient, type Seeded } from './harness';
  import { auth, functions } from '../lib/firebase';
  import App from '../App';

  test('professor panel: creator sees join code + Lobby; header follows startSeason and advance', async () => {
    // The app under test IS the professor: createGame stamps the caller's uid as
    // professorUid, and every panel listener rides that rule right. The professor
    // has NO players/{uid} membership doc — joinGame is never called for it.
    // AuthProvider only signs in once rendered, so sign in explicitly first
    // (same Task 6 finding the other itests restate).
    await signInAnonymously(auth);
    await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
    const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({ teamNames: names })
      .then((r) => r.data as { gameId: string; joinCode: string });

    // Bots on every team so driveTo can run its FA signing routine later.
    const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
    const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
    const bots: Seeded['bots'] = [];
    for (const [i, teamId] of teamIds.entries()) {
      const gm = await newClient(`gm${i}`);
      const scout = await newClient(`sc${i}`);
      const coach = await newClient(`co${i}`);
      await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
      await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
      await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
      bots.push({ teamId, gm, scout, coach });
    }
    // Prof shim over the DEFAULT app so driveTo's advancePhase calls (which
    // always carry expectedPhase + expectedRound — standing hard rule) come
    // from the professor uid via the shipped WebChannel transport.
    const prof = {
      uid: auth.currentUser!.uid,
      call: <T,>(fn: string, data: unknown) =>
        httpsCallable(functions, fn)(data).then((r) => r.data as T),
      dispose: () => Promise.resolve(),
    };
    const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };

    localStorage.setItem('ss.profGameId', gameId);
    render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(joinCode)).toBeInTheDocument(),
      { timeout: 20000 });
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    // Spec §5 item 9: config shown read-only. fmtM(100) → "$100.0M"
    // (money.ts:11, `$${x.toFixed(1)}M`); config knobs are decorative, so this
    // is plain text — asserting on the exact string also guards against anyone
    // "improving" it into an input.
    expect(screen.getByText('Cap $100.0M · 5 rounds')).toBeInTheDocument();

    await driveTo(seeded, 'R1:FREE_AGENCY'); // calls startSeason under the hood
    await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
      { timeout: 20000 });

    await driveTo(seeded, 'R1:AUCTION'); // FA signing routine + one advance
    await waitFor(() => expect(screen.getByText(/Star Auction · Round 1/)).toBeInTheDocument(),
      { timeout: 30000 });
  }, 240000);
  ```

- [ ] **Step 2: Run the new itest — expect FAILURE (route does not exist yet)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected outcome: 1 test FAILS. `/professor` matches no route, so nothing renders and the first `waitFor` times out after ~20s with `TestingLibraryElementError: Unable to find an element with the text: <the 6-char join code>`. (If it instead fails with a fetch/connection error, the emulators are not running — start them and re-run. One flaky run right after a functions edit is expected emulator behavior; re-run before investigating.)

- [ ] **Step 3: Add the Plan 3a type additions to `src/types/models.ts`**

  Three anchored edits plus one appended block. Later tasks import these — never redefine them elsewhere.

  Edit 3a — `TeamDoc` (current lines 13-17). Replace:

  ```ts
  export interface TeamDoc {
    name: string; wins: number; losses: number; pointDiff: number; pointsFor: number;
    roster: Contract[]; deadMoney: DeadMoney[]; spendLog: Contract[];
    lineup: Lineup | null; lineupLockedRound: number; hardshipUsed: number[];
  }
  ```

  with:

  ```ts
  export interface TeamDoc {
    name: string; wins: number; losses: number; pointDiff: number; pointsFor: number;
    roster: Contract[]; deadMoney: DeadMoney[]; spendLog: Contract[];
    lineup: Lineup | null; lineupLockedRound: number; hardshipUsed: number[];
    // markDone status flag (backend T2; init 0/'' in createGame). A status light,
    // NEVER a lock — signing/cutting stays open until the phase closes. Staleness
    // is implicit in the (doneRound, donePhase) pair; nothing ever clears it.
    doneRound: number; donePhase: string;
  }
  ```

  Edit 3b — `GameDoc` (current lines 27-32). Replace:

  ```ts
  export interface GameDoc {
    joinCode: string; status: 'lobby' | 'active' | 'finished'; phase: Phase; round: number;
    timerEndsAt: { toMillis(): number } | null; teamCount: number;
    config: { cap: number; totalRounds: number }; professorUid: string;
    transition?: TransitionMarker;
  }
  ```

  with:

  ```ts
  export interface GameDoc {
    joinCode: string; status: 'lobby' | 'active' | 'finished'; phase: Phase; round: number;
    timerEndsAt: { toMillis(): number } | null; teamCount: number;
    // Timer state trio (backend setTimer, T1): running = endsAt set + pausedMs null ·
    // paused = endsAt null + pausedMs set · off = both null. Timers are advisory
    // pacing only (parent spec §13): expiry never blocks a submission server-side.
    timerPausedMs: number | null;
    // Written ONLY by the professor's setRevealStep callable — the FINALE flip does
    // NOT initialize it (spec §4.3), so it is absent on every game until the first
    // step. Readers default with `revealStep ?? 0` (podium).
    revealStep?: number;
    config: { cap: number; totalRounds: number }; professorUid: string;
    transition?: TransitionMarker;
  }
  ```

  Edit 3c — `StandingsRow` (current lines 63-66). Replace:

  ```ts
  export interface StandingsRow {
    teamId: string; name: string; wins: number; losses: number;
    pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
  }
  ```

  with:

  ```ts
  export interface StandingsRow {
    teamId: string; name: string; wins: number; losses: number;
    pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
    // Last round's rank for this team, stamped by enter:SIMULATE (T4); null in
    // round 1 (and on the wire only for rounds simulated after T4 ships).
    previousRank: number | null;
  }
  ```

  Edit 3d — append the professor-surface types. Insert directly AFTER the closing brace of `RoundDoc` (currently line 69, `export interface RoundDoc { ... }`) and BEFORE the `// Verbatim strings — spec §4.4` comment block:

  ```ts
  // A claimed seat: one games/{id}/players/{uid} membership doc (professor panel +
  // bigscreen lobby wall read the whole collection; team clients only read their own).
  export interface PlayerSeat { teamId: string; role: Role; displayName: string }

  // games/{id}/reveal/latest — written ONLY by the enter:FINALE hook. THE FINALE IS
  // THE SANCTIONED REVEAL (parent spec §11.14): value-per-dollar, wins-per-dollar,
  // trap labels and weights live here on purpose. In-game team screens still never
  // render perDollar-style numbers.
  export interface RevealDoc {
    scatter: { pid: number; name: string; hype: number; salary: number | null;
      ti: number; isTrap: boolean; archetype: string }[];
    // bestSigning/worstSigning stay nullable — verified against the actual
    // enter:FINALE writer (game.js: `bestSigning: vals[0] ?? null` over
    // `team.spendLog ?? []`): a team that never signed anyone gets null.
    perTeam: { teamId: string;
      bestSigning: { pid: number; valuePerDollar: number } | null;
      worstSigning: { pid: number; valuePerDollar: number } | null }[];
    winsPerDollar: { teamId: string; wins: number; totalSpend: number; ratio: number }[];
    trueWeights: { narrative: string; defenseVisible: boolean; turnoverWeight: number;
      engine: { base: number; scoring: number; playmaking: number; steal: number;
        block: number; rebound: number; turnover: number };
      regression: { winsR2: number; turnoverCoef: number; turnoverP: string;
        payrollT: number; hypeT: number } };
  }
  ```

  Note: `trueWeights.engine`/`regression` land on the wire with backend T5. T12/T13 are the only consumers and run after T5; nothing in this task reads them.

- [ ] **Step 4: Create `src/lib/phaseNames.ts`**

  Full file contents:

  ```ts
  import type { Phase } from '../types/models';

  // Student vocabulary (design spec §5/§6): FREE_AGENCY is presented as "Draft
  // Night" and AUCTION as "Star Auction" everywhere a phase is named in UI.
  // Record<Phase, string> makes tsc enforce exhaustiveness if Phase ever grows.
  export const PHASE_NAMES: Record<Phase, string> = {
    LOBBY: 'Lobby',
    FRONT_OFFICE: 'Front Office',
    FREE_AGENCY: 'Draft Night',
    AUCTION: 'Star Auction',
    LINEUP: 'Lineup',
    SIMULATE: 'Simulate',
    RESULTS: 'Results',
    FINALE: 'Finale',
  };
  ```

- [ ] **Step 5: Create `src/contexts/ProfessorContext.tsx`**

  The transition-gated game mapping is copied from `GameContext.tsx:37-56`; everything else is professor-specific. Rules recap baked into this file: the professor may read everything under their game including other teams' `private/auction` docs (RULES POLICY in backend/SCHEMA.md — "they run the room"), but `bidsSubmitted` carries PRESENCE only, never bid contents. Every listener has a `console.error` error callback. All listeners additionally gate on `uid` so none attaches before anonymous sign-in resolves (a pre-auth attach would be permission-denied and Firestore terminates, not retries, a denied listener).

  Full file contents:

  ```tsx
  import {
    createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
  } from 'react';
  import { collection, doc, onSnapshot } from 'firebase/firestore';
  import { httpsCallable } from 'firebase/functions';
  import { db, functions } from '../lib/firebase';
  import { useAuth } from './AuthContext';
  import type {
    AuctionDoc, GameDoc, PlayerSeat, RevealDoc, RoundDoc, TeamDoc,
  } from '../types/models';

  // Data layer for /professor and /bigscreen (design spec §3.1). Deliberately NOT
  // GameContext: that provider is membership-gated by design, and the professor
  // has NO players/{uid} membership doc — never create one. Every read here rides
  // the professor rule right (games/{id}.professorUid == auth.uid), which covers
  // everything under the game including other teams' private/auction docs.
  // Every listener passes an error callback that logs via console.error — never
  // a silent no-op (§3a lesson).
  interface ProfessorCtx {
    gameId: string | null;
    setGameId(id: string | null): void;      // persists localStorage 'ss.profGameId'
    game: GameDoc | null;                    // transition-GATED (see game-doc effect)
    settling: boolean;                       // raw doc has transition != null
    teams: Map<string, TeamDoc>;
    players: Map<string, PlayerSeat>;        // key = uid
    round: RoundDoc | null;                  // rounds/{game.round}, round >= 1
    auctionWave: AuctionDoc | null;          // auctions/{game.round}
    bidsSubmitted: Set<string>;              // teamIds with private/auction.round === game.round
    reveal: RevealDoc | null;                // only fetched when phase === 'FINALE'
    call<T = unknown>(name: string, data: unknown): Promise<T>;
  }

  const Ctx = createContext<ProfessorCtx>(null as unknown as ProfessorCtx);
  export const useProfessor = () => useContext(Ctx);

  export function ProfessorProvider({ children }: { children: ReactNode }) {
    const { uid } = useAuth();
    const [gameId, setGameIdState] = useState<string | null>(
      () => localStorage.getItem('ss.profGameId'));
    const [game, setGame] = useState<GameDoc | null>(null);
    const [settling, setSettling] = useState(false);
    const [teams, setTeams] = useState<Map<string, TeamDoc>>(new Map());
    const [players, setPlayers] = useState<Map<string, PlayerSeat>>(new Map());
    const [round, setRound] = useState<RoundDoc | null>(null);
    const [auctionWave, setAuctionWave] = useState<AuctionDoc | null>(null);
    const [bidsSubmitted, setBidsSubmitted] = useState<Set<string>>(new Set());
    const [reveal, setReveal] = useState<RevealDoc | null>(null);

    // localStorage, not sessionStorage: the professor's session survives browser
    // restarts and is independent of the team client's ss.gameId story (spec §3.1).
    const setGameId = useCallback((id: string | null) => {
      if (id) localStorage.setItem('ss.profGameId', id);
      else localStorage.removeItem('ss.profGameId');
      setGameIdState(id);
    }, []);

    useEffect(() => { // game doc: gated view + raw settling flag
      if (!gameId || !uid) { setGame(null); setSettling(false); return; }
      return onSnapshot(doc(db, 'games', gameId),
        (s) => {
          if (!s.exists()) { setGame(null); setSettling(false); return; }
          const d = s.data() as GameDoc;
          // §3a transition gate — same mapping as GameContext.tsx:37-56. The
          // flip-first advance publishes the new round/phase BEFORE the enter
          // hook has created that phase's data (auctions/{r}, market/{r},
          // rounds/{r}). Until the marker clears, keep presenting the phase we
          // are LEAVING — its data is fully materialised. `settling` exposes the
          // raw marker so the panel can show "advancing…" and disable controls.
          setGame(d.transition
            ? { ...d, round: d.transition.fromRound, phase: d.transition.fromPhase }
            : d);
          setSettling(d.transition != null);
        },
        (e) => console.error('[professor] games/{id} listener', e));
    }, [gameId, uid]);

    useEffect(() => { // all team docs (public state + doneRound/donePhase lights)
      if (!gameId || !uid) { setTeams(new Map()); return; }
      return onSnapshot(collection(db, 'games', gameId, 'teams'),
        (snap) => {
          const m = new Map<string, TeamDoc>();
          snap.forEach((d) => m.set(d.id, d.data() as TeamDoc));
          setTeams(m);
        },
        (e) => console.error('[professor] teams listener', e));
    }, [gameId, uid]);

    useEffect(() => { // players collection: who claimed which seat (lobby walls)
      if (!gameId || !uid) { setPlayers(new Map()); return; }
      return onSnapshot(collection(db, 'games', gameId, 'players'),
        (snap) => {
          const m = new Map<string, PlayerSeat>();
          snap.forEach((d) => m.set(d.id, d.data() as PlayerSeat));
          setPlayers(m);
        },
        (e) => console.error('[professor] players listener', e));
    }, [gameId, uid]);

    useEffect(() => { // current round doc (gated round: its data is materialised)
      const r = game?.round ?? 0;
      if (!gameId || !uid || r < 1) { setRound(null); return; }
      return onSnapshot(doc(db, 'games', gameId, 'rounds', String(r)),
        (s) => setRound(s.exists() ? (s.data() as RoundDoc) : null),
        (e) => console.error('[professor] rounds listener', e));
    }, [gameId, uid, game?.round]);

    useEffect(() => { // current auction wave
      const r = game?.round ?? 0;
      if (!gameId || !uid || r < 1) { setAuctionWave(null); return; }
      return onSnapshot(doc(db, 'games', gameId, 'auctions', String(r)),
        (s) => setAuctionWave(s.exists() ? (s.data() as AuctionDoc) : null),
        (e) => console.error('[professor] auctions listener', e));
    }, [gameId, uid, game?.round]);

    // Per-team private/auction PRESENCE -> the auction submitted-lights. The
    // professor may read these docs (RULES POLICY: they run the room), but only
    // `.round` is consulted — bid CONTENTS are never surfaced anywhere.
    // <=21 teams => <=21 listeners on this one privileged client (spec §3.1).
    const teamIdsKey = useMemo(() => [...teams.keys()].sort().join('\n'), [teams]);
    useEffect(() => {
      const r = game?.round ?? 0;
      const tids = teamIdsKey === '' ? [] : teamIdsKey.split('\n');
      if (!gameId || !uid || r < 1 || tids.length === 0) {
        setBidsSubmitted(new Set());
        return;
      }
      setBidsSubmitted(new Set()); // round changed: all lights start dark
      const unsubs = tids.map((tid) => onSnapshot(
        doc(db, 'games', gameId, 'teams', tid, 'private', 'auction'),
        (s) => {
          const on = s.exists() && (s.data() as { round?: number }).round === r;
          setBidsSubmitted((prev) => {
            if (prev.has(tid) === on) return prev;
            const next = new Set(prev);
            if (on) next.add(tid);
            else next.delete(tid);
            return next;
          });
        },
        (e) => console.error('[professor] private/auction listener', tid, e)));
      return () => { unsubs.forEach((u) => u()); };
    }, [gameId, uid, teamIdsKey, game?.round]);

    useEffect(() => { // finale payload — professor-readable even pre-finished
      if (!gameId || !uid || game?.phase !== 'FINALE') { setReveal(null); return; }
      return onSnapshot(doc(db, 'games', gameId, 'reveal', 'latest'),
        (s) => setReveal(s.exists() ? (s.data() as RevealDoc) : null),
        (e) => console.error('[professor] reveal listener', e));
    }, [gameId, uid, game?.phase]);

    const call = useCallback(async <T,>(name: string, data: unknown): Promise<T> => {
      const res = await httpsCallable(functions, name)(data);
      return res.data as T;
    }, []);

    const value = useMemo(() => ({
      gameId, setGameId, game, settling, teams, players, round, auctionWave,
      bidsSubmitted, reveal, call,
    }), [gameId, setGameId, game, settling, teams, players, round, auctionWave,
      bidsSubmitted, reveal, call]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }
  ```

- [ ] **Step 6: Create `src/pages/professor/ProfessorPage.tsx`** (create the `src/pages/professor/` directory)

  Shell only: session header per design spec §5.1 — joinCode LARGE ("this is what Dylan reads out if the wall dies"), `PHASE_NAMES[phase] · Round N` (round suffix hidden at round 0, mirroring PhaseHeader.tsx:12), settling indicator `advancing…`, a muted read-only config line `Cap $100.0M · 5 rounds` rendered from `game.config` via `fmtM` (spec §5 item 9; hard rule — config knobs are DECORATIVE: plain text, no input, no button, ever), and the "Open projector" button calling `window.open('/bigscreen')`. T7/T8/T9/T13 extend below the header. Reuses existing CSS classes only (`page`, `card`, `phase-head`, `brand`, `mono`, `muted`, `dim`, `btn`); no new stylesheet. No emojis; facts only.

  Full file contents:

  ```tsx
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { fmtM } from '../../lib/money';
  import { PHASE_NAMES } from '../../lib/phaseNames';

  // /professor control-panel shell (design spec §5.1). Later tasks mount below
  // the header: SessionSetup + AdvanceControl (T7), TimerStrip (T8),
  // SubmissionGrid (T9), RevealStepper (T13).
  export default function ProfessorPage() {
    const { gameId, game, settling } = useProfessor();
    return (
      <main className="page">
        <div className="phase-head">
          <div>
            <div className="brand">Salary Showdown</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Professor panel</h1>
          </div>
          <button type="button" className="btn" onClick={() => window.open('/bigscreen')}>
            Open projector
          </button>
        </div>
        {game ? (
          <section className="card" style={{ marginTop: 10 }} aria-label="Session">
            <div className="mono" aria-label="Join code"
              style={{ fontSize: 44, fontWeight: 700, letterSpacing: 6, lineHeight: 1.1 }}>
              {game.joinCode}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 4 }}>
              <strong>
                {PHASE_NAMES[game.phase]}{game.round > 0 ? ` · Round ${game.round}` : ''}
              </strong>
              {settling && <span className="dim">advancing…</span>}
            </div>
            {/* Config shown read-only (spec §5 item 9). Hard rule: cap/totalRounds
                are DECORATIVE — plain text only, never an input or button. */}
            <div className="muted" style={{ marginTop: 4 }}>
              Cap {fmtM(game.config.cap)} · {game.config.totalRounds} rounds
            </div>
          </section>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>
            {gameId ? 'Connecting to session…' : 'No active session.'}
          </p>
        )}
      </main>
    );
  }
  ```

- [ ] **Step 7: Add the `/professor` route to `src/App.tsx`**

  Two anchored edits. The route element is wrapped in `ProfessorProvider` — inside `AuthProvider` per contracts; `GameProvider` stays byte-identical and dormant on this route (the professor's `ss.gameId` sessionStorage key is never set, so GameContext's listeners never attach and PhaseRouter never redirects — it requires a membership). `/bigscreen` is deliberately NOT added here; T10 adds it with BigscreenPage.

  Edit 7a — imports. Replace (current lines 1-3):

  ```tsx
  import { Route, Routes } from 'react-router-dom';
  import { AuthProvider } from './contexts/AuthContext';
  import { GameProvider } from './contexts/GameContext';
  ```

  with:

  ```tsx
  import { Route, Routes } from 'react-router-dom';
  import { AuthProvider } from './contexts/AuthContext';
  import { GameProvider } from './contexts/GameContext';
  import { ProfessorProvider } from './contexts/ProfessorContext';
  ```

  and replace (current line 13):

  ```tsx
  import StandingsPage from './pages/StandingsPage';
  ```

  with:

  ```tsx
  import StandingsPage from './pages/StandingsPage';
  import ProfessorPage from './pages/professor/ProfessorPage';
  ```

  Edit 7b — the route. Replace (current lines 39-40):

  ```tsx
            <Route path="/standings" element={<StandingsPage />} />
          </Routes>
  ```

  with:

  ```tsx
            <Route path="/standings" element={<StandingsPage />} />
            <Route path="/professor"
              element={<ProfessorProvider><ProfessorPage /></ProfessorProvider>} />
          </Routes>
  ```

- [ ] **Step 8: Run the new itest — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 1 passed (1)` (roughly 60-150s: 12 bot joins + 32 FA signings drive most of it). If the first run right after a functions-emulator hot reload flakes, re-run once before investigating.

- [ ] **Step 9: Wider verification — types, unit suite, full itest suite, UI audit**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
  ```

  Expected: exits 0, no output. (This is the check that no other file breaks on the `TeamDoc`/`GameDoc`/`StandingsRow` additions — they are additive, and reads are casts, so nothing should.)

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
  ```

  Expected: all existing unit tests pass (0 failures; this task adds no unit tests — `PHASE_NAMES` exhaustiveness is enforced by `Record<Phase, string>` at compile time).

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
  ```

  Expected: `Test Files  14 passed (14)` / `Tests  15 passed (15)` — the 13 pre-existing itest files (14 tests; `landing.itest.tsx` has 2) stay green plus `professor.itest.tsx`. 0 failures. Emulators required.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
  ```

  Expected: `audit:ui clean — <N> files scanned` (the three new non-test files are scanned; `…`/`·` are outside the banned emoji ranges, and no judgment adjectives were introduced).

- [ ] **Step 10: Commit**

  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short games/salary-showdown/app/src
  ```

  Expected: exactly these entries — `M games/salary-showdown/app/src/App.tsx`, `M games/salary-showdown/app/src/types/models.ts`, `?? games/salary-showdown/app/src/contexts/ProfessorContext.tsx`, `?? games/salary-showdown/app/src/itest/professor.itest.tsx`, `?? games/salary-showdown/app/src/lib/phaseNames.ts`, `?? games/salary-showdown/app/src/pages/professor/` — nothing else. Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/app/src/App.tsx \
    games/salary-showdown/app/src/types/models.ts \
    games/salary-showdown/app/src/lib/phaseNames.ts \
    games/salary-showdown/app/src/contexts/ProfessorContext.tsx \
    games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx \
    games/salary-showdown/app/src/itest/professor.itest.tsx \
  && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): professor data layer — types, PHASE_NAMES, ProfessorProvider, /professor shell

  Plan 3a Task 6. Adds the Plan 3a app-type additions to models.ts
  (GameDoc.timerPausedMs/revealStep, TeamDoc.doneRound/donePhase,
  StandingsRow.previousRank, PlayerSeat, RevealDoc — perTeam best/worst
  signing kept nullable: verified against the enter:FINALE writer, which
  emits null for an empty spendLog), the PHASE_NAMES student-vocabulary
  map, and ProfessorProvider: a membership-free data layer riding the
  professor rule right, with the §3a transition-gated game view, a raw
  `settling` flag, and per-team private/auction PRESENCE listeners for
  the auction lights (round match only — never bid contents). Every
  listener logs errors via console.error. /professor renders the panel
  shell (large join code, PHASE_NAMES[phase] · Round N, "advancing…"
  indicator, Open projector button); /bigscreen route lands with T10
  alongside its page. Smoke itest: the createGame caller IS the
  professor (no joinGame), header follows startSeason and advancePhase.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Expected: one commit on `main` touching exactly 6 files (2 modified, 4 added).

---

### Task 7: Panel: SessionSetup + AdvanceControl + confirm guards + CSV export

**Files:**
- Create: `games/salary-showdown/app/src/lib/submissionLights.ts`
- Create: `games/salary-showdown/app/src/lib/submissionLights.test.ts`
- Create: `games/salary-showdown/app/src/lib/exportSeason.ts`
- Create: `games/salary-showdown/app/src/lib/exportSeason.test.ts`
- Create: `games/salary-showdown/app/src/components/professor/SessionSetup.tsx` (create the `src/components/professor/` directory)
- Create: `games/salary-showdown/app/src/components/professor/AdvanceControl.tsx`
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx` (created by Task 6 — anchors below quote the exact Task 6 final content: the import block at the top of the file, and the closing `)}` / `</main>` of the JSX)
- Modify: `games/salary-showdown/app/src/itest/professor.itest.tsx` (created by Task 6 with one smoke test — one import-line edit at line 1 area, two tests appended at end of file)

**Interfaces:**
- Consumes:
  - `useProfessor(): ProfessorCtx` from `src/contexts/ProfessorContext.tsx` (T6) — fields used here: `gameId: string | null`, `setGameId(id: string | null): void`, `game: GameDoc | null` (transition-GATED), `settling: boolean`, `teams: Map<string, TeamDoc>`, `bidsSubmitted: Set<string>`, `call<T = unknown>(name: string, data: unknown): Promise<T>`.
  - `PHASE_NAMES: Record<Phase, string>` from `src/lib/phaseNames.ts` (T6).
  - `TeamDoc.doneRound: number` / `TeamDoc.donePhase: string` (T6 types; backend flag from T2's `markDone`), `TeamDoc.lineupLockedRound: number` (pre-existing), `RoundDoc.boxCsv: string` (pre-existing).
  - Callables: `createGame({teamNames}) → {gameId, joinCode}`, `startSeason({gameId})`, `advancePhase({gameId, expectedPhase, expectedRound})` (pre-existing), `markDone({gameId})` (T2), `submitBids({gameId, bids})` (pre-existing, itest only).
  - `ErrorNotice` from `src/components/ui/ErrorNotice.tsx`; `db` from `src/lib/firebase.ts`; itest harness `adminDb()`, `newClient()`, `type Client` from `src/itest/harness.ts`.
- Produces (later tasks import these, never redefine):
  - `src/lib/submissionLights.ts`: `export function submittedTeamIds(phase: Phase, round: number, teams: Map<string, TeamDoc>, bidsSubmitted: Set<string>): Set<string>` — **T9's SubmissionGrid consumes this exact signature** — and `export const LIGHT_PHASES: ReadonlySet<Phase>` (the four phases that have a lights section).
  - `src/lib/exportSeason.ts`: `export function concatBoxCsv(csvs: string[]): string` (single header row, LF-joined; empty input → `''`).
  - `src/components/professor/SessionSetup.tsx`: `export function SessionSetup(): JSX-element` (no props).
  - `src/components/professor/AdvanceControl.tsx`: `export function AdvanceControl(): JSX-element` (no props).
  - `ProfessorPage.tsx` renders, in order inside `<main className="page">`: T6 header → `<SessionSetup />` → `<AdvanceControl />` → `<ExportSeasonButton />` (file-local component). T8 (TimerStrip) and T9 (SubmissionGrid) insert between `<AdvanceControl />` and `<ExportSeasonButton />`.

**Hard rules restated for this task (the contracts win over your taste — do not "improve" on these):**
- `advancePhase` callers ALWAYS send `expectedPhase` + `expectedRound`, taken from the transition-GATED game view (`useProfessor().game`), never the raw doc.
- Max 21 franchises: enforced in the panel create-game UI (count check + the exact copy below), **NOT server-side**. The server only enforces the minimum of 2.
- NO emojis anywhere in product UI (`npm run audit:ui` fails the build on one). `→ · ‹ › — …` are all outside the banned ranges and fine.
- Facts, never conclusions, in every UI string. The confirm modal lists un-submitted team NAMES only — never bid contents.
- `markDone` is a status flag, NEVER a lock; `bidsSubmitted` is PRESENCE only. The lights logic here reads flags, nothing else.
- Config `cap`/`totalRounds` are decorative (Plan 1 ruling) — never read them to decide the season length; the season is 5 rounds, hard-coded with a comment.
- Timers are advisory pacing (parent spec §13): advancing (this task's button) is what closes a phase; the confirm guard is a professor courtesy, not an enforcement mechanism.
- Commits: `feat(salary-showdown): …`, imperative, no emoji.

All commands run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app` unless stated otherwise. The itest steps need the long-lived emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`); if they are not up, start them in a separate terminal:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && npx firebase emulators:start --project salary-showdown-dev
```

- [ ] **Step 1: Write the failing unit test for `submittedTeamIds`**

  READ `src/lib/money.test.ts` first — this file copies its pattern (vitest globals, no imports of `test`/`expect`, a small fixture builder that `satisfies` the real type). Note the fixture must include `doneRound`/`donePhase` — Task 6 added them to `TeamDoc` as required fields.

  Create `src/lib/submissionLights.test.ts` with exactly:

  ```ts
  import { LIGHT_PHASES, submittedTeamIds } from './submissionLights';
  import type { TeamDoc } from '../types/models';

  const mkTeam = (over: Partial<TeamDoc>): TeamDoc => ({
    name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
    roster: [], deadMoney: [], spendLog: [], lineup: null,
    lineupLockedRound: 0, hardshipUsed: [], doneRound: 0, donePhase: '',
    ...over,
  });

  test('FRONT_OFFICE: doneRound AND donePhase must both match', () => {
    const teams = new Map<string, TeamDoc>([
      ['a', mkTeam({ doneRound: 2, donePhase: 'FRONT_OFFICE' })],
      ['b', mkTeam({ doneRound: 2, donePhase: 'FREE_AGENCY' })],  // wrong-phase flag
      ['c', mkTeam({ doneRound: 1, donePhase: 'FRONT_OFFICE' })], // stale-round flag
      ['d', mkTeam({})],                                          // never pressed
    ]);
    expect(submittedTeamIds('FRONT_OFFICE', 2, teams, new Set())).toEqual(new Set(['a']));
  });

  test('FREE_AGENCY: the same pair check, against FREE_AGENCY', () => {
    const teams = new Map<string, TeamDoc>([
      ['a', mkTeam({ doneRound: 3, donePhase: 'FREE_AGENCY' })],
      ['b', mkTeam({ doneRound: 3, donePhase: 'FRONT_OFFICE' })], // this round's FO flag
    ]);
    expect(submittedTeamIds('FREE_AGENCY', 3, teams, new Set())).toEqual(new Set(['a']));
  });

  test('AUCTION: bidsSubmitted presence only — done flags and lineup locks ignored', () => {
    const teams = new Map<string, TeamDoc>([
      ['a', mkTeam({ doneRound: 2, donePhase: 'AUCTION', lineupLockedRound: 2 })],
      ['b', mkTeam({})],
    ]);
    expect(submittedTeamIds('AUCTION', 2, teams, new Set(['b']))).toEqual(new Set(['b']));
  });

  test('LINEUP: lineupLockedRound must equal the current round', () => {
    const teams = new Map<string, TeamDoc>([
      ['a', mkTeam({ lineupLockedRound: 4 })],
      ['b', mkTeam({ lineupLockedRound: 3 })], // last round's lock
    ]);
    expect(submittedTeamIds('LINEUP', 4, teams, new Set())).toEqual(new Set(['a']));
  });

  test('no-lights phases return the empty set even when every flag is set', () => {
    const teams = new Map<string, TeamDoc>([
      ['a', mkTeam({ doneRound: 5, donePhase: 'RESULTS', lineupLockedRound: 5 })],
    ]);
    for (const phase of ['LOBBY', 'SIMULATE', 'RESULTS', 'FINALE'] as const) {
      expect(LIGHT_PHASES.has(phase)).toBe(false);
      expect(submittedTeamIds(phase, 5, teams, new Set(['a']))).toEqual(new Set());
    }
  });
  ```

- [ ] **Step 2: Run it — expect FAILURE (module does not exist)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/submissionLights.test.ts
  ```

  Expected outcome: the file FAILS to run with a resolution error — `Failed to resolve import "./submissionLights" from "src/lib/submissionLights.test.ts"`. 0 tests pass.

- [ ] **Step 3: Implement `src/lib/submissionLights.ts`**

  Full file contents:

  ```ts
  import type { Phase, TeamDoc } from '../types/models';

  // Submission lights (contracts §Panel behaviors): which teams count as
  // "submitted" for the CURRENT phase. Shared by AdvanceControl's confirm guard
  // (T7) and SubmissionGrid (T9) — one definition, imported by both. Lights are
  // STATUS ONLY: presence facts, never bid contents, and never a lock —
  // markDone is a flag, teams keep acting until the professor closes the phase.
  export const LIGHT_PHASES: ReadonlySet<Phase> =
    new Set<Phase>(['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP']);

  export function submittedTeamIds(
    phase: Phase,
    round: number,
    teams: Map<string, TeamDoc>,
    bidsSubmitted: Set<string>,
  ): Set<string> {
    const out = new Set<string>();
    for (const [teamId, t] of teams) {
      switch (phase) {
        case 'FRONT_OFFICE':
        case 'FREE_AGENCY':
          // Staleness is implicit in the (doneRound, donePhase) pair — nothing
          // ever clears it, so BOTH the round and the phase must match.
          if (t.doneRound === round && t.donePhase === phase) out.add(teamId);
          break;
        case 'AUCTION':
          // PRESENCE only: ProfessorContext sets membership from
          // private/auction.round === current round. Bid contents never reach
          // this layer.
          if (bidsSubmitted.has(teamId)) out.add(teamId);
          break;
        case 'LINEUP':
          if (t.lineupLockedRound === round) out.add(teamId);
          break;
        default:
          // LOBBY / SIMULATE / RESULTS / FINALE: no lights section — empty set.
          break;
      }
    }
    return out;
  }
  ```

- [ ] **Step 4: Run it — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/submissionLights.test.ts
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 5 passed (5)`.

- [ ] **Step 5: Write the failing unit test for `concatBoxCsv`**

  Create `src/lib/exportSeason.test.ts` with exactly:

  ```ts
  import { concatBoxCsv } from './exportSeason';

  test('empty input produces the empty string', () => {
    expect(concatBoxCsv([])).toBe('');
  });

  test('one round passes through: its header once, LF endings, trailing LF', () => {
    expect(concatBoxCsv(['h1,h2\na,1\nb,2\n'])).toBe('h1,h2\na,1\nb,2\n');
  });

  test('three rounds: single header, bodies concatenated in order, LF only', () => {
    const r1 = 'round,team\n1,Alpha\n1,Beta\n';
    const r2 = 'round,team\n2,Alpha\n';
    const r3 = 'round,team\n3,Beta'; // no trailing LF on the wire — normalised out
    expect(concatBoxCsv([r1, r2, r3]))
      .toBe('round,team\n1,Alpha\n1,Beta\n2,Alpha\n3,Beta\n');
  });
  ```

- [ ] **Step 6: Run it — expect FAILURE (module does not exist)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/exportSeason.test.ts
  ```

  Expected outcome: resolution error — `Failed to resolve import "./exportSeason" from "src/lib/exportSeason.test.ts"`. 0 tests pass.

- [ ] **Step 7: Implement `src/lib/exportSeason.ts`**

  Full file contents:

  ```ts
  // Season CSV export (design spec §5.7): concatenate the per-round boxCsv
  // payloads into one file — the header row of the first CSV exactly once, then
  // every data row from every CSV in round order. LF line endings, one trailing
  // LF. The 23-column boxCsv format is FROZEN: rows pass through verbatim, no
  // reformatting, no re-parsing.
  export function concatBoxCsv(csvs: string[]): string {
    const nonEmpty = csvs.filter((c) => c.trim().length > 0);
    if (nonEmpty.length === 0) return '';
    const out: string[] = [];
    nonEmpty.forEach((csv, i) => {
      const lines = csv.split('\n').filter((l) => l.length > 0);
      out.push(...(i === 0 ? lines : lines.slice(1)));
    });
    return `${out.join('\n')}\n`;
  }
  ```

- [ ] **Step 8: Run it — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/exportSeason.test.ts
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 3 passed (3)`.

- [ ] **Step 9: Extend `src/itest/professor.itest.tsx` with two failing panel tests**

  READ the existing `src/itest/professor.itest.tsx` (Task 6's smoke test) and `src/itest/frontoffice.itest.tsx` (the `userEvent` + modal-assert patterns copied here) first. Two edits.

  Edit 9a — imports. The file currently starts with (Task 6 final content):

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { MemoryRouter } from 'react-router-dom';
  import { httpsCallable } from 'firebase/functions';
  import { signInAnonymously } from 'firebase/auth';
  import { adminDb, driveTo, newClient, type Seeded } from './harness';
  ```

  Replace those five lines with:

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { MemoryRouter } from 'react-router-dom';
  import { httpsCallable } from 'firebase/functions';
  import { signInAnonymously } from 'firebase/auth';
  import { adminDb, driveTo, newClient, type Client, type Seeded } from './harness';
  ```

  Edit 9b — append the two tests below at the very end of the file (after the closing `}, 240000);` of the Task 6 smoke test). The rendered client IS the professor in both (createGame is called through the app's default Firebase app, so `professorUid` is the rendered tab's anonymous uid; the professor never calls `joinGame` — no membership doc, standing rule).

  ```tsx
  test('panel: create enforces the 21-franchise cap, lists franchises, starts the season', async () => {
    await signInAnonymously(auth);
    await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
    localStorage.removeItem('ss.profGameId'); // fresh panel: force the create/resume view
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

    const box = await screen.findByLabelText('team names', {}, { timeout: 20000 });
    await user.click(box);
    await user.paste(Array.from({ length: 22 }, (_, i) => `Team ${i + 1}`).join('\n'));
    await user.click(screen.getByRole('button', { name: 'Create game' }));
    // The franchise cap is enforced HERE in the panel (count check + exact copy),
    // NOT server-side (standing hard rule): the inline error renders and no game
    // was created (no session header appears).
    expect(screen.getByText(
      "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.",
    )).toBeInTheDocument();
    expect(screen.queryByLabelText('Join code')).toBeNull();

    await user.clear(box);
    await user.click(box);
    await user.paste('Alpha\nBeta\nGamma');
    await user.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(screen.getByLabelText('Join code')).toBeInTheDocument(),
      { timeout: 30000 });
    for (const nm of ['Alpha', 'Beta', 'Gamma']) {
      await waitFor(() => expect(screen.getByText(nm)).toBeInTheDocument(), { timeout: 20000 });
    }
    await user.click(await screen.findByRole('button', { name: 'Start season' }, { timeout: 20000 }));
    // startSeason lands in FREE_AGENCY R1 (Draft Night); the advance button names
    // the CONCRETE next phase from the order — Star Auction, same round.
    await screen.findByRole('button', { name: 'Advance → Star Auction · R1' }, { timeout: 30000 });
  }, 240000);

  test('panel advance: all-lights-on skips the modal; a missing submission names the team and confirm advances', async () => {
    await signInAnonymously(auth);
    await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
    const names = ['Alpha', 'Beta', 'Gamma'];
    const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({ teamNames: names })
      .then((r) => r.data as { gameId: string; joinCode: string });
    const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
    const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
    const bots: { teamId: string; gm: Client; scout: Client }[] = [];
    for (const [i, teamId] of teamIds.entries()) {
      const gm = await newClient(`gm${i}`);
      const scout = await newClient(`sc${i}`);
      await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
      await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
      bots.push({ teamId, gm, scout });
    }
    await httpsCallable(functions, 'startSeason')({ gameId }); // → FREE_AGENCY R1
    // Every GM marks done BEFORE the panel renders: all three Draft Night lights on.
    // markDone is a status flag, never a lock (T2).
    for (const bot of bots) await bot.gm.call('markDone', { gameId });

    localStorage.setItem('ss.profGameId', gameId);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

    // Happy advance: every light on → no confirm modal, straight to AUCTION.
    const advFa = await screen.findByRole('button',
      { name: 'Advance → Star Auction · R1' }, { timeout: 30000 });
    await waitFor(() => expect(screen.getByText('Submitted: 3 of 3')).toBeInTheDocument(),
      { timeout: 20000 });
    await user.click(advFa);
    expect(screen.queryByRole('dialog')).toBeNull(); // no guard when every light is on
    const advAuction = await screen.findByRole('button',
      { name: 'Advance → Lineup · R1' }, { timeout: 30000 });

    // AUCTION: exactly one team (Gamma) stays un-submitted. Rate 2.0 is round 1's
    // league minimum (minBid(1) — see harness).
    const wave = (await adminDb().doc(`games/${gameId}/auctions/1`).get()).data()!;
    await bots[0].scout.call('submitBids', { gameId,
      bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } });
    await bots[1].scout.call('submitBids', { gameId,
      bids: { [wave.stars[1 % wave.stars.length]]: { rate: 2.0, years: 1 } } });
    await waitFor(() => expect(screen.getByText('Submitted: 2 of 3')).toBeInTheDocument(),
      { timeout: 20000 });
    await user.click(advAuction);
    const dialog = await screen.findByRole('dialog');
    // Facts only: team NAMES, never bid contents.
    expect(dialog.textContent).toContain(
      "1 teams haven't submitted: Gamma. Advance anyway? Server defaults will apply.");
    await user.click(screen.getByRole('button', { name: 'Advance anyway' }));
    await screen.findByRole('button', { name: 'Advance → Simulate · R1' }, { timeout: 30000 });
  }, 240000);
  ```

- [ ] **Step 10: Run the itest file — expect 1 pass (Task 6 smoke) + 2 FAILURES**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected outcome: `Tests 2 failed | 1 passed (3)`. The cap/create test fails with `Unable to find a label with the text of: team names` (SessionSetup does not exist yet); the advance test fails the same way on `Advance → Star Auction · R1` after its 30s timeout (AdvanceControl does not exist yet). If it instead fails with connection errors, the emulators are not running.

- [ ] **Step 11: Create `src/components/professor/SessionSetup.tsx`**

  Create the `src/components/professor/` directory. Full file contents:

  ```tsx
  import { useState } from 'react';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { ErrorNotice } from '../ui/ErrorNotice';

  // HARD RULE (contracts): max 21 franchises, enforced HERE in the panel —
  // count check + this exact copy — NOT server-side. The server only enforces
  // the minimum of 2. Reason: rounds/{r} approaches Firestore's 1 MiB document
  // ceiling beyond 21 teams (parent spec).
  const CAP_COPY =
    "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.";
  const MIN_COPY = 'Enter at least 2 team names — one per line.';

  // Game lifecycle (design spec §5.2): create a game (team-names textarea, one
  // per line), resume an existing gameId, and start the season while in lobby.
  // Renders nothing once the season is running — AdvanceControl owns the game
  // from there.
  export function SessionSetup() {
    const { gameId, setGameId, game, teams, call } = useProfessor();
    const [namesText, setNamesText] = useState('');
    const [resumeId, setResumeId] = useState('');
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [busy, setBusy] = useState(false);

    if (!gameId) {
      const create = async () => {
        const names = namesText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
        if (names.length < 2) { setInlineError(MIN_COPY); return; }
        if (names.length > 21) { setInlineError(CAP_COPY); return; }
        setInlineError(null);
        setBusy(true);
        setError(null);
        try {
          const res = await call<{ gameId: string; joinCode: string }>(
            'createGame', { teamNames: names });
          setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      };
      return (
        <section className="card" style={{ marginTop: 10 }} aria-label="Session setup">
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>New session</h2>
          <textarea aria-label="team names" rows={8} value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            placeholder="One team name per line (2 to 21 teams)"
            style={{ width: '100%', boxSizing: 'border-box' }} />
          {inlineError && (
            <p className="neg" role="alert" style={{ margin: '8px 0' }}>{inlineError}</p>
          )}
          <button type="button" className="btn gold" disabled={busy}
            onClick={() => void create()}>Create game</button>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <input aria-label="game id" className="mono" value={resumeId}
              onChange={(e) => setResumeId(e.target.value)} placeholder="Existing game id"
              style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={resumeId.trim().length === 0}
              onClick={() => setGameId(resumeId.trim())}>Resume</button>
          </div>
          <ErrorNotice error={error} />
        </section>
      );
    }

    if (game?.status !== 'lobby') return null;

    const start = async () => {
      setBusy(true);
      setError(null);
      try {
        await call('startSeason', { gameId });
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="card" style={{ marginTop: 10 }} aria-label="Lobby setup">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Franchises</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[...teams.entries()].map(([id, t]) => (
            <span key={id} className="chip">{t.name}</span>
          ))}
        </div>
        <button type="button" className="btn green" style={{ marginTop: 10 }} disabled={busy}
          onClick={() => void start()}>Start season</button>
        <ErrorNotice error={error} />
      </section>
    );
  }
  ```

  Note the hooks all sit above the early returns — do not move a `useState` below `if (!gameId)`.

- [ ] **Step 12: Create `src/components/professor/AdvanceControl.tsx`**

  Full file contents:

  ```tsx
  import { useState } from 'react';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { PHASE_NAMES } from '../../lib/phaseNames';
  import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';
  import { ErrorNotice } from '../ui/ErrorNotice';
  import type { Phase } from '../../types/models';

  // Phase order within a round (contracts): FRONT_OFFICE → FREE_AGENCY →
  // AUCTION → LINEUP → SIMULATE → RESULTS → (next round's FRONT_OFFICE, or
  // FINALE after round 5). Round 1 enters at FREE_AGENCY via startSeason; the
  // order still applies from there.
  const ORDER: Phase[] = ['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP', 'SIMULATE', 'RESULTS'];
  // config.totalRounds is decorative (Plan 1 ruling: display read-only, never
  // editable, never authoritative). The season is 5 rounds, hard-coded.
  const TOTAL_ROUNDS = 5;

  function nextOf(phase: Phase, round: number): { phase: Phase; round: number } | null {
    const i = ORDER.indexOf(phase);
    if (i === -1) return null; // LOBBY / FINALE: no advance control
    if (phase === 'RESULTS') {
      return round >= TOTAL_ROUNDS
        ? { phase: 'FINALE', round }
        : { phase: 'FRONT_OFFICE', round: round + 1 };
    }
    return { phase: ORDER[i + 1], round };
  }

  type Confirm = { kind: 'missing'; names: string[] } | { kind: 'season-end' };

  // Phase control (design spec §5.3): ONE primary Advance button labelled with
  // the concrete next phase. Confirmation guards: (1) any current-phase light
  // off → modal listing the un-submitted teams BY NAME (facts only — never bid
  // contents) with explicit confirm; (2) the RESULTS·R5 → FINALE advance gets
  // its own end-the-season confirm. Force-advance is this same path — the exit
  // hooks already apply every §13 timeout default; no new backend semantics.
  export function AdvanceControl() {
    const { gameId, game, settling, teams, bidsSubmitted, call } = useProfessor();
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    if (!gameId || !game || game.status !== 'active') return null;
    const next = nextOf(game.phase, game.round);
    if (!next) return null;

    const submitted = LIGHT_PHASES.has(game.phase)
      ? submittedTeamIds(game.phase, game.round, teams, bidsSubmitted)
      : null;

    const advance = async () => {
      setBusy(true);
      setError(null);
      try {
        // HARD RULE: advancePhase callers ALWAYS send expectedPhase +
        // expectedRound, taken from the transition-GATED game view.
        await call('advancePhase',
          { gameId, expectedPhase: game.phase, expectedRound: game.round });
        setConfirm(null);
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };

    const onAdvanceClick = () => {
      setError(null);
      if (submitted) {
        const missing = [...teams.entries()]
          .filter(([teamId]) => !submitted.has(teamId))
          .map(([, t]) => t.name)
          .sort();
        if (missing.length > 0) {
          setConfirm({ kind: 'missing', names: missing });
          return;
        }
      }
      if (game.phase === 'RESULTS' && game.round >= TOTAL_ROUNDS) {
        setConfirm({ kind: 'season-end' });
        return;
      }
      void advance();
    };

    return (
      <section className="card" style={{ marginTop: 10 }} aria-label="Phase control">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn gold" disabled={settling || busy}
            onClick={onAdvanceClick}>
            {`Advance → ${PHASE_NAMES[next.phase]} · R${next.round}`}
          </button>
          {submitted && (
            <span className="muted">{`Submitted: ${submitted.size} of ${teams.size}`}</span>
          )}
        </div>
        <ErrorNotice error={error} />
        {confirm && (
          <div className="drawer" role="dialog" aria-label="confirm advance"
            style={{ position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 688, margin: '0 auto' }}>
            <p style={{ marginTop: 0 }}>
              {confirm.kind === 'missing'
                ? `${confirm.names.length} teams haven't submitted: ${confirm.names.join(', ')}. Advance anyway? Server defaults will apply.`
                : 'End the season and reveal? This cannot be undone.'}
            </p>
            <button type="button" className="btn gold" disabled={settling || busy}
              onClick={() => void advance()}>
              {confirm.kind === 'missing' ? 'Advance anyway' : 'End the season'}
            </button>{' '}
            <button type="button" className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        )}
      </section>
    );
  }
  ```

  Two deliberate notes for the transcriber, do not change them:
  - The modal copy is the contracts' exact template with N substituted — keep `"N teams haven't submitted: …"` even when N is 1; the itest asserts the literal string.
  - The `Submitted: X of N` line is a facts-only count that both the professor and the itests use as the deterministic "lights have caught up" signal; T9's grid adds the per-team dots without touching this line.

- [ ] **Step 13: Wire SessionSetup + AdvanceControl + the CSV export button into `src/pages/professor/ProfessorPage.tsx`**

  Three anchored edits against the Task 6 final content. If Task 6's file drifted, the invariants are: imports merge at the top; the three new elements render inside `<main className="page">` AFTER the session header/`{game ? … : …}` block, in the order SessionSetup → AdvanceControl → ExportSeasonButton; the `ExportSeasonButton` function is appended at the end of the file.

  Edit 13a — imports. Replace (currently the whole import block, lines 1-2):

  ```tsx
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { PHASE_NAMES } from '../../lib/phaseNames';
  ```

  with:

  ```tsx
  import { useState } from 'react';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { PHASE_NAMES } from '../../lib/phaseNames';
  import { SessionSetup } from '../../components/professor/SessionSetup';
  import { AdvanceControl } from '../../components/professor/AdvanceControl';
  import { ErrorNotice } from '../../components/ui/ErrorNotice';
  import { concatBoxCsv } from '../../lib/exportSeason';
  import type { RoundDoc } from '../../types/models';
  ```

  Edit 13b — mount the components. Replace (the end of the ProfessorPage JSX; the `)}` closes the `{game ? … : …}` ternary):

  ```tsx
        )}
      </main>
    );
  }
  ```

  with:

  ```tsx
        )}
        <SessionSetup />
        <AdvanceControl />
        <ExportSeasonButton />
      </main>
    );
  }
  ```

  Edit 13c — append the export button component at the very end of the file:

  ```tsx
  // Design spec §5.7: "Download season CSV". The panel only SUBSCRIBES to the
  // current round, so the export does one-shot getDoc reads of rounds/1..round
  // and concatenates client-side (single header row, concatBoxCsv). Rounds not
  // yet simulated simply do not exist and are skipped — exporting mid-round is
  // legal. The 23-column boxCsv format is frozen; rows pass through verbatim.
  function ExportSeasonButton() {
    const { gameId, game } = useProfessor();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    if (!gameId || !game || game.round < 1) return null;
    const { joinCode, round } = game;
    const download = async () => {
      setBusy(true);
      setError(null);
      try {
        const csvs: string[] = [];
        for (let r = 1; r <= round; r += 1) {
          const snap = await getDoc(doc(db, 'games', gameId, 'rounds', String(r)));
          if (snap.exists()) csvs.push((snap.data() as RoundDoc).boxCsv);
        }
        const blob = new Blob([concatBoxCsv(csvs)], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `salary-showdown-season-${joinCode}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="card" style={{ marginTop: 10 }} aria-label="Export">
        <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
          Download season CSV
        </button>
        <ErrorNotice error={error} />
      </section>
    );
  }
  ```

- [ ] **Step 14: Run the professor itest file — expect all 3 PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 3 passed (3)` (Task 6's smoke test + the two new ones; roughly 3-6 minutes total — two extra createGame catalog seeds plus bot joins dominate). One flaky run right after a functions-emulator edit is expected emulator behavior — re-run before investigating.

- [ ] **Step 15: Wider verification — types, full unit suite, full itest suite, UI audit**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
  ```

  Expected: exits 0, no output.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
  ```

  Expected: every unit test file passes, including the two new ones (`submissionLights.test.ts` 5 tests, `exportSeason.test.ts` 3 tests). 0 failures.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
  ```

  Expected: `Test Files 14 passed (14)` / `Tests 17 passed (17)` — 13 pre-existing files (14 tests) + `professor.itest.tsx` (3 tests: Task 6's smoke test + this task's two), 0 failures. Emulators required.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
  ```

  Expected: `audit:ui clean — <N> files scanned`. The new non-test surfaces (SessionSetup, AdvanceControl, submissionLights, exportSeason, the ProfessorPage additions) contain no emoji (`→ · — …` are outside the banned ranges), no judgment adjectives, and never read `config.timers`.

- [ ] **Step 16: Commit**

  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short games/salary-showdown/app/src
  ```

  Expected: exactly these entries — `M games/salary-showdown/app/src/itest/professor.itest.tsx`, `M games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx`, `?? games/salary-showdown/app/src/components/professor/`, `?? games/salary-showdown/app/src/lib/exportSeason.ts`, `?? games/salary-showdown/app/src/lib/exportSeason.test.ts`, `?? games/salary-showdown/app/src/lib/submissionLights.ts`, `?? games/salary-showdown/app/src/lib/submissionLights.test.ts` — nothing else. Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/app/src/components/professor/SessionSetup.tsx \
    games/salary-showdown/app/src/components/professor/AdvanceControl.tsx \
    games/salary-showdown/app/src/lib/submissionLights.ts \
    games/salary-showdown/app/src/lib/submissionLights.test.ts \
    games/salary-showdown/app/src/lib/exportSeason.ts \
    games/salary-showdown/app/src/lib/exportSeason.test.ts \
    games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx \
    games/salary-showdown/app/src/itest/professor.itest.tsx \
  && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): panel lifecycle + advance guards + season CSV export

  Plan 3a Task 7. SessionSetup: create-game textarea (one name per line,
  2..21 — the 21-franchise cap is enforced in the panel with the exact
  1 MiB-ceiling copy, NOT server-side), resume-by-gameId, and the lobby
  Start season button. AdvanceControl: one primary button labelled
  "Advance -> {PHASE_NAMES[next]} . R{n}" from the phase order, always
  sending expectedPhase + expectedRound from the transition-gated view,
  disabled while settling; confirm modal names un-submitted teams (facts
  only, shared light logic in src/lib/submissionLights.ts that T9's grid
  reuses) and the RESULTS.R5 advance gets its own end-the-season confirm.
  CSV export: one-shot getDoc reads of rounds/1..round concatenated by
  concatBoxCsv (single frozen header, LF) into a Blob download named
  salary-showdown-season-<joinCode>.csv. Unit tests for both libs; panel
  itests cover the cap copy, create->franchises->startSeason, the
  no-modal happy advance, and the named-team confirm path driven by real
  markDone/submitBids bots.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Expected: one commit on `main` touching exactly 8 files (2 modified, 6 added).

---

### Task 8: TimerStrip + auto-arm/auto-advance + LedTimer paused state

**Files:**
- Create: `games/salary-showdown/app/src/components/professor/TimerStrip.tsx`
- Modify: `games/salary-showdown/app/src/components/ui/LedTimer.tsx` (full replacement — current file is 17 lines)
- Modify: `games/salary-showdown/app/src/components/ui/PhaseHeader.tsx` (full replacement — current file is 20 lines)
- Modify: `games/salary-showdown/app/src/components/ui/ui.test.tsx` (line 7 title refresh + two appended tests)
- Modify (one-line PhaseHeader call-site edits, current line anchors):
  `games/salary-showdown/app/src/pages/LobbyPage.tsx` (line 40) ·
  `games/salary-showdown/app/src/pages/FrontOfficePage.tsx` (line 70) ·
  `games/salary-showdown/app/src/pages/FreeAgencyPage.tsx` (lines 92–93) ·
  `games/salary-showdown/app/src/pages/AuctionPage.tsx` (line 97) ·
  `games/salary-showdown/app/src/pages/LineupPage.tsx` (line 82) ·
  `games/salary-showdown/app/src/pages/SimulatePage.tsx` (line 42) ·
  `games/salary-showdown/app/src/pages/ResultsPage.tsx` (line 97) ·
  `games/salary-showdown/app/src/pages/StandingsPage.tsx` (line 44)
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx` (created by Tasks 6–7; anchored instruction below)
- Test: `games/salary-showdown/app/src/itest/professor.itest.tsx` (created by Task 7; append two tests)

**Interfaces:**
- Consumes:
  - `setTimer({gameId, action, seconds?, expectedPhase, expectedRound})` callable (Task 1). Actions `start` (seconds int 1..3600) / `pause` / `resume` / `extend` (seconds int 1..600) / `clear`; expectation mismatch throws `HttpsError('failed-precondition', 'PHASE_MISMATCH')`; returns `{timerEndsAt: millis|null, timerPausedMs: number|null}`.
  - `advancePhase({gameId, expectedPhase, expectedRound})` (existing backend).
  - `useProfessor(): ProfessorCtx` from `src/contexts/ProfessorContext.tsx` (Task 6) — uses `gameId`, `game` (transition-GATED `GameDoc | null`), `settling: boolean`, `call<T>(name, data)`.
  - `GameDoc.timerPausedMs: number | null` on `src/types/models.ts` (Task 6).
  - `PHASE_NAMES: Record<Phase, string>` from `src/lib/phaseNames.ts` (Task 6).
  - `ProfessorPage` shell + `AdvanceControl` render site (Task 7); `src/itest/professor.itest.tsx` (Task 7).
  - Harness: `adminDb()`, `newClient()`, `driveTo()`, `type Seeded` from `src/itest/harness.ts`.
- Produces (later tasks rely on these exact signatures):
  - `export function TimerStrip(): JSX-element-or-null` (no props) in `src/components/professor/TimerStrip.tsx`.
  - `export function LedTimer({ endsAt, pausedMs }: { endsAt: { toMillis(): number } | null; pausedMs?: number | null })` — Task 10's DecisionWall reuses this shared paused/off rendering.
  - `export function fmtClock(totalSeconds: number): string` from `src/components/ui/LedTimer.tsx` (mm:ss, zero-padded).
  - `PhaseHeader` gains optional `timerPausedMs?: number | null`.
  - localStorage keys (exact, panel-local): `'ss.profTimerDefaults'` (JSON `{FRONT_OFFICE:180, FREE_AGENCY:150, AUCTION:120, LINEUP:90, SIMULATE:60, RESULTS:90}`), `'ss.profAutoArm'` (`'1'`/`'0'`, default `'1'`), `'ss.profAutoAdvance'` (`'1'`/`'0'`, default `'0'`).

Hard rules restated for this task (do NOT deviate, even where it looks "cleaner"):
- `setTimer` / `advancePhase` callers ALWAYS send `expectedPhase` + `expectedRound`, taken from the transition-GATED `game` in ProfessorContext.
- Timers are advisory pacing (parent spec §13): expiry never blocks a submission server-side. The strip paces the room; it enforces nothing.
- Auto-advance swallows `PHASE_MISMATCH` ONLY (a manual Advance click or a second panel tab won the race). Every other error surfaces via `ErrorNotice`. Clients match errors on the MESSAGE string, not the kind.
- If the panel tab dies, nothing auto-advances — the game waits. Safe failure; do not add any server-side timer enforcement.
- Timer defaults are PANEL-LOCAL localStorage, never game config. `config.cap` / `config.totalRounds` stay untouched.
- NO emojis anywhere in product UI. `+30s`, `●`/`○`, `‹ ›` style glyphs are fine.
- Game-doc timer states — running: `timerEndsAt` set / `timerPausedMs` null · paused: `timerEndsAt` null / `timerPausedMs` set · off: both null. The advancePhase flip nulls BOTH.

All commands run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app`. Steps 9, 12 and 13's itest run need the live emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`). The functions emulator hot-reloads on edit: one flaky run right after an edit is expected — re-run before investigating.

- [ ] **Step 1: Failing unit tests — LedTimer paused rendering.** In `games/salary-showdown/app/src/components/ui/ui.test.tsx`, first refresh the stale Plan-2 test title. Replace line 7:

```tsx
test('LedTimer renders the steady null state (Plan 2 has no professor timers)', () => {
```

with:

```tsx
test('LedTimer renders the steady null state (timer off)', () => {
```

Then append these two tests at the very end of the file (after the `PayrollBar` test's closing `});`):

```tsx
test('LedTimer paused state renders the frozen clock plus plain "paused" text', () => {
  render(<LedTimer endsAt={null} pausedMs={95000} />);
  expect(screen.getByTestId('led')).toHaveTextContent('01:35');
  expect(screen.getByText('paused')).toBeInTheDocument();
});
test('LedTimer off state (both null) never shows "paused"', () => {
  render(<LedTimer endsAt={null} pausedMs={null} />);
  expect(screen.getByTestId('led')).toHaveTextContent('--:--');
  expect(screen.queryByText('paused')).toBeNull();
});
```

- [ ] **Step 2: Run the unit test — expect the new paused test to FAIL.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/components/ui/ui.test.tsx
```

Expected: `LedTimer paused state renders the frozen clock plus plain "paused" text` FAILS (the current component ignores the unknown `pausedMs` prop and renders `--:--`, so the `toHaveTextContent('01:35')` assertion fails). The off-state test and the three pre-existing tests pass.

- [ ] **Step 3: Implement the LedTimer paused state.** Replace the ENTIRE contents of `games/salary-showdown/app/src/components/ui/LedTimer.tsx` (currently 17 lines, whose header comment reads "timerEndsAt is ALWAYS null in Plan 2…" — that comment is stale and must go) with exactly:

```tsx
import { useEffect, useState } from 'react';

export function fmtClock(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Professor timers (Plan 3): the game doc carries live timer state.
// States — running: endsAt set, pausedMs null · paused: pausedMs set, endsAt
// null · off: both null (the advancePhase flip nulls both). Timers are advisory
// pacing (spec §13): expiry never blocks a submission server-side, so this
// component only ever displays — it enforces nothing.
export function LedTimer({ endsAt, pausedMs }: {
  endsAt: { toMillis(): number } | null;
  pausedMs?: number | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (pausedMs != null) {
    return (
      <span data-testid="led-wrap">
        <span className="led" data-testid="led">
          {fmtClock(Math.max(0, Math.floor(pausedMs / 1000)))}
        </span>
        <span className="dim" style={{ marginLeft: 6, fontSize: 12 }}>paused</span>
      </span>
    );
  }
  if (!endsAt) return <span className="led" data-testid="led">--:--</span>;
  const left = Math.max(0, Math.floor((endsAt.toMillis() - now) / 1000));
  return <span className="led" data-testid="led">{fmtClock(left)}</span>;
}
```

(The `pausedMs` prop is optional with `null`/`undefined` behaving identically to before — every existing call site keeps compiling and rendering unchanged. The paused branch renders no interval-driven state, so the clock is frozen by construction.)

- [ ] **Step 4: Run the unit test — expect PASS.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/components/ui/ui.test.tsx
```

Expected: all 5 tests in the file pass.

- [ ] **Step 5: Thread `pausedMs` through PhaseHeader.** Replace the ENTIRE contents of `games/salary-showdown/app/src/components/ui/PhaseHeader.tsx` (currently 20 lines) with exactly:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { LedTimer } from './LedTimer';

export function PhaseHeader({ title, round, timerEndsAt, timerPausedMs }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
  timerPausedMs?: number | null;
}) {
  const { pathname } = useLocation();
  return (
    <div className="phase-head">
      <div>
        <div className="brand">Salary Showdown</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>{title}{round > 0 ? ` · Round ${round}` : ''}</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {pathname !== '/standings' && <Link to="/standings" className="chip">Standings</Link>}
        <LedTimer endsAt={timerEndsAt} pausedMs={timerPausedMs ?? null} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Pass `timerPausedMs` at every PhaseHeader call site** (8 files; the prop is optional so this is a compile-safe mechanical edit, but ALL team pages must show the shared paused rendering). Exact old → new edits:

`src/pages/LobbyPage.tsx` line 40:
```tsx
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/FrontOfficePage.tsx` line 70:
```tsx
      <PhaseHeader title="Front Office" round={round} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Front Office" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/FreeAgencyPage.tsx` lines 92–93:
```tsx
      <PhaseHeader title={round === 1 ? 'Draft Night' : 'Free Agency'} round={round}
        timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title={round === 1 ? 'Draft Night' : 'Free Agency'} round={round}
        timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/AuctionPage.tsx` line 97:
```tsx
      <PhaseHeader title="Star Auction" round={round} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Star Auction" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/LineupPage.tsx` line 82:
```tsx
      <PhaseHeader title="Set Lineup" round={round} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Set Lineup" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/SimulatePage.tsx` line 42:
```tsx
      <PhaseHeader title="Simulate" round={round} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Simulate" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/ResultsPage.tsx` line 97:
```tsx
      <PhaseHeader title="Results" round={round} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Results" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

`src/pages/StandingsPage.tsx` line 44:
```tsx
      <PhaseHeader title="Standings" round={latest?.round ?? 0} timerEndsAt={game.timerEndsAt} />
```
→
```tsx
      <PhaseHeader title="Standings" round={latest?.round ?? 0} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
```

- [ ] **Step 7: Compile + unit gate.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b && npx vitest run
```

Expected: `tsc -b` exits clean (`GameDoc.timerPausedMs` exists since Task 6) and the whole unit suite passes.

- [ ] **Step 8: Failing itests — append to `src/itest/professor.itest.tsx`** (created by Task 7). First ensure the file's import block contains ALL of the following (add any line that is missing; do not duplicate ones already present):

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';
```

Then append this block at the very END of the file. (If Task 7 already defined an identical default-app professor seeding helper, still add this one — it is namespaced `seedTimerGame` and collides with nothing.)

```tsx
// ——— Task 8: timer strip + auto-arm/auto-advance ———
// The panel professor must be the DEFAULT app's signed-in user (the itest
// client that calls createGame IS the professor). seedToPhase() builds its own
// isolated prof client, so we assemble a Seeded by hand around the default app
// and reuse driveTo() for the season driving.
async function seedTimerGame(to: string): Promise<Seeded> {
  const cred = await signInAnonymously(auth);
  const prof = {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: async () => {},
  };
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const { gameId, joinCode } = await prof.call<{ gameId: string; joinCode: string }>(
    'createGame', { teamNames: names });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const bots: Seeded['bots'] = [];
  for (const i of [1, 2, 3]) {
    const gm = await newClient(`t8gm${i}`);
    const scout = await newClient(`t8sc${i}`);
    const coach = await newClient(`t8co${i}`);
    await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId: teamIds[i], gm, scout, coach });
  }
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };
  await driveTo(seeded, to);
  return seeded;
}

test('timer strip: UI-start 90s counts down, UI-pause freezes the led', async () => {
  // R2, not R1: round 1 has no FRONT_OFFICE (startSeason enters at R1:FREE_AGENCY;
  // FRONT_OFFICE exists only as the entry phase of rounds 2+). R2:FRONT_OFFICE keeps
  // the FRONT_OFFICE:90 default below, so the button reads "Start 01:30".
  const seeded = await seedTimerGame('R2:FRONT_OFFICE');
  localStorage.setItem('ss.profGameId', seeded.gameId);
  localStorage.setItem('ss.profAutoArm', '0');      // this test drives the timer by hand
  localStorage.setItem('ss.profAutoAdvance', '0');
  localStorage.setItem('ss.profTimerDefaults', JSON.stringify(
    { FRONT_OFFICE: 90, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 90, SIMULATE: 60, RESULTS: 90 }));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  await screen.findByTestId('timer-strip', {}, { timeout: 20000 });
  const strip = () => within(screen.getByTestId('timer-strip'));

  // Start uses the per-phase default read from ss.profTimerDefaults (90s here).
  await user.click(await strip().findByRole('button', { name: 'Start 01:30' }, { timeout: 10000 }));
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.timerEndsAt).not.toBeNull();
    expect(g.timerPausedMs).toBeNull();
    const ends = g.timerEndsAt.toMillis();
    expect(ends).toBeGreaterThan(Date.now() + 60_000);   // a ~90s deadline, not garbage
    expect(ends).toBeLessThanOrEqual(Date.now() + 91_000);
  }, { timeout: 15000 });

  // The panel led mirrors the countdown: it leaves --:-- and then ticks down.
  await waitFor(() => {
    expect(strip().getByTestId('led')).not.toHaveTextContent('--:--');
  }, { timeout: 15000 });
  const first = strip().getByTestId('led').textContent;
  await waitFor(() => {
    expect(strip().getByTestId('led').textContent).not.toBe(first);
  }, { timeout: 5000 });

  await user.click(strip().getByRole('button', { name: 'Pause' }));
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.timerEndsAt).toBeNull();
    expect(g.timerPausedMs).toBeGreaterThan(0);
    expect(g.timerPausedMs).toBeLessThanOrEqual(90_000);
  }, { timeout: 15000 });

  // Frozen while paused — bounded-negative pattern: the led text must NOT
  // change across a 1.2s wait (the running tick is 500ms / 1s resolution, so a
  // still-running clock would have moved at least once in that window).
  await waitFor(() => expect(strip().getByText('paused')).toBeInTheDocument(), { timeout: 10000 });
  const frozen = strip().getByTestId('led').textContent;
  await new Promise((r) => setTimeout(r, 1200));
  expect(strip().getByTestId('led').textContent).toBe(frozen);
}, 180000);

test('auto-advance: 2s timer at LINEUP advances to SIMULATE without a click', async () => {
  const seeded = await seedTimerGame('R1:LINEUP');
  // Lineups "locked" via the harness (admin status-flag writes) so every light
  // is green. This is only the doneness flag: the LINEUP exit hook still
  // validates/auto-repairs actual lineups server-side, so the flag alone is
  // safe — timers are advisory and expiry never blocks anything server-side.
  for (const teamId of seeded.teamIds) {
    await adminDb().doc(`games/${seeded.gameId}/teams/${teamId}`)
      .update({ lineupLockedRound: 1 });
  }
  localStorage.setItem('ss.profGameId', seeded.gameId);
  localStorage.setItem('ss.profAutoArm', '0');       // deterministic: we arm via the Start button
  localStorage.setItem('ss.profAutoAdvance', '1');   // the toggle under test
  localStorage.setItem('ss.profTimerDefaults', JSON.stringify(
    { FRONT_OFFICE: 180, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 2, SIMULATE: 60, RESULTS: 90 }));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  await screen.findByTestId('timer-strip', {}, { timeout: 20000 });
  const strip = () => within(screen.getByTestId('timer-strip'));

  await user.click(await strip().findByRole('button', { name: 'Start 00:02' }, { timeout: 10000 }));

  // No Advance click anywhere in this test: the strip itself fires advancePhase
  // (with expectedPhase/expectedRound from the gated game) when the timer hits 0.
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.phase).toBe('SIMULATE');
    expect(g.round).toBe(1);
  }, { timeout: 30000 });
}, 240000);
```

- [ ] **Step 9: Run the two new itests — expect FAIL (TimerStrip does not exist yet).** Emulators must be running.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx -t 'timer strip'
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx -t 'auto-advance'
```

Expected: both FAIL with `TestingLibraryElementError: Unable to find an element by: [data-testid="timer-strip"]` (timeout on the `findByTestId`). Task 7's existing tests in the file are filtered out by `-t` and do not run here.

- [ ] **Step 10: Create the TimerStrip.** New file `games/salary-showdown/app/src/components/professor/TimerStrip.tsx` with exactly:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { LedTimer, fmtClock } from '../ui/LedTimer';
import { ErrorNotice } from '../ui/ErrorNotice';
import { PHASE_NAMES } from '../../lib/phaseNames';
import type { Phase } from '../../types/models';

// Professor timer strip (design spec §5.4).
// HARD RULES — do not "improve" these away:
// - Every setTimer / advancePhase call ALWAYS sends expectedPhase +
//   expectedRound, read from the transition-GATED game.
// - Timers are advisory pacing (parent spec §13): expiry never blocks a
//   submission server-side. This strip paces the room; it enforces nothing.
// - Auto-advance swallows PHASE_MISMATCH ONLY (a manual click or a second
//   panel tab won the race); every other error surfaces in the ErrorNotice.
// - If the panel tab dies, nothing auto-advances — the game waits (safe
//   failure by design).
// - Defaults are PANEL-LOCAL (localStorage), never game config.

const DEFAULTS_KEY = 'ss.profTimerDefaults';
const AUTO_ARM_KEY = 'ss.profAutoArm';         // '1' | '0' — default '1' (on)
const AUTO_ADVANCE_KEY = 'ss.profAutoAdvance'; // '1' | '0' — default '0' (off)

export const FALLBACK_TIMER_DEFAULTS: Record<string, number> = {
  FRONT_OFFICE: 180, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 90, SIMULATE: 60, RESULTS: 90,
};
const TIMER_PHASES = Object.keys(FALLBACK_TIMER_DEFAULTS) as Phase[];

function readTimerDefaults(): Record<string, number> {
  const out: Record<string, number> = { ...FALLBACK_TIMER_DEFAULTS };
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of TIMER_PHASES) {
      const v = parsed[k];
      // setTimer 'start' bounds: integer 1..3600 (server rejects with BAD_TIMER otherwise)
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3600) out[k] = v;
    }
  } catch { /* malformed JSON in localStorage: fall back to shipped defaults */ }
  return out;
}
function readFlag(key: string, dflt: '0' | '1'): boolean {
  const v = localStorage.getItem(key);
  return (v === '0' || v === '1' ? v : dflt) === '1';
}
const isPhaseMismatch = (e: unknown) =>
  e instanceof Error && e.message.includes('PHASE_MISMATCH'); // match on MESSAGE, house rule

export function TimerStrip() {
  const { gameId, game, settling, call } = useProfessor();
  const [defaults, setDefaults] = useState<Record<string, number>>(readTimerDefaults);
  const [autoArm, setAutoArmState] = useState<boolean>(() => readFlag(AUTO_ARM_KEY, '1'));
  const [autoAdvance, setAutoAdvanceState] =
    useState<boolean>(() => readFlag(AUTO_ADVANCE_KEY, '0'));
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const armedKeyRef = useRef<string | null>(null);      // one auto-arm per (round, phase)
  const advancedForRef = useRef<number | null>(null);   // one auto-advance per deadline

  const running = game != null && game.timerEndsAt != null;
  const paused = game != null && game.timerPausedMs != null;

  const setTimer = useCallback(async (action: string, seconds?: number) => {
    if (!gameId || !game) return;
    setBusy(true); setErr(null);
    try {
      await call('setTimer', {
        gameId, action, ...(seconds != null ? { seconds } : {}),
        expectedPhase: game.phase, expectedRound: game.round,
      });
    } catch (e) {
      // PHASE_MISMATCH: an advance beat this click; the doc re-renders the strip.
      if (!isPhaseMismatch(e)) setErr(e);
    } finally { setBusy(false); }
  }, [gameId, game, call]);

  // 500ms tick while running — feeds the auto-advance zero-detection below.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Auto-arm: when (round, phase) changes and the timer is off, start the
  // per-phase default. Fires at most once per (round, phase) — the ref is
  // marked even when auto-arm is off, so toggling it mid-phase never arms
  // retroactively. The gated game keeps presenting the OLD phase while
  // settling, so the key only changes once the transition marker clears.
  useEffect(() => {
    if (!game || !gameId || settling) return;
    if (!(game.phase in FALLBACK_TIMER_DEFAULTS)) return; // LOBBY/FINALE: no timers
    const key = `${game.round}:${game.phase}`;
    if (armedKeyRef.current === key) return;
    armedKeyRef.current = key;
    if (!autoArm) return;
    if (game.timerEndsAt != null || game.timerPausedMs != null) return; // not off
    void call('setTimer', {
      gameId, action: 'start', seconds: defaults[game.phase],
      expectedPhase: game.phase, expectedRound: game.round,
    }).catch((e) => { if (!isPhaseMismatch(e)) setErr(e); });
  }, [game, gameId, settling, autoArm, defaults, call]);

  // Auto-advance: a RUNNING timer hitting 0 advances the phase, once per
  // deadline. PHASE_MISMATCH (lost to a manual click) is swallowed silently.
  useEffect(() => {
    if (!autoAdvance || !game || !gameId || settling) return;
    if (game.timerEndsAt == null) return; // paused/off timers never auto-advance
    const endsMillis = game.timerEndsAt.toMillis();
    if (endsMillis - now > 0) return;
    if (advancedForRef.current === endsMillis) return;
    advancedForRef.current = endsMillis;
    void call('advancePhase', { gameId, expectedPhase: game.phase, expectedRound: game.round })
      .catch((e) => { if (!isPhaseMismatch(e)) setErr(e); });
  }, [autoAdvance, game, gameId, settling, now, call]);

  if (!game || !(game.phase in FALLBACK_TIMER_DEFAULTS)) return null;

  const defaultSeconds = defaults[game.phase];
  const disabled = busy || settling;
  const setAutoArm = (v: boolean) => {
    localStorage.setItem(AUTO_ARM_KEY, v ? '1' : '0'); setAutoArmState(v);
  };
  const setAutoAdvance = (v: boolean) => {
    localStorage.setItem(AUTO_ADVANCE_KEY, v ? '1' : '0'); setAutoAdvanceState(v);
  };
  const openSettings = () => {
    setDraft(Object.fromEntries(TIMER_PHASES.map((k) => [k, String(defaults[k])])));
    setShowSettings(true);
  };
  const saveSettings = () => {
    const next = { ...defaults };
    for (const k of TIMER_PHASES) {
      const n = Number(draft[k]);
      if (Number.isInteger(n) && n >= 1 && n <= 3600) next[k] = n;
    }
    setDefaults(next);
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    setShowSettings(false);
  };

  return (
    <section className="card" data-testid="timer-strip">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <LedTimer endsAt={game.timerEndsAt} pausedMs={game.timerPausedMs} />
        {!running && !paused && (
          <button className="btn green" disabled={disabled}
            onClick={() => void setTimer('start', defaultSeconds)}>
            Start {fmtClock(defaultSeconds)}
          </button>
        )}
        {running && (
          <button className="btn" disabled={disabled} onClick={() => void setTimer('pause')}>
            Pause
          </button>
        )}
        {paused && (
          <button className="btn green" disabled={disabled} onClick={() => void setTimer('resume')}>
            Resume
          </button>
        )}
        {(running || paused) && (
          <button className="btn" disabled={disabled} onClick={() => void setTimer('extend', 30)}>
            +30s
          </button>
        )}
        {(running || paused) && (
          <button className="btn cut" disabled={disabled} onClick={() => void setTimer('clear')}>
            Clear
          </button>
        )}
        <label className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={autoArm}
            onChange={(e) => setAutoArm(e.target.checked)} />
          Auto-arm
        </label>
        <label className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)} />
          Auto-advance
        </label>
        <button className="btn"
          onClick={() => (showSettings ? setShowSettings(false) : openSettings())}>
          Timer settings
        </button>
      </div>
      {showSettings && (
        <div className="inset"
          style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIMER_PHASES.map((k) => (
            <label key={k} className="mono"
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {PHASE_NAMES[k]}
              <input type="number" min={1} max={3600} value={draft[k] ?? ''}
                style={{ width: 70 }}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
              s
            </label>
          ))}
          <button className="btn gold" onClick={saveSettings}>Save defaults</button>
        </div>
      )}
      <ErrorNotice error={err} />
    </section>
  );
}
```

- [ ] **Step 11: Wire TimerStrip into ProfessorPage.** Open `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx` (created in Tasks 6–7). Two anchored edits — the file's exact contents come from Task 7, so anchor on the components, not line numbers:
  1. Add this import alongside the existing professor-component imports (the lines importing `SessionSetup` / `AdvanceControl` from `'../../components/professor/…'`):
     ```tsx
     import { TimerStrip } from '../../components/professor/TimerStrip';
     ```
  2. In the JSX branch rendered when a game is loaded (the branch that renders `<AdvanceControl />` — Task 7), insert a sibling line immediately AFTER the `<AdvanceControl />` element:
     ```tsx
     <TimerStrip />
     ```
     `TimerStrip` takes no props — it reads everything from `useProfessor()`. If `<AdvanceControl />` is rendered with props, leave them untouched; only add the sibling. TimerStrip renders `null` on LOBBY/FINALE by itself, so no conditional wrapping is needed at the call site.

- [ ] **Step 12: Run the two new itests — expect PASS.** Emulators running; remember the hot-reload flake rule (one bad run right after an edit → re-run first).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
```

Expected: the whole file passes — Task 7's existing tests plus `timer strip: UI-start 90s counts down, UI-pause freezes the led` and `auto-advance: 2s timer at LINEUP advances to SIMULATE without a click`.

- [ ] **Step 13: Wider verification.**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b && npx vitest run
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
```

Expected: `tsc -b` clean; full unit suite green (including the 5 tests in `ui.test.tsx`); full itest suite green (the 14 pre-3a tests plus everything Tasks 7–8 added); `audit:ui` clean — the strip contains no emojis and no judgment copy (`+30s`, `paused`, phase names only).

- [ ] **Step 14: Commit.**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD   # verify HEAD before committing (workspace races)
cd /Users/dylanmassaro/FenriX && git add \
  games/salary-showdown/app/src/components/professor/TimerStrip.tsx \
  games/salary-showdown/app/src/components/ui/LedTimer.tsx \
  games/salary-showdown/app/src/components/ui/PhaseHeader.tsx \
  games/salary-showdown/app/src/components/ui/ui.test.tsx \
  games/salary-showdown/app/src/pages/LobbyPage.tsx \
  games/salary-showdown/app/src/pages/FrontOfficePage.tsx \
  games/salary-showdown/app/src/pages/FreeAgencyPage.tsx \
  games/salary-showdown/app/src/pages/AuctionPage.tsx \
  games/salary-showdown/app/src/pages/LineupPage.tsx \
  games/salary-showdown/app/src/pages/SimulatePage.tsx \
  games/salary-showdown/app/src/pages/ResultsPage.tsx \
  games/salary-showdown/app/src/pages/StandingsPage.tsx \
  games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx \
  games/salary-showdown/app/src/itest/professor.itest.tsx
cd /Users/dylanmassaro/FenriX && git commit -m "$(cat <<'EOF'
feat(salary-showdown): professor timer strip — auto-arm, auto-advance, LedTimer paused state

TimerStrip mirrors timerEndsAt/timerPausedMs with Start (per-phase localStorage
default, editable popover), Pause/Resume, +30s, Clear — every setTimer and
advancePhase call carries expectedPhase + expectedRound. Auto-arm (default on)
starts the phase default once per (round, phase) when the timer is off;
auto-advance (default off) fires advancePhase at 0:00 and swallows
PHASE_MISMATCH only. LedTimer gains an optional pausedMs prop (frozen mm:ss +
plain "paused" text; null behavior unchanged) threaded through PhaseHeader on
every team page. Timers stay advisory (spec 13): expiry never blocks a
submission server-side, and a dead panel tab advances nothing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: "We're done" button (FO/FA) + SubmissionGrid (panel)

**Files:**
- Create: `games/salary-showdown/app/src/components/professor/SubmissionGrid.tsx`
- Create: `games/salary-showdown/app/src/components/professor/RoundContext.tsx`
- Modify: `games/salary-showdown/app/src/pages/FrontOfficePage.tsx` (state block ~line 36; render block after `<ErrorNotice>` ~line 73)
- Modify: `games/salary-showdown/app/src/pages/FreeAgencyPage.tsx` (state block ~line 35; handler after `sign` ~line 88; render block after the sign-note ~line 115)
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx` (created T6, extended T7/T8 — wiring anchor described in Step 8)
- Test: `games/salary-showdown/app/src/itest/frontoffice.itest.tsx` (append one test)
- Test: `games/salary-showdown/app/src/itest/professor.itest.tsx` (created T7 — append one helper + one test)

**Interfaces:**
- Consumes:
  - Backend callable `markDone({gameId})` (T2) — `memberWithRole(gameId, uid, 'GM')`-gated; phase must be `FRONT_OFFICE` or `FREE_AGENCY` else `PHASE_MISMATCH`; writes `{doneRound: g.round, donePhase: g.phase}` on the caller's team doc; returns `{ok: true}`. **Status flag, NEVER a lock** — the GM keeps full signing/cutting rights after pressing, and re-pressing is idempotent.
  - `useGame()` from `src/contexts/GameContext` — `{ game, team, call, gameId, membership }` (existing).
  - `useProfessor()` from `src/contexts/ProfessorContext` (T6) — this task uses `{ game, teams, bidsSubmitted, round }` where `game: GameDoc | null` is transition-GATED, `teams: Map<string, TeamDoc>`, `bidsSubmitted: Set<string>` (teamIds whose `private/auction.round === game.round`), `round: RoundDoc | null` (`rounds/{game.round}` — null until the enter:SIMULATE hook writes it).
  - `submittedTeamIds` and `LIGHT_PHASES` from `src/lib/submissionLights.ts` (T7 Produces, Step 3 — **import, never redefine**). Exact exports this task compiles against:
    ```ts
    export const LIGHT_PHASES: ReadonlySet<Phase>;
    // = new Set<Phase>(['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP'])
    export function submittedTeamIds(
      phase: Phase, round: number, teams: Map<string, TeamDoc>, bidsSubmitted: Set<string>,
    ): Set<string>
    // Per-phase rule (contracts §Panel behaviors): FRONT_OFFICE/FREE_AGENCY →
    // teamIds with doneRound === round && donePhase === phase · AUCTION →
    // bidsSubmitted as-is · LINEUP → teamIds with lineupLockedRound === round ·
    // any other phase (LOBBY/SIMULATE/RESULTS/FINALE) → EMPTY Set.
    ```
    The "no lights section" decision is NOT the function's return value — it is `LIGHT_PHASES` membership: `SubmissionGrid` renders `null` when the current phase is not in `LIGHT_PHASES`. Do not re-implement the per-phase rule locally and do not change Task 7's file.
  - itest harness `src/itest/harness.ts` (existing): `adminDb()`, `newClient()`, `driveTo()`, types `Client`, `Seeded`.
- Produces:
  - `export function SubmissionGrid(): JSX.Element | null` in `src/components/professor/SubmissionGrid.tsx` — renders one row per team (`data-testid="submission-grid"`, per-row `data-testid={'light-' + teamId}`, text `● <name>` filled / `○ <name>` empty); returns `null` whenever the current phase is not in `LIGHT_PHASES` (LOBBY / SIMULATE / RESULTS / FINALE — the component unmounts, no empty shell). Task 10's bigscreen `DecisionWall` may import and reuse this component (Bigscreen uses the same `ProfessorProvider` per contracts).
  - `export function RoundContext(): JSX.Element | null` in `src/components/professor/RoundContext.tsx` (design spec §5 item 6) — compact read-only panel section (`data-testid="round-context"`): current standings (rank · name · W-L · point diff, in `round.standings` order) and last-round scores (`round.games` as `Home 102–98 Away` lines, team NAMES resolved via the `teams` map — `games[].home`/`away` are teamIds). Returns `null` when there is no round doc.
  - GM-facing "We're done" button on both decision pages with success note `data-testid="done-note"`, copy EXACTLY: `Marked done — you can still make changes until the phase closes.`

Hard rules restated for this task (do not "improve" on them):
- The submission grid renders **lights only — NEVER bid contents** (no rates, years, target pids, or any private submission data). The filled/empty dot is the entire disclosure.
- No lights section is rendered in SIMULATE / RESULTS / FINALE (the component unmounts, it does not render an empty shell).
- `markDone` is a status flag, never a lock: the button stays enabled after success (re-press is fine) and no control on either page becomes disabled because of it.
- Non-GM team members see **nothing new** on either page.
- Facts, never conclusions: `RoundContext` renders standings rows and score lines ONLY — no judgment labels, and the wins-per-payroll-dollar column is NOT part of this compact view (the FINALE is the sanctioned reveal).
- NO emojis anywhere in product UI. The `●` / `○` glyphs are explicitly sanctioned.
- All phase driving in tests goes through the harness, which always sends `expectedPhase` + `expectedRound` to `advancePhase`.

All commands below run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app` with the long-lived emulators already running (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`). Do not start or restart the emulators.

- [ ] **Step 1: Failing itest — GM "We're done" on FrontOfficePage**

  Append the following test to the END of `src/itest/frontoffice.itest.tsx` (all imports it needs — `render`, `screen`, `waitFor`, `userEvent`, `MemoryRouter`, `httpsCallable`, `adminDb`, `seedToPhase`, `auth`, `functions`, `signInAnonymously`, `App` — already exist at the top of that file; add nothing to the import block):

  ```tsx
  test("we're done: GM sees the button, click stamps {doneRound, donePhase}", async () => {
    const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' });
    await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
    await httpsCallable(functions, 'joinGame')({
      joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
    });
    sessionStorage.setItem('ss.gameId', seeded.gameId);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

    const btn = await screen.findByRole('button', { name: "We're done" }, { timeout: 20000 });
    await user.click(btn);

    await waitFor(() => expect(screen.getByTestId('done-note')).toHaveTextContent(
      'Marked done — you can still make changes until the phase closes.'), { timeout: 15000 });
    // Status flag, NEVER a lock: the button must still be pressable after success.
    expect(screen.getByRole('button', { name: "We're done" })).toBeEnabled();

    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.doneRound).toBe(2);
    expect(t.donePhase).toBe('FRONT_OFFICE');
  }, 120000);
  ```

- [ ] **Step 2: Run the new test — expect FAILURE (button does not exist yet)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/frontoffice.itest.tsx
  ```

  Expected: the pre-existing front-office test still passes; the new test FAILS with `TestingLibraryElementError: Unable to find role="button" and name "We're done"` (findByRole timeout). If it fails for any other reason, stop and fix that first. (One flaky run right after a functions edit is expected emulator hot-reload behavior — re-run before investigating.)

- [ ] **Step 3: FrontOfficePage — add the GM-only button**

  In `src/pages/FrontOfficePage.tsx`, two exact edits.

  Edit A — add note state. Old (line 36):
  ```tsx
    const [busy, setBusy] = useState(false);
  ```
  New:
  ```tsx
    const [busy, setBusy] = useState(false);
    const [doneNote, setDoneNote] = useState('');
  ```

  Edit B — render the button directly under the error notice. Old (lines 72–73):
  ```tsx
        {!isGM && <p className="dim">The GM acts this phase — decisions shown are read-only.</p>}
        <ErrorNotice error={err} />
  ```
  New:
  ```tsx
        {!isGM && <p className="dim">The GM acts this phase — decisions shown are read-only.</p>}
        <ErrorNotice error={err} />
        {isGM && (
          <div style={{ margin: '10px 0' }}>
            {/* markDone is a status flag, NEVER a lock (spec §4.2): the GM keeps
                acting after pressing it, and re-pressing is idempotent — so the
                button stays enabled after success. Non-GM sees nothing here. */}
            <button className="btn gold" disabled={busy}
              onClick={() => void act(async () => {
                await call('markDone', { gameId });
                setDoneNote('Marked done — you can still make changes until the phase closes.');
              })}>
              {"We're done"}
            </button>
            {doneNote && (
              <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>{doneNote}</p>
            )}
          </div>
        )}
  ```

- [ ] **Step 4: FreeAgencyPage — same button, same copy**

  In `src/pages/FreeAgencyPage.tsx`, three exact edits.

  Edit A — add note state. Old (line 35):
  ```tsx
    const [busy, setBusy] = useState(false);
  ```
  New:
  ```tsx
    const [busy, setBusy] = useState(false);
    const [doneNote, setDoneNote] = useState('');
  ```

  Edit B — add the handler directly after the existing `sign` function. Old (lines 80–88):
  ```tsx
    const sign = async () => {
      if (!selRow) return;
      setBusy(true); setErr(null); setNote('');
      try {
        await call('signPlayer', { gameId, pid: selRow.pid, years: Math.min(years, my) });
        // NON-EXCLUSIVE (spec §4.2): the row stays exactly as it is — never grey it.
        setNote(`Signed ${selRow.name} — ${fmtM(rate)}/rd × ${Math.min(years, my)}. He remains available to every team.`);
      } catch (e) { setErr(e); } finally { setBusy(false); }
    };
  ```
  New:
  ```tsx
    const sign = async () => {
      if (!selRow) return;
      setBusy(true); setErr(null); setNote('');
      try {
        await call('signPlayer', { gameId, pid: selRow.pid, years: Math.min(years, my) });
        // NON-EXCLUSIVE (spec §4.2): the row stays exactly as it is — never grey it.
        setNote(`Signed ${selRow.name} — ${fmtM(rate)}/rd × ${Math.min(years, my)}. He remains available to every team.`);
      } catch (e) { setErr(e); } finally { setBusy(false); }
    };

    // markDone is a status flag, NEVER a lock (spec §4.2): signing stays open
    // after pressing it and re-pressing is idempotent.
    const markDone = async () => {
      setBusy(true); setErr(null);
      try {
        await call('markDone', { gameId });
        setDoneNote('Marked done — you can still make changes until the phase closes.');
      } catch (e) { setErr(e); } finally { setBusy(false); }
    };
  ```

  Edit C — render the button under the sign note. Old (lines 114–115):
  ```tsx
        <ErrorNotice error={err} />
        {note && <p className="ok" data-testid="sign-note">{note}</p>}
  ```
  New:
  ```tsx
        <ErrorNotice error={err} />
        {note && <p className="ok" data-testid="sign-note">{note}</p>}
        {isGM && (
          <div style={{ margin: '10px 0' }}>
            <button className="btn gold" disabled={busy} onClick={() => void markDone()}>
              {"We're done"}
            </button>
            {doneNote && (
              <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>{doneNote}</p>
            )}
          </div>
        )}
  ```

  Non-GM members see nothing new on either page (both blocks are inside `isGM &&`); the existing "The GM signs this phase." drawer copy is untouched.

- [ ] **Step 5: Run the front-office itest — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/frontoffice.itest.tsx
  ```

  Expected: both tests in the file pass (2 passed).

- [ ] **Step 6: Failing itest — SubmissionGrid lights on the professor panel**

  Append the following to the END of `src/itest/professor.itest.tsx` (file created by Task 7). Add ONLY the imports that are missing from the file's existing import block; every name below is needed by this test:

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { MemoryRouter } from 'react-router-dom';
  import { httpsCallable } from 'firebase/functions';
  import { signInAnonymously } from 'firebase/auth';
  import { adminDb, driveTo, newClient, type Client, type Seeded } from './harness';
  import { auth, functions } from '../lib/firebase';
  import App from '../App';
  ```

  Then the helper and test (if Task 7 already defines a helper that (a) makes the DEFAULT app's signed-in user the professor via `httpsCallable(functions, 'createGame')` AND (b) fills GM+Scout+Coach bots on EVERY team, reuse it and skip `seedProfGame`; otherwise add this verbatim):

  ```tsx
  // The rendered panel's call() goes through the default app, so the DEFAULT
  // app's anonymous user must BE the professor (contracts: the itest client that
  // calls createGame IS the professor). seedToPhase() can't be used here — its
  // professor is a separate harness client. The prof shim below satisfies the
  // harness Client shape so driveTo() works unchanged (it always sends
  // expectedPhase + expectedRound to advancePhase — RULING unchanged).
  async function seedProfGame(names: string[]): Promise<Seeded> {
    const cred = await signInAnonymously(auth);
    const { gameId, joinCode } = (await httpsCallable(functions, 'createGame')({
      teamNames: names })).data as { gameId: string; joinCode: string };
    const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
    const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
    const prof: Client = {
      uid: cred.user.uid,
      call: <T,>(fn: string, data: unknown) =>
        httpsCallable(functions, fn)(data).then((r) => r.data as T),
      dispose: async () => {},
    };
    const bots: Seeded['bots'] = [];
    for (const [i, teamId] of teamIds.entries()) {
      const gm = await newClient(`pgm${i}`);
      const scout = await newClient(`psc${i}`);
      const coach = await newClient(`pco${i}`);
      await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
      await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
      await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
      bots.push({ teamId, gm, scout, coach });
    }
    return { gameId, joinCode, teamIds, prof, bots };
  }

  test('submission grid: lights track markDone, bids, lineup locks; absent in SIMULATE; round context at RESULTS', async () => {
    const seeded = await seedProfGame(['Alpha', 'Beta']);
    // Round 1 has NO FRONT_OFFICE — startSeason enters at R1:FREE_AGENCY
    // (FRONT_OFFICE exists only rounds 2+). markDone and the doneRound/donePhase
    // light rule apply identically in FREE_AGENCY.
    await driveTo(seeded, 'R1:FREE_AGENCY');
    localStorage.setItem('ss.profGameId', seeded.gameId);
    render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
    const [alphaId, betaId] = seeded.teamIds;

    // FREE_AGENCY: grid renders, both lights empty.
    await waitFor(() => {
      expect(screen.getByTestId(`light-${alphaId}`)).toHaveTextContent('○ Alpha');
      expect(screen.getByTestId(`light-${betaId}`)).toHaveTextContent('○ Beta');
    }, { timeout: 20000 });

    // Harness GM marks done → only Alpha's light fills.
    await seeded.bots[0].gm.call('markDone', { gameId: seeded.gameId });
    await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
      .toHaveTextContent('● Alpha'), { timeout: 15000 });
    expect(screen.getByTestId(`light-${betaId}`)).toHaveTextContent('○ Beta');

    // AUCTION: lights reset (phase-scoped), then a Scout's bid fills Alpha's.
    await driveTo(seeded, 'R1:AUCTION');
    await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
      .toHaveTextContent('○ Alpha'), { timeout: 20000 });
    const wave = (await adminDb().doc(
      `games/${seeded.gameId}/auctions/1`).get()).data()!;
    await seeded.bots[0].scout.call('submitBids', { gameId: seeded.gameId,
      bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } });
    await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
      .toHaveTextContent('● Alpha'), { timeout: 15000 });
    // Lights only — the grid must NEVER surface bid contents.
    expect(screen.getByTestId('submission-grid').textContent).not.toContain('2.0');

    // LINEUP: harness leaves lineups to the exit hook's auto-repair, so the
    // light needs an explicit Coach submitLineup (full 5+sixth+rest assignment;
    // validateLineup requires EVERY active pid assigned and 2G/2W/1B starters).
    await driveTo(seeded, 'R1:LINEUP');
    await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
      .toHaveTextContent('○ Alpha'), { timeout: 20000 });
    const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
    const posOf = new Map(cat.docs.map((d) => [Number(d.id), d.data().position as string]));
    const alpha = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${alphaId}`).get()).data()!;
    const pids: number[] = alpha.roster
      .filter((c: { startRound: number; years: number }) => c.startRound + c.years - 1 >= 1)
      .map((c: { pid: number }) => c.pid);
    const byPos: Record<string, number[]> = { G: [], W: [], B: [] };
    for (const pid of pids) byPos[posOf.get(pid)!].push(pid);
    const starters = [byPos.G[0], byPos.G[1], byPos.W[0], byPos.W[1], byPos.B[0]];
    const rest = pids.filter((p) => !starters.includes(p));
    await seeded.bots[0].coach.call('submitLineup', { gameId: seeded.gameId,
      lineup: { starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' } });
    await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
      .toHaveTextContent('● Alpha'), { timeout: 15000 });

    // SIMULATE: no lights section at all.
    await driveTo(seeded, 'R1:SIMULATE');
    await waitFor(() =>
      expect(screen.queryByTestId('submission-grid')).toBeNull(), { timeout: 20000 });

    // RESULTS: RoundContext renders facts from rounds/1 — a standings row
    // (rank · name · W-L · point diff) and a score line (names, not teamIds).
    await driveTo(seeded, 'R1:RESULTS');
    await waitFor(() => {
      const ctx = screen.getByTestId('round-context');
      expect(ctx.textContent).toMatch(/1 · (Alpha|Beta) · \d+-\d+ · [+-]?\d+/);
      expect(ctx.textContent).toMatch(/(Alpha|Beta) \d+–\d+ (Alpha|Beta)/);
    }, { timeout: 20000 });
  }, 240000);
  ```

- [ ] **Step 7: Run the professor itest — expect the new test to FAIL**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected: Task 7/8's existing tests still pass; the new test FAILS at the first `waitFor` with `Unable to find an element by: [data-testid="light-<id>"]` (the grid does not exist yet).

- [ ] **Step 8: Create SubmissionGrid + RoundContext and wire them into ProfessorPage**

  Create `src/components/professor/SubmissionGrid.tsx` with EXACTLY:

  ```tsx
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';

  // Submission grid (design spec §5.5): one row per team, one light for the
  // CURRENT phase. Lights only — this component must NEVER render bid contents
  // (rates, years, target pids) or any other private submission data; the
  // filled/empty dot is the entire disclosure. submittedTeamIds (Task 7) owns
  // the per-phase rule; LIGHT_PHASES (also Task 7) names the four phases that
  // have a lights section — outside them (LOBBY / SIMULATE / RESULTS / FINALE)
  // this renders nothing at all, not an empty shell. ● / ○ are sanctioned
  // glyphs, not emojis.
  export function SubmissionGrid() {
    const { game, teams, bidsSubmitted } = useProfessor();
    if (!game) return null;
    if (!LIGHT_PHASES.has(game.phase)) return null;
    const lit = submittedTeamIds(game.phase, game.round, teams, bidsSubmitted);
    const rows = [...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
    return (
      <section className="card" data-testid="submission-grid" style={{ marginTop: 12 }}>
        <strong>Submissions</strong>
        <span className="mono muted" style={{ marginLeft: 8, fontSize: 13 }}>
          {lit.size} of {rows.length} in
        </span>
        {rows.map(([teamId, t]) => (
          <div key={teamId} data-testid={`light-${teamId}`}
            style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
            <span className={lit.has(teamId) ? 'ok' : 'dim'} style={{ marginRight: 8 }}>
              {lit.has(teamId) ? '●' : '○'}
            </span>
            {/* Explicit space text node: JSX strips the bare newline between the
                two spans, and the Step 6 tests (and the '● <name>' text contract
                in Produces) assert textContent '● Alpha' WITH a space. The flex
                row ignores this node visually (marginRight above provides the
                gap) but it is part of textContent. Do not remove. */}
            {' '}
            <span>{t.name}</span>
          </div>
        ))}
      </section>
    );
  }
  ```

  Then create `src/components/professor/RoundContext.tsx` with EXACTLY:

  ```tsx
  import { useProfessor } from '../../contexts/ProfessorContext';

  // Round context (design spec §5 item 6): compact READ-ONLY facts from the
  // current round doc — current standings and last-round scores. Facts, never
  // conclusions (hard rule): no judgment labels, and the wins-per-payroll-
  // dollar column is NOT part of this compact view (the FINALE is the
  // sanctioned reveal). games[].home/away are teamIds, NOT names — resolve
  // through the teams map. rounds/{game.round} does not exist until the
  // enter:SIMULATE hook writes it, so this renders nothing until then.
  export function RoundContext() {
    const { round, teams } = useProfessor();
    if (!round) return null;
    const nameOf = (teamId: string) => teams.get(teamId)?.name ?? teamId;
    return (
      <section className="card" data-testid="round-context" style={{ marginTop: 12 }}>
        <strong>Standings</strong>
        {round.standings.map((row) => (
          <div key={row.teamId} data-testid={`standing-${row.teamId}`} className="mono"
            style={{ marginTop: 4, fontSize: 13 }}>
            {`${row.rank} · ${row.name} · ${row.wins}-${row.losses} · ${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}`}
          </div>
        ))}
        <strong style={{ display: 'block', marginTop: 10 }}>Last round</strong>
        {round.games.map((g) => (
          <div key={g.game_id} data-testid={`score-${g.game_id}`} className="mono"
            style={{ marginTop: 4, fontSize: 13 }}>
            {`${nameOf(g.home)} ${g.homeScore}–${g.awayScore} ${nameOf(g.away)}`}
          </div>
        ))}
      </section>
    );
  }
  ```

  Then wire both into `src/pages/professor/ProfessorPage.tsx`:
  1. Add to the import block (alongside the existing professor-component imports such as `AdvanceControl` / `TimerStrip`):
     ```tsx
     import { SubmissionGrid } from '../../components/professor/SubmissionGrid';
     import { RoundContext } from '../../components/professor/RoundContext';
     ```
  2. In the connected-game branch of the JSX (the branch that renders when a game is selected — the same region where `<AdvanceControl />` (T7) and `<TimerStrip />` (T8) render), insert on their own lines immediately AFTER `<TimerStrip />`:
     ```tsx
     <SubmissionGrid />
     <RoundContext />
     ```
     If `<TimerStrip />` is not rendered in that branch, insert immediately after `<AdvanceControl />` instead. Insert exactly one of each; both self-hide (SubmissionGrid in phases outside LIGHT_PHASES, RoundContext while no round doc exists), so neither needs a conditional wrapper.

- [ ] **Step 9: Run the professor itest — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
  ```

  Expected: all tests in the file pass, including the new grid test. (One flaky run right after a functions-emulator hot reload is expected — re-run before investigating.)

- [ ] **Step 10: Wider verification**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
  ```

  Expected: `tsc -b` clean (no output) · `audit:ui` clean (the new button copy and ●/○ glyphs must pass the emoji/judgment tripwires) · app unit suite green · full itest suite green (the 14 pre-Plan-3a tests plus every Plan 3a test landed so far).

- [ ] **Step 11: Commit**

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/app/src/components/professor/SubmissionGrid.tsx \
    games/salary-showdown/app/src/components/professor/RoundContext.tsx \
    games/salary-showdown/app/src/pages/FrontOfficePage.tsx \
    games/salary-showdown/app/src/pages/FreeAgencyPage.tsx \
    games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx \
    games/salary-showdown/app/src/itest/frontoffice.itest.tsx \
    games/salary-showdown/app/src/itest/professor.itest.tsx
  git -C /Users/dylanmassaro/FenriX commit -m "feat(salary-showdown): GM 'We're done' flag + panel submission lights

FrontOfficePage/FreeAgencyPage gain a GM-only 'We're done' button calling
markDone — a status flag, never a lock; non-GM screens unchanged.
SubmissionGrid renders one light per team from submittedTeamIds (lights
only, never bid contents; no section outside LIGHT_PHASES) and RoundContext
renders read-only standings + last-round score facts; both wired into
ProfessorPage. Itests cover the doneRound/donePhase stamp and the light
lifecycle across FREE_AGENCY, AUCTION, LINEUP, SIMULATE, and RESULTS."
  ```

  Note the pre-commit memory rule for this workspace: an external process races HEAD here — run `git -C /Users/dylanmassaro/FenriX rev-parse HEAD` before and after the commit and confirm HEAD advanced by exactly your commit.

---

### Task 10: BigscreenPage shell + LobbyWall + DecisionWall + /bigscreen route

**Files:**
- Create: `games/salary-showdown/app/src/itest/bigscreen.itest.tsx`
- Create: `games/salary-showdown/app/src/styles/bigscreen.css`
- Create: `games/salary-showdown/app/src/components/bigscreen/LobbyWall.tsx`
- Create: `games/salary-showdown/app/src/components/bigscreen/DecisionWall.tsx`
- Create: `games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx`
- Modify: `games/salary-showdown/app/src/App.tsx` — two anchored insertions in the code Task 6 added: one import line below `import ProfessorPage from './pages/professor/ProfessorPage';`, and one two-line `<Route>` entry below the two-line `/professor` route. T6 wraps the `/professor` route ELEMENT in `ProfessorProvider` (not the `<Routes>` block); the new `/bigscreen` route's element gets the identical wrapping.

**Interfaces:**

*Consumes (must already exist exactly as below — T6 and T8 produce them):*
- `useProfessor()` from `src/contexts/ProfessorContext.tsx` (T6), returning the contract `ProfessorCtx`; the fields this task reads:
  ```ts
  game: GameDoc | null;           // transition-GATED: while a transition marker is set the
                                  // provider presents fromRound/fromPhase (§3a rule), so the
                                  // wall never renders a phase whose data does not exist yet
  teams: Map<string, TeamDoc>;
  players: Map<string, PlayerSeat>;   // key = uid
  bidsSubmitted: Set<string>;         // teamIds with private/auction.round === game.round
  ```
- `PHASE_NAMES: Record<Phase, string>` from `src/lib/phaseNames.ts` (T6) — LOBBY 'Lobby' · FRONT_OFFICE 'Front Office' · FREE_AGENCY 'Draft Night' · AUCTION 'Star Auction' · LINEUP 'Lineup' · SIMULATE 'Simulate' · RESULTS 'Results' · FINALE 'Finale'.
- `submittedTeamIds(phase: Phase, round: number, teams: Map<string, TeamDoc>, bidsSubmitted: Set<string>): Set<string>` and `LIGHT_PHASES: ReadonlySet<Phase>` from `src/lib/submissionLights.ts` (T7 Step 3) — the ONE definition of the submission-light rules, already unit-tested by T7 and consumed by T9's SubmissionGrid. This task must NOT re-implement it.
- Types from `src/types/models.ts` including the T6 additions: `GameDoc.timerPausedMs: number | null`, `TeamDoc.doneRound: number` / `.donePhase: string`, `PlayerSeat { teamId: string; role: Role; displayName: string }`, plus existing `Phase`, `TeamDoc.lineupLockedRound`.
- `LedTimer({ endsAt, pausedMs }: { endsAt: { toMillis(): number } | null; pausedMs?: number | null })` from `src/components/ui/LedTimer.tsx` (T8 added the optional `pausedMs` prop; null/undefined behavior unchanged — off state renders `--:--`).
- Itest harness `src/itest/harness.ts` (exists today, unmodified): `adminDb()`, `newClient()`, `driveTo(seeded, to)`, `type Seeded`.
- App.tsx anchors produced by T6 (Edit 7a/7b): the `import { ProfessorProvider } from './contexts/ProfessorContext';` line (so this task adds NO provider import), the `import ProfessorPage from './pages/professor/ProfessorPage';` line, and the two-line `/professor` route inside the `<Routes>` block:
  ```tsx
          <Route path="/professor"
            element={<ProfessorProvider><ProfessorPage /></ProfessorProvider>} />
  ```
  The provider wraps the route ELEMENT, not the `<Routes>` block. Note the real App.tsx nesting: the `<Routes>` block sits INSIDE `GameProvider` (which stays dormant for the professor — no `ss.gameId` in sessionStorage), which sits inside `AuthProvider`. GameProvider itself is untouched.

*Produces (later tasks rely on these exact shapes):*
- `export default function BigscreenPage()` at `src/pages/bigscreen/BigscreenPage.tsx` with a **complete and final** mode switch on the gated phase. T11 replaces ONLY the bodies of the `case 'SIMULATE'` and `case 'RESULTS'` returns (with `<SimulateFlood />` / `<StandingsShuffle />`); T13 replaces ONLY the `case 'FINALE'` return (with `<FinaleWall />`). The switch statement itself, the no-game idle card, and the LOBBY/decision cases must not be restructured by later tasks.
- `export function LobbyWall()` at `src/components/bigscreen/LobbyWall.tsx` (no props; reads `useProfessor()`).
- `export function DecisionWall()` at `src/components/bigscreen/DecisionWall.tsx`. The submission-light logic is NOT redefined here: DecisionWall imports `submittedTeamIds` (and `LIGHT_PHASES`) from `src/lib/submissionLights.ts` — T7 owns the single definition (positional signature `submittedTeamIds(phase, round, teams, bidsSubmitted)`).
- Route `/bigscreen` in `App.tsx` whose element is `<ProfessorProvider><BigscreenPage /></ProfessorProvider>` (element-level wrapping, identical to `/professor`).
- CSS classes `bigscreen`, `bs-center`, `bs-brand`, `bs-joincode`, `bs-joinline`, `bs-seats`, `bs-teamgrid`, `bs-teamcard`, `bs-chips`, `bs-head`, `bs-phase-title`, `bs-sub`, `bs-led`, `bs-lights`, `bs-light-row`, `bs-dot` in `src/styles/bigscreen.css` (T11/T13 walls reuse `bigscreen`, `bs-brand`, `bs-phase-title`, `bs-sub`).
- `src/itest/bigscreen.itest.tsx` — T11 appends further tests to this file; do not rename its existing test.

**Hard rules restated for this task (do not "improve" them away):**
- NO emojis anywhere in product UI. The submission dots are the glyphs `●` / `○` (glyphs are fine); do not substitute emoji circles or checkmarks.
- The bigscreen is **display-only**: no buttons, no links, no click handlers, no inputs. It shows facts, never conclusions (team names + filled/empty dots — public information by design; NEVER bid contents, amounts, or targets).
- Mode is a function of the **transition-gated** phase from `useProfessor().game` — the provider already applies the §3a gate; BigscreenPage must NOT read any raw/ungated phase.
- Timers are advisory pacing (parent spec §13): the wall renders whatever `timerEndsAt`/`timerPausedMs` say and nothing else — a timer at 0:00 changes nothing on this surface.
- `advancePhase` callers ALWAYS send `expectedPhase` + `expectedRound` — the itest drives phases exclusively through the harness `driveTo`, which already obeys this.

---

- [ ] **Step 1: Write the failing integration test** — create `games/salary-showdown/app/src/itest/bigscreen.itest.tsx` with exactly:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

// The rendered client IS the professor: it calls createGame with its own uid.
// The professor holds no players/{uid} membership doc, so GameProvider/PhaseRouter
// stay dormant and ProfessorProvider is the only live data layer on /bigscreen.
test('bigscreen: lobby wall fills seats live, then flips to the decision wall', async () => {
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  const created = await httpsCallable(functions, 'createGame')({ teamNames: ['Alpha', 'Beta'] });
  const { gameId, joinCode } = created.data as { gameId: string; joinCode: string };
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = ['Alpha', 'Beta'].map(
    (nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);

  localStorage.setItem('ss.profGameId', gameId);
  render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);

  // LobbyWall: giant join code, join URL line, seat counter (2 teams -> 6 seats).
  await waitFor(() => {
    expect(screen.getByTestId('bs-joincode')).toHaveTextContent(joinCode);
    expect(screen.getByText(
      `join at ${window.location.origin}/?code=${joinCode}`)).toBeInTheDocument();
    expect(screen.getByText('0 of 6 seats filled')).toBeInTheDocument();
  }, { timeout: 20000 });

  // A GM claims a seat -> that chip flips from open to the display name, counter ticks.
  const gm = await newClient('bs-gm');
  await gm.call('joinGame',
    { joinCode, teamId: teamIds[0], role: 'GM', displayName: 'Casey' });
  await waitFor(() => {
    expect(screen.getByText('GM: Casey')).toBeInTheDocument();
    expect(screen.getByText('1 of 6 seats filled')).toBeInTheDocument();
  }, { timeout: 15000 });

  // Drive to R2:FRONT_OFFICE. Round 1 has NO Front Office phase — startSeason opens
  // the season at R1:FREE_AGENCY (game.js startSeason), so Front Office first exists
  // in round 2. Zero bots is fine: the FREE_AGENCY exit hook hardship-signs every
  // roster-short team and the LINEUP exit auto-repair carries every team — the same
  // no-member-team path frontoffice.itest.tsx already relies on for Alpha.
  const prof: Seeded['prof'] = {
    uid: auth.currentUser!.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: () => Promise.resolve(),
  };
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots: [] };
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  // DecisionWall: student-vocabulary phase title, round line, idle LED, a row per team.
  await waitFor(() => {
    expect(screen.getByText('Front Office')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByTestId('led')).toHaveTextContent('--:--');
    const lights = screen.getByTestId('bs-lights');
    expect(lights).toHaveTextContent('Alpha');
    expect(lights).toHaveTextContent('Beta');
  }, { timeout: 30000 });

  // Spec §9 two-client freeze, wall side: the professor harness client starts a
  // 90s timer then pauses it; the RENDERED bigscreen must show a frozen mm:ss
  // plus the plain "paused" text (T8's LedTimer pausedMs prop). This complements
  // T8's panel-side freeze test so BOTH rendered client types are covered.
  // setTimer callers ALWAYS send expectedPhase + expectedRound (hard rule).
  await prof.call('setTimer', { gameId, action: 'start', seconds: 90,
    expectedPhase: 'FRONT_OFFICE', expectedRound: 2 });
  await prof.call('setTimer', { gameId, action: 'pause',
    expectedPhase: 'FRONT_OFFICE', expectedRound: 2 });
  let frozen = '';
  await waitFor(() => {
    const led = screen.getByTestId('led');
    // 90s minus the start→pause round trip, floor + zero-pad (LedTimer format).
    expect(led).toHaveTextContent(/01:(2[0-9]|30)/);
    expect(screen.getByText('paused')).toBeInTheDocument();
    frozen = led.textContent ?? '';
  }, { timeout: 15000 });
  // Frozen means frozen: the readout must not tick while paused.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(screen.getByTestId('led').textContent).toBe(frozen);
}, 180000);
```

- [ ] **Step 2: Run the new itest — expect failure** (emulators must already be running: Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/bigscreen.itest.tsx
```

Expected outcome: **1 failed**. The `/bigscreen` route does not exist yet, so the render produces an empty page and the first `waitFor` times out after 20s with `Unable to find an element by: [data-testid="bs-joincode"]`. (If it instead fails on `createGame`, the emulators are not up — start them before proceeding.)

- [ ] **Step 3: Create the bigscreen stylesheet** — create `games/salary-showdown/app/src/styles/bigscreen.css` with exactly:

```css
/* Bigscreen (projector) — Plan 3a Task 10. Display-only wall: dark, high-contrast,
   big type, zero interactivity. Color tokens come from arena.css :root; this file
   adds bs-* layout only. Type sizes use clamp() so the same wall reads on a 720p
   classroom projector and a 4K panel. */
.bigscreen { min-height: 100vh; padding: 4vh 5vw; display: flex; flex-direction: column;
  gap: 3vh; }
.bs-center { align-items: center; justify-content: center; text-align: center; }
/* Chips on the wall are status labels, not controls — kill the pointer affordance. */
.bigscreen .chip { cursor: default; font-size: clamp(14px, 1.6vw, 24px); padding: 6px 16px; }
.bs-brand { font-size: clamp(22px, 3vw, 44px); }
.bs-joincode { font-size: clamp(72px, 16vw, 220px); font-weight: 800; color: var(--gold);
  letter-spacing: 0.12em; line-height: 1; }
.bs-joinline { font-size: clamp(18px, 2.4vw, 36px); color: var(--text); margin: 0; }
.bs-seats { font-size: clamp(16px, 2vw, 30px); color: var(--muted); margin: 0; }
.bs-teamgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px; width: 100%; }
.bs-teamcard { background: linear-gradient(180deg, var(--card-a), var(--card-b));
  border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: left; }
.bs-teamcard h2 { margin: 0 0 10px; font-size: clamp(18px, 2vw, 30px); }
.bs-chips { display: flex; gap: 10px; flex-wrap: wrap; }
.bs-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.bs-phase-title { margin: 4px 0 0; font-size: clamp(40px, 7vw, 96px);
  text-transform: uppercase; letter-spacing: 0.04em; }
.bs-sub { font-size: clamp(20px, 2.6vw, 40px); color: var(--muted); margin: 4px 0 0; }
.bs-led .led { font-size: clamp(56px, 9vw, 140px); padding: 12px 32px; border-width: 3px;
  border-radius: 12px; }
.bs-lights { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px 28px; }
.bs-light-row { display: flex; align-items: center; gap: 14px;
  font-size: clamp(22px, 3vw, 44px); }
.bs-dot { font-size: 0.9em; line-height: 1; }
```

- [ ] **Step 4: Create LobbyWall** — create `games/salary-showdown/app/src/components/bigscreen/LobbyWall.tsx` with exactly:

```tsx
import { useProfessor } from '../../contexts/ProfessorContext';
import type { Role } from '../../types/models';

const ROLES: Role[] = ['GM', 'Scout', 'Coach'];

// Projector lobby wall. Display-only: giant join code (the professor reads this
// aloud if the wall dies), the join URL, a live seat counter, and one card per
// franchise with GM/Scout/Coach chips filling in as seats are claimed.
// No emojis; no interactive elements.
export function LobbyWall() {
  const { game, teams, players } = useProfessor();
  if (!game) return null;
  const seatTotal = game.teamCount * 3;
  const claimed = [...players.values()];
  return (
    <main className="bigscreen bs-center">
      <div className="brand bs-brand">Salary Showdown</div>
      <div className="mono bs-joincode" data-testid="bs-joincode">{game.joinCode}</div>
      <p className="bs-joinline">join at {window.location.origin}/?code={game.joinCode}</p>
      <p className="bs-seats">{claimed.length} of {seatTotal} seats filled</p>
      <div className="bs-teamgrid">
        {[...teams.entries()].map(([tid, t]) => (
          <section key={tid} className="bs-teamcard">
            <h2>{t.name}</h2>
            <div className="bs-chips">
              {ROLES.map((role) => {
                const seat = claimed.find((p) => p.teamId === tid && p.role === role);
                return (
                  <span key={role} className={seat ? 'chip on' : 'chip'}>
                    {role}: {seat ? seat.displayName : 'open'}
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create DecisionWall** — create `games/salary-showdown/app/src/components/bigscreen/DecisionWall.tsx` with exactly:

```tsx
import { useProfessor } from '../../contexts/ProfessorContext';
import { LedTimer } from '../ui/LedTimer';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';

// Submission-light rules live in src/lib/submissionLights.ts (T7) — ONE
// definition shared by the panel's confirm guard (T7), SubmissionGrid (T9) and
// this wall. BigscreenPage's mode switch guarantees DecisionWall only renders
// for FRONT_OFFICE / FREE_AGENCY / AUCTION / LINEUP — exactly T7's
// LIGHT_PHASES — so the shared function applies directly; the LIGHT_PHASES
// check below is a consistency guard that can never fire under that switch.

// Projector wall for the four decision phases (FO / FA / Auction / Lineup).
// Facts only, display-only: phase title in student vocabulary, round, a huge
// LedTimer (timers are advisory pacing — 0:00 changes nothing here), and one
// light per team: name + filled/empty dot. The dots are the glyphs ● / ○ (no
// emojis) and NEVER reveal bid contents — presence is public by design; it is
// on the wall to create pace pressure.
export function DecisionWall() {
  const { game, teams, bidsSubmitted } = useProfessor();
  if (!game || !LIGHT_PHASES.has(game.phase)) return null;
  const lit = submittedTeamIds(game.phase, game.round, teams, bidsSubmitted);
  return (
    <main className="bigscreen">
      <header className="bs-head">
        <div>
          <div className="brand bs-brand">Salary Showdown</div>
          <h1 className="bs-phase-title">{PHASE_NAMES[game.phase]}</h1>
          <p className="bs-sub">Round {game.round}</p>
        </div>
        <div className="bs-led">
          <LedTimer endsAt={game.timerEndsAt} pausedMs={game.timerPausedMs} />
        </div>
      </header>
      <div className="bs-lights" data-testid="bs-lights">
        {[...teams.entries()].map(([tid, t]) => (
          <div key={tid} className="bs-light-row">
            <span className={lit.has(tid) ? 'bs-dot ok' : 'bs-dot dim'} aria-hidden="true">
              {lit.has(tid) ? '●' : '○'}
            </span>
            <span className="bs-light-name">{t.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create BigscreenPage (the mode switch)** — create `games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx` with exactly:

```tsx
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { LobbyWall } from '../../components/bigscreen/LobbyWall';
import { DecisionWall } from '../../components/bigscreen/DecisionWall';
import '../../styles/bigscreen.css';

// Minimal full-screen phase-title card. Task 10 renders it for SIMULATE, RESULTS
// and FINALE; Task 11 replaces the SIMULATE/RESULTS cases with SimulateFlood /
// StandingsShuffle and Task 13 replaces the FINALE case with FinaleWall. The
// switch below is complete and final — later tasks swap CASE BODIES only.
function PhaseTitleCard({ title, round }: { title: string; round: number | null }) {
  return (
    <main className="bigscreen bs-center">
      <div className="brand bs-brand">Salary Showdown</div>
      <h1 className="bs-phase-title">{title}</h1>
      {round !== null && <p className="bs-sub">Round {round}</p>}
    </main>
  );
}

// Projector view. Mode = f(transition-gated phase): while an advance is settling
// the provider keeps presenting the phase being LEFT (its data is fully
// materialised), so the wall never points at documents that do not exist yet.
// Display-only surface: no controls anywhere below this line.
export default function BigscreenPage() {
  const { game } = useProfessor();
  if (!game) {
    return (
      <main className="bigscreen bs-center">
        <div className="brand bs-brand">Salary Showdown</div>
        <p className="bs-sub">Waiting for a session.</p>
      </main>
    );
  }
  switch (game.phase) {
    case 'LOBBY':
      return <LobbyWall />;
    case 'FRONT_OFFICE':
    case 'FREE_AGENCY':
    case 'AUCTION':
    case 'LINEUP':
      return <DecisionWall />;
    case 'SIMULATE':
      return <PhaseTitleCard title={PHASE_NAMES.SIMULATE} round={game.round} />;
    case 'RESULTS':
      return <PhaseTitleCard title={PHASE_NAMES.RESULTS} round={game.round} />;
    case 'FINALE':
      return <PhaseTitleCard title={PHASE_NAMES.FINALE} round={null} />;
  }
}
```

- [ ] **Step 7: Add the /bigscreen route** — modify `games/salary-showdown/app/src/App.tsx`. Two anchored edits against the code Task 6 added (Task 6 Edit 7a introduced the `ProfessorProvider` and `ProfessorPage` imports; Task 6 Edit 7b introduced the two-line `/professor` route whose ELEMENT is wrapped in `ProfessorProvider`; the pre-3a file had none of these, and T7–T9 do not touch App.tsx).

  Edit 1 — add the import directly below the ProfessorPage import. Replace:

```tsx
import ProfessorPage from './pages/professor/ProfessorPage';
```

  with:

```tsx
import ProfessorPage from './pages/professor/ProfessorPage';
import BigscreenPage from './pages/bigscreen/BigscreenPage';
```

  (Do NOT add a `ProfessorProvider` import — T6's Edit 7a already added `import { ProfessorProvider } from './contexts/ProfessorContext';`.)

  Edit 2 — add the route as a sibling directly below the two-line `/professor` route T6 added, with the element wrapped in its own `ProfessorProvider` exactly like `/professor`. Replace:

```tsx
          <Route path="/professor"
            element={<ProfessorProvider><ProfessorPage /></ProfessorProvider>} />
```

  with:

```tsx
          <Route path="/professor"
            element={<ProfessorProvider><ProfessorPage /></ProfessorProvider>} />
          <Route path="/bigscreen"
            element={<ProfessorProvider><BigscreenPage /></ProfessorProvider>} />
```

  Invariant that must hold after the edit (do not deviate): the `/bigscreen` route's ELEMENT is wrapped in `<ProfessorProvider>` exactly like `/professor`'s (the provider wraps each route element, NOT the `<Routes>` block — a bare `<BigscreenPage />` element would call `useProfessor()` against the null-cast default context and crash on first render), both routes sit inside `AuthProvider`; the `GameProvider` subtree and all existing team routes are untouched.

- [ ] **Step 8: Run the bigscreen itest — expect pass:**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/bigscreen.itest.tsx
```

Expected outcome: **1 passed** (runtime roughly 40–95s; the drive to R2:FRONT_OFFICE performs startSeason plus five expectation-carrying advancePhase calls, and the paused-timer freeze check adds a fixed 2s wait). Note: the functions emulator hot-reloads on edit — one flaky run right after an edit is expected; re-run before investigating.

- [ ] **Step 9: Wider verification** (all from `games/salary-showdown/app`):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
```

Expected outcomes, in order: `tsc -b` exits clean with no output; the unit suite passes (all pre-existing tests plus any added by T6–T9); the full itest suite passes (the 14 pre-existing itests, those added by T7–T9, and `bigscreen.itest.tsx` — all green); `audit:ui` reports no violations (the new bigscreen surfaces contain no emojis and no judgment copy — dots are the ● / ○ glyphs, which the tripwires allow).

- [ ] **Step 10: Commit:**

```bash
cd /Users/dylanmassaro/FenriX && git add games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx games/salary-showdown/app/src/components/bigscreen/LobbyWall.tsx games/salary-showdown/app/src/components/bigscreen/DecisionWall.tsx games/salary-showdown/app/src/styles/bigscreen.css games/salary-showdown/app/src/itest/bigscreen.itest.tsx games/salary-showdown/app/src/App.tsx && git commit -m "feat(salary-showdown): bigscreen shell — LobbyWall, DecisionWall, /bigscreen route

Projector view mode-switches on the transition-gated phase from
ProfessorContext: LOBBY renders the join-code wall (code, join URL, live
seat counter, per-team GM/Scout/Coach chips); the four decision phases
render the DecisionWall (student-vocabulary title, round, huge LedTimer
incl. paused state, submission lights sharing the panel's rules —
presence dots only, never bid contents). SIMULATE/RESULTS/FINALE render
placeholder phase-title cards that T11/T13 replace case-body-only.
Display-only surface: no controls, no emojis. Covered by
bigscreen.itest.tsx driving a real seeded game through R2:FRONT_OFFICE."
```

(Per the workspace memory note: run `git rev-parse HEAD` first and confirm it matches the Task 9 commit before committing — an external process races HEAD in this workspace.)

---

### Task 11: SimulateFlood + StandingsShuffle (+ shuffle.ts pure function)

**Files:**
- Create: `games/salary-showdown/app/src/lib/shuffle.ts`
- Create: `games/salary-showdown/app/src/lib/shuffle.test.ts`
- Create: `games/salary-showdown/app/src/components/bigscreen/SimulateFlood.tsx`
- Create: `games/salary-showdown/app/src/components/bigscreen/StandingsShuffle.tsx`
- Modify: `games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx` — exactly as created by T10 Step 6; two anchored edits (import block, and the `case 'SIMULATE'` / `case 'RESULTS'` bodies of the mode switch) plus one comment update. The switch statement itself is complete and final (T10 ruling): this task swaps CASE BODIES ONLY — do not restructure the switch, the no-game idle card, or the LOBBY/decision cases.
- Modify: `games/salary-showdown/app/src/styles/bigscreen.css` — append-only, anchored after the `.bs-dot` rule (the last rule of the T10 file).
- Test (extend): `games/salary-showdown/app/src/itest/bigscreen.itest.tsx` — append one test after the T10 test; do not rename or edit the existing test; no import changes are needed (everything the new test uses is already imported at the top of the T10 file).

**Interfaces:**

*Consumes (must already exist exactly as below):*
- `useProfessor()` from `src/contexts/ProfessorContext.tsx` (T6) — fields read by this task:
  ```ts
  game: GameDoc | null;        // transition-GATED (§3a): while an advance settles the provider
                               // presents fromRound/fromPhase, so these walls never render
                               // before rounds/{r} exists
  round: RoundDoc | null;      // rounds/{game.round} — games + standings for the current round
  teams: Map<string, TeamDoc>; // team names for the score cards
  ```
- `PHASE_NAMES: Record<Phase, string>` from `src/lib/phaseNames.ts` (T6) — this task uses `PHASE_NAMES.SIMULATE === 'Simulate'` and `PHASE_NAMES.RESULTS === 'Results'`.
- Types from `src/types/models.ts` (T6 additions): `StandingsRow` including `previousRank: number | null` (stamped on the wire by backend T4: `null` in round 1, prior round's rank otherwise), `RoundDoc { games: GameResult[]; awards: Awards; boxCsv: string; standings: StandingsRow[] }`, `GameResult { game_id, home, away, homeScore, awayScore }`.
- `src/pages/bigscreen/BigscreenPage.tsx` (T10) — the mode switch with `PhaseTitleCard` placeholders in the `SIMULATE`/`RESULTS`/`FINALE` cases; this task replaces the first two case bodies.
- CSS classes from T10's `src/styles/bigscreen.css`: `bigscreen`, `bs-center`, `bs-brand`, `bs-phase-title`, `bs-sub`; from `src/styles/arena.css`: `mono`, `ok`, `neg`, `dim`, `muted`, color tokens `--card-a`, `--card-b`, `--border`, `--gold`.
- Itest harness `src/itest/harness.ts` (exists today, unmodified): `adminDb()`, `driveTo(seeded, to)`, `type Seeded`.

*Produces (exact signatures):*
- `src/lib/shuffle.ts`:
  ```ts
  export interface ShuffleStep { teamId: string; name: string; rank: number;
    previousRank: number | null; delta: number | null;   // prev - rank; null round 1
    wins: number; losses: number; shroud: boolean }      // shroud: rank <= 3
  export function computeShuffleSteps(standings: StandingsRow[]): ShuffleStep[]
  // returns rows in REVEAL order: rank N first … rank 1 last
  ```
- `export function SimulateFlood()` at `src/components/bigscreen/SimulateFlood.tsx` (no props; reads `useProfessor()` — same pattern as T10's walls).
- `export function StandingsShuffle()` at `src/components/bigscreen/StandingsShuffle.tsx` (no props; reads `useProfessor()`).
- After this task the only remaining `PhaseTitleCard` placeholder in BigscreenPage is `case 'FINALE'` — T13 replaces that case body (and nothing else) with `<FinaleWall />`.

**Hard rules restated for this task (do not "improve" them away):**
- NO emojis anywhere in product UI. The movement markers are the GLYPHS `▲` (U+25B2) / `▼` (U+25BC), the em dash `—`, and the plain text `NEW` — `npm run audit:ui` bans the emoji ranges but allows these. Do not substitute arrow emoji or colored-circle emoji.
- The bigscreen is **display-only**: no buttons, no links, no click handlers. Facts, never conclusions: scores, ranks, records, and movement are facts; do not add editorializing copy ("dominant win", "collapse", etc.).
- Both walls render from the **transition-gated** phase/round that `useProfessor().game` already presents. `rounds/{r}` is written by the `enter:SIMULATE` hook inside the advance, so by the time these walls mount the data is server-final — the pacing below is purely cosmetic playback (same pattern as `SimulatePage.tsx:27-36`).
- Mockup sample numbers are never authoritative — the flood interval is recomputed as `Math.min(3000, 45000 / games.length)`, never hard-coded per class size.
- Round 5 IS the championship round. `config.totalRounds` is decorative (Plan 1 ruling) and must not be consulted; the slow-reveal trigger is literally `game.round === 5`.

All commands run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app`. The integration test needs the long-lived emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`); if they are not already up:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend && npx firebase emulators:start --project salary-showdown-dev
```

- [ ] **Step 1: Write the failing unit test for `computeShuffleSteps`**

  READ `src/lib/arrange.test.ts` first — this file copies its shape (bare `test`/`expect`, vitest globals are on, a tiny local row factory). Create `src/lib/shuffle.test.ts` with exactly:

  ```ts
  import { computeShuffleSteps } from './shuffle';
  import type { StandingsRow } from '../types/models';

  // Real-shaped rows. sim.js stores standings already sorted by rank 1..N, but the
  // function must not depend on input order — tests deliberately scramble it.
  const row = (teamId: string, rank: number, previousRank: number | null,
    wins = 0, losses = 0): StandingsRow => ({
    teamId, name: `Team ${teamId}`, wins, losses,
    pointDiff: 0, pointsFor: 0, tiebreakCoin: 0.5, rank, previousRank,
  });

  test('reveal order: rank N first, rank 1 last, regardless of input order', () => {
    const steps = computeShuffleSteps(
      [row('b', 2, 1), row('d', 4, 3), row('a', 1, 2), row('c', 3, 4)]);
    expect(steps.map((s) => s.rank)).toEqual([4, 3, 2, 1]);
    expect(steps.map((s) => s.teamId)).toEqual(['d', 'c', 'b', 'a']);
  });

  test('delta = previousRank - rank: positive climbs, negative falls, zero holds', () => {
    const steps = computeShuffleSteps([
      row('a', 1, 3), // was 3rd, now 1st: climbed 2
      row('b', 2, 1), // was 1st, now 2nd: fell 1
      row('c', 3, 2), // was 2nd, now 3rd: fell 1
      row('d', 4, 4), // held
    ]);
    const byTeam = Object.fromEntries(steps.map((s) => [s.teamId, s]));
    expect(byTeam.a.delta).toBe(2);
    expect(byTeam.b.delta).toBe(-1);
    expect(byTeam.c.delta).toBe(-1);
    expect(byTeam.d.delta).toBe(0);
  });

  test('round 1: previousRank null -> previousRank and delta both null (NEW)', () => {
    const steps = computeShuffleSteps(
      ['a', 'b', 'c', 'd'].map((t, i) => row(t, i + 1, null)));
    for (const s of steps) {
      expect(s.previousRank).toBeNull();
      expect(s.delta).toBeNull();
    }
    // A round doc simulated before backend T4 shipped lacks the key entirely —
    // treated exactly like null.
    const legacy = { ...row('x', 1, null) } as Record<string, unknown>;
    delete legacy.previousRank;
    const [s] = computeShuffleSteps([legacy as unknown as StandingsRow]);
    expect(s.previousRank).toBeNull();
    expect(s.delta).toBeNull();
  });

  test('shroud is true for ranks 1-3 only — the last three reveal steps', () => {
    const steps = computeShuffleSteps(
      ['a', 'b', 'c', 'd'].map((t, i) => row(t, i + 1, i + 1)));
    expect(steps.map((s) => s.shroud)).toEqual([false, true, true, true]);
  });

  test('21-team shape: 21 steps, bottom-up, exactly three shrouded, fields carried', () => {
    const input: StandingsRow[] = [];
    for (let r = 1; r <= 21; r += 1) input.push(row(`t${r}`, r, 22 - r, 21 - r, r - 1));
    input.reverse(); // scramble: input order must not matter
    const steps = computeShuffleSteps(input);
    expect(steps).toHaveLength(21);
    expect(steps[0].rank).toBe(21);
    expect(steps[20].rank).toBe(1);
    expect(steps.filter((s) => s.shroud).map((s) => s.rank)).toEqual([3, 2, 1]);
    const t5 = steps.find((s) => s.teamId === 't5')!;
    expect(t5.delta).toBe(12); // previousRank 17 - rank 5
    expect(t5.previousRank).toBe(17);
    expect(t5.wins).toBe(16);
    expect(t5.losses).toBe(4);
    expect(t5.name).toBe('Team t5');
  });
  ```

- [ ] **Step 2: Run the unit test — expect FAILURE (module does not exist)**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/shuffle.test.ts
  ```

  Expected outcome: 1 test file FAILS to load with a resolve error — `Failed to resolve import "./shuffle" from "src/lib/shuffle.test.ts"` (0 tests run).

- [ ] **Step 3: Create `src/lib/shuffle.ts`**

  Full file contents:

  ```ts
  import type { StandingsRow } from '../types/models';

  // The Standings Shuffle step list (design spec §6.4). Pure data -> playback
  // plan: rows in REVEAL order — rank N first … rank 1 last (bottom-up drama,
  // first place lands last). The playback component is a dumb consumer of this
  // list; every branchy decision lives here where it is unit-testable.
  export interface ShuffleStep {
    teamId: string; name: string; rank: number;
    previousRank: number | null;   // last round's rank; null in round 1
    delta: number | null;          // previousRank - rank (positive = climbed); null round 1
    wins: number; losses: number;
    shroud: boolean;               // rank <= 3: masked as '#<rank> — ?' until its own reveal
  }

  export function computeShuffleSteps(standings: StandingsRow[]): ShuffleStep[] {
    return [...standings]
      .sort((a, b) => b.rank - a.rank) // reveal order: rank N first … rank 1 last
      .map((r) => {
        // previousRank is absent (not null) on round docs simulated before the
        // backend stamped it — treat exactly like round 1's explicit null.
        const previousRank = r.previousRank ?? null;
        return {
          teamId: r.teamId, name: r.name, rank: r.rank,
          previousRank,
          delta: previousRank === null ? null : previousRank - r.rank,
          wins: r.wins, losses: r.losses,
          shroud: r.rank <= 3,
        };
      });
  }
  ```

- [ ] **Step 4: Run the unit test — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/shuffle.test.ts
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 5 passed (5)`.

- [ ] **Step 5: Extend `src/itest/bigscreen.itest.tsx` with the failing flood + shuffle test**

  READ the existing T10 test in this file first — the new test copies its exact professor pattern (the rendered client IS the professor; `signInAnonymously` on the default app before `createGame`; a `prof` shim over the default app so `driveTo`'s `advancePhase` calls — which ALWAYS carry `expectedPhase` + `expectedRound`, standing hard rule — come from the professor uid). Zero bots: the FREE_AGENCY exit hook hardship-signs every roster-short team and the LINEUP exit auto-repair carries every team, the same no-member-team path the T10 test already relies on.

  APPEND the following test at the end of the file (after the closing `}, 180000);` of the T10 test). Do not touch the existing test or the import block — every identifier the new test uses is already imported.

  ```tsx
  // Task 11: SIMULATE flood + RESULTS shuffle. 4 teams -> 6 games per round, so
  // interval = min(3000, 45000/6) = 3000ms and the full flood takes ~18s of real
  // time (real timers; generous waitFor timeouts bound it).
  test('bigscreen: score-card flood, then standings shuffle with NEW and delta glyphs', async () => {
    await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
    const created = await httpsCallable(functions, 'createGame')(
      { teamNames: ['Alpha', 'Beta', 'Gamma', 'Delta'] });
    const { gameId, joinCode } = created.data as { gameId: string; joinCode: string };
    const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
    const teamIds = ['Alpha', 'Beta', 'Gamma', 'Delta'].map(
      (nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
    const prof: Seeded['prof'] = {
      uid: auth.currentUser!.uid,
      call: <T,>(fn: string, data: unknown) =>
        httpsCallable(functions, fn)(data).then((r) => r.data as T),
      dispose: () => Promise.resolve(),
    };
    const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots: [] };

    localStorage.setItem('ss.profGameId', gameId);
    render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);

    // R1:SIMULATE — all 6 score cards flood in, then the terminal line.
    await driveTo(seeded, 'R1:SIMULATE');
    await waitFor(() => {
      expect(screen.getAllByTestId('bs-scorecard')).toHaveLength(6);
      expect(screen.getByRole('status')).toHaveTextContent('Round complete.');
    }, { timeout: 60000 });

    // R1:RESULTS — round 1 has no previous round: every previousRank is null,
    // so the rest-state table is 4 rows, all marked NEW.
    await driveTo(seeded, 'R1:RESULTS');
    const rd1 = (await adminDb().doc(`games/${gameId}/rounds/1`).get()).data()!;
    expect((rd1.standings as { previousRank: number | null }[])
      .every((r) => r.previousRank === null)).toBe(true);
    await waitFor(() => {
      expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(4);
      for (const r of rd1.standings as { teamId: string }[]) {
        expect(screen.getByTestId(`bs-delta-${r.teamId}`)).toHaveTextContent('NEW');
      }
    }, { timeout: 30000 });

    // R2:RESULTS — every delta glyph must agree with the stored previousRank:
    // delta = previousRank - rank; positive -> '▲ d', negative -> '▼ |d|', zero -> '—'.
    await driveTo(seeded, 'R2:RESULTS');
    const rd2 = (await adminDb().doc(`games/${gameId}/rounds/2`).get()).data()!;
    expect((rd2.standings as { previousRank: number | null }[])
      .every((r) => r.previousRank !== null)).toBe(true);
    await waitFor(() => {
      expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(4);
      for (const r of rd2.standings as
        { teamId: string; rank: number; previousRank: number }[]) {
        const d = r.previousRank - r.rank;
        const expected = d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '—';
        expect(screen.getByTestId(`bs-delta-${r.teamId}`)).toHaveTextContent(expected);
      }
    }, { timeout: 30000 });
  }, 300000);
  ```

- [ ] **Step 6: Run the bigscreen itest file — expect the new test to FAIL**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/bigscreen.itest.tsx
  ```

  Expected outcome: **1 passed, 1 failed**. The T10 test stays green; the new test times out on the first `waitFor` after ~60s with `Unable to find an element by: [data-testid="bs-scorecard"]` — the SIMULATE case still renders the T10 `PhaseTitleCard` placeholder. (If it fails on `createGame` instead, the emulators are not running. One flaky run right after a functions-emulator hot reload is expected — re-run before investigating.)

- [ ] **Step 7: Create `src/components/bigscreen/SimulateFlood.tsx`**

  Full file contents:

  ```tsx
  import { useEffect, useState } from 'react';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { PHASE_NAMES } from '../../lib/phaseNames';

  // SIMULATE wall: staggered reveal of ALL of this round's games as score cards.
  // rounds/{r} is written by the enter:SIMULATE hook inside the advance and the
  // provider's §3a transition gate holds this phase back until it exists, so the
  // data is server-final before this ever mounts — the stagger is pure cosmetic
  // playback (same pacing pattern as SimulatePage, over every game instead of
  // one team's three). interval = min(3000, 45000/games.length) keeps the whole
  // flood inside ~45s at any class size. Display-only; facts only; no emojis.
  export function SimulateFlood() {
    const { game, round, teams } = useProfessor();
    const games = round?.games ?? [];
    const total = games.length;
    const [shown, setShown] = useState(0);

    useEffect(() => { // cosmetic client pacing — the data is already server-final
      setShown(0);
      if (total === 0) return;
      const interval = Math.min(3000, 45000 / total);
      const id = setInterval(() => setShown((n) => {
        if (n + 1 >= total) clearInterval(id);
        return n + 1;
      }), interval);
      return () => clearInterval(id);
    }, [total, game?.round]);

    if (!game) return null;
    const done = total > 0 && shown >= total;
    return (
      <main className="bigscreen">
        <header>
          <div className="brand bs-brand">Salary Showdown</div>
          <h1 className="bs-phase-title">{PHASE_NAMES.SIMULATE}</h1>
          <p className="bs-sub">Round {game.round}</p>
        </header>
        {total === 0 && <p className="bs-sub">Crunching the round…</p>}
        <div className="bs-flood">
          {games.slice(0, shown).map((g) => (
            <div key={g.game_id} className="bs-scorecard mono" data-testid="bs-scorecard">
              <span className="bs-score-team">{teams.get(g.home)?.name ?? '—'}</span>
              <span className={g.homeScore > g.awayScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.homeScore}
              </span>
              <span className="dim">–</span>
              <span className={g.awayScore > g.homeScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.awayScore}
              </span>
              <span className="bs-score-team away">{teams.get(g.away)?.name ?? '—'}</span>
            </div>
          ))}
        </div>
        {done && <p className="bs-sub ok" role="status">Round complete.</p>}
      </main>
    );
  }
  ```

- [ ] **Step 8: Create `src/components/bigscreen/StandingsShuffle.tsx`**

  Full file contents:

  ```tsx
  import { useEffect, useMemo, useState } from 'react';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { PHASE_NAMES } from '../../lib/phaseNames';
  import { computeShuffleSteps, type ShuffleStep } from '../../lib/shuffle';

  // Movement markers are GLYPHS + plain text, never emojis: ▲ climbed, ▼ fell,
  // — held, NEW when previousRank is null (round 1).
  function deltaGlyph(delta: number | null): string {
    if (delta === null) return 'NEW';
    if (delta > 0) return `▲ ${delta}`;
    if (delta < 0) return `▼ ${-delta}`;
    return '—';
  }
  function deltaClass(delta: number | null): string {
    if (delta === null) return 'bs-delta mono';
    if (delta > 0) return 'bs-delta mono ok';
    if (delta < 0) return 'bs-delta mono neg';
    return 'bs-delta mono dim';
  }

  // RESULTS wall: playback of computeShuffleSteps(round.standings). One reveal
  // per 0.8s, bottom-up (rank N first, rank 1 last); the top three render as
  // '#<rank> — ?' until their own step. In round 5 the last three reveals slow
  // to 3s each — the championship reveal. Round 5 IS the final round:
  // config.totalRounds is decorative (Plan 1 ruling) and is deliberately not
  // consulted. Rest state: the full table with deltas, held until the professor
  // advances. Display-only; facts only (rank, name, record, movement).
  export function StandingsShuffle() {
    const { game, round } = useProfessor();
    const steps = useMemo(() => computeShuffleSteps(round?.standings ?? []), [round]);
    const championship = game?.round === 5;
    const [shown, setShown] = useState(0);

    useEffect(() => { // cosmetic client pacing — the standings are already server-final
      setShown(0);
      if (steps.length === 0) return;
      let cancelled = false;
      let id: ReturnType<typeof setTimeout>;
      const schedule = (i: number) => { // i = index of the NEXT step to reveal
        const slow = championship && i >= steps.length - 3;
        id = setTimeout(() => {
          if (cancelled) return;
          setShown(i + 1);
          if (i + 1 < steps.length) schedule(i + 1);
        }, slow ? 3000 : 800);
      };
      schedule(0);
      return () => { cancelled = true; clearTimeout(id); };
    }, [steps, championship]);

    if (!game) return null;
    const revealed = new Set(steps.slice(0, shown).map((s) => s.teamId));
    const rows: ShuffleStep[] = [...steps].sort((a, b) => a.rank - b.rank);
    return (
      <main className="bigscreen">
        <header>
          <div className="brand bs-brand">Salary Showdown</div>
          <h1 className="bs-phase-title">{PHASE_NAMES.RESULTS}</h1>
          <p className="bs-sub">Round {game.round}</p>
        </header>
        <div className="bs-shuffle" data-testid="bs-shuffle">
          {rows.map((s) => {
            // Bottom-up reveal: an unrevealed row is absent — EXCEPT the top
            // three, whose shrouded placeholders hold the podium slots open.
            if (!revealed.has(s.teamId) && !s.shroud) return null;
            return revealed.has(s.teamId) ? (
              <div key={s.teamId} className="bs-shuffle-row" data-testid="bs-shuffle-row">
                <span className="bs-shuffle-rank mono">#{s.rank}</span>
                <span className="bs-shuffle-name">{s.name}</span>
                <span className="bs-shuffle-record mono">{s.wins}–{s.losses}</span>
                <span className={deltaClass(s.delta)} data-testid={`bs-delta-${s.teamId}`}>
                  {deltaGlyph(s.delta)}
                </span>
              </div>
            ) : (
              <div key={s.teamId} className="bs-shuffle-row">
                <span className="bs-shuffle-shroud mono">#{s.rank} — ?</span>
              </div>
            );
          })}
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 9: Append the flood/shuffle styles to `src/styles/bigscreen.css`**

  Anchor: the current last rule of the file (T10 Step 3) is:

  ```css
  .bs-dot { font-size: 0.9em; line-height: 1; }
  ```

  APPEND directly below it (do not modify any existing rule):

  ```css

  /* --- Task 11: SimulateFlood + StandingsShuffle --- */
  .bs-flood { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 14px; width: 100%; }
  .bs-scorecard { display: flex; align-items: baseline; gap: 14px;
    background: linear-gradient(180deg, var(--card-a), var(--card-b));
    border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px;
    font-size: clamp(18px, 2.2vw, 34px); }
  .bs-score-team { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-score-team.away { text-align: right; }
  .bs-score-num { font-weight: 800; }
  .bs-shuffle { display: flex; flex-direction: column; gap: 10px; width: 100%;
    max-width: 1100px; margin: 0 auto; }
  .bs-shuffle-row { display: flex; align-items: baseline; gap: 18px;
    background: linear-gradient(180deg, var(--card-a), var(--card-b));
    border: 1px solid var(--border); border-radius: 10px; padding: 10px 18px;
    font-size: clamp(20px, 2.6vw, 40px); }
  .bs-shuffle-rank { min-width: 2.2em; color: var(--dim); }
  .bs-shuffle-name { flex: 1; font-weight: 700; }
  .bs-shuffle-record { color: var(--muted); }
  .bs-delta { min-width: 3.2em; text-align: right; }
  .bs-shuffle-shroud { color: var(--gold); letter-spacing: 0.06em; }
  ```

- [ ] **Step 10: Swap the SIMULATE/RESULTS case bodies in `src/pages/bigscreen/BigscreenPage.tsx`**

  Three anchored edits against the file exactly as T10 Step 6 created it. CASE BODIES ONLY — the switch statement, the no-game idle card, and the LOBBY/decision cases must remain byte-identical.

  Edit 10a — imports. Replace:

  ```tsx
  import { LobbyWall } from '../../components/bigscreen/LobbyWall';
  import { DecisionWall } from '../../components/bigscreen/DecisionWall';
  ```

  with:

  ```tsx
  import { LobbyWall } from '../../components/bigscreen/LobbyWall';
  import { DecisionWall } from '../../components/bigscreen/DecisionWall';
  import { SimulateFlood } from '../../components/bigscreen/SimulateFlood';
  import { StandingsShuffle } from '../../components/bigscreen/StandingsShuffle';
  ```

  Edit 10b — the now-outdated placeholder comment. Replace:

  ```tsx
  // Minimal full-screen phase-title card. Task 10 renders it for SIMULATE, RESULTS
  // and FINALE; Task 11 replaces the SIMULATE/RESULTS cases with SimulateFlood /
  // StandingsShuffle and Task 13 replaces the FINALE case with FinaleWall. The
  // switch below is complete and final — later tasks swap CASE BODIES only.
  ```

  with:

  ```tsx
  // Minimal full-screen phase-title card — now only the FINALE placeholder;
  // Task 13 replaces that case body with FinaleWall. The switch below is
  // complete and final — later tasks swap CASE BODIES only.
  ```

  Edit 10c — the two case bodies. Replace:

  ```tsx
      case 'SIMULATE':
        return <PhaseTitleCard title={PHASE_NAMES.SIMULATE} round={game.round} />;
      case 'RESULTS':
        return <PhaseTitleCard title={PHASE_NAMES.RESULTS} round={game.round} />;
  ```

  with:

  ```tsx
      case 'SIMULATE':
        return <SimulateFlood />;
      case 'RESULTS':
        return <StandingsShuffle />;
  ```

  After the edits, `PhaseTitleCard` and the `PHASE_NAMES` import are still used (the `case 'FINALE'` return is untouched) — `tsc` stays clean with no unused-symbol removals needed.

- [ ] **Step 11: Run the bigscreen itest file — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/bigscreen.itest.tsx
  ```

  Expected outcome: `Test Files 1 passed (1)` / `Tests 2 passed (2)`. The new test takes roughly 90-180s dominated by the ~18s flood plus two multi-advance drives. If the first run right after a functions-emulator hot reload flakes, re-run once before investigating.

- [ ] **Step 12: Wider verification — types, unit suite, full itest suite, UI audit**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
  ```

  Expected: exits 0, no output.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
  ```

  Expected: all unit tests pass — the pre-existing suites, anything added by T6-T10, plus the 5 new `shuffle.test.ts` tests. 0 failures.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
  ```

  Expected: `Test Files 15 passed (15)` / `Tests 23 passed (23)` — 15 itest files (the 13 pre-existing + `professor.itest.tsx` + `bigscreen.itest.tsx`), 0 failures. Test arithmetic: 14 pre-existing tests (13 files; `landing.itest.tsx` has 2) + 1 appended to the pre-existing `frontoffice.itest.tsx` by T9 + 6 in `professor.itest.tsx` (T6 smoke 1 + T7 2 + T8 2 + T9 1) + 2 in `bigscreen.itest.tsx` (T10 1 + this task 1) = 23. Emulators required.

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
  ```

  Expected: `audit:ui clean — <N> files scanned`. The new surfaces use only sanctioned glyphs: `▲` (U+25B2) and `▼` (U+25BC) are in the 25xx block, outside the banned emoji ranges; `—`, `–`, `…`, `?` and the text `NEW` are plain; no judgment adjectives were introduced.

- [ ] **Step 13: Commit**

  Per the workspace memory note, verify HEAD first — an external process races HEAD in this workspace:

  ```bash
  cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git status --short games/salary-showdown/app/src
  ```

  Expected: HEAD is the Task 10 commit, and the status shows exactly — `M games/salary-showdown/app/src/itest/bigscreen.itest.tsx`, `M games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx`, `M games/salary-showdown/app/src/styles/bigscreen.css`, `?? games/salary-showdown/app/src/components/bigscreen/SimulateFlood.tsx`, `?? games/salary-showdown/app/src/components/bigscreen/StandingsShuffle.tsx`, `?? games/salary-showdown/app/src/lib/shuffle.ts`, `?? games/salary-showdown/app/src/lib/shuffle.test.ts` — nothing else. Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/app/src/lib/shuffle.ts \
    games/salary-showdown/app/src/lib/shuffle.test.ts \
    games/salary-showdown/app/src/components/bigscreen/SimulateFlood.tsx \
    games/salary-showdown/app/src/components/bigscreen/StandingsShuffle.tsx \
    games/salary-showdown/app/src/styles/bigscreen.css \
    games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx \
    games/salary-showdown/app/src/itest/bigscreen.itest.tsx \
  && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): bigscreen SIMULATE flood + RESULTS standings shuffle

  Plan 3a Task 11. computeShuffleSteps (src/lib/shuffle.ts): pure
  standings -> playback plan — reveal order rank N..1, delta =
  previousRank - rank (null/NEW in round 1, absent key treated as
  null), shroud on ranks 1-3; unit-tested on 4- and 21-team shapes.
  SimulateFlood replaces the T10 SIMULATE placeholder: staggered score
  cards over ALL round.games at min(3000, 45000/n) ms — pure cosmetic
  playback, rounds/{r} is server-final before the phase renders —
  ending in "Round complete." StandingsShuffle replaces the RESULTS
  placeholder: bottom-up reveal at 0.8s/row, top three masked as
  '#<rank> — ?' until their own step, round 5 slows the last three
  reveals to 3s (championship), rest state full table with the
  ▲ / ▼ / — / NEW glyphs. Both walls display-only, no emojis; the
  FINALE case body stays a placeholder for T13. bigscreen.itest.tsx
  gains a driven test: R1:SIMULATE all-6-card flood, R1:RESULTS
  all-NEW rest state, R2:RESULTS glyphs checked against the stored
  previousRank values.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Expected: one commit on `main` touching exactly 7 files (3 modified, 4 added).

---

### Task 12: revealCharts transforms + SVG chart components + FinalePage (laptop debrief)

**Files:**
- Create: `games/salary-showdown/app/src/lib/revealCharts.ts`
- Create: `games/salary-showdown/app/src/lib/revealCharts.test.ts`
- Create: `games/salary-showdown/app/src/components/charts/ScatterTI.tsx`
- Create: `games/salary-showdown/app/src/components/charts/WeightsCompare.tsx`
- Create: `games/salary-showdown/app/src/components/charts/WinsPerDollar.tsx`
- Create: `games/salary-showdown/app/src/components/charts/BestWorst.tsx`
- Create: `games/salary-showdown/app/src/pages/FinalePage.tsx`
- Create: `games/salary-showdown/app/src/itest/finale.itest.tsx`
- Modify: `games/salary-showdown/app/src/App.tsx` (import block ~line 13; Stub component lines 15–22; `/game/conclusion` route ~line 38 — line numbers may have shifted slightly after Task 6 added the `/professor` and `/bigscreen` routes; anchor on the exact quoted strings, which Task 6 does not touch)
- Modify: `games/salary-showdown/app/src/itest/season.itest.tsx` (final FINALE assertion, lines 36–38)

**Interfaces:**

*Consumes* (from earlier tasks / existing code — import, never redefine):
- `RevealDoc`, `StandingsRow`, `TeamDoc` from `src/types/models.ts` — `RevealDoc` is the T6 shape verbatim, including the T5-extended `trueWeights`:
  ```ts
  export interface RevealDoc {
    scatter: { pid: number; name: string; hype: number; salary: number | null;
      ti: number; isTrap: boolean; archetype: string }[];
    perTeam: { teamId: string;
      bestSigning: { pid: number; valuePerDollar: number } | null;
      worstSigning: { pid: number; valuePerDollar: number } | null }[];
    winsPerDollar: { teamId: string; wins: number; totalSpend: number; ratio: number }[];
    trueWeights: { narrative: string; defenseVisible: boolean; turnoverWeight: number;
      engine: { base: number; scoring: number; playmaking: number; steal: number;
        block: number; rebound: number; turnover: number };
      regression: { winsR2: number; turnoverCoef: number; turnoverP: string;
        payrollT: number; hypeT: number } };
  }
  ```
- `useGame()` from `src/contexts/GameContext.tsx` (gameId, game, membership, teams, call).
- `useRoundDoc(round)` from `src/hooks/useRoundDoc.ts`.
- `PhaseHeader` from `src/components/ui/PhaseHeader.tsx` (current 3-prop signature `{title, round, timerEndsAt}`; if Task 8 already added an optional `pausedMs` prop, omitting it is fine — it is optional by contract).
- itest harness `src/itest/harness.ts`: `adminDb()`, `newClient()`, `seedToPhase({teams?, fill?, to})`, `driveTo(seeded, to)` — `to: 'FINALE'` is supported (`harness.ts:50`).
- Backend reveal writer `HOOKS['enter:FINALE']` (`backend/functions/src/game.js:562-608`) — `perTeam` best/worst are genuinely nullable (`vals[0] ?? null`), `isTrap` is true exactly for archetypes `volume_trap` and `aging_legend` (`game.js:574`), and after T5 `trueWeights` carries `engine`/`regression`/`narrative`.

*Produces* (Task 13's FinaleWall imports these EXACT signatures — do not rename):
```ts
// src/lib/revealCharts.ts
export interface Frame { w: number; h: number; padL: number; padR: number; padT: number; padB: number }
export function quantile(xs: number[], q: number): number
export const median: (xs: number[]) => number
export type ScatterClass = 'trap' | 'bargain' | 'normal';
export function classifyScatter(rows: RevealDoc['scatter']): Map<number, ScatterClass>
export interface Tick { pos: number; label: string }
export interface ScatterPoint { pid: number; name: string; hype: number; ti: number;
  salary: number | null; cls: ScatterClass; x: number; y: number }
export interface ScatterGeometry { points: ScatterPoint[]; xTicks: Tick[]; yTicks: Tick[];
  xMax: number; yMax: number }
export function scatterGeometry(rows: RevealDoc['scatter'], f: Frame): ScatterGeometry
export interface WeightBar { key: string; label: string; value: number; valueLabel: string;
  x: number; y: number; w: number; h: number; neg: boolean; note?: string }
export interface WeightsGroup { title: string; unitLabel: string; boxX: number;
  zeroX: number; bars: WeightBar[] }
export interface WeightsGeometry { engine: WeightsGroup; regression: WeightsGroup; caption: string }
export function weightsGeometry(tw: RevealDoc['trueWeights'], f: Frame): WeightsGeometry
export interface WpdBar { teamId: string; name: string; ratio: number; ratioLabel: string;
  detail: string; x: number; y: number; w: number; h: number }
export function winsPerDollarGeometry(rows: RevealDoc['winsPerDollar'],
  names: Map<string, string>, f: Frame): WpdBar[]
export interface BestWorstRow { teamId: string; team: string;
  best: { pid: number; name: string; vpd: string } | null;
  worst: { pid: number; name: string; vpd: string } | null }
export function bestWorstRows(perTeam: RevealDoc['perTeam'],
  teamNames: Map<string, string>, playerNames: Map<number, string>,
  order?: string[]): BestWorstRow[]

// src/components/charts/*.tsx (named exports, hand-rolled SVG, NO new npm deps)
export function ScatterTI({ rows }: { rows: RevealDoc['scatter'] }): JSX.Element            // data-testid="chart-scatter-ti"
export function WeightsCompare({ trueWeights }: { trueWeights: RevealDoc['trueWeights'] }): JSX.Element  // data-testid="chart-weights-compare"
export function WinsPerDollar({ rows, teamNames }: { rows: RevealDoc['winsPerDollar'];
  teamNames: Map<string, string> }): JSX.Element                                            // data-testid="chart-wins-per-dollar"
export function BestWorst({ perTeam, teamNames, playerNames, order, highlightTeamId }: {
  perTeam: RevealDoc['perTeam']; teamNames: Map<string, string>;
  playerNames: Map<number, string>; order?: string[];
  highlightTeamId?: string | null }): JSX.Element                                           // data-testid="chart-best-worst"
```
`src/pages/FinalePage.tsx` default-exports `FinalePage` and is routed at `/game/conclusion`.

**Hard rules restated for this task (contracts — do not "improve" on them):**
- THE FINALE IS THE SANCTIONED REVEAL (parent spec §11.14): value-per-dollar, wins-per-dollar, trap/bargain labels, and the weights comparison are exactly what this page exists to show — do not hide them here. The "facts, never conclusions" rule and the in-game "bargain award never renders `perDollar`" rule govern IN-GAME team screens (the Results page), not the Finale.
- NO emojis anywhere in product UI. Glyphs `★ ▲ ▼ ½ ‹ ›` are fine (and `² · —` are ordinary non-emoji glyphs). `npm run audit:ui` enforces this and also bans judgment adjectives in string literals (`underperforming`, `a steal`, `overpaid`, `great value`, …) — keep all copy factual.
- The weights comparison's two sides have DIFFERENT units — engine weights are TrueImpact points, the regression side is R²/coefficient/t-statistics from `league_history.csv`. Render them as two side-by-side, independently normalized groups with their own zero lines and explicit unit labels. NEVER a single shared axis.
- FinalePage is the TEAM client's scrollable laptop debrief. It IGNORES `games/{id}.revealStep` entirely (that field drives the projector wall, Task 13). It reads the reveal via its OWN listener on `games/{id}/reveal/latest` — member-readable once `status == 'finished'` per `firestore.rules:48-52`. It does NOT use ProfessorContext.
- Every listener passes an error callback that logs via `console.error` — never a silent `() => {}` (§3a lesson).
- Hand-rolled SVG only — NO new npm dependencies anywhere in 3a.
- Mockup sample numbers are never authoritative — every number rendered comes from the reveal doc / round doc.

---

- [ ] **Step 1: Write the failing unit test for the transforms**

Create `games/salary-showdown/app/src/lib/revealCharts.test.ts` with exactly:

```ts
import {
  bestWorstRows, classifyScatter, median, quantile, scatterGeometry,
  weightsGeometry, winsPerDollarGeometry, type Frame,
} from './revealCharts';
import type { RevealDoc } from '../types/models';

// Fixture builder. Archetype strings are the REAL values from
// backend/functions/src/data/hidden.json (10 archetypes: efficient_star,
// volume_trap, two_way_wing, elite_defender, floor_general, sharpshooter,
// rim_protector, aging_legend, young_riser, journeyman).
const row = (o: Partial<RevealDoc['scatter'][number]>): RevealDoc['scatter'][number] => ({
  pid: 0, name: 'P', hype: 5, salary: 10, ti: 5, isTrap: false, archetype: 'journeyman', ...o,
});
// Priced salaries [20, 4, 18] -> median 18. All ti [8, 9, 2, 9] -> q75 = 9.
const ROWS: RevealDoc['scatter'] = [
  row({ pid: 1, name: 'Pricey', hype: 10, ti: 8, salary: 20, archetype: 'efficient_star' }),
  row({ pid: 2, name: 'Cheap', hype: 2, ti: 9, salary: 4, archetype: 'elite_defender' }),
  row({ pid: 3, name: 'Empty', hype: 9, ti: 2, salary: 18, isTrap: true, archetype: 'volume_trap' }),
  row({ pid: 4, name: 'Star', hype: 6, ti: 9, salary: null, archetype: 'efficient_star' }),
];
const FS: Frame = { w: 700, h: 400, padL: 50, padR: 10, padT: 10, padB: 40 };

test('quantile: linear interpolation (numpy default, matches datagen harness)', () => {
  expect(quantile([8, 9, 2, 9], 0.75)).toBe(9);        // idx 2.25 on [2,8,9,9]
  expect(quantile([1, 10], 0.75)).toBeCloseTo(7.75);   // 1 + 0.75 * 9
  expect(quantile([5], 0.75)).toBe(5);
  expect(Number.isNaN(quantile([], 0.5))).toBe(true);
});

test('median: odd and even counts', () => {
  expect(median([4, 18, 20])).toBe(18);
  expect(median([2, 10])).toBe(6);
});

test('classifyScatter: trap from the server flag, bargain from price vs TrueImpact', () => {
  const cls = classifyScatter(ROWS);
  expect(cls.get(3)).toBe('trap');      // isTrap: true
  expect(cls.get(2)).toBe('bargain');   // 4 < 18 (bottom-half salary) AND 9 >= 9 (top-quartile ti)
  expect(cls.get(1)).toBe('normal');    // 20 is not below the median salary
});

test('classifyScatter: null-salary rows are never bargains', () => {
  // pid 4 has top-quartile ti (9 >= 9) but no list price (auction-class star).
  expect(classifyScatter(ROWS).get(4)).toBe('normal');
});

test('classifyScatter: trap wins when a trap also sits in the bargain box', () => {
  const rows = [
    row({ pid: 5, isTrap: true, archetype: 'aging_legend', salary: 2, ti: 10 }),
    row({ pid: 6, salary: 10, ti: 1 }),
  ];
  // salary 2 < median 6 and ti 10 >= q75 7.75 -> would be a bargain, but trap wins.
  expect(classifyScatter(rows).get(5)).toBe('trap');
});

test('classifyScatter: archetype fallback marks trap archetypes even if the flag is unset', () => {
  const rows = [row({ pid: 7, isTrap: false, archetype: 'aging_legend' }), row({ pid: 8 })];
  expect(classifyScatter(rows).get(7)).toBe('trap');
  expect(classifyScatter(rows).get(8)).toBe('normal');
});

test('scatterGeometry: plots every row including null salary, exact scaling', () => {
  const g = scatterGeometry(ROWS, FS);
  expect(g.points).toHaveLength(4);                 // null-salary row IS plotted
  expect(g.xMax).toBe(10);
  expect(g.yMax).toBe(9);                           // ceil(max ti 9)
  const pricey = g.points.find((p) => p.pid === 1)!;
  expect(pricey.x).toBeCloseTo(690, 5);             // 50 + (10/10) * 640
  expect(pricey.y).toBeCloseTo(360 - (8 / 9) * 350, 5);
  const cheap = g.points.find((p) => p.pid === 2)!;
  expect(cheap.x).toBeCloseTo(178, 5);              // 50 + (2/10) * 640
  expect(cheap.y).toBeCloseTo(10, 5);               // ti 9 of 9 -> top of plot
  expect(cheap.cls).toBe('bargain');
});

test('scatterGeometry: ticks span the domain', () => {
  const g = scatterGeometry(ROWS, FS);
  expect(g.xTicks.map((t) => t.label)).toEqual(['0', '2', '4', '6', '8', '10']);
  expect(g.xTicks[0].pos).toBeCloseTo(50, 5);
  expect(g.xTicks.at(-1)!.pos).toBeCloseTo(690, 5);
  expect(g.yTicks.map((t) => t.label)).toEqual(['0', '4.5', '9']);
  expect(g.yTicks.map((t) => Math.round(t.pos))).toEqual([360, 185, 10]);
});

test('scatterGeometry: empty input yields empty points and sane domains', () => {
  const g = scatterGeometry([], FS);
  expect(g.points).toEqual([]);
  expect(g.xMax).toBe(10);
  expect(g.yMax).toBe(1);
});

// T5 contract values (reveal_weights.json shape; regression numbers approximate
// the seed-310 harness output: R2 0.70, turnover coef -3.84, payroll t -0.03, hype t 1.37).
const TW: RevealDoc['trueWeights'] = {
  narrative: 'n', defenseVisible: true, turnoverWeight: 1.5,
  engine: { base: 6.0, scoring: 1.6, playmaking: 0.55, steal: 1.05, block: 1.0, rebound: 0.25, turnover: 1.5 },
  regression: { winsR2: 0.7, turnoverCoef: -3.84, turnoverP: '<0.001', payrollT: -0.03, hypeT: 1.37 },
};
const FW: Frame = { w: 700, h: 400, padL: 10, padR: 10, padT: 30, padB: 30 };
// inner 680, gutter 36 -> groupW 322; labelW 96 -> span 226, half-span 113.

test('weightsGeometry: two side-by-side groups, each normalized to ITS OWN max — never a shared axis', () => {
  const g = weightsGeometry(TW, FW);
  expect(g.engine.boxX).toBe(10);
  expect(g.regression.boxX).toBe(368);              // 10 + 322 + 36
  expect(g.engine.zeroX).toBe(219);                 // 10 + 96 + 113
  expect(g.regression.zeroX).toBe(577);             // 368 + 96 + 113
  // Engine normalizes to |6|: base fills the half-span exactly.
  const base = g.engine.bars.find((b) => b.key === 'base')!;
  expect(base.w).toBeCloseTo(113, 5);
  expect(base.neg).toBe(false);
  expect(base.x).toBe(219);
  expect(base.valueLabel).toBe('+6');
  // Regression normalizes to |-3.84|: the turnover coefficient fills ITS half-span.
  const tov = g.regression.bars.find((b) => b.key === 'turnoverCoef')!;
  expect(tov.w).toBeCloseTo(113, 5);
  expect(tov.neg).toBe(true);
  // Same |fraction of group max| would give a DIFFERENT width on a shared axis:
  // 0.7 (R2) is tiny next to 6 but sizeable next to 3.84.
  const r2 = g.regression.bars.find((b) => b.key === 'winsR2')!;
  expect(r2.w).toBeCloseTo((0.7 / 3.84) * 113, 3);
  expect(g.caption).toContain('never share an axis');
});

test('weightsGeometry: engine turnover is presented as a penalty (negative)', () => {
  const g = weightsGeometry(TW, FW);
  const t = g.engine.bars.find((b) => b.key === 'turnover')!;
  expect(t.value).toBe(-1.5);                       // engine SUBTRACTS this weight
  expect(t.neg).toBe(true);
  expect(t.w).toBeCloseTo((1.5 / 6) * 113, 5);
  expect(t.x).toBeCloseTo(219 - (1.5 / 6) * 113, 5);
  expect(t.valueLabel).toBe('-1.5');
});

test('weightsGeometry: labels, p-value note, and DIFFERENT unit labels per side', () => {
  const g = weightsGeometry(TW, FW);
  expect(g.engine.bars.map((b) => b.key)).toEqual(
    ['base', 'scoring', 'playmaking', 'steal', 'block', 'rebound', 'turnover']);
  expect(g.regression.bars.map((b) => b.key)).toEqual(
    ['winsR2', 'turnoverCoef', 'payrollT', 'hypeT']);
  expect(g.regression.bars[1].note).toBe('p <0.001');   // turnoverP is the STRING '<0.001'
  expect(g.regression.bars[0].valueLabel).toBe('0.70');
  expect(g.regression.bars[2].valueLabel).toBe('-0.03');
  expect(g.engine.unitLabel).not.toBe(g.regression.unitLabel);
  expect(g.engine.unitLabel).toContain('TrueImpact points');
  expect(g.regression.unitLabel).toContain('league_history.csv');
});

test('winsPerDollarGeometry: sorted desc with name tiebreak, proportional widths', () => {
  const names = new Map([['t1', 'Alpha'], ['t2', 'Beta'], ['t3', 'Gamma']]);
  const rows: RevealDoc['winsPerDollar'] = [
    { teamId: 't1', wins: 6, totalSpend: 120, ratio: 0.05 },
    { teamId: 't3', wins: 9, totalSpend: 100, ratio: 0.09 },
    { teamId: 't2', wins: 9, totalSpend: 100, ratio: 0.09 },
  ];
  const f: Frame = { w: 700, h: 300, padL: 10, padR: 10, padT: 10, padB: 10 };
  const bars = winsPerDollarGeometry(rows, names, f);
  expect(bars.map((b) => b.name)).toEqual(['Beta', 'Gamma', 'Alpha']); // tie broken by name
  expect(bars[0].w).toBeCloseTo(530, 5);            // span = 700 - 20 - 150 (label gutter)
  expect(bars[2].w).toBeCloseTo((0.05 / 0.09) * 530, 3);
  expect(bars[0].x).toBe(160);                      // padL + label gutter
  expect(bars[0].ratioLabel).toBe('0.090');
  expect(bars[0].detail).toBe('9 W · $100.0M committed');
});

test('winsPerDollarGeometry: all-zero ratios yield zero-width bars, no NaN', () => {
  const f: Frame = { w: 700, h: 300, padL: 10, padR: 10, padT: 10, padB: 10 };
  const bars = winsPerDollarGeometry(
    [{ teamId: 't1', wins: 0, totalSpend: 0, ratio: 0 }], new Map([['t1', 'Alpha']]), f);
  expect(bars[0].w).toBe(0);
  expect(Number.isFinite(bars[0].w)).toBe(true);
});

test('bestWorstRows: rank order, player-name fallback, null signings preserved', () => {
  const perTeam: RevealDoc['perTeam'] = [
    { teamId: 't2', bestSigning: { pid: 7, valuePerDollar: 1.5 },
      worstSigning: { pid: 8, valuePerDollar: 0.2 } },
    { teamId: 't1', bestSigning: null, worstSigning: null },
  ];
  const rows = bestWorstRows(perTeam, new Map([['t1', 'Alpha'], ['t2', 'Beta']]),
    new Map([[7, 'Seven']]), ['t1', 't2']);
  expect(rows.map((r) => r.team)).toEqual(['Alpha', 'Beta']);   // order array wins
  expect(rows[0].best).toBeNull();
  expect(rows[0].worst).toBeNull();
  expect(rows[1].best).toEqual({ pid: 7, name: 'Seven', vpd: '1.50' });
  expect(rows[1].worst).toEqual({ pid: 8, name: '8', vpd: '0.20' }); // pid string fallback
  // No order array -> alphabetical by team name.
  const alpha = bestWorstRows(perTeam, new Map([['t1', 'Zed'], ['t2', 'Beta']]), new Map());
  expect(alpha.map((r) => r.team)).toEqual(['Beta', 'Zed']);
});
```

- [ ] **Step 2: Run the unit test — expect module-not-found failure**

```bash
cd games/salary-showdown/app && npx vitest run src/lib/revealCharts.test.ts
```

Expected outcome: the file FAILS to run with a resolve error — `Failed to resolve import "./revealCharts"` (or `Cannot find module './revealCharts'`). Zero tests pass. If it passes, stop: you are editing the wrong tree.

- [ ] **Step 3: Implement the transforms**

Create `games/salary-showdown/app/src/lib/revealCharts.ts` with exactly:

```ts
// Pure data -> geometry transforms for the four Finale charts. No React, no DOM:
// everything here is unit-testable arithmetic consumed by the SVG components in
// src/components/charts/ (team laptop debrief, Task 12) and the projector's
// FinaleWall (Task 13).
//
// THE FINALE IS THE SANCTIONED REVEAL (parent spec section 11.14): value-per-
// dollar, wins-per-dollar, trap/bargain labels, and the weights comparison are
// exactly what these transforms exist to compute. The "facts, never conclusions"
// rule and the "bargain award never renders perDollar" rule govern IN-GAME team
// screens (the Results page), not the Finale.
import type { RevealDoc } from '../types/models';

export interface Frame {
  w: number; h: number; padL: number; padR: number; padT: number; padB: number;
}

// Linear-interpolation quantile (numpy's default estimator) — the same one
// datagen's harness.py check2_bargains uses, so the app-side bargain cluster
// reproduces datagen's "check 2" definition exactly.
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const idx = (a.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, a.length - 1);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}
export const median = (xs: number[]): number => quantile(xs, 0.5);

export type ScatterClass = 'trap' | 'bargain' | 'normal';

// The two trap archetypes in backend/functions/src/data/hidden.json — the same
// pair enter:FINALE uses to set isTrap (game.js:574). isTrap is the server
// truth; the archetype strings are a belt-and-suspenders fallback.
const TRAP_ARCHETYPES = ['volume_trap', 'aging_legend'];

// Bargain = datagen harness.py check2_bargains, verbatim in spirit: bottom-half
// salary AND top-quartile TrueImpact. ('elite_defender' is the bargain
// cluster's backbone by pool construction — datagen config.py — but the cluster
// is DEFINED by price vs TrueImpact, not by archetype name.) A null salary
// (auction-class star: no list price) can never be a bargain. Trap wins when a
// row qualifies as both.
export function classifyScatter(rows: RevealDoc['scatter']): Map<number, ScatterClass> {
  const priced = rows.filter((r) => r.salary !== null).map((r) => r.salary as number);
  const salaryMed = median(priced);
  const tiQ3 = quantile(rows.map((r) => r.ti), 0.75);
  const out = new Map<number, ScatterClass>();
  for (const r of rows) {
    if (r.isTrap || TRAP_ARCHETYPES.includes(r.archetype)) out.set(r.pid, 'trap');
    else if (r.salary !== null && r.salary < salaryMed && r.ti >= tiQ3) out.set(r.pid, 'bargain');
    else out.set(r.pid, 'normal');
  }
  return out;
}

const fmtNum = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

export interface Tick { pos: number; label: string }
export interface ScatterPoint {
  pid: number; name: string; hype: number; ti: number; salary: number | null;
  cls: ScatterClass; x: number; y: number;
}
export interface ScatterGeometry {
  points: ScatterPoint[]; xTicks: Tick[]; yTicks: Tick[]; xMax: number; yMax: number;
}

// x = hype on [0, max(10, data max)]; y = TrueImpact on [0, ceil(data max)].
// Null-salary rows (auction stars) are plotted like everyone else — salary only
// matters for bargain classing.
export function scatterGeometry(rows: RevealDoc['scatter'], f: Frame): ScatterGeometry {
  const x0 = f.padL, x1 = f.w - f.padR, y0 = f.padT, y1 = f.h - f.padB;
  const xMax = Math.max(10, ...rows.map((r) => r.hype));
  const yMax = Math.max(1, Math.ceil(Math.max(0, ...rows.map((r) => r.ti))));
  const cls = classifyScatter(rows);
  const points = rows.map((r) => ({
    pid: r.pid, name: r.name, hype: r.hype, ti: r.ti, salary: r.salary,
    cls: cls.get(r.pid) as ScatterClass,
    x: x0 + (r.hype / xMax) * (x1 - x0),
    y: y1 - (r.ti / yMax) * (y1 - y0),
  }));
  const xTicks: Tick[] = [];
  for (let v = 0; v <= xMax; v += 2) {
    xTicks.push({ pos: x0 + (v / xMax) * (x1 - x0), label: String(v) });
  }
  const yTicks: Tick[] = [0, yMax / 2, yMax].map((v) => ({
    pos: y1 - (v / yMax) * (y1 - y0), label: fmtNum(v),
  }));
  return { points, xTicks, yTicks, xMax, yMax };
}

export interface WeightBar {
  key: string; label: string; value: number; valueLabel: string;
  x: number; y: number; w: number; h: number; neg: boolean; note?: string;
}
export interface WeightsGroup {
  title: string; unitLabel: string; boxX: number; zeroX: number; bars: WeightBar[];
}
export interface WeightsGeometry {
  engine: WeightsGroup; regression: WeightsGroup; caption: string;
}

const GUTTER = 36;
const LABEL_W = 96;
const signed = (v: number): string => `${v >= 0 ? '+' : ''}${fmtNum(v)}`;

interface WeightRowIn { key: string; label: string; value: number; valueLabel: string; note?: string }

function groupBars(rows: WeightRowIn[], boxX: number, groupW: number, f: Frame):
  { zeroX: number; bars: WeightBar[] } {
  const span = groupW - LABEL_W;
  const zeroX = boxX + LABEL_W + span / 2;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  const rowH = (f.h - f.padT - f.padB) / rows.length;
  const barH = rowH * 0.6;
  const bars = rows.map((r, i) => {
    const w = (Math.abs(r.value) / maxAbs) * (span / 2);
    const neg = r.value < 0;
    return {
      ...r, neg, w, h: barH,
      x: neg ? zeroX - w : zeroX,
      y: f.padT + i * rowH + (rowH - barH) / 2,
    };
  });
  return { zeroX, bars };
}

// HARD RULE (contracts): the two sides have DIFFERENT units — engine weights
// are TrueImpact points per stat unit; the regression side is R2/coefficient/
// t-statistics recovered from league_history.csv. Each group is normalized to
// ITS OWN max absolute value, drawn around its own zero line. The two sides
// NEVER share an axis.
export function weightsGeometry(tw: RevealDoc['trueWeights'], f: Frame): WeightsGeometry {
  const inner = f.w - f.padL - f.padR;
  const groupW = (inner - GUTTER) / 2;
  const e = tw.engine, r = tw.regression;
  // The engine SUBTRACTS its turnover weight inside the TrueImpact formula
  // (engine_params.json ti_weights); presenting it signed makes both panels
  // tell the same ball-security story.
  const engineRows: WeightRowIn[] = [
    { key: 'base', label: 'Base', value: e.base, valueLabel: signed(e.base) },
    { key: 'scoring', label: 'Scoring', value: e.scoring, valueLabel: signed(e.scoring) },
    { key: 'playmaking', label: 'Playmaking', value: e.playmaking, valueLabel: signed(e.playmaking) },
    { key: 'steal', label: 'Steals', value: e.steal, valueLabel: signed(e.steal) },
    { key: 'block', label: 'Blocks', value: e.block, valueLabel: signed(e.block) },
    { key: 'rebound', label: 'Rebounds', value: e.rebound, valueLabel: signed(e.rebound) },
    { key: 'turnover', label: 'Turnovers', value: -e.turnover, valueLabel: signed(-e.turnover) },
  ];
  const regressionRows: WeightRowIn[] = [
    { key: 'winsR2', label: 'R² (model fit)', value: r.winsR2, valueLabel: r.winsR2.toFixed(2) },
    { key: 'turnoverCoef', label: 'Turnovers (coef)', value: r.turnoverCoef,
      valueLabel: r.turnoverCoef.toFixed(2), note: `p ${r.turnoverP}` },
    { key: 'payrollT', label: 'Payroll (t)', value: r.payrollT, valueLabel: r.payrollT.toFixed(2) },
    { key: 'hypeT', label: 'Hype (t)', value: r.hypeT, valueLabel: r.hypeT.toFixed(2) },
  ];
  const eBox = f.padL;
  const rBox = f.padL + groupW + GUTTER;
  return {
    engine: {
      title: 'Engine weights',
      unitLabel: 'TrueImpact points per unit of stat',
      boxX: eBox, ...groupBars(engineRows, eBox, groupW, f),
    },
    regression: {
      title: 'Class regression',
      unitLabel: 'league_history.csv estimates — R², coefficient, t-statistics',
      boxX: rBox, ...groupBars(regressionRows, rBox, groupW, f),
    },
    caption: 'Each side is scaled to its own units — the two panels never share an axis.',
  };
}

export interface WpdBar {
  teamId: string; name: string; ratio: number; ratioLabel: string; detail: string;
  x: number; y: number; w: number; h: number;
}

const WPD_LABEL_W = 150;

// Sorted bars, best ratio first (ties broken by team name for determinism).
// totalSpend counts every contract ever signed — committed money is never
// recovered (enter:FINALE computes it over spendLog; that is the game's lesson).
export function winsPerDollarGeometry(rows: RevealDoc['winsPerDollar'],
  names: Map<string, string>, f: Frame): WpdBar[] {
  const nameOf = (id: string) => names.get(id) ?? id;
  const sorted = [...rows].sort((a, b) =>
    b.ratio - a.ratio || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
  const span = f.w - f.padL - f.padR - WPD_LABEL_W;
  const maxRatio = Math.max(...sorted.map((r) => r.ratio), 1e-9);
  const rowH = (f.h - f.padT - f.padB) / Math.max(1, sorted.length);
  const barH = rowH * 0.5;
  return sorted.map((r, i) => ({
    teamId: r.teamId, name: nameOf(r.teamId), ratio: r.ratio,
    ratioLabel: r.ratio.toFixed(3),
    detail: `${r.wins} W · $${r.totalSpend.toFixed(1)}M committed`,
    x: f.padL + WPD_LABEL_W,
    y: f.padT + i * rowH + (rowH - barH) / 2,
    w: (r.ratio / maxRatio) * span,
    h: barH,
  }));
}

export interface BestWorstRow {
  teamId: string; team: string;
  best: { pid: number; name: string; vpd: string } | null;
  worst: { pid: number; name: string; vpd: string } | null;
}

// Display rows for the best/worst-signing chart. `order` (usually final
// standings rank order) wins; teams absent from it sink to the bottom; name
// order breaks all remaining ties. valuePerDollar is server-rounded to 2dp
// already; toFixed(2) only stabilizes the string.
export function bestWorstRows(perTeam: RevealDoc['perTeam'],
  teamNames: Map<string, string>, playerNames: Map<number, string>,
  order?: string[]): BestWorstRow[] {
  const pos = (id: string) => {
    const i = order ? order.indexOf(id) : -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sig = (s: { pid: number; valuePerDollar: number } | null) => (s === null ? null : {
    pid: s.pid, name: playerNames.get(s.pid) ?? String(s.pid),
    vpd: s.valuePerDollar.toFixed(2),
  });
  return [...perTeam]
    .map((t) => ({
      teamId: t.teamId, team: teamNames.get(t.teamId) ?? t.teamId,
      best: sig(t.bestSigning), worst: sig(t.worstSigning),
    }))
    .sort((a, b) => pos(a.teamId) - pos(b.teamId) || a.team.localeCompare(b.team));
}
```

- [ ] **Step 4: Run the unit test — expect 15 passing**

```bash
cd games/salary-showdown/app && npx vitest run src/lib/revealCharts.test.ts
```

Expected outcome: `Test Files  1 passed (1)` · `Tests  15 passed (15)`.

- [ ] **Step 5: Write the failing integration test**

READ `src/itest/results.itest.tsx` and `src/itest/season.itest.tsx` first — this file copies their harness pattern exactly (explicit `signInAnonymously`, `joinGame` via the shipped `httpsCallable`, `sessionStorage ss.gameId`, render `<MemoryRouter><App/></MemoryRouter>`).

Create `games/salary-showdown/app/src/itest/finale.itest.tsx` with exactly:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';
import type { RevealDoc } from '../types/models';

// FinalePage is the TEAM client's scrollable debrief: podium + all four charts
// + own-team best/worst, reading reveal/latest through the member listener.
// THE FINALE IS THE SANCTIONED REVEAL — valuePerDollar renders here on purpose.
test('finale: joined GM sees podium, four SVG charts, own signings, narrative', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);

  // Alpha (team 0) has no bot, so the harness never signs for it — give it two
  // contracts (one cheap Guard, one pricey Wing) so the reveal's perTeam entry
  // has non-null, distinct best/worst signings. Free agency is NON-EXCLUSIVE:
  // bots signing the same players is fine. Two signings cannot trip
  // POSITION_LOCK (unmet 2G/2W/1B needs stay far below the open slots).
  await driveTo(seeded, 'R1:FREE_AGENCY');
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const priced = (market.available as number[])
    .map((pid) => ({ pid, pos: byPid[pid].position as string, sal: byPid[pid].salary_per_round as string }))
    .filter((p) => p.sal !== '');
  const bySal = (pos: string) => priced.filter((p) => p.pos === pos)
    .sort((a, b) => Number(a.sal) - Number(b.sal));
  await httpsCallable(functions, 'signPlayer')(
    { gameId: seeded.gameId, pid: bySal('G')[0].pid, years: 1 });
  await httpsCallable(functions, 'signPlayer')(
    { gameId: seeded.gameId, pid: bySal('W').at(-1)!.pid, years: 1 });

  await driveTo(seeded, 'FINALE');
  const rev = (await adminDb().doc(`games/${seeded.gameId}/reveal/latest`).get())
    .data() as unknown as RevealDoc;
  const mine = rev.perTeam.find((t) => t.teamId === seeded.teamIds[0])!;
  expect(mine.bestSigning).toBeTruthy();
  expect(mine.worstSigning).toBeTruthy();
  const nameOf = new Map(rev.scatter.map((p) => [p.pid, p.name]));

  render(<MemoryRouter initialEntries={['/game/conclusion']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Final Podium' }))
    .toBeInTheDocument(), { timeout: 30000 });

  // One hand-rolled SVG per chart, each with its own testid.
  for (const id of ['chart-scatter-ti', 'chart-weights-compare',
    'chart-wins-per-dollar', 'chart-best-worst']) {
    expect(screen.getByTestId(id).tagName.toLowerCase()).toBe('svg');
  }

  // Own-team best/worst section: player names AND the sanctioned valuePerDollar.
  const yours = screen.getByTestId('your-signings');
  expect(yours).toHaveTextContent(String(nameOf.get(mine.bestSigning!.pid)));
  expect(yours).toHaveTextContent(mine.bestSigning!.valuePerDollar.toFixed(2));
  expect(yours).toHaveTextContent(String(nameOf.get(mine.worstSigning!.pid)));
  expect(yours).toHaveTextContent(mine.worstSigning!.valuePerDollar.toFixed(2));

  // The narrative string from trueWeights, verbatim from the wire.
  expect(screen.getByTestId('narrative')).toHaveTextContent(rev.trueWeights.narrative);
}, 300000);
```

- [ ] **Step 6: Run the itest — expect failure (stub still routed)**

Requires the long-lived emulators (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`) already running, as for every itest.

```bash
cd games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/finale.itest.tsx
```

Expected outcome: FAIL — the season drives to FINALE, then the render still shows the `/game/conclusion` Stub, so the `waitFor` times out with `Unable to find an accessible element with the role "heading" and name "Final Podium"`. (The functions emulator hot-reloads on edit: one flaky run right after an edit is expected — re-run before investigating.)

- [ ] **Step 7: Create the four SVG chart components**

No new npm dependencies — plain `<svg>` JSX on the existing theme variables (`arena.css` custom properties). Create the directory `src/components/charts/` with these four files.

Create `games/salary-showdown/app/src/components/charts/ScatterTI.tsx` with exactly:

```tsx
import { scatterGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 1 — Hype vs TrueImpact. THE FINALE IS THE SANCTIONED REVEAL
// (parent spec section 11.14): trap/bargain labels are exactly what this chart
// exists to show. Hand-rolled SVG, theme colors, no chart library.
const F: Frame = { w: 720, h: 440, padL: 48, padR: 14, padT: 14, padB: 44 };
const DOT: Record<'trap' | 'bargain' | 'normal', { fill: string; r: number }> = {
  trap: { fill: 'var(--neg)', r: 5.5 },
  bargain: { fill: 'var(--ok)', r: 5.5 },
  normal: { fill: 'var(--muted)', r: 3.5 },
};

export function ScatterTI({ rows }: { rows: RevealDoc['scatter'] }) {
  const g = scatterGeometry(rows, F);
  const x0 = F.padL, x1 = F.w - F.padR, y0 = F.padT, y1 = F.h - F.padB;
  return (
    <svg data-testid="chart-scatter-ti" viewBox={`0 0 ${F.w} ${F.h}`} role="img"
      aria-label="Hype versus TrueImpact, traps and bargains labeled"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--border)" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="var(--border)" />
      {g.xTicks.map((t) => (
        <g key={`x${t.label}`}>
          <line x1={t.pos} y1={y1} x2={t.pos} y2={y1 + 4} stroke="var(--border)" />
          <text x={t.pos} y={y1 + 18} textAnchor="middle" fontSize={12} fill="var(--dim)">
            {t.label}</text>
        </g>
      ))}
      {g.yTicks.map((t) => (
        <g key={`y${t.label}`}>
          <line x1={x0 - 4} y1={t.pos} x2={x0} y2={t.pos} stroke="var(--border)" />
          <text x={x0 - 8} y={t.pos + 4} textAnchor="end" fontSize={12} fill="var(--dim)">
            {t.label}</text>
        </g>
      ))}
      <text x={(x0 + x1) / 2} y={F.h - 6} textAnchor="middle" fontSize={13}
        fill="var(--muted)">Hype</text>
      <text x={14} y={(y0 + y1) / 2} textAnchor="middle" fontSize={13} fill="var(--muted)"
        transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>TrueImpact</text>
      {g.points.map((p) => (
        <circle key={p.pid} cx={p.x} cy={p.y} r={DOT[p.cls].r} fill={DOT[p.cls].fill}
          opacity={p.cls === 'normal' ? 0.55 : 0.9}>
          <title>{`${p.name} — hype ${p.hype}, TI ${p.ti}${
            p.salary === null ? '' : `, $${p.salary.toFixed(1)}M`}`}</title>
        </circle>
      ))}
      <g fontSize={12}>
        <circle cx={x0 + 12} cy={y0 + 10} r={5.5} fill="var(--neg)" />
        <text x={x0 + 24} y={y0 + 14} fill="var(--text)">Trap (volume trap, aging legend)</text>
        <circle cx={x0 + 12} cy={y0 + 30} r={5.5} fill="var(--ok)" />
        <text x={x0 + 24} y={y0 + 34} fill="var(--text)">
          Bargain (bottom-half salary, top-quartile TrueImpact)</text>
        <circle cx={x0 + 12} cy={y0 + 50} r={3.5} fill="var(--muted)" />
        <text x={x0 + 24} y={y0 + 54} fill="var(--text)">Everyone else</text>
      </g>
    </svg>
  );
}
```

Create `games/salary-showdown/app/src/components/charts/WeightsCompare.tsx` with exactly:

```tsx
import { weightsGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 2 — what the engine paid for vs what the class regression found.
// HARD RULE (contracts): the two sides have DIFFERENT units — engine weights
// are TrueImpact points; the regression side is R²/coefficient/t-statistics
// from league_history.csv. Two independently normalized groups, each with its
// own zero line and unit label. NEVER a single shared axis.
const F: Frame = { w: 720, h: 400, padL: 12, padR: 12, padT: 56, padB: 34 };

export function WeightsCompare({ trueWeights }: { trueWeights: RevealDoc['trueWeights'] }) {
  const g = weightsGeometry(trueWeights, F);
  return (
    <svg data-testid="chart-weights-compare" viewBox={`0 0 ${F.w} ${F.h}`} role="img"
      aria-label="Engine weights next to the class regression, separate axes"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[g.engine, g.regression].map((grp) => (
        <g key={grp.title}>
          <text x={grp.boxX} y={22} fontSize={15} fontWeight={700} fill="var(--gold)">
            {grp.title}</text>
          <text x={grp.boxX} y={40} fontSize={11} fill="var(--dim)">{grp.unitLabel}</text>
          <line x1={grp.zeroX} y1={F.padT} x2={grp.zeroX} y2={F.h - F.padB}
            stroke="var(--border)" />
          {grp.bars.map((b) => (
            <g key={b.key}>
              <text x={grp.boxX} y={b.y + b.h / 2 + 4} fontSize={12} fill="var(--text)">
                {b.label}</text>
              <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
                fill={b.neg ? 'var(--neg)' : 'var(--ok)'} opacity={0.85} />
              <text x={b.neg ? b.x - 4 : b.x + b.w + 4} y={b.y + b.h / 2 + 4} fontSize={11}
                textAnchor={b.neg ? 'end' : 'start'} fill="var(--muted)"
                fontFamily="var(--mono)">
                {b.valueLabel}{b.note ? ` (${b.note})` : ''}</text>
            </g>
          ))}
        </g>
      ))}
      <text x={F.w / 2} y={F.h - 10} textAnchor="middle" fontSize={12} fill="var(--dim)">
        {g.caption}</text>
    </svg>
  );
}
```

Create `games/salary-showdown/app/src/components/charts/WinsPerDollar.tsx` with exactly:

```tsx
import { winsPerDollarGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 3 — wins per $M of committed payroll, best first. Sanctioned
// here (THE FINALE IS THE SANCTIONED REVEAL); the server computed totalSpend
// over spendLog, so cut contracts still count — committed money is never
// recovered. Height grows with the team count (2..21 franchises).
export function WinsPerDollar({ rows, teamNames }: {
  rows: RevealDoc['winsPerDollar']; teamNames: Map<string, string>;
}) {
  const f: Frame = {
    w: 720, h: 30 + rows.length * 36 + 12, padL: 12, padR: 88, padT: 30, padB: 8,
  };
  const bars = winsPerDollarGeometry(rows, teamNames, f);
  return (
    <svg data-testid="chart-wins-per-dollar" viewBox={`0 0 ${f.w} ${f.h}`} role="img"
      aria-label="Wins per payroll dollar by team, best first"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <text x={f.padL} y={18} fontSize={11} fill="var(--dim)">
        Wins per $M of committed payroll — cut contracts still count</text>
      {bars.map((b) => (
        <g key={b.teamId}>
          <text x={f.padL} y={b.y + b.h / 2 + 4} fontSize={13} fontWeight={700}
            fill="var(--text)">{b.name}</text>
          <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
            fill="var(--gold)" opacity={0.85} />
          <text x={b.x + Math.max(b.w, 0.5) + 6} y={b.y + b.h / 2 + 4} fontSize={11}
            fill="var(--muted)" fontFamily="var(--mono)">
            {b.ratioLabel} · {b.detail}</text>
        </g>
      ))}
    </svg>
  );
}
```

Create `games/salary-showdown/app/src/components/charts/BestWorst.tsx` with exactly:

```tsx
import { bestWorstRows } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 4 — every team's best and worst signing by TrueImpact per $M of
// contract rate. valuePerDollar renders here BY DESIGN: the Finale is the
// sanctioned reveal (parent spec section 11.14); the never-render rule applies
// to the in-game Results bargain award, not to this page.
export function BestWorst({ perTeam, teamNames, playerNames, order, highlightTeamId }: {
  perTeam: RevealDoc['perTeam']; teamNames: Map<string, string>;
  playerNames: Map<number, string>; order?: string[];
  highlightTeamId?: string | null;
}) {
  const rows = bestWorstRows(perTeam, teamNames, playerNames, order);
  const rowH = 34, headH = 30, w = 720;
  const h = headH + rows.length * rowH + 8;
  return (
    <svg data-testid="chart-best-worst" viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label="Best and worst signing per team, TrueImpact per million dollars"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <g fontSize={11} fill="var(--dim)">
        <text x={12} y={18}>TEAM</text>
        <text x={210} y={18}>BEST SIGNING · TI PER $M</text>
        <text x={470} y={18}>WORST SIGNING · TI PER $M</text>
      </g>
      {rows.map((r, i) => {
        const y = headH + i * rowH;
        return (
          <g key={r.teamId}>
            {r.teamId === highlightTeamId && (
              <rect x={2} y={y} width={w - 4} height={rowH} rx={4}
                fill="rgba(255, 201, 77, 0.12)" />
            )}
            <line x1={2} y1={y} x2={w - 2} y2={y} stroke="var(--track)" />
            <text x={12} y={y + 22} fontSize={13} fontWeight={700} fill="var(--text)">
              {r.team}</text>
            <text x={210} y={y + 22} fontSize={12} fill="var(--ok)" fontFamily="var(--mono)">
              {r.best ? `${r.best.name} · ${r.best.vpd}` : '—'}</text>
            <text x={470} y={y + 22} fontSize={12} fill="var(--neg)" fontFamily="var(--mono)">
              {r.worst ? `${r.worst.name} · ${r.worst.vpd}` : '—'}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 8: Create FinalePage**

Create `games/salary-showdown/app/src/pages/FinalePage.tsx` with exactly:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { ScatterTI } from '../components/charts/ScatterTI';
import { WeightsCompare } from '../components/charts/WeightsCompare';
import { WinsPerDollar } from '../components/charts/WinsPerDollar';
import { BestWorst } from '../components/charts/BestWorst';
import type { RevealDoc, StandingsRow } from '../types/models';

// THE FINALE IS THE SANCTIONED REVEAL (parent spec section 11.14):
// value-per-dollar, wins-per-dollar, trap/bargain labels, and the weights
// comparison are exactly what this page exists to show — do not hide them
// here. The "facts, never conclusions" rule and the perDollar-never-renders
// rule govern IN-GAME team screens (the Results bargain award), not this page.
//
// This is the TEAM-CLIENT laptop debrief: one scrollable page that IGNORES the
// game doc's revealStep entirely (revealStep drives the projector wall only).
export default function FinalePage() {
  const { gameId, game, membership, teams } = useGame();
  const round = game?.round ?? 0;
  const rd = useRoundDoc(round); // final standings live on rounds/{round} (round 5 at FINALE)
  const [reveal, setReveal] = useState<RevealDoc | null>(null);

  // Own listener on games/{id}/reveal/latest — member-readable once
  // status == 'finished' (firestore.rules), which the RESULTS·R5 flip sets
  // before the transition-gated phase ever presents FINALE. Error callback
  // logs via console.error — never a silent no-op (the §3a lesson).
  useEffect(() => {
    if (!gameId || game?.phase !== 'FINALE') { setReveal(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'reveal', 'latest'),
      (s) => setReveal(s.exists() ? (s.data() as RevealDoc) : null),
      (e) => console.error('reveal/latest listener', e));
  }, [gameId, game?.phase]);

  const playerNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of reveal?.scatter ?? []) m.set(p.pid, p.name);
    return m;
  }, [reveal]);
  const teamNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const [tid, t] of teams) m.set(tid, t.name);
    return m;
  }, [teams]);

  if (!game || !membership || !rd || !reveal) return null;

  const ranked = [...rd.standings].sort((a, b) => a.rank - b.rank);
  const podium = ranked.slice(0, 3);
  // 2nd - 1st - 3rd visual order; small games may have fewer than three teams.
  const podiumOrder = [podium[1], podium[0], podium[2]]
    .filter((s): s is StandingsRow => s !== undefined);
  const rankOrder = ranked.map((s) => s.teamId);
  const mine = reveal.perTeam.find((t) => t.teamId === membership.teamId) ?? null;

  return (
    <main className="page">
      <PhaseHeader title="Finale" round={round} timerEndsAt={game.timerEndsAt} />

      <section className="card" data-testid="podium">
        <h2 style={{ margin: '0 0 10px' }}>Final Podium</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          {podiumOrder.map((s) => (
            <div key={s.teamId} className="inset"
              style={{
                flex: s.rank === 1 ? 1.3 : 1, textAlign: 'center',
                paddingTop: s.rank === 1 ? 26 : 12,
                borderColor: s.rank === 1 ? 'var(--gold)' : undefined,
              }}>
              <div className="mono" style={{ fontSize: s.rank === 1 ? 36 : 24, color: 'var(--gold)' }}>
                {`#${s.rank}`}</div>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div className="muted mono">{s.wins}-{s.losses}</div>
            </div>
          ))}
        </div>
      </section>

      {mine && (
        <section className="card" data-testid="your-signings"
          style={{ margin: '12px 0', border: '1px solid var(--gold)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Your best & worst signing</h3>
          {/* TrueImpact per $M of contract rate — sanctioned here and only here. */}
          {mine.bestSigning ? (
            <div>
              <span className="dim">BEST</span>{' '}
              {playerNames.get(mine.bestSigning.pid) ?? mine.bestSigning.pid} ·{' '}
              <span className="ok mono">
                {mine.bestSigning.valuePerDollar.toFixed(2)} TI per $M</span>
            </div>
          ) : <div className="muted">No signings on record.</div>}
          {mine.worstSigning && (
            <div style={{ marginTop: 4 }}>
              <span className="dim">WORST</span>{' '}
              {playerNames.get(mine.worstSigning.pid) ?? mine.worstSigning.pid} ·{' '}
              <span className="neg mono">
                {mine.worstSigning.valuePerDollar.toFixed(2)} TI per $M</span>
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Hype vs TrueImpact</h3>
        <ScatterTI rows={reveal.scatter} />
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>What the engine paid for</h3>
        <WeightsCompare trueWeights={reveal.trueWeights} />
        <p className="muted" data-testid="narrative" style={{ marginBottom: 0 }}>
          {reveal.trueWeights.narrative}</p>
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Wins per dollar</h3>
        <WinsPerDollar rows={reveal.winsPerDollar} teamNames={teamNames} />
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Best & worst signings</h3>
        <BestWorst perTeam={reveal.perTeam} teamNames={teamNames}
          playerNames={playerNames} order={rankOrder}
          highlightTeamId={membership.teamId} />
      </section>
    </main>
  );
}
```

- [ ] **Step 9: Route FinalePage at /game/conclusion (replace the Stub)**

Three exact edits to `games/salary-showdown/app/src/App.tsx`. `noUnusedLocals` is on, so the now-unused `Stub` must be deleted, not left behind.

Edit 1 — add the import. Old:
```tsx
import StandingsPage from './pages/StandingsPage';
```
New:
```tsx
import StandingsPage from './pages/StandingsPage';
import FinalePage from './pages/FinalePage';
```

Edit 2 — delete the Stub component (its only consumer was the conclusion route). Old (delete the whole block AND the blank line after it):
```tsx
const Stub = ({ name }: { name: string }) => (
  <main style={{ color: '#f2f5fa', padding: 24 }}>
    <h1 style={{ color: '#ffc94d', fontStyle: 'italic', textTransform: 'uppercase' }}>
      Salary Showdown
    </h1>
    <p data-testid="stub">{name} — under construction</p>
  </main>
);

```
New: (nothing — remove it).

Edit 3 — swap the route. Old:
```tsx
          <Route path="/game/conclusion" element={<Stub name="Finale (Plan 3)" />} />
```
New:
```tsx
          <Route path="/game/conclusion" element={<FinalePage />} />
```

If Task 6 already added `/professor` and `/bigscreen` routes, leave them untouched; these three anchors are unaffected by that change.

- [ ] **Step 10: Update season.itest.tsx — the stub assertion is now wrong on purpose**

`src/itest/season.itest.tsx:36-38` still asserts the old Stub. Edit it. Old:
```tsx
  await driveTo(seeded, 'FINALE');
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Finale (Plan 3)'),
    { timeout: 30000 });
```
New:
```tsx
  await driveTo(seeded, 'FINALE');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Final Podium' }))
    .toBeInTheDocument(), { timeout: 30000 });
```

(The season test's GM never signs anyone, so its team's perTeam entry has null best/worst — FinalePage renders the "No signings on record." fallback, and the podium heading is still the right rendezvous point.)

- [ ] **Step 11: Run the finale itest — expect pass**

```bash
cd games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/finale.itest.tsx
```

Expected outcome: `Test Files  1 passed (1)` · `Tests  1 passed (1)` (takes a few minutes — it drives a full 5-round season). If the very first run after editing backend files in earlier tasks flakes, re-run once before investigating (functions emulator hot-reload).

- [ ] **Step 12: Wider verification — unit suite, types, UI audit, full itest suite**

```bash
cd games/salary-showdown/app && npx vitest run
```
Expected: all unit test files pass, 0 failures (includes the 15 new revealCharts tests; total count depends on how many of Tasks 6-11 have landed).

```bash
cd games/salary-showdown/app && npx tsc -b
```
Expected: exits 0, no output.

```bash
cd games/salary-showdown/app && npm run audit:ui
```
Expected: `audit:ui clean — <N> files scanned` (the new charts/page must clear the emoji and judgment-language tripwires; `² · — ★` are not in the banned ranges).

```bash
cd games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
```
Expected: every itest file passes — the 14 pre-existing tests (including the modified season.itest.tsx) plus finale.itest.tsx and any panel/bigscreen itests earlier 3a tasks added. 0 failures.

- [ ] **Step 13: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD
```
(Verify HEAD is where you expect before committing — an external process races HEAD in this workspace.)

```bash
cd /Users/dylanmassaro/FenriX && git add \
  games/salary-showdown/app/src/lib/revealCharts.ts \
  games/salary-showdown/app/src/lib/revealCharts.test.ts \
  games/salary-showdown/app/src/components/charts/ScatterTI.tsx \
  games/salary-showdown/app/src/components/charts/WeightsCompare.tsx \
  games/salary-showdown/app/src/components/charts/WinsPerDollar.tsx \
  games/salary-showdown/app/src/components/charts/BestWorst.tsx \
  games/salary-showdown/app/src/pages/FinalePage.tsx \
  games/salary-showdown/app/src/itest/finale.itest.tsx \
  games/salary-showdown/app/src/App.tsx \
  games/salary-showdown/app/src/itest/season.itest.tsx \
&& git commit -m "$(cat <<'EOF'
feat(salary-showdown): FinalePage laptop debrief + hand-rolled SVG reveal charts

Task 12 of Plan 3a. Adds pure data->geometry transforms (revealCharts.ts) for
the four sanctioned Finale charts — hype-vs-TrueImpact scatter with
trap/bargain classing (traps from the server flag, bargains via datagen's
bottom-half-salary + top-quartile-TI rule), engine-vs-regression weights
comparison rendered as two independently normalized groups that never share an
axis, wins-per-dollar ranking, and per-team best/worst signings — plus the four
SVG chart components (no new dependencies) and FinalePage, the scrollable
team-client debrief replacing the /game/conclusion stub. FinalePage reads
reveal/latest through its own member listener and ignores revealStep (that
field drives the projector wall). THE FINALE IS THE SANCTIONED REVEAL (parent
spec 11.14). season.itest updated: the FINALE rendezvous is now the podium
heading, not the stub.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

Expected outcome: one commit containing exactly the ten files listed above.

---

### Task 13: FinaleWall (bigscreen) + RevealStepper (panel)

**Files:**
- Create: `games/salary-showdown/app/src/components/bigscreen/FinaleWall.tsx`
- Create: `games/salary-showdown/app/src/components/professor/RevealStepper.tsx`
- Modify: `games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx` (created T10 — replace the FINALE placeholder branch of its phase→wall mode switch; anchor described in Step 4)
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx` (created T6, extended T7/T8/T9 — insert `<RevealStepper />` immediately after `<SubmissionGrid />`; anchor described in Step 6)
- Test: `games/salary-showdown/app/src/itest/finale.itest.tsx` (created T12 — append one helper + one describe block with two tests)

**Interfaces:**
- Consumes:
  - `useProfessor()` from `src/contexts/ProfessorContext` (T6) — this task uses `{ gameId, game, teams, round, reveal, call }` where `game: GameDoc | null` is transition-GATED and carries `revealStep?: number`, `teams: Map<string, TeamDoc>`, `round: RoundDoc | null` (= `rounds/{game.round}`; at FINALE `game.round` is 5, so `round.standings` IS the final standings), `reveal: RevealDoc | null` (fetched only when phase is `FINALE`), `call<T>(name, data)`.
  - Backend callable `setRevealStep({gameId, step}) → {revealStep: step}` (T3) — professor-only; phase must be `FINALE` else `PHASE_MISMATCH`; `step` integer 0..8 else `BAD_STEP` (invalid-argument); writes `games/{id}.revealStep`.
  - `games/{id}.revealStep` is ABSENT until the first `setRevealStep` call (adjudicated T3 change — the FINALE flip does NOT write it). Every read of `game.revealStep` in this task defaults it with `?? 0`, so a freshly finished game still starts on the Podium.
  - Types from `src/types/models.ts` (T6 — import, never redefine): `RevealDoc`, `StandingsRow`.
  - T12 chart components (**import, never redefine or re-implement**). Exact signatures this task compiles against:
    ```tsx
    // src/components/charts/ScatterTI.tsx
    export function ScatterTI({ rows }: { rows: RevealDoc['scatter'] }): JSX.Element
    // src/components/charts/WeightsCompare.tsx
    export function WeightsCompare({ trueWeights }: { trueWeights: RevealDoc['trueWeights'] }): JSX.Element
    // src/components/charts/WinsPerDollar.tsx
    export function WinsPerDollar({ rows, teamNames }:
      { rows: RevealDoc['winsPerDollar']; teamNames: Map<string, string> }): JSX.Element
    // src/components/charts/BestWorst.tsx
    export function BestWorst({ perTeam, teamNames, playerNames, order, highlightTeamId }:
      { perTeam: RevealDoc['perTeam']; teamNames: Map<string, string>;
        playerNames: Map<number, string>; order?: string[];
        highlightTeamId?: string | null }): JSX.Element
    ```
    `ScatterTI`'s `rows` is `reveal.scatter` verbatim — the same thing FinalePage passes (the data→geometry transform lives inside T12's `src/lib/revealCharts.ts` and the component calls it itself; never re-implement it here). `BestWorst`'s `playerNames` is REQUIRED — `Map<number, string>` of pid→name, built inside FinaleWall from `reveal.scatter` (which carries `pid` + `name` for every player). `order` and `highlightTeamId` are optional and omitted on the wall. If Task 12 shipped these components with different export style (default exports) or different prop shapes, adapt ONLY the four import lines and four call sites in `FinaleWall.tsx` to Task 12's actual exports — do not change Task 12's files, do not re-implement any data→geometry transform locally, and keep this task's wrapper `data-testid`s exactly as written (the itest matches on the wrappers, deliberately independent of chart internals).
  - `src/pages/bigscreen/BigscreenPage.tsx` (T10) — the phase→wall mode switch this task extends. T10's contract: mode is a function of the transition-GATED phase; LOBBY → LobbyWall · FO/FA/AUCTION/LINEUP → DecisionWall · SIMULATE → SimulateFlood (T11) · RESULTS → StandingsShuffle (T11) · FINALE → a placeholder that this task replaces.
  - `ErrorNotice` from `src/components/ui/ErrorNotice` (existing): `export function ErrorNotice({ error }: { error: unknown | null })`.
  - itest harness `src/itest/harness.ts` (existing): `adminDb()`, `newClient()`, `driveTo()`, types `Client`, `Seeded`.
- Produces:
  - `export function FinaleWall(): JSX.Element | null` in `src/components/bigscreen/FinaleWall.tsx` — no props; reads `useProfessor()` itself (so the BigscreenPage wiring is a bare `<FinaleWall />`). Renders `data-testid="finale-wall"` with `data-testid="finale-step-title"` and exactly one of: `finale-podium` (step 0) · `finale-scatter` (1) · `finale-weights` (2) · `finale-wpd` (3) · `finale-bestworst` (4). Clamps incoming `revealStep` to 0..4.
  - `export function RevealStepper(): JSX.Element | null` in `src/components/professor/RevealStepper.tsx` — no props; renders `null` unless phase is `FINALE` (so ProfessorPage mounts it unconditionally). `data-testid="reveal-stepper"`, buttons `aria-label="previous step"` (‹) / `aria-label="next step"` (›), label `data-testid="reveal-step-name"` with text `<step+1> of 5 · <name>`.

Hard rules restated for this task (do not "improve" on them):
- **THE FINALE IS THE SANCTIONED REVEAL** (parent spec §11.14): value-per-dollar, wins-per-dollar, trap/bargain labels, and the weights comparison are exactly what this surface exists to show — do NOT hide or soften them here. (The facts-not-conclusions rule governs *in-game team screens*; the in-game Results bargain award still never renders `perDollar` — that code is untouched by this task.)
- NO emojis anywhere in product UI. The `‹` `›` glyphs on the stepper are explicitly sanctioned; `·` and `…` are fine. `npm run audit:ui` will fail the build on a violation.
- Step names are contract-fixed, verbatim: `Podium` · `Hype vs Reality` · `What the engine paid for` · `Wins per dollar` · `Best & worst signings`. Never re-word, never abbreviate.
- The wall CLAMPS incoming `revealStep` to 0..4 (the server accepts 0..8; anything ≥ 4 parks on the last chart, never a blank wall). The stepper also clamps before calling.
- All bigscreen text: big, dark background, NO interactivity on the wall (the panel is the only control surface).
- NO new npm dependencies anywhere in 3a (the charts are T12's hand-rolled SVG; this task only composes them).
- All phase driving in tests goes through the harness, which always sends `expectedPhase` + `expectedRound` to `advancePhase` (standing hard rule).

All commands below run from `/Users/dylanmassaro/FenriX/games/salary-showdown/app` with the long-lived emulators already running (Functions 5101 / Firestore 8180 / Auth 9199, project `salary-showdown-dev`). Do not start or restart the emulators. One flaky run right after a functions-emulator hot reload is expected — re-run before investigating.

- [ ] **Step 1: Failing itest — append the T13 block to `src/itest/finale.itest.tsx`**

  READ `src/itest/finale.itest.tsx` (created by Task 12) top to bottom first. Then:

  1. Add ONLY the imports that are missing from the file's existing import block. The full set this block needs is:

     ```tsx
     import { render, screen, waitFor } from '@testing-library/react';
     import userEvent from '@testing-library/user-event';
     import { MemoryRouter } from 'react-router-dom';
     import { httpsCallable } from 'firebase/functions';
     import { signInAnonymously } from 'firebase/auth';
     import { adminDb, driveTo, newClient, type Client, type Seeded } from './harness';
     import { auth, functions } from '../lib/firebase';
     import App from '../App';
     ```

  2. Append the helper and describe block below to the END of the file. If Task 12's file already defines a helper that (a) makes the DEFAULT app's signed-in user the professor via `httpsCallable(functions, 'createGame')` AND (b) fills GM+Scout+Coach bots on EVERY team AND (c) drives to FINALE, reuse it and skip `seedProfFinale`; otherwise add it verbatim. (Task 12's own FinalePage tests use `seedToPhase`, whose professor is a separate harness client — that cannot be reused here, because the rendered panel's and wall's reads/calls go through the DEFAULT app, whose anonymous user must BE the professor.)

     ```tsx
     // T13 — FinaleWall (projector) + RevealStepper (panel). The rendered
     // surfaces read via ProfessorProvider and call setRevealStep through the
     // default app, so the DEFAULT app's anonymous user must BE the professor
     // (contracts: the itest client that calls createGame IS the professor; the
     // professor has NO players/{uid} membership doc — joinGame is never called
     // for it). The prof shim satisfies the harness Client shape so driveTo()
     // works unchanged (it always sends expectedPhase + expectedRound to
     // advancePhase — RULING unchanged).
     async function seedProfFinale(names: string[]): Promise<Seeded> {
       const cred = await signInAnonymously(auth);
       const { gameId, joinCode } = (await httpsCallable(functions, 'createGame')({
         teamNames: names })).data as { gameId: string; joinCode: string };
       const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
       const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
       const prof: Client = {
         uid: cred.user.uid,
         call: <T,>(fn: string, data: unknown) =>
           httpsCallable(functions, fn)(data).then((r) => r.data as T),
         dispose: async () => {},
       };
       const bots: Seeded['bots'] = [];
       for (const [i, teamId] of teamIds.entries()) {
         const gm = await newClient(`fgm${i}`);
         const scout = await newClient(`fsc${i}`);
         const coach = await newClient(`fco${i}`);
         await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
         await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
         await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
         bots.push({ teamId, gm, scout, coach });
       }
       const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };
       await driveTo(seeded, 'FINALE');
       return seeded;
     }

     describe('T13: finale wall + reveal stepper', () => {
       let seeded: Seeded;
       beforeAll(async () => {
         seeded = await seedProfFinale(['Alpha', 'Beta']);
         // Earlier tests in this file join the default user into THEIR game and
         // set sessionStorage 'ss.gameId'; with it set, GameContext wakes up and
         // PhaseRouter would yank /professor and /bigscreen to /game/conclusion.
         // Clear it so GameProvider stays dormant on the new surfaces.
         sessionStorage.removeItem('ss.gameId');
         localStorage.setItem('ss.profGameId', seeded.gameId);
       }, 600000);

       test('panel stepper: › advances revealStep 0→1 via setRevealStep', async () => {
         render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
         // revealStep is absent until the first setRevealStep call (T3); the
         // stepper's `?? 0` default still shows step 1 of 5.
         await waitFor(() => expect(screen.getByTestId('reveal-step-name'))
           .toHaveTextContent('1 of 5 · Podium'), { timeout: 20000 });
         expect(screen.getByRole('button', { name: 'previous step' })).toBeDisabled();

         const user = userEvent.setup();
         await user.click(screen.getByRole('button', { name: 'next step' }));
         await waitFor(async () => {
           const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
           expect(g.revealStep).toBe(1);
         }, { timeout: 15000 });
         await waitFor(() => expect(screen.getByTestId('reveal-step-name'))
           .toHaveTextContent('2 of 5 · Hype vs Reality'), { timeout: 15000 });
       }, 120000);

       test('wall: renders the revealStep chart; podium at 0; clamps 8 to the last step', async () => {
         // revealStep is 1 after the stepper test above → the wall opens on the
         // hype-vs-TrueImpact scatter, not the podium.
         render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);
         await waitFor(() => expect(screen.getByTestId('finale-scatter')).toBeInTheDocument(),
           { timeout: 20000 });
         expect(screen.queryByTestId('finale-podium')).toBeNull();

         // Harness professor steps back to 0 → podium = top three of the FINAL
         // standings (rounds/5 — game.round is 5 at FINALE).
         await seeded.prof.call('setRevealStep', { gameId: seeded.gameId, step: 0 });
         await waitFor(() => expect(screen.getByTestId('finale-podium')).toBeInTheDocument(),
           { timeout: 15000 });
         expect(screen.getByTestId('finale-step-title')).toHaveTextContent('Podium');
         const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/5`).get()).data()!;
         const first = rd.standings.find((r: { rank: number }) => r.rank === 1)!;
         expect(screen.getByTestId('finale-podium')).toHaveTextContent(first.name);

         // Server accepts 0..8; the wall clamps to its 5 steps → 8 parks on the
         // last chart, never a blank wall.
         await seeded.prof.call('setRevealStep', { gameId: seeded.gameId, step: 8 });
         await waitFor(() => expect(screen.getByTestId('finale-bestworst')).toBeInTheDocument(),
           { timeout: 15000 });
         expect(screen.getByTestId('finale-step-title')).toHaveTextContent('Best & worst signings');
       }, 120000);
     });
     ```

- [ ] **Step 2: Run the finale itest — expect the two new tests to FAIL**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/finale.itest.tsx
  ```

  Expected outcome: Task 12's existing test(s) in the file still pass; the two new tests FAIL — the stepper test at its first `waitFor` with `Unable to find an element by: [data-testid="reveal-step-name"]` (the component does not exist yet), the wall test with `Unable to find an element by: [data-testid="finale-scatter"]` (BigscreenPage still renders T10's FINALE placeholder). The expensive beforeAll seed runs once for both (~2-4 min). If anything fails differently, stop and fix that first.

- [ ] **Step 3: Create `src/components/bigscreen/FinaleWall.tsx`**

  Full file contents:

  ```tsx
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { BestWorst } from '../charts/BestWorst';
  import { ScatterTI } from '../charts/ScatterTI';
  import { WeightsCompare } from '../charts/WeightsCompare';
  import { WinsPerDollar } from '../charts/WinsPerDollar';
  import type { StandingsRow } from '../../types/models';

  // FINALE wall (design spec §6.5): the projector face of the sanctioned reveal
  // (parent spec §11.14) — value-per-dollar, wins-per-dollar, trap labels and the
  // weights comparison are exactly what this surface exists to show. Read-only:
  // the professor's RevealStepper is the only control; this wall just follows
  // games/{id}.revealStep. No interactivity, no emojis, big type on the dark
  // global theme.
  //
  // Step titles are contract-fixed, verbatim — shared with RevealStepper. Never
  // re-word them.
  const STEP_TITLES = [
    'Podium',
    'Hype vs Reality',
    'What the engine paid for',
    'Wins per dollar',
    'Best & worst signings',
  ] as const;

  export function FinaleWall() {
    const { game, round, reveal, teams } = useProfessor();
    if (!game) return null;
    // Clamp incoming revealStep to this wall's 5 steps (0..4). setRevealStep
    // accepts 0..8 server-side; anything past the last chart parks on
    // "Best & worst signings" instead of blanking the projector. revealStep is
    // absent until the first setRevealStep call (T3) — `?? 0` opens on the Podium.
    const step = Math.min(STEP_TITLES.length - 1, Math.max(0, game.revealStep ?? 0));
    const teamNames = new Map([...teams.entries()].map(([id, t]) => [id, t.name] as const));
    // BestWorst requires pid→name; reveal.scatter carries pid + name for EVERY
    // player, so it doubles as the roster lookup (same trick as FinalePage).
    const playerNames = new Map(
      (reveal?.scatter ?? []).map((p) => [p.pid, p.name] as const));
    // At FINALE game.round is 5, so ProfessorContext's round doc IS the final
    // round: its standings are the season-final table the podium reads.
    const podium = (round?.standings ?? [])
      .filter((r) => r.rank <= 3)
      .sort((a, b) => a.rank - b.rank);
    // Visual order 2nd · 1st · 3rd (champion center); tolerate < 3 teams.
    const podiumOrder = [podium[1], podium[0], podium[2]]
      .filter((r): r is StandingsRow => r !== undefined);
    return (
      <div data-testid="finale-wall" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div className="dim"
          style={{ fontSize: 26, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Finale
        </div>
        <h1 data-testid="finale-step-title" style={{ fontSize: 52, margin: '8px 0 28px' }}>
          {STEP_TITLES[step]}
        </h1>
        {step === 0 && (
          <div data-testid="finale-podium" style={{ display: 'flex',
            justifyContent: 'center', alignItems: 'flex-end', gap: 28 }}>
            {podiumOrder.map((r) => (
              <div key={r.teamId} className="card"
                style={{ padding: r.rank === 1 ? '40px 44px' : '26px 32px', minWidth: 220 }}>
                <div className="mono"
                  style={{ fontSize: r.rank === 1 ? 64 : 44, color: 'var(--gold)' }}>
                  #{r.rank}
                </div>
                <div style={{ fontSize: r.rank === 1 ? 40 : 30, fontWeight: 800 }}>
                  {r.name}
                </div>
                <div className="muted" style={{ fontSize: 24 }}>{r.wins}–{r.losses}</div>
              </div>
            ))}
          </div>
        )}
        {step > 0 && !reveal && (
          <p className="dim" style={{ fontSize: 28 }}>Loading the reveal…</p>
        )}
        {step === 1 && reveal && (
          <div data-testid="finale-scatter">
            <ScatterTI rows={reveal.scatter} />
          </div>
        )}
        {step === 2 && reveal && (
          <div data-testid="finale-weights">
            <WeightsCompare trueWeights={reveal.trueWeights} />
          </div>
        )}
        {step === 3 && reveal && (
          <div data-testid="finale-wpd">
            <WinsPerDollar rows={reveal.winsPerDollar} teamNames={teamNames} />
          </div>
        )}
        {step === 4 && reveal && (
          <div data-testid="finale-bestworst">
            <BestWorst perTeam={reveal.perTeam} teamNames={teamNames}
              playerNames={playerNames} />
          </div>
        )}
      </div>
    );
  }
  ```

  If Task 12's chart exports differ from the Interfaces block above, adapt ONLY the four `../charts/...` import lines and the four call sites; keep every `data-testid` and all step titles byte-identical.

- [ ] **Step 4: Wire FinaleWall into `src/pages/bigscreen/BigscreenPage.tsx` (replace the T10 FINALE placeholder)**

  Open `src/pages/bigscreen/BigscreenPage.tsx` (created by Task 10, SIMULATE/RESULTS branches replaced by Task 11). It contains a mode switch on the transition-gated phase mapping `LOBBY → <LobbyWall />`, `FRONT_OFFICE|FREE_AGENCY|AUCTION|LINEUP → <DecisionWall />`, `SIMULATE → <SimulateFlood />`, `RESULTS → <StandingsShuffle />`, and a FINALE placeholder (per T10's charter). Two edits:

  1. Add to the import block, alongside the existing `../../components/bigscreen/...` imports:

     ```tsx
     import { FinaleWall } from '../../components/bigscreen/FinaleWall';
     ```

  2. Find the `FINALE` branch of the mode switch. Whatever placeholder T10 left there — e.g. a `case 'FINALE': return <p ...>Finale</p>;` arm, an object-map entry, or a ternary leg — replace ONLY that branch's rendered element with:

     ```tsx
     <FinaleWall />
     ```

     `FinaleWall` takes no props (it reads `useProfessor()` itself). Do not touch any other branch, and do not add a conditional around it — the switch already selects on the gated phase, so FinaleWall only mounts at FINALE. If T10's placeholder carried a `data-testid`, delete it with the placeholder; T13's testids live inside FinaleWall.

  3. **Dead-code cleanup (required for `tsc -b` to pass):** the FINALE branch was the LAST
     user of T10's `PhaseTitleCard` helper — T11 already replaced its SIMULATE/RESULTS uses.
     After the swap above, delete from `BigscreenPage.tsx`: (a) the entire `PhaseTitleCard`
     function, (b) the `PHASE_NAMES` import **if and only if** nothing else in the file still
     references it (grep the file — DecisionWall receives its title internally, but check the
     header/LOBBY branches before deleting), and (c) the stale comment T11 left saying the
     helper "now only renders the FINALE placeholder". `tsconfig.json` has
     `noUnusedLocals: true`, so leaving either unused symbol fails the Step 8 `npx tsc -b`
     check with TS6133.

- [ ] **Step 5: Create `src/components/professor/RevealStepper.tsx`**

  Full file contents:

  ```tsx
  import { useState } from 'react';
  import { useProfessor } from '../../contexts/ProfessorContext';
  import { ErrorNotice } from '../ui/ErrorNotice';

  // Finale reveal stepper (design spec §5.8): FINALE-only professor control
  // walking the projector wall through the five reveal steps via setRevealStep
  // (professor-only callable; phase must be FINALE server-side too). Renders
  // null outside FINALE, so ProfessorPage mounts it unconditionally.
  // ‹ › are sanctioned glyphs, not emojis. Step names are contract-fixed,
  // verbatim — shared with FinaleWall. Never re-word them.
  const STEPS = [
    'Podium',
    'Hype vs Reality',
    'What the engine paid for',
    'Wins per dollar',
    'Best & worst signings',
  ] as const;

  export function RevealStepper() {
    const { gameId, game, call } = useProfessor();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<unknown>(null);
    if (!gameId || !game || game.phase !== 'FINALE') return null;
    // Display clamp mirrors the wall's: revealStep can legally be 0..8 on the
    // wire, but this panel only addresses the 5 steps the wall renders.
    // revealStep is absent until the first setRevealStep call (T3) — the `?? 0`
    // default shows "1 of 5 · Podium" on a freshly finished game.
    const step = Math.min(STEPS.length - 1, Math.max(0, game.revealStep ?? 0));
    const go = async (next: number) => {
      const target = Math.min(STEPS.length - 1, Math.max(0, next));
      if (target === step) return;
      setBusy(true); setErr(null);
      try {
        await call('setRevealStep', { gameId, step: target });
        // No local step state: the games/{id} listener delivers revealStep and
        // re-renders the label — single source of truth, same doc the wall reads.
      } catch (e) { setErr(e); } finally { setBusy(false); }
    };
    return (
      <section className="card" data-testid="reveal-stepper" style={{ marginTop: 12 }}>
        <strong>Finale reveal</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button type="button" className="btn" aria-label="previous step"
            disabled={busy || step === 0} onClick={() => void go(step - 1)}>
            {'‹'}
          </button>
          <span data-testid="reveal-step-name"
            style={{ minWidth: 230, textAlign: 'center' }}>
            {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
          <button type="button" className="btn" aria-label="next step"
            disabled={busy || step === STEPS.length - 1} onClick={() => void go(step + 1)}>
            {'›'}
          </button>
        </div>
        <ErrorNotice error={err} />
      </section>
    );
  }
  ```

- [ ] **Step 6: Wire RevealStepper into `src/pages/professor/ProfessorPage.tsx` (FINALE-only via self-gate)**

  Two edits to `src/pages/professor/ProfessorPage.tsx`:

  1. Add to the import block, alongside the existing professor-component imports (`SubmissionGrid` etc.):

     ```tsx
     import { RevealStepper } from '../../components/professor/RevealStepper';
     ```

  2. In the connected-game branch of the JSX — the same region where `<AdvanceControl />` (T7), `<TimerStrip />` (T8) and `<SubmissionGrid />` (T9) render — insert on its own line immediately AFTER `<SubmissionGrid />`:

     ```tsx
     <RevealStepper />
     ```

     Insert exactly one `<RevealStepper />` with no conditional wrapper: the component returns `null` unless the gated phase is FINALE, which is the "wire into ProfessorPage FINALE-only" requirement. (`SubmissionGrid` symmetrically self-hides AT FINALE, so at most one of the two renders.) If `<SubmissionGrid />` is not present in that branch, insert immediately after `<TimerStrip />`, else after `<AdvanceControl />`.

- [ ] **Step 7: Run the finale itest — expect PASS**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/finale.itest.tsx
  ```

  Expected outcome: every test in the file passes — Task 12's plus the two new T13 tests (`panel stepper: › advances revealStep 0→1 via setRevealStep`, `wall: renders the revealStep chart; podium at 0; clamps 8 to the last step`). Total runtime is dominated by the two FINALE seeds (T12's and this block's), roughly 4-8 minutes. One flaky run right after a functions-emulator hot reload is expected — re-run before investigating.

- [ ] **Step 8: Wider verification — types, unit suite, full itest suite, UI audit**

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
  ```

  Expected: `tsc -b` exits 0 with no output (this is the check that FinaleWall's chart call sites match T12's real exports — if it fails here, apply the Step 3 adaptation note, nothing else) · app unit suite green (this task adds no unit tests; the four transforms are covered by T12's) · full itest suite green — the 14 pre-Plan-3a files plus every Plan 3a itest landed so far, emulators required · `audit:ui` clean (`‹ › · … –` and the contract step names must pass the emoji/judgment tripwires; they contain no banned ranges).

- [ ] **Step 9: Commit**

  Pre-commit memory rule for this workspace: an external process races HEAD here — run `git -C /Users/dylanmassaro/FenriX rev-parse HEAD` before and after the commit and confirm HEAD advanced by exactly your commit.

  ```bash
  cd /Users/dylanmassaro/FenriX && git status --short games/salary-showdown/app/src
  ```

  Expected: exactly these entries — `M games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx`, `M games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx`, `M games/salary-showdown/app/src/itest/finale.itest.tsx`, `?? games/salary-showdown/app/src/components/bigscreen/FinaleWall.tsx` (or `M` on the directory listing form), `?? games/salary-showdown/app/src/components/professor/RevealStepper.tsx` — nothing else. Then:

  ```bash
  cd /Users/dylanmassaro/FenriX && git add \
    games/salary-showdown/app/src/components/bigscreen/FinaleWall.tsx \
    games/salary-showdown/app/src/components/professor/RevealStepper.tsx \
    games/salary-showdown/app/src/pages/bigscreen/BigscreenPage.tsx \
    games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx \
    games/salary-showdown/app/src/itest/finale.itest.tsx \
  && git commit -m "$(cat <<'EOF'
  feat(salary-showdown): FinaleWall projector + RevealStepper panel control

  Plan 3a Task 13. FinaleWall replaces the T10 FINALE placeholder on
  /bigscreen: games/{id}.revealStep drives 0 Podium (top three of the
  final standings, rounds/5) · 1 Hype vs Reality scatter · 2 What the
  engine paid for · 3 Wins per dollar · 4 Best & worst signings,
  composing T12's hand-rolled SVG chart components; incoming steps are
  clamped to 0..4 so a wire value up to 8 parks on the last chart
  instead of blanking the wall. THE FINALE IS THE SANCTIONED REVEAL
  (parent spec §11.14) — per-dollar numbers, trap labels and the weights
  comparison render here on purpose. RevealStepper (‹ › + contract-fixed
  step names) calls setRevealStep and mounts unconditionally in
  ProfessorPage, self-gated to FINALE. finale.itest.tsx: default-app
  professor seed to FINALE; stepper › stamps revealStep 1 in Firestore
  and relabels; the wall follows harness setRevealStep calls including
  the clamp.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Expected: one commit on `main` touching exactly 5 files (3 modified, 2 added).

---

### Task 14: Mop-up + full battery + browser walkthrough checklist

**Files:**
- Modify: `games/salary-showdown/app/src/lib/errors.test.ts` (the `'coded messages map to student copy'` test, currently lines 8–13)
- Modify: `games/salary-showdown/app/src/lib/errors.ts` (the `STAR_TAKEN` entry in `TABLE`, currently line 6; plus two NEW `TABLE` entries `BAD_TIMER` / `BAD_STEP` — spec §8 coverage gap, Task 1/Task 3 emit these codes but ship no student copy)
- Modify (only if the gap checks in Step 4 fail): `games/salary-showdown/backend/SCHEMA.md`
- Modify: `games/salary-showdown/backend/README.md` (test-count line, currently line 22; callable table, currently lines 38–48)
- Modify: `.superpowers/sdd/progress.md` (append only)
- Test: no new test files — this task runs the FULL battery (backend suite, app unit, app integration ×3, `tsc -b`, `audit:ui`) plus a manual browser walkthrough

**Interfaces:**
- Consumes: `errorCopy(err: unknown): { headline: string; raw?: string }` (`app/src/lib/errors.ts`, matches on MESSAGE substring, not error kind — house convention). The three Plan 3a callables as shipped by Tasks 1–3, documented here exactly per contract: `setTimer({gameId, action, seconds?, expectedPhase, expectedRound})` (professor-only), `markDone({gameId})` (GM-only, FO/FA only, status flag NEVER a lock), `setRevealStep({gameId, step})` (professor-only, FINALE only, step 0..8). Schema fields introduced by T1–T5: `games/{id}.timerPausedMs`, `games/{id}.revealStep`, `teams/{id}.doneRound`/`.donePhase`, `rounds/{r}.standings[].previousRank`, extended `reveal/latest.trueWeights`.
- Produces: nothing downstream — this is the Plan 3a exit gate. Its outputs are a green full battery, a completed walkthrough, synced docs, and the final commit.

Hard rules restated for this task (do not "improve" them away):
- Timers are advisory pacing (parent spec §13): expiry never blocks a submission server-side. The README/SCHEMA wording you write below must say this, not imply enforcement.
- NO emojis anywhere in product UI or docs added here. Glyphs `★ ▲ ▼ ½ ‹ › ● ○ —` are fine.
- Config `cap`/`totalRounds` are decorative: display read-only, never editable — the walkthrough verifies this.
- Max 21 franchises is enforced in the panel create-game UI only, NOT server-side — the walkthrough verifies the UI copy.
- Commits: `fix(salary-showdown): …` / `docs(…)`, imperative, no emoji.
- The functions emulator hot-reloads on edit: one flaky run right after an edit is expected — re-run before investigating. Restart the emulator suite before any run you intend to trust (known emulator residue: `10 ABORTED: Transaction lock timeout` under back-to-back backend runs is emulator load behaviour, not a logic regression; assertion failures are real).

---

- [ ] **Step 1: Grep for the old STAR_TAKEN copy before touching anything**

  ```bash
  cd /Users/dylanmassaro/FenriX
  grep -rn "Another team claimed this star first" games/salary-showdown --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules
  ```

  Expected output: exactly ONE hit — `games/salary-showdown/app/src/lib/errors.ts` (the TABLE entry). As of plan-writing no test asserts the old copy (backend tests assert the bare code string `STAR_TAKEN`, which is unaffected). If any OTHER hit appears (a test or itest added by an earlier 3a task), update that assertion to the new copy `This star's claim has already been used this round.` in the same edit wave as Step 3.

- [ ] **Step 2: Failing test — assert the NEW STAR_TAKEN copy plus BAD_TIMER/BAD_STEP mappings**

  In `games/salary-showdown/app/src/lib/errors.test.ts`, edit the existing coded-messages test. Current code:

  ```ts
  test('coded messages map to student copy', () => {
    expect(errorCopy(new Error('BAD_YEARS')).headline)
      .toBe('That contract length is not available this round.');
    expect(errorCopy(new Error('ROSTER_FULL')).headline)
      .toBe('Your roster is full — 10 players is the maximum.');
  });
  ```

  Replace with:

  ```ts
  test('coded messages map to student copy', () => {
    expect(errorCopy(new Error('BAD_YEARS')).headline)
      .toBe('That contract length is not available this round.');
    expect(errorCopy(new Error('ROSTER_FULL')).headline)
      .toBe('Your roster is full — 10 players is the maximum.');
    expect(errorCopy(new Error('STAR_TAKEN')).headline)
      .toBe("This star's claim has already been used this round.");
    expect(errorCopy(new Error('BAD_TIMER')).headline)
      .toBe("Timer request was invalid — check the phase hasn't changed.");
    expect(errorCopy(new Error('BAD_STEP')).headline)
      .toBe("That reveal step doesn't exist.");
  });
  ```

  Run it:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app
  npx vitest run src/lib/errors.test.ts
  ```

  Expected outcome: FAIL — 1 failed test, `coded messages map to student copy`. Vitest stops the test at its first failing assertion, which is the STAR_TAKEN one: `expected 'Another team claimed this star first.' to be "This star's claim has already been used this round."`. (The BAD_TIMER/BAD_STEP assertions would also fail right now — those codes have no `TABLE` entry, so they hit the `'That did not go through — try again.'` fallback — Step 3 fixes all three at once.) All other tests in the file pass.

- [ ] **Step 3: Implementation — change the STAR_TAKEN copy and add BAD_TIMER/BAD_STEP entries in errors.ts**

  In `games/salary-showdown/app/src/lib/errors.ts`, make two edits to the `TABLE`, matching the file's exact existing structure (a flat `Record<string, string>` of coded keys followed by prose-substring keys; `errorCopy` matches on MESSAGE substring).

  First, change the `STAR_TAKEN` line. Current code (line 6):

  ```ts
  STAR_TAKEN: 'Another team claimed this star first.',
  ```

  New code:

  ```ts
  STAR_TAKEN: "This star's claim has already been used this round.",
  ```

  (Double-quoted because the copy contains an apostrophe. Rationale, so nobody "fixes" it back: since backend hardening H-C, `STAR_TAKEN` also fires when the SAME team double-clicks an exclusive star it already claimed — "Another team" was factually wrong for that path. The new copy is accurate for both paths.)

  Second, add the two missing Plan 3a code entries. Directly after the line

  ```ts
  BAD_SHAPE: 'The lineup did not submit cleanly — rearrange and resubmit.',
  ```

  (currently line 19 — the last coded key, just above the prose-substring keys like `'market is closed'`), insert:

  ```ts
  BAD_TIMER: "Timer request was invalid — check the phase hasn't changed.",
  BAD_STEP: "That reveal step doesn't exist.",
  ```

  (Both double-quoted for the apostrophes, mirroring the STAR_TAKEN line. Coverage rationale: Task 1's `setTimer` throws `BAD_TIMER` and Task 3's `setRevealStep` throws `BAD_STEP` — without these entries `errorCopy` falls through to the generic 'That did not go through' fallback, violating spec §8's every-code-has-student-copy rule.)

  Run again:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app
  npx vitest run src/lib/errors.test.ts
  ```

  Expected outcome: PASS — all tests in the file green.

- [ ] **Step 4: SCHEMA.md gap check — every 3a field must be documented**

  `backend/SCHEMA.md` should already carry all 3a fields (each introducing task T1–T5 was responsible for its own). Verify, do not assume:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend
  for t in timerPausedMs revealStep doneRound donePhase previousRank turnoverP; do
    printf '%-14s ' "$t"; grep -c "$t" SCHEMA.md || true
  done
  ```

  Expected outcome: every term reports a count of 1 or more. For any term reporting 0, apply the matching fix below (and ONLY for missing terms — if a term is present, leave the earlier task's wording alone). Anchors reference stable pre-3a text in SCHEMA.md:

  - `timerPausedMs` missing — in the `games/{gameId}` block, the field list line contains the token `timerEndsAt: ts|null,`. Immediately after that token, insert ` timerPausedMs: n|null,` and add this comment line directly below the field-list line:

    ```
      # timer tri-state: running = timerEndsAt set / timerPausedMs null · paused = timerEndsAt null / timerPausedMs set · off = both null.
      # advancePhase's flip nulls BOTH. Timers are advisory pacing only (parent spec §13): expiry NEVER blocks a submission server-side.
    ```

  - `revealStep` missing — add below the timer comment lines in the same `games/{gameId}` block:

    ```
      revealStep: 0-8                     # FINALE chart stepping; ABSENT until the first setRevealStep call (professor-only, the field's sole writer — the flip does NOT write it); readers default `?? 0`
    ```

  - `doneRound` / `donePhase` missing — in the `games/{gameId}/teams/{teamId}` block, directly after the line

    ```
      lineupLockedRound, hardshipUsed: [round]
    ```

    insert:

    ```
      doneRound: n, donePhase: string     # GM "we're done" status flag (markDone callable): equals the game's round+phase when marked
                                          # for the current FO/FA phase. Status only, NEVER a lock — the team can still act until
                                          # the phase closes. Initialised 0 / '' at createGame.
    ```

  - `previousRank` missing — in the `games/{gameId}/rounds/{r}` block, the standings shape line reads

    ```
                                          #   standings: [{teamId, name, wins, losses, pointDiff, pointsFor, tiebreakCoin, rank}] }
    ```

    Change `rank}]` to `rank, previousRank}]` and add directly below:

    ```
                                          # previousRank: this team's rank in rounds/{r-1}.standings (null in round 1) — stamped by
                                          # enter:SIMULATE inside the same single batch that writes the round doc.
    ```

  - `turnoverP` missing (extended `trueWeights` undocumented) — the `games/{gameId}/reveal/latest` line reads

    ```
    games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload)
    ```

    Add directly below:

    ```
                                          # trueWeights: {narrative, defenseVisible, turnoverWeight,
                                          #   engine: {base, scoring, playmaking, steal, block, rebound, turnover},
                                          #   regression: {winsR2, turnoverCoef, turnoverP, payrollT, hypeT}}
                                          # turnoverWeight kept for compatibility; turnoverP is the STRING '<0.001'.
                                          # engine/regression come from datagen's reveal_weights.json (never hand-typed).
    ```

  Re-run the grep loop; expected outcome: all six terms now report >= 1.

- [ ] **Step 5: backend/README.md — callables table + stale advancePhase signature**

  In `games/salary-showdown/backend/README.md`, the callable table currently ends:

  ```
  | `submitLineup({ gameId, lineup })` | Coach-only: validates and locks `{starters, sixth, bench, playstyle}` against the team's currently-active roster. |
  ```

  Append these three rows directly after that line:

  ```
  | `setTimer({ gameId, action, seconds?, expectedPhase, expectedRound })` | Professor-only pacing timer: `start`/`pause`/`resume`/`extend`/`clear` over `timerEndsAt`/`timerPausedMs`. Advisory only — expiry never blocks a submission server-side. |
  | `markDone({ gameId })` | GM-only "we're done" status flag during `FRONT_OFFICE`/`FREE_AGENCY`: stamps `doneRound`/`donePhase` on the caller's team doc. Status light only, never a lock. |
  | `setRevealStep({ gameId, step })` | Professor-only during `FINALE`: sets `revealStep` (integer 0-8) on the game doc to step the projector's reveal charts. |
  ```

  Also fix the stale `advancePhase` row. Current:

  ```
  | `advancePhase({ gameId })` | Professor-only: resolves the exit hook for the current phase, the entry hook for the next, and advances `phase`/`round` (idempotent via `hooklog`). |
  ```

  New:

  ```
  | `advancePhase({ gameId, expectedPhase, expectedRound })` | Professor-only: flips `phase`/`round` first (losers of a race get `PHASE_MISMATCH`), then resolves the exit + entry hooks (idempotent via `hooklog`). Callers ALWAYS send both expectations. |
  ```

  Leave the stale test-count line (currently `— 16 files, 102 tests`) alone for now — Step 6 produces the real numbers and Step 7 writes them.

- [ ] **Step 6: FULL BATTERY**

  Precondition: freshly restarted emulator suite. Kill any running emulators, then in a separate long-lived terminal:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npm run emu
  ```

  Wait for the Emulator UI banner (`http://127.0.0.1:4100`; Functions 5101, Firestore 8180, Auth 9199, project `salary-showdown-dev`). Then run, in order, recording the exact totals of each:

  1. Backend suite:

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
     ```

     Expected outcome: 0 failed. Total tests >= 115 (the pre-3a baseline was 19 files / 115 tests; Tasks 1–5 added setTimer/markDone/setRevealStep/previousRank/trueWeights suites on top). If a run fails ONLY with `10 ABORTED: Transaction lock timeout`, restart the emulator suite and re-run once — that is documented emulator load behaviour; any assertion failure is real and blocks this task.

  2. App unit suite:

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
     ```

     Expected outcome: 0 failed (pre-3a baseline 30 tests; 3a added `shuffle.test.ts`, `revealCharts` tests, and the Step 2 assertion). The Step 2/3 copy change is exercised here again.

  3. App integration suite — THREE consecutive runs, all green (flake gate):

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/app
     npx vitest run -c vitest.integration.config.ts
     npx vitest run -c vitest.integration.config.ts
     npx vitest run -c vitest.integration.config.ts
     ```

     Expected outcome: 3/3 runs with 0 failed. Baseline was 13 files / 14 tests pre-3a; 3a added `professor.itest.tsx`, `bigscreen.itest.tsx`, `finale.itest.tsx` — ALL pre-existing itests must stay green, including `transport.itest.ts` (the WebChannel-pin tripwire — if it fails, someone broke the vitest.integration.config.ts firestore alias; that config was contractually off-limits, treat as a regression to fix, not a config to adjust).

  4. Typecheck:

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
     ```

     Expected outcome: no output, exit code 0.

  5. UI rules audit:

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui
     ```

     Expected outcome: clean pass over 37+ files (pre-3a it scanned 37; every new 3a surface — professor components, bigscreen walls, charts, FinalePage — must pass the emoji/judgment tripwires). Any violation is a bug in the flagged file; fix the file, never the auditor.

  If ANY step fails for a non-emulator-flake reason: stop, fix (or route back to the owning task's code), and restart Step 6 from run 1.

- [ ] **Step 7: Write the real test counts into backend/README.md**

  Current line (in the Quickstart section):

  ```
  you should run before every commit — 16 files, 102 tests):
  ```

  Replace `16 files, 102 tests` with the ACTUAL file/test totals printed by Step 6 run 1 (e.g. `22 files, 138 tests` — use the numbers vitest printed, never these examples).

- [ ] **Step 8: MANUAL BROWSER WALKTHROUGH — the classroom dress rehearsal**

  Setup: emulator suite still running from Step 6. Start the dev server in another terminal:

  ```bash
  cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run dev
  ```

  App serves at `http://localhost:5176`. Environment gotcha (spec §9): when driving the UI through browser automation, trigger controls with in-page JS `element.click()` (e.g. `document.querySelector('button.btn.gold').click()`) — native/coordinate clicks are unreliable in this environment. Typing into inputs: set `.value` then dispatch an `input` event, or use the automation tool's form-input facility.

  Walk every numbered item and confirm the "SEE" line before moving on:

  1. **Seed smoke (backend end-to-end):**

     ```bash
     cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run seed -- --to FINALE
     ```

     SEE: console prints phase progression lines ending `-> R5:FINALE`, then `Seeded game at R5:FINALE` with gameId + joinCode. In the Emulator UI Firestore tab (`http://127.0.0.1:4100/firestore`), open that game doc — SEE `timerPausedMs: null` and NO `revealStep` field (it is written only by the setRevealStep callable, which the seed script never calls); open `reveal/latest` — SEE `trueWeights.engine` (7 keys) and `trueWeights.regression` (with `turnoverP: "<0.001"`); open `rounds/1` — SEE every standings row has `previousRank: null`; open `rounds/3` — SEE numeric `previousRank` values.
     NOTE: this seeded game's professor is the seed SCRIPT's anonymous uid — the browser panel can NOT control it (assertProfessor would reject the tab's own anonymous uid). It exists to prove the backend season drive; the interactive walkthrough below uses a game created FROM the panel.

  2. **Panel — create-game guard:** open `http://localhost:5176/professor`. SEE the session setup form (textarea, one team name per line). Paste 22 lines (any names). SEE the inline error copy EXACTLY: "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that." and no game created.
  3. **Panel — create for real:** clear the textarea, enter 4 lines: `Alpha`, `Beta`, `Gamma`, `Delta`. Create. SEE session header: join code rendered LARGE, `Lobby · Round 0`, and the muted read-only config line reading EXACTLY `Cap $100.0M · 5 rounds` (Task 6 renders it from `game.config` via `fmtM`; plain text, NO input fields — decorative by contract).
  4. **Projector:** click "Open projector". SEE a new tab at `/bigscreen` rendering LobbyWall: giant join code, the line `join at http://localhost:5176/?code=<CODE>`, a 4-team grid with empty GM/Scout/Coach chips, and "0 of 12 seats filled". Dark background, big type, no buttons, no emojis.
  5. **Team tabs (two):** open two more tabs at `http://localhost:5176`. Tab A: join with the code as Team Alpha GM, display name `Dana`. Tab B: join as Team Beta Scout, display name `Blake`. SEE on the wall: Alpha's GM chip fills with `Dana`, Beta's Scout chip with `Blake`, counter reads "2 of 12 seats filled". SEE the same two players listed on the panel.
  6. **Start season:** click the panel's start-season control. SEE panel header flip to `Draft Night · Round 1`; wall switches to DecisionWall (title "Draft Night", Round 1, huge timer, 4-team lights row all `○`). Auto-arm (default on) starts the FREE_AGENCY default timer at 2:30 — SEE it counting down IN SYNC on all four screens: panel strip, wall, and both team tabs' phase headers.
  7. **Timer controls (every screen):** on the panel: Pause — SEE all four screens freeze on the same mm:ss with a plain "paused" note. Resume — SEE counting resume from that value. +30s — SEE the remaining time jump up by 0:30 everywhere. Clear — SEE the timer disappear/blank everywhere. Start — SEE a fresh 2:30 running.
  8. **Done light (GM):** in tab A (Alpha GM), sign a few free agents, then press "We're done". SEE the success note EXACTLY: "Marked done — you can still make changes until the phase closes." SEE Alpha's light fill `●` on the panel grid AND on the wall; Beta stays `○`. Press it again — SEE no error (idempotent). Sign one more player after marking done — SEE it still works (status flag, NEVER a lock).
  9. **Advance with confirm modal:** the panel's advance button reads `Advance → Star Auction · R1`. Click it. Because Beta/Gamma/Delta lights are off, SEE the modal listing the un-submitted teams by name with "Advance anyway? Server defaults will apply." Confirm. SEE the header show "advancing…" briefly (settling), then `Star Auction · Round 1`; wall retitles to "Star Auction". SEE the advance button disabled during settling.
  10. **Auction light (Scout):** in tab B (Beta Scout), submit a sealed bid on any star. SEE Beta's light fill `●` on panel + wall; Alpha (no Scout) stays `○`. SEE the light row shows ONLY name + dot — never bid contents, on either screen.
  11. **Lineup phase:** advance (confirm the modal listing non-bidders). SEE `Lineup · Round 1` everywhere. No Coach seats are staffed, so all lights stay `○`. Advance again through its modal — server auto-repair covers the lineups (facts only; nothing to see on teams beyond the phase change).
  12. **SIMULATE — scoreboard flood:** SEE the wall switch to the flood: score cards appear one by one, staggered (interval = min(3s, 45s/games)), each showing the matchup and final score; after the last card, SEE "Round complete."
  13. **RESULTS — Standings Shuffle, round 1:** advance. SEE the wall reveal standings bottom-up, one row per ~0.8s; every row's delta glyph reads `NEW` (round 1 has `previousRank: null`); ranks 3, 2, 1 render as `#3 — ?`, `#2 — ?`, `#1 — ?` until their own reveal moment. End state: full table.
  14. **Auto-advance (one round of hands-off pacing):** in the panel's timer settings, set the LINEUP default to 10 seconds and switch the auto-advance toggle ON. Advance into round 2: `Front Office · Round 2`. In tab A press "We're done" on the Front Office page — SEE the same success note and Alpha's light fill (markDone also covers FO). Walk R2 to LINEUP, let the 10s timer hit 0:00 with auto-advance on — SEE the panel call advancePhase by itself and the phase flip to SIMULATE with no click. Turn auto-advance back OFF and restore the LINEUP default (90).
  15. **Shuffle with real deltas:** at R2 RESULTS, SEE `▲` / `▼` / `—` glyphs computed from previousRank (no more `NEW`).
  16. **Rounds 3–5:** drive each round through the panel (modals will list unstaffed teams; confirm each — server defaults apply). At R5 RESULTS, SEE the shuffle's top-3 reveal slow to ~3s per row (championship pacing).
  17. **End of season guard:** the advance button at `Results · Round 5` triggers the modal "End the season and reveal? This cannot be undone." Confirm. SEE `Finale` everywhere.
  18. **Stepped finale:** SEE the wall at step 0: Podium with the top three teams. On the panel's RevealStepper press `›` four times, watching the wall each time: step 1 Hype vs Reality (scatter, traps and the bargain cluster labeled), step 2 What the engine paid for (paired weight bars, engine vs regression), step 3 Wins per dollar (ranking bars), step 4 Best & worst signings (per-team rows). Press `›` again at step 4 — SEE it clamp (no step 5). Press `‹` back to 0 — SEE it clamp at 0. This wall is the SANCTIONED reveal (parent spec §11.14): value-per-dollar and trap/bargain labels are exactly what it exists to show.
  19. **FinalePage (team laptop):** in tab A, navigate to the conclusion route. SEE the scrollable debrief with all four charts at once, unaffected by the wall's current step.
  20. **CSV export:** on the panel, click "Download season CSV". SEE a file `salary-showdown-season-<joinCode>.csv` download. Open it: SEE exactly ONE header row (23 columns), followed by data rows spanning rounds 1–5.
  21. **Emoji sweep:** eyeball every surface visited (panel, wall in all six modes, team pages, finale). SEE zero emojis; only the sanctioned glyphs (`★ ▲ ▼ ● ○ ‹ › —`).

  Any FAILED item: stop the walkthrough, fix, re-run the affected battery suite from Step 6, then re-verify the item before continuing.

- [ ] **Step 9: Append the task summary to progress.md and commit**

  Append to `/Users/dylanmassaro/FenriX/.superpowers/sdd/progress.md` (append-only — do not edit existing lines), substituting the REAL numbers recorded in Steps 6–8:

  ```
  == PLAN 3A TASK 14 — MOP-UP + EXIT BATTERY (<date>) ==
  T14: complete. STAR_TAKEN copy -> "This star's claim has already been used this round." (errors.ts + errors.test.ts assertion; grep confirmed no other old-copy sites). errors.ts gains BAD_TIMER/BAD_STEP student copy (spec §8 coverage — Task 1/Task 3 codes previously fell through to the generic fallback). SCHEMA.md 3a-field audit: <all six fields present | gaps fixed: list>. backend/README.md: +setTimer/markDone/setRevealStep rows, advancePhase row now shows expectations, test-count line refreshed to <F> files / <T> tests.
  EXIT BATTERY: backend <F> files / <T> tests green; app unit <U> green; app integration <I> files / <J> tests x3 CONSECUTIVE green; tsc -b clean; audit:ui clean over <K> files.
  BROWSER WALKTHROUGH: 21/21 checks passed (seeded FINALE smoke incl. previousRank + extended trueWeights; panel-created 4-team season end-to-end: lights per phase, timer sync/pause on 4 screens, confirm modals, auto-advance at 0:00, flood, shuffle w/ shrouded top-3 + R5 slowdown, 5-step finale wall clamped 0..4, FinalePage debrief, CSV single-header download, zero emojis). Note: seed-demo games are NOT panel-controllable (script uid owns professorUid) — panel walkthroughs create their own game.
  ```

  Then commit everything from this task in one commit:

  ```bash
  cd /Users/dylanmassaro/FenriX
  git rev-parse HEAD   # verify HEAD is the Task 13 commit before branching-adjacent ops (external process races HEAD in this workspace)
  git add games/salary-showdown/app/src/lib/errors.ts \
          games/salary-showdown/app/src/lib/errors.test.ts \
          games/salary-showdown/backend/SCHEMA.md \
          games/salary-showdown/backend/README.md \
          .superpowers/sdd/progress.md
  git commit -m "fix(salary-showdown): 3a mop-up — STAR_TAKEN copy, schema/README sync, exit battery green

STAR_TAKEN now reads \"This star's claim has already been used this round.\"
(accurate for the owner-double-click path H-C introduced, not just rival
claims). errors.ts also gains BAD_TIMER/BAD_STEP student copy so setTimer
and setRevealStep rejections stop falling through to the generic fallback
(spec section 8 coverage). SCHEMA.md audited against every Plan 3a field; backend README
gains setTimer/markDone/setRevealStep and the real advancePhase signature.
Full battery: backend green, app unit green, app integration x3 consecutive
green, tsc -b clean, audit:ui clean. 21-point browser walkthrough of a
panel-driven 4-team season passed end-to-end.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

  Expected outcome: clean commit on the working branch; `git status` afterwards shows no modified files under `games/salary-showdown` or `.superpowers/sdd`.
