import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };
import { drawMarket } from '../src/market.js';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer } = await import('../src/game.js');
const { HOOKS } = await import('../src/phases.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const fa = players.filter((p) => !p.auction_round);

// Free agency is NON-EXCLUSIVE (spec §4.2): the FA pool is a shared catalog — any
// number of teams may sign their own independent copy of the same player, and
// signing never removes a player from the market. Only auction stars are exclusive.
describe('market flow (signing, cutting, hardship, non-exclusive shared catalog)', () => {
  let gameId, teamA, teamB, sharedPid;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'A' }, 'gmA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamB, role: 'GM', displayName: 'B' }, 'gmB');
    await call(startSeason, { gameId }, 'prof');
  });

  it('signPlayer signs an available FA without removing it from the shared market', async () => {
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    sharedPid = market.available[0];
    const { contract } = await call(signPlayer, { gameId, pid: sharedPid, years: 2 }, 'gmA');
    expect(contract.pid).toBe(sharedPid);
    expect(contract.startRound).toBe(1);
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(team.roster.some((c) => c.pid === sharedPid)).toBe(true);
    const marketAfter = (await db.doc(`games/${gameId}/market/1`).get()).data();
    expect(marketAfter.available).toEqual(market.available); // market table is static within a phase
  });

  it('another team CAN sign its own copy of the same pid (non-exclusive)', async () => {
    const { contract } = await call(signPlayer, { gameId, pid: sharedPid, years: 1 }, 'gmB');
    expect(contract.pid).toBe(sharedPid);
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const b = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(a.roster.some((c) => c.pid === sharedPid)).toBe(true); // both rosters hold a copy
    expect(b.roster.some((c) => c.pid === sharedPid)).toBe(true);
  });

  it('rejects a GM double-signing the same pid onto their own roster in one phase', async () => {
    // the pid is still in the market (never removed), so the guard that stops a
    // single team stacking two copies of one player is ALREADY_SIGNED, not market state.
    await expect(call(signPlayer, { gameId, pid: sharedPid, years: 1 }, 'gmA')).rejects.toThrow('ALREADY_SIGNED');
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(a.roster.filter((c) => c.pid === sharedPid).length).toBe(1);
  });

  it('cutRosterPlayer moves a contract to dead money and frees the roster slot', async () => {
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    const pid = market.available[1];
    await call(signPlayer, { gameId, pid, years: 1 }, 'gmA');
    const { deadMoney } = await call(cutRosterPlayer, { gameId, pid }, 'gmA');
    expect(deadMoney.length).toBeGreaterThan(0);
    const after = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(after.roster.some((c) => c.pid === pid)).toBe(false);
  });

  it('hardship fills every under-8 team on FREE_AGENCY exit (copies allowed) and is internally idempotent', async () => {
    // Neither team built a legal 8-man roster from the handful of signings above,
    // so both should get hardship-filled when FREE_AGENCY closes.
    const res = await call(advancePhase, { gameId }, 'prof'); // FREE_AGENCY(1) -> AUCTION(1)
    expect(res).toEqual({ round: 1, phase: 'AUCTION' });

    const a1 = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const b1 = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(a1.hardshipUsed).toContain(1);
    expect(b1.hardshipUsed).toContain(1);
    expect(a1.roster.length).toBeGreaterThanOrEqual(8);
    expect(b1.roster.length).toBeGreaterThanOrEqual(8);
    // non-exclusive: both teams needed the same cheapest-legal players, so their
    // hardship signings overlap — each team holds its own independent copy.
    const aH = a1.roster.filter((c) => c.hardship).map((c) => c.pid);
    const bH = b1.roster.filter((c) => c.hardship).map((c) => c.pid);
    expect(aH.length).toBeGreaterThan(0);
    expect(aH.filter((pid) => bH.includes(pid)).length).toBeGreaterThan(0);
    // but no single team ever holds two copies of one player (per-team `owned` exclusion)
    expect(new Set(a1.roster.map((c) => c.pid)).size).toBe(a1.roster.length);
    expect(new Set(b1.roster.map((c) => c.pid)).size).toBe(b1.roster.length);

    // Directly re-invoke the exit hook (bypassing the hooklog guard entirely) to prove
    // hardship's OWN idempotency check — not just runHookOnce's — prevents re-filling
    // a team whose hardshipUsed already records this round.
    await HOOKS.FREE_AGENCY(gameId, 1);
    const a2 = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const b2 = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(a2.roster.length).toBe(a1.roster.length);
    expect(b2.roster.length).toBe(b1.roster.length);
    expect(a2.hardshipUsed.filter((r) => r === 1).length).toBe(1); // not appended twice
  });

  it('later-round draws run over the FULL catalog — players under contract still appear', async () => {
    // teamA's 2-round signing from the first test is still under contract for round 2.
    const a = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(a.roster.some((c) => c.pid === sharedPid && c.startRound + c.years - 1 >= 2)).toBe(true);

    const market1 = (await db.doc(`games/${gameId}/market/1`).get()).data();
    await call(advancePhase, { gameId }, 'prof'); // AUCTION(1) -> LINEUP(1)
    await call(advancePhase, { gameId }, 'prof'); // LINEUP(1) -> SIMULATE(1)
    await call(advancePhase, { gameId }, 'prof'); // SIMULATE(1) -> RESULTS(1)
    await call(advancePhase, { gameId }, 'prof'); // RESULTS(1) -> FRONT_OFFICE(2)
    const res = await call(advancePhase, { gameId }, 'prof'); // FRONT_OFFICE(2) -> FREE_AGENCY(2)
    expect(res).toEqual({ round: 2, phase: 'FREE_AGENCY' });

    const market2 = (await db.doc(`games/${gameId}/market/2`).get()).data();
    // the hook's draw must equal a draw over the UNFILTERED FA catalog: contract
    // status never hides a player from other teams' rotation draws (spec §4.2).
    const expected = drawMarket({ gameId, round: 2, faPool: fa, absentCounts: market1.absentCounts, extraPids: [] });
    expect(market2.available).toEqual(expected.available);
    expect(market2.absentCounts).toEqual(expected.absentCounts);
    expect(market2).toHaveProperty('unsoldPrices');
  });
});

