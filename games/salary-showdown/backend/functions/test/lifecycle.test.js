import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase } = await import('../src/game.js');
const { HOOKS } = await import('../src/phases.js');
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
  it('advancePhase is professor-only and moves FREE_AGENCY to AUCTION', async () => {
    await expect(call(advancePhase, { gameId }, 'u1')).rejects.toThrow(/professor/i);
    const res = await call(advancePhase, { gameId }, 'prof');
    expect(res).toEqual({ round: 1, phase: 'AUCTION' });
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'AUCTION' });
  });
  it('advancePhase skips an exit hook already recorded in hooklog (retry-safe)', async () => {
    // Simulate a retry: a prior attempt resolved FREE_AGENCY's exit hook (logged),
    // then died before the game doc updated — the doc still shows FREE_AGENCY.
    await db.doc(`games/${gameId}`).update({ round: 1, phase: 'FREE_AGENCY' });
    await db.doc(`games/${gameId}/hooklog/1-FREE_AGENCY`).set({ at: new Date() });
    let probeRuns = 0;
    HOOKS.FREE_AGENCY = () => { probeRuns += 1; };
    try {
      const res = await call(advancePhase, { gameId }, 'prof');
      expect(res).toEqual({ round: 1, phase: 'AUCTION' });
      expect(probeRuns).toBe(0); // guard skipped the already-resolved exit hook
    } finally {
      delete HOOKS.FREE_AGENCY; // cleanup so other tests are unaffected
    }
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'AUCTION' });
  });
  it('advancePhase records a completed exit hook in hooklog', async () => {
    // Positive half of the guard: first run fires the hook and writes the log.
    let probeRuns = 0;
    HOOKS.AUCTION = () => { probeRuns += 1; };
    try {
      const res = await call(advancePhase, { gameId }, 'prof'); // AUCTION -> LINEUP
      expect(res).toEqual({ round: 1, phase: 'LINEUP' });
      expect(probeRuns).toBe(1);
      const log = await db.doc(`games/${gameId}/hooklog/1-AUCTION`).get();
      expect(log.exists).toBe(true);
    } finally {
      delete HOOKS.AUCTION; // cleanup so other tests are unaffected
    }
  });
});
