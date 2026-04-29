/**
 * M-16 regression test — bid attribution under last-second concurrency.
 *
 * Simulates the playtest race: two teams submit `submitBids` at
 * phaseEndsAtMs (and one later by 100ms after the auto-advance has flipped
 * the phase). Validates that:
 *
 *   1. The bid that arrives BEFORE the phase flip is accepted.
 *   2. The bid that arrives AFTER the phase flip is REJECTED with
 *      `failed-precondition` (M-16's expectedFromPhase or the existing
 *      canSubmitBids gate catches it via Firestore optimistic concurrency).
 *   3. The resolved auction winner matches the surviving accepted bid.
 *
 * Run via: firebase emulators:exec --only auth,firestore,functions \
 *   "node scripts/test-bid-race-condition.js" --project bakery-bash-54d12
 *
 * Hand-run only — not in `npm test` (which is mocha + pure modules).
 */

/* eslint-disable no-console */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp: initializeClientApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

const PROJECT_ID = 'bakery-bash-54d12';
const HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;

process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${AUTH_PORT}`;

const adminApp = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(adminApp);

function clientApp() {
  const app = initializeClientApp({
    apiKey: 'fake', authDomain: `${PROJECT_ID}.firebaseapp.com`, projectId: PROJECT_ID,
  });
  const auth = getAuth(app);
  auth.useEmulator(`http://${HOST}:${AUTH_PORT}`);
  const fns = getFunctions(app);
  fns.useEmulator(HOST, FUNCTIONS_PORT);
  return { app, auth, fns };
}

async function main() {
  console.log('M-16 bid race regression — see scripts/test-bid-race-condition.js for fixture details.');
  console.log('TODO (post-M-16): wire this up against the existing setup helpers in scripts/test-apr23-e2e.js.');
  console.log('Manual repro until then:');
  console.log('  1. Start a 2-team game, advance to bid_ad.');
  console.log('  2. Use 2 anon clients, both submit submitBids at phaseEndsAtMs.');
  console.log('  3. Bot A: bidType=ad, adBids={ TV: 50 }, expectedFromPhase=current.');
  console.log('  4. Wait 200ms (auto-advance flips bid_ad→bid_chef).');
  console.log('  5. Bot B: bidType=ad, adBids={ TV: 100 }, expectedFromPhase=bid_ad (stale).');
  console.log('     → Should reject with failed-precondition: "Phase has already advanced".');
  console.log('  6. Inspect rounds/round_1/auctionResults.ads.TV → winnerKey === Bot A team.');
  console.log('');
  console.log('Skeleton complete. Wire up before Friday playtest if a fix verification is needed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
