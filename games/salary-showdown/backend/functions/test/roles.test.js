import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitBids, submitLineup, releaseSeat } =
  await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

// Two teams; team A gets a GM (+ optionally a Scout); team B stays empty and
// rides hardship autofill + lineup auto-repair, like reveal.test.js's passive
// teams. Drive with expectations — standing hard rule.
async function gameAt(phase, { withScout = false } = {}) {
  const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
  const teams = await db.collection(`games/${res.gameId}/teams`).get();
  const teamA = teams.docs.find((d) => d.data().name === 'Alpha').id;
  await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'G' }, 'gmA');
  if (withScout) {
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'S' }, 'scoutA');
  }
  await call(startSeason, { gameId: res.gameId }, 'prof');
  let g = (await db.doc(`games/${res.gameId}`).get()).data();
  let guard = 0;
  while (g.phase !== phase) {
    await call(advancePhase,
      { gameId: res.gameId, expectedPhase: g.phase, expectedRound: g.round }, 'prof');
    g = (await db.doc(`games/${res.gameId}`).get()).data();
    if (++guard > 10) throw new Error(`never reached ${phase}`);
  }
  return { gameId: res.gameId, teamA, round: g.round };
}

describe('absent-seat role fallback', () => {
  it('a GM may bid when the team has NO Scout', async () => {
    const { gameId, teamA } = await gameAt('AUCTION');
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    await call(submitBids, { gameId, bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } }, 'gmA');
    const priv = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    expect(priv.round).toBe(1);
  });
  it('a claimed Scout seat stays authoritative — the GM is rejected', async () => {
    const { gameId } = await gameAt('AUCTION', { withScout: true });
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    await expect(call(submitBids,
      { gameId, bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } }, 'gmA'))
      .rejects.toThrow('Scout only');
  });
  it('a GM may submit the lineup when the team has NO Coach', async () => {
    const { gameId, teamA } = await gameAt('LINEUP');
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const active = team.roster
      .filter((c) => c.startRound + c.years - 1 >= 1).map((c) => c.pid);
    // synthetics.js pid blocks: 9001-3 G, 9011-3 W, 9021-2 B
    const pos = (pid) => (pid >= 9020 ? 'B' : pid >= 9010 ? 'W' : 'G');
    const g = active.filter((p) => pos(p) === 'G');
    const w = active.filter((p) => pos(p) === 'W');
    const b = active.filter((p) => pos(p) === 'B');
    const starters = [g[0], g[1], w[0], w[1], b[0]];
    const rest = active.filter((p) => !starters.includes(p));
    await call(submitLineup, { gameId, lineup: {
      starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' } }, 'gmA');
    const after = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(after.lineupLockedRound).toBe(1);
  });
});

describe('releaseSeat', () => {
  it('professor frees a claimed seat; the fallback then covers it', async () => {
    const { gameId, teamA } = await gameAt('AUCTION', { withScout: true });
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    const bids = { [wave.stars[0]]: { rate: 2.0, years: 1 } };
    await expect(call(submitBids, { gameId, bids }, 'gmA')).rejects.toThrow('Scout only');
    await call(releaseSeat, { gameId, teamId: teamA, role: 'Scout' }, 'prof');
    expect((await db.doc(`games/${gameId}/players/scoutA`).get()).exists).toBe(false);
    await call(submitBids, { gameId, bids }, 'gmA'); // fallback now applies
    const priv = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    expect(priv.round).toBe(1);
  });
  it('non-professor and unclaimed-seat calls reject', async () => {
    const { gameId, teamA } = await gameAt('AUCTION');
    await expect(call(releaseSeat, { gameId, teamId: teamA, role: 'GM' }, 'gmA'))
      .rejects.toThrow('professor only');
    await expect(call(releaseSeat, { gameId, teamId: teamA, role: 'Coach' }, 'prof'))
      .rejects.toThrow('seat is not claimed');
  });

  it('fallback is per-TEAM: a rival Scout neither blocks nor receives team A\'s fallback bid', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    const teamA = teams.docs.find((d) => d.data().name === 'Alpha').id;
    const teamB = teams.docs.find((d) => d.data().name === 'Beta').id;
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'G' }, 'gmA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamB, role: 'Scout', displayName: 'S' }, 'scoutB');
    await call(startSeason, { gameId: res.gameId }, 'prof');
    let g = (await db.doc(`games/${res.gameId}`).get()).data();
    let guard = 0;
    while (g.phase !== 'AUCTION') {
      await call(advancePhase,
        { gameId: res.gameId, expectedPhase: g.phase, expectedRound: g.round }, 'prof');
      g = (await db.doc(`games/${res.gameId}`).get()).data();
      if (++guard > 10) throw new Error('never reached AUCTION');
    }
    const wave = (await db.doc(`games/${res.gameId}/auctions/1`).get()).data();
    // B's claimed Scout must NOT block team A's fallback (holder query keys on
    // the CALLER's team)...
    await call(submitBids,
      { gameId: res.gameId, bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } }, 'gmA');
    // ...and the write landed on A's own private doc, with B's untouched.
    expect((await db.doc(`games/${res.gameId}/teams/${teamA}/private/auction`).get()).data().round).toBe(1);
    expect((await db.doc(`games/${res.gameId}/teams/${teamB}/private/auction`).get()).exists).toBe(false);
    // releaseSeat scoped to team A cannot touch B's Scout.
    await expect(call(releaseSeat, { gameId: res.gameId, teamId: teamA, role: 'Scout' }, 'prof'))
      .rejects.toThrow('seat is not claimed');
    expect((await db.doc(`games/${res.gameId}/players/scoutB`).get()).exists).toBe(true);
  });

  it('releaseSeat demands auth before the professor check (crafted-path guard)', async () => {
    const { gameId, teamA } = await gameAt('AUCTION');
    await expect(t.wrap(releaseSeat)({
      data: { gameId: `${gameId}/teams/${teamA}`, teamId: teamA, role: 'GM' },
      auth: undefined,
    })).rejects.toThrow('sign in first');
  });
});
