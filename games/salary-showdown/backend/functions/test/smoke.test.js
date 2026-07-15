// Full-game smoke test: the executable proof the backend plays a whole season,
// lobby to finale, on the emulator. 4 teams x 3 members (GM/Scout/Coach) = 12 uids.
// Round 1 is played "for real" (signings, one bid wave, real lineups); rounds 2-5 are
// professor-only advancement (plus one FRONT_OFFICE cut in round 3) — hardship
// (FREE_AGENCY exit) and lineup auto-repair (LINEUP exit) must carry every team the
// rest of the way, exactly like a class where most students go quiet after draft night.
import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };
import { autoRepair, validateLineup } from '../src/lineup.js';
import { minBid } from '../src/payroll.js';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const {
  createGame, joinGame, startSeason, advancePhase,
  signPlayer, cutRosterPlayer, submitBids, submitLineup,
} = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));

// Round-1 signing order: 3G/3W/2B, interleaved G/W/B so the 2G/2W/1B lineup floor is
// covered within the first three signings (never trips validateSigning's POSITION_LOCK
// partway through), cheapest-in-position-first (safest against the $100M cap). Four-
// round contracts (rounds 1-4) so the round-3 FRONT_OFFICE cut below is a genuine
// mid-contract cut, not a natural expiry.
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];
const SIGN_YEARS = 4;

async function signEight(gameId, gmUid) {
  const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
  const byPos = { G: [], W: [], B: [] };
  for (const pid of market.available) {
    const p = byId[pid];
    if (p) byPos[p.position].push(p);
  }
  for (const pos of ['G', 'W', 'B']) byPos[pos].sort((a, b) => +a.salary_per_round - +b.salary_per_round);
  const used = new Set();
  for (const pos of SIGN_ORDER) {
    const pick = byPos[pos].find((p) => !used.has(p.pid));
    used.add(pick.pid);
    await call(signPlayer, { gameId, pid: pick.pid, years: SIGN_YEARS }, gmUid);
  }
}

