import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitBids, submitLineup,
        signPlayer, cutRosterPlayer } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const wave1 = players.filter((p) => +p.auction_round === 1).map((p) => p.pid);

// Builds a legal { starters[5], sixth, bench[] } (2G/2W/1B, all remaining actives on
// the bench in the given roster order) out of a team's live roster pids.
function legalLineupFrom(activePids, playstyle) {
  const byPos = { G: [], W: [], B: [] };
  for (const pid of activePids) byPos[byId[pid].position].push(pid);
  const starters = [byPos.G[0], byPos.G[1], byPos.W[0], byPos.W[1], byPos.B[0]];
  const rest = activePids.filter((pid) => !starters.includes(pid));
  return { starters, sixth: rest[0], bench: rest.slice(1), playstyle };
}

// Defect 1 regression: two overlapping advancePhase calls (professor double-click,
// two tabs) must never both enter the same transition's hook bodies. The flip-first
// transaction closes the phase before any resolution work, and because BOTH calls
// here carry the pre-flip expectations, the loser is DETERMINISTIC: its retried
// transaction re-reads the already-flipped doc and fails the expectation check —
// which runs BEFORE transition adoption — rejecting with PHASE_MISMATCH. (Probed
// empirically during hardening: with adoption checked first, a loser retrying
// inside the winner's hook window adopted the in-flight transition in ~1/3 of runs
// and both calls fulfilled — hence the check order. Adoption remains reachable only
// for matching or expectation-less callers, i.e. genuine crash-retries.) And in NO
// interleaving does enter:SIMULATE double-count the league's records.
describe('concurrent double-advance (LINEUP -> SIMULATE)', () => {
  let gameId, teamA, teamB;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof-race');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Coach', displayName: 'CoachA' }, 'coachA-race');
    await call(startSeason, { gameId }, 'prof-race');
    await call(advancePhase, { gameId }, 'prof-race'); // FREE_AGENCY(1) -> AUCTION(1): hardship fills both teams
    await call(advancePhase, { gameId }, 'prof-race'); // AUCTION(1) -> LINEUP(1): no bids, stars unsold
    // teamA's Coach locks in a legal lineup; teamB's null lineup auto-repairs on exit.
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    await call(submitLineup,
      { gameId, lineup: legalLineupFrom(team.roster.map((c) => c.pid), 'Balanced') }, 'coachA-race');
  });

  it('exactly one of two simultaneous advances wins; the other gets PHASE_MISMATCH; the sim never double-counts', async () => {
    const adv = () => call(advancePhase, { gameId, expectedPhase: 'LINEUP', expectedRound: 1 }, 'prof-race');
    const results = await Promise.allSettled([adv(), adv()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value).toEqual({ round: 1, phase: 'SIMULATE' });
    expect(rejected[0].reason).toMatchObject({
      code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });

    // the game landed at SIMULATE round 1 — not beyond — with the marker cleaned up
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'SIMULATE' });
    expect(g.transition).toBeUndefined();

    // rounds/1 exists exactly once (the sim hook fired exactly one round doc)
    const rounds = await db.collection(`games/${gameId}/rounds`).get();
    expect(rounds.docs.map((d) => d.id)).toEqual(['1']);

    // 2 teams -> 1 game -> exactly 1 total win across the league. A total of 2 is
    // precisely what a double-entered enter:SIMULATE would produce (+= run twice).
    const [a, b] = await Promise.all(
      [teamA, teamB].map((id) => db.doc(`games/${gameId}/teams/${id}`).get()));
    expect(a.data().wins + b.data().wins).toBe(1);
    expect(a.data().wins + a.data().losses).toBe(1);
    expect(b.data().wins + b.data().losses).toBe(1);
  });
});

