#!/usr/bin/env node
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp: initAdmin } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { initializeApp: initClient } = require('firebase/app');
const { getAuth, signInWithCustomToken, connectAuthEmulator } = require('firebase/auth');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');

const PROJECT_ID = 'bakery-bash-54d12';
const GAME_ID = 'v7-real';
const PROF_UID = 'prof-v7-real';

(async () => {
  initAdmin({ projectId: PROJECT_ID });
  const db = getFirestore();
  const adminAuth = getAdminAuth();
  const before = await db.collection('games').doc(GAME_ID).get();
  console.log(`Before: phase=${before.get('phase')}`);
  const app = initClient({ apiKey: 'demo', projectId: PROJECT_ID }, 'a');
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app), '127.0.0.1', 5001);
  await signInWithCustomToken(getAuth(app), await adminAuth.createCustomToken(PROF_UID));
  const result = await httpsCallable(getFunctions(app), 'advanceGamePhase')({ gameId: GAME_ID });
  console.log(`After: phase=${result.data.phase}`);
})();
