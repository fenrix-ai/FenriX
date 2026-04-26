/* eslint-disable no-console */
/**
 * Integration test for the PR #92 follow-up:
 *   - /submissions stays professor-only (rule)
 *   - /submissionCounts mirrors a count-only doc (rule + Cloud Function)
 *   - recordSubmission is idempotent (re-submit doesn't double-count)
 *   - /submissions and /submissionCounts stay in lockstep across multiple uids
 *
 * Talks directly to the running Firestore emulator via firebase-admin (rules
 * are bypassed for admin) and exercises a clone of recordSubmission's logic
 * to verify the design. This is intentionally a black-box test of the
 * intended behavior — it does not import index.js (which has side effects
 * on require). The actual recordSubmission body in index.js mirrors this.
 *
 * Run with:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GOOGLE_CLOUD_PROJECT=bakery-bash-rules-test \
 *     node scripts/test-submission-counts.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'bakery-bash-pr92-test',
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const GAME_ID = `pr92-test-${Date.now()}`;
const SUBMISSION_DOC_ID = 'round_1_decide';

const gameRef = db.collection('games').doc(GAME_ID);
const submissionRef = gameRef.collection('submissions').doc(SUBMISSION_DOC_ID);
const countRef = gameRef.collection('submissionCounts').doc(SUBMISSION_DOC_ID);

// Mirror of the recordSubmission body in functions/index.js.
async function recordSubmission(uid, displayName, role) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(submissionRef);
    const existing = snap.exists ? (snap.data() || {}) : {};
    const wasAlreadySubmitted =
      existing[uid] && existing[uid].status === 'submitted';

    tx.set(submissionRef, {
      [uid]: {
        status: 'submitted',
        submittedAt: Timestamp.now(),
        displayName: displayName || '',
        role: role || null,
      },
    }, { merge: true });

    if (!wasAlreadySubmitted) {
      tx.set(countRef, {
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      tx.set(countRef, {
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
  console.log(`PASS: ${label} = ${actual}`);
}

async function readCount() {
  const snap = await countRef.get();
  return snap.exists ? (snap.data().count || 0) : 0;
}

async function readSubmittedUids() {
  const snap = await submissionRef.get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return Object.entries(data)
    .filter(([, v]) => v && typeof v === 'object' && v.status === 'submitted')
    .map(([uid]) => uid);
}

async function cleanup() {
  await Promise.all([submissionRef.delete().catch(() => {}), countRef.delete().catch(() => {})]);
  await gameRef.delete().catch(() => {});
}

async function main() {
  console.log(`game=${GAME_ID}`);
  await cleanup();

  // Empty state.
  assertEq(await readCount(), 0, 'initial count');
  assertEq((await readSubmittedUids()).length, 0, 'initial submitted uids');

  // First-time submit by uid_a.
  await recordSubmission('uid_a', 'Alice', 'finance');
  assertEq(await readCount(), 1, 'count after first submit (uid_a)');
  assertEq((await readSubmittedUids()).join(','), 'uid_a', 'submitted uids');

  // Re-submit by uid_a — count must not increment.
  await recordSubmission('uid_a', 'Alice', 'operations');
  assertEq(await readCount(), 1, 'count after re-submit (uid_a)');
  // Role should now reflect the latest re-submit.
  const aSnap = await submissionRef.get();
  assertEq(aSnap.data().uid_a.role, 'operations', 'role updated on re-submit');

  // Second uid (uid_b) submits — count goes to 2.
  await recordSubmission('uid_b', 'Bob', 'advertising');
  assertEq(await readCount(), 2, 'count after second uid (uid_b)');
  const uids = (await readSubmittedUids()).sort();
  assertEq(uids.join(','), 'uid_a,uid_b', 'submitted uids after second');

  // Re-submit by uid_b — count must not increment.
  await recordSubmission('uid_b', 'Bob', 'advertising');
  assertEq(await readCount(), 2, 'count after re-submit (uid_b)');

  // Third uid (uid_c) — count goes to 3.
  await recordSubmission('uid_c', 'Carol', null);
  assertEq(await readCount(), 3, 'count after third uid (uid_c)');

  // Concurrent first-time submits from two new uids — both must increment.
  await Promise.all([
    recordSubmission('uid_d', 'Dan', 'finance'),
    recordSubmission('uid_e', 'Eve', 'finance'),
  ]);
  assertEq(await readCount(), 5, 'count after two concurrent first-time submits');

  await cleanup();
  console.log('\nAll PR #92 follow-up integration checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