// Crash-resume: a prior advance flipped the phase (transition marker committed) but
// died before running any hook. The next advancePhase call must ADOPT that
// transition — finish its hooks and clear the marker — instead of advancing again.
describe('crash-resume via the transition marker', () => {
  it('finishes a crashed advance (runs the missed hooks, clears transition) instead of advancing again', async () => {
    const res = await call(createGame, { teamNames: ['Gamma', 'Delta'] }, 'prof-resume');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [tA] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: tA, role: 'Scout', displayName: 'S' }, 'scout-resume');
    await call(startSeason, { gameId }, 'prof-resume');
    await call(advancePhase, { gameId }, 'prof-resume'); // FREE_AGENCY(1) -> AUCTION(1)
    await call(submitBids, { gameId, bids: { [wave1[0]]: { rate: 5.0, years: 1 } } }, 'scout-resume');

    // Simulate the crash: flip committed (phase already LINEUP, marker present),
    // process died before ANY hook ran — the auction was never resolved.
    await db.doc(`games/${gameId}`).update({
      phase: 'LINEUP',
      transition: { fromRound: 1, fromPhase: 'AUCTION', toRound: 1, toPhase: 'LINEUP' },
    });

    const out = await call(advancePhase, { gameId }, 'prof-resume');
    expect(out).toEqual({ round: 1, phase: 'LINEUP' }); // finished the crashed advance — did NOT step further

    // the missed AUCTION exit hook ran on resume: sealed bids are now resolved
    const auction = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect(auction.results).toBeTruthy();
    expect(auction.results.find((r) => r.pid === wave1[0]))
      .toMatchObject({ pid: wave1[0], teamId: tA, rate: 5.0, years: 1 });

    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'LINEUP' });
    expect(g.transition).toBeUndefined(); // marker cleaned up
  });

  // Companion to the expectation-less variant above: the professor's client re-reads
  // the live game doc after any call, so its own retry of a crashed advance — or a
  // quick second click landing after that re-read — sends expectations MATCHING the
  // post-flip state (LINEUP/1, what the crashed call already committed), not the
  // stale pre-flip AUCTION/1. That must adopt too, not bounce off PHASE_MISMATCH.
  it('finishes a crashed advance when the retry supplies MATCHING expectations (quick re-click / crash-retry)', async () => {
    const res = await call(createGame, { teamNames: ['Eta', 'Theta'] }, 'prof-resume-2');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [tA] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: tA, role: 'Scout', displayName: 'S' }, 'scout-resume-2');
    await call(startSeason, { gameId }, 'prof-resume-2');
    await call(advancePhase, { gameId }, 'prof-resume-2'); // FREE_AGENCY(1) -> AUCTION(1)
    await call(submitBids, { gameId, bids: { [wave1[0]]: { rate: 5.0, years: 1 } } }, 'scout-resume-2');

    // Simulate the crash: flip committed (phase already LINEUP, marker present),
    // process died before ANY hook ran — the auction was never resolved.
    await db.doc(`games/${gameId}`).update({
      phase: 'LINEUP',
      transition: { fromRound: 1, fromPhase: 'AUCTION', toRound: 1, toPhase: 'LINEUP' },
    });

    const out = await call(advancePhase,
      { gameId, expectedPhase: 'LINEUP', expectedRound: 1 }, 'prof-resume-2');
    expect(out).toEqual({ round: 1, phase: 'LINEUP' }); // finished the crashed advance — did NOT step further

    // the missed AUCTION exit hook ran on resume: sealed bids are now resolved
    const auction = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect(auction.results).toBeTruthy();
    expect(auction.results.find((r) => r.pid === wave1[0]))
      .toMatchObject({ pid: wave1[0], teamId: tA, rate: 5.0, years: 1 });

    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 1, phase: 'LINEUP' });
    expect(g.transition).toBeUndefined(); // marker cleaned up
  });
});

// Defect 2 regression (the minor half): once the flip lands, the door is closed —
// every phase-gated transaction that would have raced the closing hook now sees the
// new phase and rejects with its mapped error instead of silently slipping through.
describe('phase flips close the door on late transactions', () => {
  let gameId, teamA;
  const prof = 'prof-close', gm = 'gm-close', scout = 'scout-close';

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Epsilon', 'Zeta'] }, prof);
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'G' }, gm);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'S' }, scout);
    await call(startSeason, { gameId }, prof);
  });

  it('after FREE_AGENCY -> AUCTION, cutRosterPlayer and signPlayer reject with their phase errors', async () => {
    // sign someone during FA so there is a real roster pid to attempt to cut later
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    const pid = market.available[0];
    await call(signPlayer, { gameId, pid, years: 1 }, gm);

    await call(advancePhase, { gameId }, prof); // FREE_AGENCY(1) -> AUCTION(1)

    await expect(call(cutRosterPlayer, { gameId, pid }, gm)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('cuts happen in front office or free agency') });
    await expect(call(signPlayer, { gameId, pid: market.available[1], years: 1 }, gm))
      .rejects.toMatchObject({
        code: 'failed-precondition', message: expect.stringContaining('market is closed') });
  });

  it('after AUCTION -> LINEUP, submitBids rejects "auction is closed"', async () => {
    await call(advancePhase, { gameId }, prof); // AUCTION(1) -> LINEUP(1)
    await expect(call(submitBids, { gameId, bids: { [wave1[0]]: { rate: 5.0, years: 1 } } }, scout))
      .rejects.toMatchObject({
        code: 'failed-precondition', message: expect.stringContaining('auction is closed') });
  });
});
