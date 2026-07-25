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
