const path = require('path');
const fs = require('fs');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

if (!getApps().length) {
  initializeApp({ projectId: 'bakery-bash-54d12' });
}
const db = getFirestore();

(async () => {
  // Delete any prior demo-game-* docs (best-effort)
  try {
    const snap = await db.collection('games').get();
    for (const d of snap.docs) {
      // Delete subcollections shallow-ish
      const subs = ['players','teams','leaderboard','config'];
      for (const s of subs) {
        const ssnap = await db.collection(`games/${d.id}/${s}`).get();
        await Promise.all(ssnap.docs.map(x => x.ref.delete()));
      }
      await d.ref.delete();
    }
    console.log('cleared games');
  } catch (e) { console.error('clear:', e.message); }

  const gameId = 'demo-decide';
  const joinCode = 'BAKERY';

  // Game doc — set phase to round_1_decide directly so player lands on Decide
  await db.doc(`games/${gameId}`).set({
    joinCode,
    phase: 'lobby',
    currentRound: 1,
    totalRounds: 5,
    phaseEndsAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    phaseEndTime: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    phaseStartedAt: Timestamp.now(),
    submittedCount: 0,
    totalPlayers: 2,
    paused: false,
    professorId: 'uid_professor',
    professorUid: 'uid_professor',
    createdAt: Timestamp.now(),
    startedAt: Timestamp.now(),
    endedAt: null,
  });

  // Minimal config copied from local-game.json
  const seedPath = path.resolve('/Users/dylanmassaro/FenriX/.claude/worktrees/silly-dhawan-9c47a7/games/bakery-bash/backend/seed/local-game.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const paramsDoc = seed.docs.find(d => d.path === 'games/demo-lobby/config/params');
  await db.doc(`games/${gameId}/config/params`).set(paramsDoc.data);

  console.log(`Seeded games/${gameId} with phase=round_1_decide, joinCode=${joinCode}`);
  console.log('Now the LandingPage Create flow with code', joinCode, 'should let any team join.');
})().catch(e => { console.error(e); process.exit(1); });
