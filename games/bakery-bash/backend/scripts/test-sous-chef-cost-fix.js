/**
 * test-sous-chef-cost-fix.js
 *
 * Regression test for the per-station sous-chef cost fix.
 *
 * Bug: backend's calculateRoundCosts applied the escalating cost curve
 * (1.0× / 1.5× / 2.25× / 3.0× / +0.75× per additional) to the AGGREGATE
 * sousChefCount across all stations, while the frontend's totalStaffCost
 * applies the curve PER STATION. With 2 chefs per station (6 total) the
 * backend charged $160 while the UI showed $75 — a hidden $85/round
 * overcharge that compounded with stocking and ad costs.
 *
 * This test seeds a player with `staffCounts.{bakery,deli,barista}SousChefs = 2`
 * each, runs the full simulation pipeline through advanceGamePhase, then
 * asserts the resulting `totalSpent` matches the per-station calculation
 * (3 stations × ($10 + $15) = $75 in sous chef cost) — NOT the aggregate
 * curve ($160).
 *
 * Run via: firebase emulators:exec --only auth,firestore,functions \
 *          "node scripts/test-sous-chef-cost-fix.js" --project bakery-bash-54d12
 */

const { initializeApp: initializeAdminApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase/app");
const {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} = require("firebase/auth");
const {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} = require("firebase/functions");

const PROJECT_ID = "bakery-bash-54d12";
const GAME_ID = "sous-chef-cost-game";
const ROUND_ID = "round_1";
const PLAYER_UID = "uid_player_a";

// Per-station expectation: 2 chefs × 3 stations.
// Each station: 1.0× $10 + 1.5× $10 = $25. Three stations: $75.
// Aggregate (the OLD broken behavior): 6 chefs across all stations =
//   $10 + $15 + $22.50 + $30 + $37.50 + $45 = $160.
const SOUS_CHEFS_PER_STATION = 2;
const EXPECTED_SOUS_COST = 75;
const BUGGY_AGGREGATE_COST = 160;

// Other costs we'll seed so we can isolate the sous-chef line:
//   stock: 0 units → $0
//   ad: 0 → $0
//   chef bid: 0 → $0
//   maintenance: 0 → $0
//   equipment upgrade: not toggled → $0
// Therefore totalSpent should equal EXPECTED_SOUS_COST exactly.
const EXPECTED_TOTAL_SPENT = EXPECTED_SOUS_COST;

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} must be set by Firebase emulators:exec.`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message} — expected ${expected}, got ${actual}.`);
  }
}

async function cleanSlate(db) {
  await db.recursiveDelete(db.doc(`games/${GAME_ID}`));
}