describe('re-sign path', () => {
  it('signPlayer re-signs a team\'s own expiring pid in FRONT_OFFICE, bypassing the market', async () => {
    const res = await call(createGame, { teamNames: ['Gamma', 'Delta'] }, 'prof2');
    const gid = res.gameId;
    const teams = await db.collection(`games/${gid}/teams`).get();
    const teamId = teams.docs[0].id;
    await call(joinGame, { joinCode: res.joinCode, teamId, role: 'GM', displayName: 'G' }, 'gmG');
    const pid = fa[20].pid;
    // covers round 1 only -> expiringPids flags it as expiring once the game clock reads round 2
    await db.doc(`games/${gid}/teams/${teamId}`).update({ roster: [{ pid, rate: 4.0, startRound: 1, years: 1 }] });
    await db.doc(`games/${gid}`).update({ round: 2, phase: 'FRONT_OFFICE' });

    const { contract } = await call(signPlayer, { gameId: gid, pid, years: 2 }, 'gmG');
    expect(contract.pid).toBe(pid);
    expect(contract.startRound).toBe(2);
    const team = (await db.doc(`games/${gid}/teams/${teamId}`).get()).data();
    expect(team.roster.find((c) => c.pid === pid).years).toBe(2);
    expect(team.roster.filter((c) => c.pid === pid).length).toBe(1); // old contract replaced, not duplicated
  });

  it('rejects re-signing a pid that is not actually expiring this round', async () => {
    const res = await call(createGame, { teamNames: ['Epsilon', 'Zeta'] }, 'prof3');
    const gid = res.gameId;
    const teams = await db.collection(`games/${gid}/teams`).get();
    const teamId = teams.docs[0].id;
    await call(joinGame, { joinCode: res.joinCode, teamId, role: 'GM', displayName: 'E' }, 'gmE');
    const pid = fa[21].pid;
    // covers rounds 1-5: not expiring at round 2
    await db.doc(`games/${gid}/teams/${teamId}`).update({ roster: [{ pid, rate: 4.0, startRound: 1, years: 5 }] });
    await db.doc(`games/${gid}`).update({ round: 2, phase: 'FRONT_OFFICE' });

    await expect(call(signPlayer, { gameId: gid, pid, years: 1 }, 'gmE')).rejects.toThrow(/expiring/i);
  });
});
