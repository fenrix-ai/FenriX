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

// Drives a 2-team game all the way to SIMULATE(1) purely through advancePhase — no
// manual signings or lineup submissions, exactly like lineup-flow/auction-flow: the
// FREE_AGENCY exit hook's hardship autofill brings both teams to the >=8, 2G/2W/1B
// floor, nobody bids at AUCTION (both stars go unsold), and the LINEUP exit hook
// auto-repairs both teams' still-null lineups. The advancePhase call that leaves
// LINEUP and enters SIMULATE is the SAME call that fires enter:SIMULATE (game.js
// flips the phase first, then resolves the exit and entry hooks before returning),
// so by the time it resolves, games/{gameId}/rounds/1 already exists.
describe('sim flow (round-robin sim fires on LINEUP -> SIMULATE, rounds/{r} persisted)', () => {
  let gameId, teamA, teamB;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(startSeason, { gameId }, 'prof');
    await call(advancePhase, { gameId }, 'prof'); // FREE_AGENCY(1) -> AUCTION(1): hardship fills both teams
    await call(advancePhase, { gameId }, 'prof'); // AUCTION(1) -> LINEUP(1): no bids, both stars unsold
  });

  it('advancing LINEUP(1) -> SIMULATE(1) writes rounds/1 with games, awards, standings, a 23-col boxCsv', async () => {
    const before = await Promise.all([teamA, teamB].map(
      (id) => db.doc(`games/${gameId}/teams/${id}`).get()));
    for (const doc of before) expect(doc.data().wins + doc.data().losses).toBe(0);

    const res = await call(advancePhase, { gameId }, 'prof'); // LINEUP(1) -> SIMULATE(1)
    expect(res).toEqual({ round: 1, phase: 'SIMULATE' });

    const round = (await db.doc(`games/${gameId}/rounds/1`).get()).data();
    expect(round.games).toHaveLength(1); // C(2,2) — one game between the two teams
    expect(round.games[0]).toMatchObject({ home: teamA, away: teamB });
    expect(round.games[0].homeScore).not.toBe(round.games[0].awayScore);

    expect(round.awards.roundMvp.pid).toBeTruthy();
    expect(round.awards.topScorer.pid).toBeTruthy();
    expect(round.awards.bargain.perDollar).toBeGreaterThan(0);

    expect(round.standings).toHaveLength(2);
    expect(round.standings[0].rank).toBe(1);
    expect(round.standings[1].rank).toBe(2);
    // tiebreakCoin is kept on the STORED standings row (not stripped) so the
    // per-round seeded tiebreak is auditable from rounds/{r} itself.
    for (const row of round.standings) expect(typeof row.tiebreakCoin).toBe('number');

    const header = round.boxCsv.split('\n')[0].split(',');
    expect(header).toHaveLength(23);
    expect(header).toContain('playstyle');

    // team docs rolled forward: exactly one win, one loss, summing correctly
    const after = await Promise.all([teamA, teamB].map(
      (id) => db.doc(`games/${gameId}/teams/${id}`).get()));
    const totalWins = after.reduce((s, d) => s + d.data().wins, 0);
    const totalLosses = after.reduce((s, d) => s + d.data().losses, 0);
    expect(totalWins).toBe(1);
    expect(totalLosses).toBe(1);
    for (const doc of after) expect(doc.data().wins + doc.data().losses).toBe(1);
  });

  it('enter:SIMULATE is internally idempotent (bails once rounds/{round} already exists)', async () => {
    const before = await Promise.all([teamA, teamB].map(
      (id) => db.doc(`games/${gameId}/teams/${id}`).get()));
    await HOOKS['enter:SIMULATE'](gameId, 1); // direct re-invoke, bypassing runHookOnce entirely
    const after = await Promise.all([teamA, teamB].map(
      (id) => db.doc(`games/${gameId}/teams/${id}`).get()));
    for (let i = 0; i < 2; i++) {
      expect(after[i].data().wins).toBe(before[i].data().wins);
      expect(after[i].data().losses).toBe(before[i].data().losses);
    }
  });
});
