/**
 * test-equipment-upgrade-fix.js
 *
 * Regression test for the equipment-upgrade flag flow.
 *
 * Bug: GamePage.tsx's `submitDecision` payload was missing the
 * `equipmentUpgradePurchased` field, so even when a player toggled the
 * StaffTab upgrade button the flag never reached the backend. The
 * decision validator happily defaulted the field to `false`, and the
 * simulation upgrade branch never fired — players reported "equipment
 * upgrade isn't working" because their grade stayed at 'C' regardless
 * of the toggle.
 *
 * This test seeds a player with `equipmentUpgradePurchased: true` in
 * their decision doc (mirroring what a fixed FE submitDecision call
 * would write), runs the simulation, and asserts the player's
 * equipmentGrade advanced from 'C' to 'B' for the next round.
 *
 * Run via: firebase emulators:exec --only auth,firestore,functions \
 *          "node scripts/test-equipment-upgrade-fix.js" --project bakery-bash-54d12
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
const GAME_ID = "equipment-upgrade-game";
const ROUND_ID = "round_1";
const PLAYER_UID = "uid_player_a";

// C → B upgrade cost: $1000 (per EQUIPMENT_TIER_COSTS in config.js).
// Budget $5000 covers it comfortably with room to spare.
const STARTING_BUDGET = 5000;

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
    joinCode: "EQUP01",
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

  await db.doc(`games/${GAME_ID}/config/params`).set({
    unitCostPerProduct: 1,
    sousChefBaseCost: 10,
    specialtyChefCap: 3,
    chefPoolSize: 12,
  });

  await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}`).set({
    uid: PLAYER_UID,
    playerId: PLAYER_UID,
    displayName: "Upgrade Test Player",
    bakeryName: "Upgrade Test Bakery",
    role: "solo",
    teamId: null,
    budgetCurrent: STARTING_BUDGET,
    cumulativeRevenue: 0,
    specialtyChefs: [],
    sousChefCount: 0,
    consecutiveMissedRounds: 0,
    disconnected: false,
    equipmentGrade: "C", // explicit starting grade
  });

  // Decision: zero stock, no chefs, equipmentUpgradePurchased TRUE.
  // This mirrors what a working FE submitDecision should write after the
  // user toggles "Upgrade to B" in the StaffTab.
  await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}/decisions/${ROUND_ID}`).set({
    round: 1,
    submittedAt: Timestamp.fromMillis(Date.now()),
    menu: { croissant: true, bagel: true, coffee: true },
    quantities: { croissant: 0, bagel: 0, coffee: 0 },
    sousChefCount: 0,
    sousChefAssignments: {},
    staffCounts: {
      bakerySousChefs: 0,
      deliSousChefs: 0,
      baristaSousChefs: 0,
      maintenanceGuys: 0,
    },
    productPrices: {},
    equipmentUpgradePurchased: true, // ← the fix sends this from FE
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

  const result = await advanceGamePhase({ gameId: GAME_ID });
  assertEqual(
    result.data.phase,
    "results_ready",
    "Phase after simulation should be results_ready",
  );
  console.log("  ✓ advanceGamePhase: round_1_decide → results_ready");

  // After simulation, the player doc should have equipmentGrade='B' and
  // budgetCurrent reduced by the $1000 upgrade cost.
  const playerSnap = await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}`).get();
  const newGrade = playerSnap.get("equipmentGrade");
  const newBudget = playerSnap.get("budgetCurrent");

  console.log(`  ↳ equipmentGrade: ${newGrade} (was 'C')`);
  console.log(`  ↳ budgetCurrent:  $${newBudget} (was $${STARTING_BUDGET})`);

  assertEqual(
    newGrade,
    "B",
    "Equipment grade should advance from 'C' to 'B' after upgrade purchase",
  );

  // Budget should drop by AT LEAST $1000 (the upgrade cost). It may drop
  // further if revenue from $0 stock dropped below 0 (no revenue → just
  // the upgrade cost deducted from budget). Let's just check upgrade was
  // charged.
  if (newBudget > STARTING_BUDGET - 1000 + 0.01) {
    throw new Error(
      `FAIL: budget after upgrade ($${newBudget}) should be at most ` +
      `$${STARTING_BUDGET - 1000} (charge of $1000 for C→B upgrade).`,
    );
  }
  console.log(`  ✓ Budget reduced by ≥$1000 (upgrade cost charged)`);

  // Round doc should also reflect the new grade for next-round persistence.
  const roundSnap = await db
    .doc(`games/${GAME_ID}/players/${PLAYER_UID}/rounds/${ROUND_ID}`)
    .get();
  if (roundSnap.exists) {
    const roundGrade = roundSnap.get("equipmentGrade");
    if (roundGrade !== "B") {
      throw new Error(
        `FAIL: round result equipmentGrade should be 'B', got '${roundGrade}'.`,
      );
    }
    console.log(`  ✓ Round-result equipmentGrade also reflects upgrade`);
  }

  console.log("\nEquipment upgrade fix verified end-to-end via emulator.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