async function seedGame(db, professorUid) {
  await db.doc(`games/${GAME_ID}`).set({
    joinCode: "SOUSC1",
    phase: "round_1_decide",
    round: 1,
    currentRound: 1,
    totalRounds: 3,
    phaseStartedAt: Timestamp.fromMillis(Date.now()),
    phaseEndsAt: null,
    submittedCount: 0,
    totalPlayers: 1,
    paused: false,
    professorId: professorUid,
    professorUid,
    createdAt: Timestamp.fromMillis(Date.now()),
    startedAt: Timestamp.fromMillis(Date.now()),
    endedAt: null,
  });

  // Zero out every revenue knob so totalSpent isolates the sous chef line
  // (no ad spend coefficient, no satisfaction bonus, no noise…).
  await db.doc(`games/${GAME_ID}/config/params`).set({
    unitCostPerProduct: 1,
    sousChefBaseCost: 10, // matches DEFAULT_GAME_CONFIG
    specialtyChefCap: 3,
    chefPoolSize: 12,
    revenueCoefficients: {
      base: 0,
      sousChefCoeff: 0,
      satisfactionCoeff: 0,
      adSpendCoeff: 0,
      numProductsCoeff: 0,
      noiseMin: 0,
      noiseMax: 0,
    },
  });

  await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}`).set({
    uid: PLAYER_UID,
    playerId: PLAYER_UID,
    displayName: "Cost Test Player",
    bakeryName: "Cost Test Bakery",
    role: "solo",
    teamId: null,
    budgetCurrent: 10000,
    cumulativeRevenue: 0,
    specialtyChefs: [],
    sousChefCount: SOUS_CHEFS_PER_STATION * 3,
    consecutiveMissedRounds: 0,
    disconnected: false,
  });

  // Decision: 0 stock everywhere, sous chefs distributed 2 per station.
  // sousChefCount aggregate is set to 6 — the OLD code path reads this and
  // applies the aggregate curve. The fix reads `staffCounts` per-station.
  await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}/decisions/${ROUND_ID}`).set({
    round: 1,
    submittedAt: Timestamp.fromMillis(Date.now()),
    menu: { croissant: true, bagel: true, coffee: true },
    quantities: { croissant: 0, bagel: 0, coffee: 0 },
    sousChefCount: SOUS_CHEFS_PER_STATION * 3,
    sousChefAssignments: {},
    staffCounts: {
      bakerySousChefs: SOUS_CHEFS_PER_STATION,
      deliSousChefs: SOUS_CHEFS_PER_STATION,
      baristaSousChefs: SOUS_CHEFS_PER_STATION,
      maintenanceGuys: 0,
    },
    productPrices: {},
  });
}

async function main() {
  requireEnv("FIRESTORE_EMULATOR_HOST");
  requireEnv("FIREBASE_AUTH_EMULATOR_HOST");

  initializeAdminApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const app = initializeApp({
    apiKey: "demo-key",
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  });

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });

  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);

  const { user: professor } = await signInAnonymously(auth);

  await cleanSlate(db);
  await seedGame(db, professor.uid);

  const advanceGamePhase = httpsCallable(functions, "advanceGamePhase");

  // round_1_decide → simulating → results_ready (single advance triggers
  // simulation when all players have submitted).
  const result = await advanceGamePhase({ gameId: GAME_ID });
  assertEqual(
    result.data.phase,
    "results_ready",
    "Phase after simulation should be results_ready",
  );
  console.log("  ✓ advanceGamePhase: round_1_decide → results_ready");

  // Read the round-result doc to assert totalSpent.
  const roundDocRef = db.doc(
    `games/${GAME_ID}/players/${PLAYER_UID}/rounds/${ROUND_ID}`,
  );
  const roundDoc = await roundDocRef.get();
  if (!roundDoc.exists) {
    throw new Error("FAIL: player round doc was never written.");
  }
  const totalSpent = roundDoc.get("totalSpent");

  // Print a clear diagnostic so a regression is obvious in the test output.
  console.log(`  ↳ totalSpent: $${totalSpent}`);
  console.log(`     expected:  $${EXPECTED_TOTAL_SPENT} (per-station)`);
  console.log(`     buggy:     $${BUGGY_AGGREGATE_COST} (aggregate curve)`);

  if (totalSpent === BUGGY_AGGREGATE_COST) {
    throw new Error(
      `FAIL: backend is applying the aggregate sous-chef cost curve. ` +
      `This means the per-station fix in revenue.js::calculateRoundCosts ` +
      `was reverted or is not being reached. totalSpent=${totalSpent}.`,
    );
  }

  assertEqual(
    totalSpent,
    EXPECTED_TOTAL_SPENT,
    "Per-station sous-chef cost should equal $75 (3 × $25) for 2 chefs/station",
  );
  console.log(
    `  ✓ Per-station sous-chef cost: $${totalSpent} matches expected $${EXPECTED_TOTAL_SPENT}`,
  );
  console.log(
    `  ✓ Aggregate-curve overcharge ($${BUGGY_AGGREGATE_COST - EXPECTED_TOTAL_SPENT}) ` +
    `is no longer being charged.`,
  );

  console.log("\nSous-chef cost fix verified end-to-end via emulator.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