describe('full-game smoke test', () => {
  it('plays a whole season on the emulator: lobby -> 5 rounds -> finale', async () => {
    const teamNames = ['Alpha', 'Beta', 'Gamma', 'Delta'];
    const { gameId, joinCode } = await call(createGame, { teamNames }, 'prof');

    const teamsSnap = await db.collection(`games/${gameId}/teams`).get();
    expect(teamsSnap.size).toBe(4);
    const teamIds = teamsSnap.docs.map((d) => d.id);

    // 12 joinGame calls: GM/Scout/Coach for each of the 4 teams.
    for (let i = 0; i < teamIds.length; i++) {
      await call(joinGame, { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i}` }, `t${i}-gm`);
      await call(joinGame, { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `Scout${i}` }, `t${i}-scout`);
      await call(joinGame, { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `Coach${i}` }, `t${i}-coach`);
    }

    await call(startSeason, { gameId }, 'prof');

    // ---- Round 1: every GM signs a legal 8-man roster off market/1 ----
    for (let i = 0; i < teamIds.length; i++) await signEight(gameId, `t${i}-gm`);

    await call(advancePhase, { gameId }, 'prof'); // FREE_AGENCY(1) -> AUCTION(1)
    let g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'AUCTION' });

    // ---- Round 1: every Scout submits one legal minimum bid on a wave-1 star ----
    const wave1 = (await db.doc(`games/${gameId}/auctions/1`).get()).data().stars;
    for (let i = 0; i < teamIds.length; i++) {
      const pid = wave1[i % wave1.length];
      await call(submitBids, { gameId, bids: { [pid]: { rate: minBid(1), years: 1 } } }, `t${i}-scout`);
    }

    await call(advancePhase, { gameId }, 'prof'); // AUCTION(1) -> LINEUP(1)
    g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'LINEUP' });

    // ---- Round 1: every Coach submits a legal lineup built with autoRepair ----
    for (let i = 0; i < teamIds.length; i++) {
      const team = (await db.doc(`games/${gameId}/teams/${teamIds[i]}`).get()).data();
      const activePids = team.roster.filter((c) => c.startRound + c.years - 1 >= 1).map((c) => c.pid);
      const lineup = autoRepair({ prevLineup: null, activePids, catalogById: byId });
      validateLineup({ lineup, activePids, catalogById: byId }); // sanity: what we're about to submit is legal
      await call(submitLineup, { gameId, lineup }, `t${i}-coach`);
    }

    await call(advancePhase, { gameId }, 'prof'); // LINEUP(1) -> SIMULATE(1)
    g = (await db.doc(`games/${gameId}`).get()).data();
    let teamsNow = await db.collection(`games/${gameId}/teams`).get();
    for (const doc of teamsNow.docs) {
      const active = doc.data().roster.filter((c) => c.startRound + c.years - 1 >= 1);
      expect(active.length).toBeGreaterThanOrEqual(8); // signings alone clear the floor
    }

    await call(advancePhase, { gameId }, 'prof'); // SIMULATE(1) -> RESULTS(1)
    await call(advancePhase, { gameId }, 'prof'); // RESULTS(1) -> FRONT_OFFICE(2)

    // ---- Rounds 2-5: professor-only advancement. No GM/Scout/Coach touches the game
    //      again except one FRONT_OFFICE round-3 cut. Hardship and lineup auto-repair
    //      must carry every team through every remaining round. ----
    let cutAsserted = false;
    let guard = 0;
    g = (await db.doc(`games/${gameId}`).get()).data();
    while (g.phase !== 'FINALE') {
      if (g.round === 3 && g.phase === 'FRONT_OFFICE' && !cutAsserted) {
        const team0Before = (await db.doc(`games/${gameId}/teams/${teamIds[0]}`).get()).data();
        // a round-1, 4-year signing: contract runs through round 4, so cutting it in
        // round 3 forfeits real guaranteed money — a genuine mid-contract cut.
        const targetPid = team0Before.roster[0].pid;
        const { deadMoney } = await call(cutRosterPlayer, { gameId, pid: targetPid }, 't0-gm');
        expect(deadMoney.length).toBeGreaterThan(0);
        const team0After = (await db.doc(`games/${gameId}/teams/${teamIds[0]}`).get()).data();
        expect(team0After.deadMoney.length).toBeGreaterThan(0);
        expect(team0After.roster.some((c) => c.pid === targetPid)).toBe(false);
        cutAsserted = true;
      }
      await call(advancePhase, { gameId }, 'prof');
      g = (await db.doc(`games/${gameId}`).get()).data();
      guard += 1;
      if (guard > 40) throw new Error('safety cap exceeded — game never reached FINALE');
      if (g.phase === 'SIMULATE') {
        // LINEUP just exited (hardship + auto-repair already ran for this round):
        // every team must clear the 8-active floor before its box scores are generated.
        teamsNow = await db.collection(`games/${gameId}/teams`).get();
        for (const doc of teamsNow.docs) {
          const active = doc.data().roster.filter((c) => c.startRound + c.years - 1 >= g.round);
          expect(active.length).toBeGreaterThanOrEqual(8);
        }
      }
    }
    expect(cutAsserted).toBe(true);

    // ---- Final assertions ----
    const finalGame = (await db.doc(`games/${gameId}`).get()).data();
    expect(finalGame.status).toBe('finished');
    expect(finalGame.phase).toBe('FINALE');
    expect(finalGame.round).toBe(5);

    // Every rounds/{1..5} doc exists; boxCsv's first line is the frozen 23-column header.
    for (let r = 1; r <= 5; r++) {
      const roundDoc = (await db.doc(`games/${gameId}/rounds/${r}`).get()).data();
      expect(roundDoc).toBeTruthy();
      const header = roundDoc.boxCsv.split('\n')[0].split(',');
      expect(header).toHaveLength(23);
    }

    // Round-robin totals: 4 teams -> C(4,2)=6 games/round x 5 rounds = 30 decided
    // games; sim.js never allows a tie, so total wins across the league == 30.
    const teamsFinal = await db.collection(`games/${gameId}/teams`).get();
    const totalWins = teamsFinal.docs.reduce((s, d) => s + d.data().wins, 0);
    expect(totalWins).toBe(30);

    // Every team's lineup was locked through round 5 — round 1 by the Coach's own
    // submission, rounds 2-5 entirely by LINEUP-exit auto-repair (no Coach acted again).
    for (const doc of teamsFinal.docs) expect(doc.data().lineupLockedRound).toBe(5);

    // reveal/latest is published only at FINALE, one scatter point per catalog player.
    const reveal = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
    expect(reveal.scatter).toHaveLength(175);
  }, 120000);
});
