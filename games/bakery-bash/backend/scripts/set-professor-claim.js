#!/usr/bin/env node
/**
 * One-off admin script to grant a UID the `professor: true` custom claim.
 *
 * Usage:
 *   node scripts/set-professor-claim.js <uid>
 *
 * Against the local emulator:
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 node scripts/set-professor-claim.js <uid>
 *
 * Against production (requires ADC or GOOGLE_APPLICATION_CREDENTIALS):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/set-professor-claim.js <uid>
 *
 * The claim takes effect after the user's ID token refreshes (up to 1 hour,
 * or immediately if they sign out and back in).
 */

const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const uid = process.argv[2];

if (!uid) {
  console.error('Usage: node set-professor-claim.js <uid>');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp();
}

const auth = getAuth();

auth
  .setCustomUserClaims(uid, { professor: true })
  .then(() => auth.getUser(uid))
  .then((user) => {
    console.log(`Done. Professor claim set on ${uid} (${user.email || 'anonymous'}).`);
    console.log('User must refresh their ID token before the claim takes effect.');
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
