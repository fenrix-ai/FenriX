import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, renameTeam } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('count-first createGame', () => {
  it('teamCount creates placeholder-named franchises', async () => {
    const res = await call(createGame, { teamCount: 3 }, 'prof');
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    expect(teams.docs.map((d) => d.data().name).sort())
      .toEqual(['Franchise 1', 'Franchise 2', 'Franchise 3']);
  });
  it('teamCount below 2 rejects like a short teamNames list', async () => {
    await expect(call(createGame, { teamCount: 1 }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
  });
});

describe('renameTeam', () => {
  async function lobbyGame() {
    const res = await call(createGame, { teamCount: 2 }, 'prof');
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    const teamIds = teams.docs.map((d) => d.id);
    await call(joinGame, {
      joinCode: res.joinCode, teamId: teamIds[0], role: 'GM', displayName: 'A',
    }, 'gmA');
    return { ...res, teamIds };
  }
  it('a member renames THEIR OWN team in the lobby (trimmed, 24-char cap)', async () => {
    const g = await lobbyGame();
    await call(renameTeam, { gameId: g.gameId, name: '  The Cap Crunchers of Silicon Valley  ' }, 'gmA');
    const mine = (await db.doc(`games/${g.gameId}/teams/${g.teamIds[0]}`).get()).data();
    expect(mine.name).toBe('The Cap Crunchers of Sil'); // trim + slice(0, 24)
    // the rival team keeps its placeholder — renameTeam has no teamId input
    const rival = (await db.doc(`games/${g.gameId}/teams/${g.teamIds[1]}`).get()).data();
    expect(rival.name).toMatch(/^Franchise /);
  });
  it('empty and non-member renames reject', async () => {
    const g = await lobbyGame();
    await expect(call(renameTeam, { gameId: g.gameId, name: '   ' }, 'gmA'))
      .rejects.toThrow('BAD_NAME');
    await expect(call(renameTeam, { gameId: g.gameId, name: 'Sneaky' }, 'stranger'))
      .rejects.toThrow('not in this game');
  });
  it('naming closes at startSeason', async () => {
    const g = await lobbyGame();
    await call(startSeason, { gameId: g.gameId }, 'prof');
    await expect(call(renameTeam, { gameId: g.gameId, name: 'Too Late FC' }, 'gmA'))
      .rejects.toThrow('naming is closed');
  });
});
