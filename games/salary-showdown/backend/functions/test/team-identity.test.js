import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const api = await import('../src/game.js');
const db = getFirestore();

const { isTeamIdentity } = await import('../src/teamIdentity.js');
const { createGame, getLobby, joinGame, startSeason } = api;

const call = (fn, data, uid) => {
  if (typeof fn !== 'function') return Promise.resolve({ missingCallable: true });
  const request = { data };
  if (uid !== undefined) request.auth = { uid, token: {} };
  return t.wrap(fn)(request);
};

async function lobbyGame() {
  const professorUid = `prof-${crypto.randomUUID()}`;
  const created = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, professorUid);
  const teams = await db.collection(`games/${created.gameId}/teams`).get();
  const teamByName = Object.fromEntries(teams.docs.map((doc) => [doc.data().name, doc.id]));
  const teamIds = [teamByName.Alpha, teamByName.Beta];
  const memberUid = `member-${crypto.randomUUID()}`;
  await call(joinGame, {
    joinCode: created.joinCode,
    teamId: teamIds[0],
    role: 'GM',
    displayName: 'Identity Owner',
  }, memberUid);
  return { ...created, memberUid, professorUid, teamIds };
}

describe('isTeamIdentity', () => {
  it('accepts the exact accent and jersey wire shape', () => {
    expect(isTeamIdentity({ accent: 'teal', jersey: 'stripe' })).toBe(true);
  });

  it.each([
    null,
    [],
    { accent: '#fff', jersey: 'stripe' },
    { accent: 'teal', jersey: 'pinstripe' },
    { accent: 'teal', jersey: 'stripe', url: 'x' },
    Object.assign(Object.create(null), { accent: 'teal', jersey: 'stripe' }),
  ])('rejects malformed identity %#', (identity) => {
    expect(isTeamIdentity(identity)).toBe(false);
  });
});

describe('setTeamIdentity', () => {
  let sharedGame;

  beforeAll(async () => {
    sharedGame = await lobbyGame();
  });

  it('is exported from the callable module', () => {
    expect(typeof api.setTeamIdentity).toBe('function');
  });

  it('updates only the caller team, ignores a caller-supplied rival teamId, and returns {ok:true}', async () => {
    const game = sharedGame;
    const identity = { accent: 'teal', jersey: 'stripe' };

    const result = await call(api.setTeamIdentity, {
      gameId: game.gameId,
      teamId: game.teamIds[1],
      identity,
    }, game.memberUid);

    expect(result).toEqual({ ok: true });
    const [own, rival] = await Promise.all(game.teamIds.map((teamId) =>
      db.doc(`games/${game.gameId}/teams/${teamId}`).get()));
    expect(own.data().identity).toEqual(identity);
    expect(rival.data().identity).toBeUndefined();
  });

  it('rejects strangers and unauthenticated callers', async () => {
    const game = sharedGame;
    const data = {
      gameId: game.gameId,
      identity: { accent: 'coral', jersey: 'classic' },
    };

    await expect(call(api.setTeamIdentity, data, `stranger-${crypto.randomUUID()}`))
      .rejects.toMatchObject({
        code: 'permission-denied',
        message: expect.stringContaining('not in this game'),
      });
    await expect(call(api.setTeamIdentity, data))
      .rejects.toMatchObject({
        code: 'unauthenticated',
        message: expect.stringContaining('sign in first'),
      });
  });

  it.each(['', '   ', 'bad/game', null, 42])('rejects malformed gameId %# before constructing refs', async (gameId) => {
    await expect(call(api.setTeamIdentity, {
      gameId,
      identity: { accent: 'gold', jersey: 'chevron' },
    }, `member-${crypto.randomUUID()}`)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('BAD_GAME_ID'),
    });
  });

  it.each([
    null,
    [],
    { accent: '#fff', jersey: 'stripe' },
    { accent: 'teal', jersey: 'pinstripe' },
    { accent: 'teal', jersey: 'stripe', url: 'x' },
  ])('rejects invalid identity %# with BAD_IDENTITY', async (identity) => {
    const game = sharedGame;
    await expect(call(api.setTeamIdentity, { gameId: game.gameId, identity }, game.memberUid))
      .rejects.toMatchObject({
        code: 'invalid-argument',
        message: expect.stringContaining('BAD_IDENTITY'),
      });
  });

  it('rejects after startSeason and when either lobby gate is closed', async () => {
    const started = await lobbyGame();
    await call(startSeason, { gameId: started.gameId }, started.professorUid);
    await expect(call(api.setTeamIdentity, {
      gameId: started.gameId,
      identity: { accent: 'violet', jersey: 'classic' },
    }, started.memberUid)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('identity is closed'),
    });

    const wrongPhase = await lobbyGame();
    await db.doc(`games/${wrongPhase.gameId}`).update({ phase: 'FREE_AGENCY' });
    await expect(call(api.setTeamIdentity, {
      gameId: wrongPhase.gameId,
      identity: { accent: 'sky', jersey: 'chevron' },
    }, wrongPhase.memberUid)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('identity is closed'),
    });
  });

  it('getLobby preserves the old public shape and adds only validated identity when present', async () => {
    const game = await lobbyGame();
    const identity = { accent: 'mint', jersey: 'chevron' };
    await call(api.setTeamIdentity, { gameId: game.gameId, identity }, game.memberUid);

    const lobby = await call(getLobby, { joinCode: game.joinCode }, `viewer-${crypto.randomUUID()}`);
    const own = lobby.teams.find((team) => team.teamId === game.teamIds[0]);
    const old = lobby.teams.find((team) => team.teamId === game.teamIds[1]);
    expect(own).toEqual({
      teamId: game.teamIds[0], name: 'Alpha', claimedRoles: ['GM'], identity,
    });
    expect(old).toEqual({
      teamId: game.teamIds[1], name: 'Beta', claimedRoles: [],
    });

    await db.doc(`games/${game.gameId}/teams/${game.teamIds[1]}`)
      .update({ identity: { accent: '#fff', jersey: 'classic' } });
    const guarded = await call(getLobby, { joinCode: game.joinCode }, `viewer-${crypto.randomUUID()}`);
    expect(guarded.teams.find((team) => team.teamId === game.teamIds[1])).toEqual({
      teamId: game.teamIds[1], name: 'Beta', claimedRoles: [],
    });
  });

  it('serializes a concurrent identity save against startSeason', async () => {
    const game = await lobbyGame();
    const identity = { accent: 'coral', jersey: 'stripe' };

    const [save, start] = await Promise.allSettled([
      call(api.setTeamIdentity, { gameId: game.gameId, identity }, game.memberUid),
      call(startSeason, { gameId: game.gameId }, game.professorUid),
    ]);

    expect(start).toMatchObject({ status: 'fulfilled', value: { phase: 'FREE_AGENCY' } });
    const [gameDoc, teamDoc] = await Promise.all([
      db.doc(`games/${game.gameId}`).get(),
      db.doc(`games/${game.gameId}/teams/${game.teamIds[0]}`).get(),
    ]);
    expect(gameDoc.data()).toMatchObject({ status: 'active', phase: 'FREE_AGENCY' });
    if (save.status === 'fulfilled') {
      expect(save.value).toEqual({ ok: true });
      expect(teamDoc.data().identity).toEqual(identity);
    } else {
      expect(save.reason).toMatchObject({
        code: 'failed-precondition',
        message: expect.stringContaining('identity is closed'),
      });
      expect(teamDoc.data().identity).toBeUndefined();
    }
  });
});
