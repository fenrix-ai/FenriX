import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import players from './data/players.json' with { type: 'json' };
import { makeRng } from './rng.js';
import { nextPhase, HOOKS } from './phases.js';

const ROLES = ['GM', 'Scout', 'Coach'];
const db = () => getFirestore();

export async function assertProfessor(gameId, uid) {
  const g = await db().doc(`games/${gameId}`).get();
  if (!g.exists) throw new HttpsError('not-found', 'game not found');
  if (g.data().professorUid !== uid) throw new HttpsError('permission-denied', 'professor only');
  return g.data();
}

export const createGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const teamNames = req.data.teamNames ?? [];
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
  const gameRef = db().collection('games').doc();
  const joinCode = gameRef.id.slice(0, 6).toUpperCase();
  const batch = db().batch();
  batch.set(gameRef, {
    joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null,
    professorUid: req.auth.uid, teamCount: teamNames.length,
    standingsSeed: gameRef.id, createdAt: FieldValue.serverTimestamp(),
    config: { cap: 100.0, totalRounds: 5 },
  });
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
    });
  }
  await batch.commit();
  // catalog seed: batched in chunks of 400 (batch limit 500)
  for (let i = 0; i < players.length; i += 400) {
    const b = db().batch();
    for (const p of players.slice(i, i + 400))
      b.set(gameRef.collection('catalog').doc(String(p.pid)), p);
    await b.commit();
  }
  return { gameId: gameRef.id, joinCode };
});

export const joinGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const { joinCode, teamId, role, displayName } = req.data;
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'bad role');
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const gameRef = games.docs[0].ref;
  return db().runTransaction(async (tx) => {
    const team = await tx.get(gameRef.collection('teams').doc(teamId));
    if (!team.exists) throw new HttpsError('not-found', 'team not found');
    const taken = await tx.get(gameRef.collection('players')
      .where('teamId', '==', teamId).where('role', '==', role));
    if (!taken.empty && taken.docs[0].id !== req.auth.uid)
      throw new HttpsError('already-exists', `${role} role already taken on that team`);
    tx.set(gameRef.collection('players').doc(req.auth.uid),
      { teamId, role, displayName: String(displayName).slice(0, 24) });
    return { gameId: gameRef.id, teamId, role };
  });
});

export const startSeason = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
  // round-1 market draw (75% of FA pool, seeded, identical for all teams)
  // TODO(Task 9): replace with drawMarket() once implemented; this placeholder
  // draws directly from the FA pool with the same seeding convention drawMarket
  // is expected to use, so wiring it in later is a drop-in swap.
  const fa = players.filter((p) => !p.auction_round);
  const rng = makeRng(`${gameId}|market|1`);
  const drawn = rng.shuffle([...fa]).slice(0, Math.floor(fa.length * 0.75)).map((p) => p.pid);
  const batch = db().batch();
  batch.set(db().doc(`games/${gameId}/market/1`), { available: drawn });
  batch.update(db().doc(`games/${gameId}`), { status: 'active', round: 1, phase: 'FREE_AGENCY' });
  await batch.commit();
  return { phase: 'FREE_AGENCY' };
});

export const advancePhase = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status === 'finished') throw new HttpsError('failed-precondition', 'game over');
  const hook = HOOKS[g.phase];
  if (hook) await hook(gameId, g.round);          // resolve the phase we are LEAVING
  const nxt = nextPhase(g.round, g.phase, g.config.totalRounds);
  const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null };
  if (nxt.phase === 'FINALE') update.status = 'finished';
  const entry = HOOKS[`enter:${nxt.phase}`];
  if (entry) await entry(gameId, nxt.round);      // e.g. market draw on FREE_AGENCY entry
  await db().doc(`games/${gameId}`).update(update);
  return nxt;
});
