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
