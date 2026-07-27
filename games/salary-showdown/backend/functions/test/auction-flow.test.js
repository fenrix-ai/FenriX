import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };
import { hypeCurve } from '../src/payroll.js';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitBids } = await import('../src/game.js');
const { HOOKS } = await import('../src/phases.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const wave1 = players.filter((p) => +p.auction_round === 1).map((p) => p.pid);
const byId = Object.fromEntries(players.map((p) => [p.pid, p]));

// Sealed-bid star auction: submitBids (Scout-only, writes a private per-team bid
// doc) feeding the AUCTION exit hook's resolveAuction call. Covers the interlocking
// contracts from Task 9's review: unsold/{pid} = { price } (not `listBase`) matches
// enter:FREE_AGENCY's reader exactly, and a skipped/losing bid never leaks cross-team.
describe('auction flow (sealed bids -> resolution)', () => {
  let gameId, teamA, teamB;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'ScoutA' }, 'scoutA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamB, role: 'Scout', displayName: 'ScoutB' }, 'scoutB');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'GmA' }, 'gmA');
    await call(startSeason, { gameId }, 'prof');
    await call(advancePhase, { gameId }, 'prof'); // FREE_AGENCY(1) -> AUCTION(1) (fires hardship + enter:AUCTION)
  });

  it('enter:AUCTION seeds tonight\'s wave with the round-1 stars', async () => {
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect([...wave.stars].sort()).toEqual([...wave1].sort());
  });

  it('rejects a non-Scout role', async () => {
    await expect(call(submitBids, { gameId, bids: { [wave1[0]]: { rate: 5.0, years: 1 } } }, 'gmA'))
      .rejects.toThrow(/Scout only/i);
  });

  it('rejects an invalid bid (server-side validateBids is actually wired)', async () => {
    await expect(call(submitBids, { gameId, bids: { 999999: { rate: 5.0, years: 1 } } }, 'scoutA'))
      .rejects.toThrow('NOT_IN_WAVE');
  });

  // Shape guard: a null (or non-object) `bids` payload must fail as a named,
  // catchable error at the callable boundary — not slip past `validateBids`'s
  // `bids ?? {}` and crash downstream at `Object.keys(bids).length` with a raw
  // "Cannot convert undefined or null to object" TypeError.
  it('rejects a null bids payload with BAD_SHAPE instead of crashing at Object.keys', async () => {
    await expect(call(submitBids, { gameId, bids: null }, 'scoutA'))
      .rejects.toThrow('BAD_SHAPE');
  });

  it('a Scout cannot bid on behalf of another team even with a spoofed teamId in the payload', async () => {
    // scoutA bids on the contested star AND a second star, with an extra `teamId`
    // field pointing at teamB tacked onto the payload — submitBids must ignore it
    // and derive the team from the caller's own membership doc.
    await call(submitBids, { gameId, teamId: teamB, bids: {
      [wave1[0]]: { rate: 5.0, years: 1 },   // 5.0 gtd — will lose to scoutB below
      [wave1[4]]: { rate: 3.0, years: 1 },   // uncontested
    } }, 'scoutA');
    await call(submitBids, { gameId, bids: { [wave1[0]]: { rate: 8.0, years: 1 } } }, 'scoutB'); // 8.0 gtd — wins

    const privA = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    const privB = (await db.doc(`games/${gameId}/teams/${teamB}/private/auction`).get()).data();
    expect(privA.bids[wave1[0]]).toMatchObject({ rate: 5.0, years: 1 });
    expect(privA.bids[wave1[4]]).toMatchObject({ rate: 3.0, years: 1 });
    expect(privB.bids[wave1[4]]).toBeUndefined(); // the spoofed teamId had no effect
  });

  it('resolves on AUCTION exit: higher guaranteed wins, loser pays nothing, results public, unsold doc created', async () => {
    const res = await call(advancePhase, { gameId }, 'prof'); // AUCTION(1) -> LINEUP(1)
    expect(res).toEqual({ round: 1, phase: 'LINEUP' });

    const auction = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect(auction.results.find((a) => a.pid === wave1[0])).toMatchObject(
      { pid: wave1[0], teamId: teamB, rate: 8.0, years: 1, guaranteed: 8.0 });
    expect(auction.results.find((a) => a.pid === wave1[4])).toMatchObject(
      { pid: wave1[4], teamId: teamA, rate: 3.0, years: 1, guaranteed: 3.0 });

    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const b = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(a.roster.some((c) => c.pid === wave1[0])).toBe(false); // A lost the bid war, gets nothing
    expect(b.roster.find((c) => c.pid === wave1[0])).toMatchObject(
      { pid: wave1[0], rate: 8.0, years: 1, startRound: 1, viaAuction: true });
    expect(a.roster.find((c) => c.pid === wave1[4])).toMatchObject(
      { pid: wave1[4], rate: 3.0, years: 1, startRound: 1, viaAuction: true });

    // wave1[1] never received a bid at all — resolves to teamId: null, and
    // enter:FREE_AGENCY's exact reader shape (doc.data().price) is what gets written.
    const unsoldPid = wave1[1];
    expect(auction.results.find((r) => r.pid === unsoldPid)).toMatchObject({ pid: unsoldPid, teamId: null });
    const unsoldDoc = (await db.doc(`games/${gameId}/unsold/${unsoldPid}`).get()).data();
    const expectedPrice = Math.round(hypeCurve(+byId[unsoldPid].hype) * 10) / 10;
    expect(unsoldDoc).toEqual({ price: expectedPrice });
  });

  it('AUCTION exit hook is internally idempotent (bails once results already exist)', async () => {
    const before = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    const beforeUnsold = (await db.doc(`games/${gameId}/unsold/${wave1[1]}`).get()).data();
    await HOOKS.AUCTION(gameId, 1); // direct re-invoke, bypassing runHookOnce entirely
    const after = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    const afterUnsold = (await db.doc(`games/${gameId}/unsold/${wave1[1]}`).get()).data();
    expect(after.roster.length).toBe(before.roster.length); // no duplicate award
    expect(afterUnsold).toEqual(beforeUnsold);
  });
});

