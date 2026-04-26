const { initializeApp: initializeAdminApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp: initializeClientApp } = require("firebase/app");
const { connectAuthEmulator, getAuth, signInAnonymously } = require("firebase/auth");
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require("firebase/functions");

const PROJECT_ID = "bakery-bash-54d12";
const GAME_ID = "revenue-flow-game";

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} must be set`);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg} — Expected ${expected}, got ${actual}`);
}

function makeApp(name) {
  return initializeClientApp({
    apiKey: "demo-key",
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  }, name);
}

async function main() {
  requireEnv("FIRESTORE_EMULATOR_HOST");
  requireEnv("FIREBASE_AUTH_EMULATOR_HOST");

  initializeAdminApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const emulatorHost = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;

  const professorApp = makeApp("professor");
  const professorAuth = getAuth(professorApp);
  connectFunctionsEmulator(getFunctions(professorApp), "127.0.0.1", 5001);
  connectAuthEmulator(professorAuth, emulatorHost, { disableWarnings: true });
  const professorUser = await signInAnonymously(professorAuth);

  const app1 = makeApp("player1");
  const auth1 = getAuth(app1);
  connectFunctionsEmulator(getFunctions(app1), "127.0.0.1", 5001);
  connectAuthEmulator(auth1, emulatorHost, { disableWarnings: true });
  const player1User = await signInAnonymously(auth1);
  const uid1 = player1User.user.uid;

  const app2 = makeApp("player2");
  const auth2 = getAuth(app2);
  connectFunctionsEmulator(getFunctions(app2), "127.0.0.1", 5001);
  connectAuthEmulator(auth2, emulatorHost, { disableWarnings: true });
  const player2User = await signInAnonymously(auth2);
  const uid2 = player2User.user.uid;

  const ROUND_ID = "round_1";

  await db.doc(`games/${GAME_ID}`).set({
    joinCode: "REV001", phase: "closing_hours", currentRound: 1, totalRounds: 5,
    phaseEndTime: null, submittedCount: 0, totalPlayers: 2, paused: false,
    professorId: professorUser.user.uid, createdAt: null, startedAt: null, endedAt: null,
  });

  await db.doc(`games/${GAME_ID}/config/params`).set({
    startingBudget: 2000, costPerStaffPerRound: 50, unitCostPerProduct: 1,
    revenueModel: {
      base: 500, staffCoefficient: 30, priceCoefficient: -15,
      adSpendCoefficient: 0.8, numProductsCoefficient: 50, noiseMin: 0, noiseMax: 0,
    },
    adBonuses: { TV: 200, Billboard: 150, Radio: 100, Newspaper: 75 },
    chefBonusPerPoint: 5, customerPoolMultiplier: 100,
  });

  const basePlayer = (uid, name, staffCount) => ({
    uid, displayName: name, joinedAt: null, budgetCurrent: 2000, creditBalance: 0,
    cumulativeRevenue: 0,
    pendingDecision: {
      submitted: false, submittedAt: null, staffCount, adSpend: 0,
      menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: false, matchaLatte: false },
      productPrices: {}, quantities: {},
    },
    pendingBids: { adBid: { adType: null, amount: 0 }, chefBid: { skillLevel: 0, amount: 0 } },
    lastRoundResult: { round: 0, revenue: 0, customerCount: 0, customerSatisfaction: 0, headchefSkill: 0, adTypeWon: null, productsSold: {} },
  });

  await db.doc(`games/${GAME_ID}/players/${uid1}`).set(basePlayer(uid1, "The Rolling Scone", 3));
  await db.doc(`games/${GAME_ID}/players/${uid2}`).set(basePlayer(uid2, "Bagel Bros", 2));

  const submit1 = httpsCallable(getFunctions(app1), "submitDecision");
  const submit2 = httpsCallable(getFunctions(app2), "submitDecision");
  const advanceGamePhase = httpsCallable(getFunctions(professorApp), "advanceGamePhase");

  await submit1({
    gameId: GAME_ID,
    menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: true, matchaLatte: false },
    productPrices: { croissant: 5, cookie: 5, bagel: 5, sandwich: 0, latte: 5, matchaLatte: 0 },
    quantities: { croissant: 10, cookie: 10, bagel: 10, sandwich: 0, latte: 10, matchaLatte: 0 },
    staffCount: 3, adSpend: 50, adType: "TV", chefBid: { skillLevel: 80, amount: 100 },
  });

  await submit2({
    gameId: GAME_ID,
    menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: true, matchaLatte: false },
    productPrices: { croissant: 4, cookie: 4, bagel: 4, sandwich: 0, latte: 4, matchaLatte: 0 },
    quantities: { croissant: 10, cookie: 10, bagel: 10, sandwich: 0, latte: 10, matchaLatte: 0 },
    staffCount: 2, adSpend: 50, adType: "TV", chefBid: { skillLevel: 80, amount: 100 },
  });

  await advanceGamePhase({ gameId: GAME_ID });
  await advanceGamePhase({ gameId: GAME_ID });

  const waitDeadline = Date.now() + 20000;
  const gameRef = db.doc(`games/${GAME_ID}`);
  while (Date.now() < waitDeadline) {
    const snap = await gameRef.get();
    if (snap.get("phase") === "results") break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const finalSnap = await gameRef.get();
  assertEqual(finalSnap.get("phase"), "results", "Final phase");

  const [playerASnap, playerBSnap, resultASnap, resultBSnap, roundSnap, leaderboardSnap, csvSnap, emailSnap] = await Promise.all([
    db.doc(`games/${GAME_ID}/players/${uid1}`).get(),
    db.doc(`games/${GAME_ID}/players/${uid2}`).get(),
    db.doc(`games/${GAME_ID}/players/${uid1}/rounds/${ROUND_ID}`).get(),
    db.doc(`games/${GAME_ID}/players/${uid2}/rounds/${ROUND_ID}`).get(),
    db.doc(`games/${GAME_ID}/rounds/${ROUND_ID}`).get(),
    db.doc(`games/${GAME_ID}/leaderboard/current`).get(),
    db.doc(`games/${GAME_ID}/csvRows/${uid1}/rounds/${ROUND_ID}`).get(),
    db.doc(`games/${GAME_ID}/players/${uid1}/emails/round_2_data`).get(),
  ]);

  assertEqual(roundSnap.get("simulationStatus"), "complete", "Round status");
  assertEqual(roundSnap.get("auctionResults.ads.TV.tieBreaker"), "earliest_submission", "Ad tie-breaker");
  assertEqual(roundSnap.get("auctionResults.ads.TV.winnerId") !== null, true, "TV ad has winner");
  assertEqual(roundSnap.get("auctionResults.chef.winnerId") !== null, true, "Chef auction has winner");

  const tvWinnerId = roundSnap.get("auctionResults.ads.TV.winnerId");
  const chefWinnerId = roundSnap.get("auctionResults.chef.winnerId");
  assertEqual(resultASnap.get("adTypeWon") === "TV" || resultASnap.get("adTypeWon") === null, true, "Player A adTypeWon valid");
  assertEqual(resultBSnap.get("adTypeWon") === "TV" || resultBSnap.get("adTypeWon") === null, true, "Player B adTypeWon valid");
  assertEqual(
    (resultASnap.get("headchefSkill") !== 0) === (chefWinnerId === uid1),
    true, "Player A chefSkill matches auction"
  );
  assertEqual(
    (resultBSnap.get("headchefSkill") !== 0) === (chefWinnerId === uid2),
    true, "Player B chefSkill matches auction"
  );
  assertEqual(typeof resultASnap.get("headchefSkill"), "number", "Player A headchefSkill is number");
  assertEqual(resultASnap.get("headchefSkill") >= 0 && resultASnap.get("headchefSkill") <= 100, true, "Player A headchefSkill in range");
  assertEqual(typeof resultBSnap.get("headchefSkill"), "number", "Player B headchefSkill is number");
  assertEqual(resultBSnap.get("headchefSkill") >= 0 && resultBSnap.get("headchefSkill") <= 100, true, "Player B headchefSkill in range");

  assertEqual(resultASnap.get("revenue") >= 500 && resultASnap.get("revenue") <= 2000, true, `Player A revenue in range: ${resultASnap.get("revenue")}`);
  assertEqual(resultASnap.get("budgetAfter"), resultASnap.get("budgetBefore") + resultASnap.get("revenue") - resultASnap.get("totalCosts"), "Player A budget formula");
  assertEqual(playerASnap.get("budgetCurrent"), resultASnap.get("budgetAfter"), "Player A live budget");
  assertEqual(resultBSnap.get("budgetAfter"), resultBSnap.get("budgetBefore") + resultBSnap.get("revenue") - resultBSnap.get("totalCosts"), "Player B budget formula");
  assertEqual(playerBSnap.get("budgetCurrent"), resultBSnap.get("budgetAfter"), "Player B live budget");

  const csvRow = csvSnap.data()?.row || csvSnap.data();
  if (!csvRow) throw new Error("CSV row not found");
  assertEqual(typeof csvRow.revenue, "number", "CSV row revenue is number");
  assertEqual(typeof csvRow.num_products, "number", "CSV row num_products is number");

  const leaderWinnerId = resultASnap.get("revenue") >= resultBSnap.get("revenue") ? uid1 : uid2;
  assertEqual(leaderboardSnap.data().rankings[0].playerId, leaderWinnerId, "Leaderboard winner matches highest revenue");

  assertEqual(emailSnap.get("type"), "round_data_csv", "Email type");
  assertEqual(emailSnap.get("round"), 2, "Email target round");
  const emailAttachment = emailSnap.data().attachments[0];
  assertEqual(emailAttachment.contentType, "text/csv", "Email attachment content type");
  assertEqual(emailAttachment.rowCount, 1, "Email attachment row count");
  const emailCsv = emailAttachment.csvText;
  if (!emailCsv.includes("day,revenue,num_products")) {
    throw new Error(`Email CSV missing header: ${emailCsv}`);
  }

  console.log("Revenue simulation flow passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});