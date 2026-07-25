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
