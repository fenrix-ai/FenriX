import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, createTeam, joinGame, startSeason } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('zero-team createGame', () => {
  it('an empty payload creates a game with zero teams and teamCount 0', async () => {
    const res = await call(createGame, {}, 'prof');
    expect(res.joinCode).toHaveLength(6);
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    expect(teams.size).toBe(0);
    expect((await db.doc(`games/${res.gameId}`).get()).data().teamCount).toBe(0);
  });
  it('explicit paths keep the 2-minimum (tooling contract)', async () => {
    await expect(call(createGame, { teamNames: [] }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await expect(call(createGame, { teamCount: 0 }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
  });
});

describe('createTeam', () => {
  it('creates the franchise AND claims the creator seat in one transaction', async () => {
    const g = await call(createGame, {}, 'prof');
    const res = await call(createTeam,
      { joinCode: g.joinCode, name: 'Cap Crunchers', role: 'GM', displayName: 'Founder' }, 'stu1');
    expect(res).toMatchObject({ gameId: g.gameId, role: 'GM' });
    const team = (await db.doc(`games/${g.gameId}/teams/${res.teamId}`).get()).data();
    // Exact day-zero shape parity with createGame's teams (shared newTeamDoc).
    expect(team).toEqual({
      name: 'Cap Crunchers', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
      doneRound: 0, donePhase: '', spendLog: [],
    });
    const m = (await db.doc(`games/${g.gameId}/players/stu1`).get()).data();
    expect(m).toEqual({ teamId: res.teamId, role: 'GM', displayName: 'Founder' });
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(1);
  });
  it('name rules mirror renameTeam: trim + 24-char slice; empty and formula prefixes reject', async () => {
    const g = await call(createGame, {}, 'prof');
    const res = await call(createTeam, {
      joinCode: g.joinCode, name: '  The Cap Crunchers of Silicon Valley  ',
      role: 'Scout', displayName: 'S' }, 'stu1');
    const team = (await db.doc(`games/${g.gameId}/teams/${res.teamId}`).get()).data();
    expect(team.name).toBe('The Cap Crunchers of Sil'); // trim then slice(0, 24)
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: '   ', role: 'GM', displayName: 'A' }, 'stu2'))
      .rejects.toThrow('BAD_NAME');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: '=SUM(A1:B2)', role: 'GM', displayName: 'A' }, 'stu2'))
      .rejects.toThrow('BAD_NAME');
  });
  it('duplicate names are allowed — teamId keys all correctness (accepted, ledgered)', async () => {
    const g = await call(createGame, {}, 'prof');
    const a = await call(createTeam,
      { joinCode: g.joinCode, name: 'Twins', role: 'GM', displayName: 'A' }, 'stu1');
    const b = await call(createTeam,
      { joinCode: g.joinCode, name: 'Twins', role: 'GM', displayName: 'B' }, 'stu2');
    expect(a.teamId).not.toBe(b.teamId);
    const teams = await db.collection(`games/${g.gameId}/teams`).get();
    expect(teams.docs.map((d) => d.data().name)).toEqual(['Twins', 'Twins']);
  });
  it('franchise #22 is rejected: the 21-cap is enforced HERE server-side (amended rule)', async () => {
    const names = Array.from({ length: 21 }, (_, i) => `Team ${i + 1}`);
    const g = await call(createGame, { teamNames: names }, 'prof');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'One Too Many', role: 'GM', displayName: 'X' }, 'stu1'))
      .rejects.toThrow('league is full');
    const after = await db.collection(`games/${g.gameId}/teams`).get();
    expect(after.size).toBe(21);
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(21);
  });
  it('creation closes at startSeason; join codes must resolve; roles must be real', async () => {
    const g = await call(createGame, {}, 'prof');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Alpha', role: 'GM', displayName: 'A' }, 'stu1');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Beta', role: 'GM', displayName: 'B' }, 'stu2');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'Late FC', role: 'GM', displayName: 'L' }, 'stu3'))
      .rejects.toThrow('creation is closed');
    await expect(call(createTeam,
      { joinCode: 'ZZZZZZ', name: 'Ghost', role: 'GM', displayName: 'G' }, 'stu3'))
      .rejects.toThrow('bad join code');
    await expect(call(createTeam,
      { joinCode: g.joinCode, name: 'Ref FC', role: 'Referee', displayName: 'R' }, 'stu3'))
      .rejects.toThrow('bad role');
  });
  it('a creator holding a seat MOVES to the new franchise (joinGame switch parity)', async () => {
    const g = await call(createGame, {}, 'prof');
    const first = await call(createTeam,
      { joinCode: g.joinCode, name: 'First Try', role: 'GM', displayName: 'A' }, 'stu1');
    const second = await call(createTeam,
      { joinCode: g.joinCode, name: 'Second Try', role: 'Coach', displayName: 'A' }, 'stu1');
    const m = (await db.doc(`games/${g.gameId}/players/stu1`).get()).data();
    expect(m).toMatchObject({ teamId: second.teamId, role: 'Coach' });
    // The abandoned franchise persists (idles on server defaults) — no orphan
    // at birth, but abandonment is possible and accepted (RUNBOOK row).
    expect((await db.doc(`games/${g.gameId}/teams/${first.teamId}`).get()).exists).toBe(true);
    expect((await db.doc(`games/${g.gameId}`).get()).data().teamCount).toBe(2);
  });
});

describe('startSeason floor', () => {
  it('refuses 0 and 1 teams; starts at 2 with the market drawn', async () => {
    const g = await call(createGame, {}, 'prof');
    await expect(call(startSeason, { gameId: g.gameId }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Solo', role: 'GM', displayName: 'A' }, 'stu1');
    await expect(call(startSeason, { gameId: g.gameId }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
    await call(createTeam,
      { joinCode: g.joinCode, name: 'Duo', role: 'GM', displayName: 'B' }, 'stu2');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    const game = (await db.doc(`games/${g.gameId}`).get()).data();
    expect(game).toMatchObject({ status: 'active', round: 1, phase: 'FREE_AGENCY' });
    expect((await db.doc(`games/${g.gameId}/market/1`).get()).exists).toBe(true);
  });
  it('teamNames-created games start exactly as before (tooling regression guard)', async () => {
    const g = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    await call(startSeason, { gameId: g.gameId }, 'prof');
    const game = (await db.doc(`games/${g.gameId}`).get()).data();
    expect(game).toMatchObject({ status: 'active', round: 1, phase: 'FREE_AGENCY' });
    expect((await db.doc(`games/${g.gameId}/market/1`).get()).exists).toBe(true);
  });
});
