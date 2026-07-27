import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, getLobby } = await import('../src/game.js');
const { HOOKS } = await import('../src/phases.js');
const { SYNTHETICS } = await import('../src/synthetics.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('lifecycle', () => {
  let gameId, joinCode;
  it('createGame seeds teams and catalog', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    ({ gameId, joinCode } = res);
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g.status).toBe('lobby');
    expect(g.professorUid).toBe('prof');
    // 175 datagen players + the 8 synthetic Default Role Players (spec §2,
    // 2026-07-26): hardship contracts must resolve a name from catalog/{pid} too.
    const catalog = await db.collection(`games/${gameId}/catalog`).count().get();
    expect(catalog.data().count).toBe(175 + SYNTHETICS.length);
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
  // Rejection-only: deliberately does NOT drive a successful advance here, so it
  // can't disturb the hooklog state the next two tests depend on (they assert
  // exactly which invocation first writes hooklog/1-AUCTION). The "matching
  // expectedPhase/expectedRound still succeeds" half is covered inside the
  // "records a completed exit hook" test below instead.
  it('advancePhase rejects an expectedPhase/expectedRound mismatch (double-click guard) without mutating state', async () => {
    const before = (await db.doc(`games/${gameId}`).get()).data();
    expect(before).toMatchObject({ round: 1, phase: 'AUCTION' }); // sanity: prior test's end state
    // stale expectedPhase: caller thinks it's still FREE_AGENCY (a prior click already advanced it)
    await expect(call(advancePhase, { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'prof'))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
    // stale expectedRound, correct phase
    await expect(call(advancePhase, { gameId, expectedPhase: 'AUCTION', expectedRound: 99 }, 'prof'))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
    // the game doc must be untouched by the rejected attempts (no hook fired, no phase moved)
    const after = (await db.doc(`games/${gameId}`).get()).data();
    expect(after).toMatchObject({ round: 1, phase: 'AUCTION' });
    const log = await db.doc(`games/${gameId}/hooklog/1-AUCTION`).get();
    expect(log.exists).toBe(false);
  });
  it('advancePhase throws failed-precondition "season not started" while phase is LOBBY, instead of an internal error', async () => {
    // Independent game, never past startSeason: phase is still LOBBY.
    const res = await call(createGame, { teamNames: ['Lobby1', 'Lobby2'] }, 'prof');
    await expect(call(advancePhase, { gameId: res.gameId }, 'prof'))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('season not started') });
    const g = (await db.doc(`games/${res.gameId}`).get()).data();
    expect(g).toMatchObject({ status: 'lobby', phase: 'LOBBY', round: 0 }); // untouched
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
  it('advancePhase records a completed exit hook in hooklog (and a matching expectedPhase/expectedRound does not block it)', async () => {
    // Positive half of the guard: first run fires the hook and writes the log.
    // Also supplies matching expectedPhase/expectedRound — the double-click guard
    // must be a no-op (not a blocker) when the caller's expectation is correct.
    let probeRuns = 0;
    HOOKS.AUCTION = () => { probeRuns += 1; };
    try {
      const res = await call(advancePhase, { gameId, expectedPhase: 'AUCTION', expectedRound: 1 }, 'prof'); // AUCTION -> LINEUP
      expect(res).toEqual({ round: 1, phase: 'LINEUP' });
      expect(probeRuns).toBe(1);
      const log = await db.doc(`games/${gameId}/hooklog/1-AUCTION`).get();
      expect(log.exists).toBe(true);
    } finally {
      delete HOOKS.AUCTION; // cleanup so other tests are unaffected
    }
  });
  it('getLobby returns teams and claimed roles for a join code, without membership', async () => {
    const { gameId, joinCode } = await call(createGame, { teamNames: ['Home', 'Away'] }, 'prof-gl');
    const teamsSnap = await db.collection(`games/${gameId}/teams`).get();
    const teamId = teamsSnap.docs.find((d) => d.data().name === 'Home').id;
    await call(joinGame, { joinCode, teamId, role: 'GM', displayName: 'Dana' }, 'stranger-1');
    const lobby = await call(getLobby, { joinCode }, 'stranger-2'); // NOT a member
    expect(lobby.gameId).toBe(gameId);
    expect(lobby.status).toBe('lobby');
    const home = lobby.teams.find((t) => t.name === 'Home');
    expect(home.teamId).toBe(teamId);
    expect(home.claimedRoles).toEqual(['GM']);
    expect(lobby.teams.find((t) => t.name === 'Away').claimedRoles).toEqual([]);
  });
  it('getLobby rejects a bad join code', async () => {
    await expect(call(getLobby, { joinCode: 'ZZZZZZ' }, 'stranger-3'))
      .rejects.toThrow('bad join code');
  });
});
