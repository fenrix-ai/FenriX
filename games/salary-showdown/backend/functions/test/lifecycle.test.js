import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('lifecycle', () => {
  let gameId, joinCode;
  it('createGame seeds teams and catalog', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    ({ gameId, joinCode } = res);
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g.status).toBe('lobby');
    expect(g.professorUid).toBe('prof');
    const catalog = await db.collection(`games/${gameId}/catalog`).count().get();
    expect(catalog.data().count).toBe(175);
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
});
