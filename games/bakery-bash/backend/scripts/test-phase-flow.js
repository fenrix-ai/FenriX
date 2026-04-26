const { initializeApp: initializeAdminApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
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
const GAME_ID = "phase-flow-game";

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} must be set by Firebase emulators:exec.`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}

function assertPhaseEndTime(value, message) {
  if (typeof value !== "number" || value <= Date.now()) {
    throw new Error(message);
  }
}

async function seedLobbyGame(db, professorId, playerId) {
  await db.doc(`games/${GAME_ID}`).set({
    joinCode: "PHASE1",
    phase: "lobby",
    currentRound: 1,
    totalRounds: 5,
    phaseEndTime: null,
    submittedCount: 0,
    totalPlayers: 1,
    paused: false,
    professorId,
    createdAt: null,
    startedAt: null,
    endedAt: null,
  });

  await db.doc(`games/${GAME_ID}/config/params`).set({
    startingBudget: 2000,
    phaseDurations: {
      closing_hours: 180,
      auction: 90,
      open_for_business: 30,
      results: 60,
    },
  });

  await db.doc(`games/${GAME_ID}/players/${playerId}`).set({
    uid: playerId,
    displayName: "Test Player",
    joinedAt: null,
    budgetCurrent: 2000,
    creditBalance: 0,
    cumulativeRevenue: 0,
    pendingDecision: {
      submitted: false,
      submittedAt: null,
      staffCount: 3,
      adSpend: 0,
      menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: false, matchaLatte: false },
      productPrices: { croissant: 0, cookie: 0, bagel: 0, sandwich: 0, latte: 0, matchaLatte: 0 },
      quantities: { croissant: 0, cookie: 0, bagel: 0, sandwich: 0, latte: 0, matchaLatte: 0 },
    },
    pendingBids: {
      adBid: { adType: null, amount: 0 },
      chefBid: { skillLevel: 0, amount: 0 },
    },
    lastRoundResult: {
      round: 0, revenue: 0, customerCount: 0, customerSatisfaction: 0,
      headchefSkill: 0, adTypeWon: null,
      productsSold: { croissant: 0, cookie: 0, bagel: 0, sandwich: 0, latte: 0, matchaLatte: 0 },
    },
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

  const anonymousUser = await signInAnonymously(auth);
  const professorId = anonymousUser.user.uid;
  const playerId = `player_${professorId}`;
  await seedLobbyGame(db, professorId, playerId);

  const startGame = httpsCallable(functions, "startGame");
  const advanceGamePhase = httpsCallable(functions, "advanceGamePhase");

  const startResult = await startGame({ gameId: GAME_ID });
  assertEqual(startResult.data.phase, "closing_hours", "Start phase mismatch.");
  assertEqual(startResult.data.currentRound, 1, "Start round mismatch.");
  assertPhaseEndTime(
    startResult.data.phaseEndTime,
    "startGame did not return a future phaseEndTime."
  );

  let gameSnap = await db.doc(`games/${GAME_ID}`).get();
  assertEqual(gameSnap.get("phase"), "closing_hours", "Stored start phase mismatch.");
  if (!gameSnap.get("phaseEndTime")) {
    throw new Error("startGame did not store phaseEndTime.");
  }

  const auctionResult = await advanceGamePhase({ gameId: GAME_ID });
  assertEqual(auctionResult.data.phase, "auction", "Auction phase mismatch.");
  assertEqual(auctionResult.data.currentRound, 1, "Auction round mismatch.");
  assertPhaseEndTime(
    auctionResult.data.phaseEndTime,
    "advanceGamePhase did not return a future auction phaseEndTime."
  );

  gameSnap = await db.doc(`games/${GAME_ID}`).get();
  assertEqual(gameSnap.get("phase"), "auction", "Stored auction phase mismatch.");
  if (!gameSnap.get("phaseEndTime")) {
    throw new Error("advanceGamePhase did not store auction phaseEndTime.");
  }

  console.log("Phase state machine flow passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