// Regression test: HOOKS['AUCTION'] only honors a private/auction doc whose `round`
// field matches the round actually being resolved (`if (!priv.exists || priv.data().round
// !== round) continue;`). A doc left over from a prior round — e.g. a retry/race that
// wrote a stale `round` — must be ignored entirely, not honored as a phantom bid.
// Playtest-polish Task 1: a bid that would have won a star but was passed over for
// roster/cap reasons produces a team-private "skip" note (spec §1.2) on the exact
// private/auction doc the Scout wrote, round-stamped to the round just resolved.
// NOTE: a genuine CAP block via real signPlayer callables would require engineering
// the FA market draw's exact rates in this fixture set; per the task brief, an admin
// pre-write that fills the roster to the 10-man max is the sanctioned equivalent —
// this exercises the identical roster-skip/fall-through path with reason: 'roster'.
describe('auction skip records: team-private would-have-won note (playtest-polish T1)', () => {
  it('a roster-blocked high bid is recorded as a private skip note; the lower bid wins clean, public results carry no skip', async () => {
    const res = await call(createGame, { teamNames: ['Full', 'Open'] }, 'profSkip');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'ScoutFullA' }, 'scoutFullA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamB, role: 'Scout', displayName: 'ScoutOpenB' }, 'scoutOpenB');
    await call(startSeason, { gameId }, 'profSkip');
    await call(advancePhase, { gameId }, 'profSkip'); // FREE_AGENCY(1) -> AUCTION(1)

    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    const target = wave.stars[0];

    // Admin pre-write: overwrite team A's roster to the 10-man max with round-1,
    // 5-year contracts so its bid below is roster-blocked, not cap-blocked.
    const fullRoster = Array.from({ length: 10 }, (_, i) => ({
      pid: 9000 + i, rate: 1.0, startRound: 1, years: 5, viaAuction: false, hardship: false,
    }));
    await db.doc(`games/${gameId}/teams/${teamA}`).update({ roster: fullRoster });

    await call(submitBids, { gameId, bids: { [target]: { rate: 20.0, years: 1 } } }, 'scoutFullA'); // 20 gtd — would win, roster-blocked
    await call(submitBids, { gameId, bids: { [target]: { rate: 10.0, years: 1 } } }, 'scoutOpenB'); // 10 gtd — wins

    await call(advancePhase, { gameId }, 'profSkip'); // AUCTION(1) -> LINEUP(1): resolves

    const auction = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect(auction.results.find((a) => a.pid === target)).toMatchObject(
      { pid: target, teamId: teamB, rate: 10.0, years: 1 });

    const privA = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    const privB = (await db.doc(`games/${gameId}/teams/${teamB}/private/auction`).get()).data();
    expect(privA.skippedRound).toBe(1);
    expect(privA.skipped).toEqual([{ pid: target, reason: 'roster' }]);
    expect(privB.skipped).toBeUndefined(); // clean winner's private doc carries no skip note
  });
});

describe('stale prior-round bid doc is ignored at resolution', () => {
  it('a private/auction doc with round: r-1 present is ignored — no phantom award, star resolves unsold', async () => {
    const res = await call(createGame, { teamNames: ['Iota', 'Kappa'] }, 'prof5');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [tA] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: tA, role: 'Scout', displayName: 'S' }, 'scoutStale');
    await call(startSeason, { gameId }, 'prof5');
    await call(advancePhase, { gameId }, 'prof5'); // FREE_AGENCY(1) -> AUCTION(1)

    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    const target = wave.stars[0];
    // A legal-looking, generously high bid — but tagged with round: 0, a PRIOR round,
    // as if a retry/race left this doc behind before the live round (1) ever bid on
    // it. This must never be honored.
    await db.doc(`games/${gameId}/teams/${tA}/private/auction`).set({
      bids: { [target]: { rate: 50.0, years: 1 } }, round: 0,
    });

    await call(advancePhase, { gameId }, 'prof5'); // AUCTION(1) -> LINEUP(1): resolves

    const auction = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    expect(auction.results.find((a) => a.pid === target)).toMatchObject({ pid: target, teamId: null });
    const teamADoc = (await db.doc(`games/${gameId}/teams/${tA}`).get()).data();
    expect(teamADoc.roster.some((c) => c.pid === target)).toBe(false);
    expect(teamADoc.spendLog.some((c) => c.pid === target)).toBe(false);
  });
});
