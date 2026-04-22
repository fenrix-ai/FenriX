# Bakery Bash — Backend Agent Tasks (Apr 21)

## Context for AI Agent

You are implementing Firebase Cloud Functions v2 for a multiplayer bakery simulation game. The entry point is `games/bakery-bash/backend/functions/index.js`. The canonical Firestore schema lives in `games/bakery-bash/backend/firestore-schema.js`. TypeScript types (for cross-reference only) live in `games/bakery-bash/app/src/types/game.ts`.

**Rules for every function you write:**
- Import `onCall` from `firebase-functions/v2/https`
- Import `getFirestore`, `FieldValue`, `Timestamp` from `firebase-admin/firestore`
- The `db` constant and `initializeApp()` guard are already present at the top of `index.js` — do not re-initialize
- Export every function via `exports.<functionName>`
- Never hardcode game parameters — always read from `/games/{gameId}/config/params`
- All monetary values are numbers (float), never strings
- All Timestamps: use `FieldValue.serverTimestamp()` for writes, `Timestamp.now()` for computed deadlines
- Round subcollection IDs follow `"round_1"`, `"round_2"` — always use `"round_" + currentRound`

---

## TASK BE-0 — Fix Stale `DEFAULT_PENDING_DECISION` in `index.js`

**Priority: CRITICAL — do this before anything else. This constant causes data corruption on every new player join.**

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**What is wrong:** Around line 15, there is a constant `DEFAULT_PENDING_DECISION` that uses the old Firestore schema field names. It must be updated to match `PlayerDocument.pendingDecision` in `firestore-schema.js`.

**Exact changes required:**

1. Replace the flat `staffCount: 3` field with a `staffCounts` object:
```js
staffCounts: {
  bakerySousChefs: 0,
  deliSousChefs: 0,
  baristaSousChefs: 0,
  maintenanceGuys: 0,
}
```

2. Add `maintenanceTasks: []` as a top-level key.

3. In both `menu` and `quantities` sub-objects, rename:
   - `latte` → `coffee`
   - `matchaLatte` → `matcha`

4. Remove the top-level `adSpend: 0` key — ad spend is now captured via `pendingBids`, not here.

5. Inside the `joinGame` function, find the `transaction.set(playerRef, {...})` call and add these fields to the player document being created:
```js
cleanliness_pct: 100,
oven_health_pct: 100,
slicer_health_pct: 100,
espresso_health_pct: 100,
chefSatisfactionScores: {},
```

6. In the same `joinGame` function, update `lastRoundResult` to use `coffee`/`matcha` instead of `latte`/`matchaLatte`, and add:
```js
chefSatisfactionScore: 0,
chefDepartures: [],
```

**Acceptance criteria:** A fresh call to `joinGame` writes a player document with `staffCounts` (not `staffCount`), `maintenanceTasks`, `coffee`/`matcha` keys, and all four health bars at 100.

---

## TASK BE-1 — `createGame` Cloud Function

**What to build:** An `exports.createGame` callable that lets the professor initialize a new game session.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape (`request.data`):**
```js
{
  professorName: string,  // display name
  totalRounds: number,    // default 5 if not provided
}
```

**Implementation steps:**

1. Throw `unauthenticated` if `request.auth` is missing.

2. Generate a random 6-character uppercase alphanumeric join code:
```js
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let code = '';
for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
```
Query `/games` where `joinCode == code` — if a document already exists, regenerate. Retry up to 5 times, then throw `internal` if still colliding.

3. Write to `/games/{gameId}` (auto-generated doc ID) the full `GameDocument` shape from `firestore-schema.js`:
```js
{
  joinCode,
  phase: "lobby",
  currentRound: 1,
  totalRounds: request.data.totalRounds ?? 5,
  professorId: request.auth.uid,
  professorName: request.data.professorName,
  paused: false,
  submittedCount: 0,
  totalPlayers: 0,
  createdAt: FieldValue.serverTimestamp(),
  startedAt: null,
  endedAt: null,
  phaseEndTime: null,
}
```

4. Write the config document to `/games/{gameId}/config/params` using **all default values** from `GameConfigDocument` in `firestore-schema.js`. Do not omit any field.

5. Return `{ gameId, joinCode }`.

**Acceptance criteria:** Professor can call `createGame`, receive a `joinCode`, and that join code resolves to a game in `/games`.

---

## TASK BE-2 — `startGame` Cloud Function

**What to build:** An `exports.startGame` callable that transitions the game from `lobby` → `email`.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:** `{ gameId: string }`

**Implementation steps:**

1. Throw `unauthenticated` if `request.auth` is missing.
2. Read the game document at `/games/{gameId}`. Throw `not-found` if it doesn't exist.
3. Verify `request.auth.uid === game.professorId` — throw `permission-denied` if not.
4. Verify `game.phase === "lobby"` — throw `failed-precondition` with message `"Game already started"` if not.
5. Read config from `/games/{gameId}/config/params` to get `phaseDurations.email`.
6. In a Firestore transaction: update the game doc:
```js
{
  phase: "email",
  startedAt: FieldValue.serverTimestamp(),
  phaseEndTime: Timestamp.fromMillis(Date.now() + config.phaseDurations.email * 1000),
}
```
7. Return `{ success: true }`.

---

## TASK BE-3 — `advancePhase` Cloud Function

**What to build:** An `exports.advancePhase` callable. The professor calls this to move the game to the next phase. It also handles the round loop (incrementing round, resetting submission counts).

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:** `{ gameId: string }`

**Phase transition map — implement exactly this:**
```
"email"         → "decide"
"decide"        → "bid"
"bid"           → "simulating"    (also calls simulateRound internally — see BE-5)
"simulating"    → "results_ready" (this transition is set automatically by simulateRound, not by professor)
"results_ready" → "email"         (if currentRound < totalRounds; also increments round and resets submittedCount)
"results_ready" → "game_over"     (if currentRound === totalRounds)
```

**Implementation steps:**

1. Throw `unauthenticated` if no auth. Verify `professorId`. Throw `failed-precondition` if game is in `"simulating"` phase (professor cannot skip past it manually).
2. Read current `phase` and `currentRound` and `totalRounds` from the game doc.
3. Determine the next phase using the map above.
4. Read config to get `phaseDurations[nextPhase]` (use 0 if phase is `simulating` or `game_over`).
5. Open a Firestore transaction:
   - Update `phase` to next phase.
   - Set `phaseEndTime: Timestamp.fromMillis(Date.now() + duration * 1000)`.
   - If `phase === "results_ready"` and next phase is `"email"`: increment `currentRound` by 1, reset `submittedCount: 0`.
   - If `phase === "results_ready"` and next phase is `"game_over"`: set `endedAt: FieldValue.serverTimestamp()`.
6. After the transaction: if `phase === "bid"` (i.e. we just transitioned to `simulating`), call `await simulateRound(gameId)` (the internal helper from BE-5).
7. Return `{ phase: nextPhase, currentRound: updatedRound }`.

---

## TASK BE-4 — `submitDecision` Cloud Function

**What to build:** An `exports.submitDecision` callable. Players call this to lock in their decisions for the current round.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:**
```js
{
  gameId: string,
  decision: {
    quantities: { croissant, cookie, bagel, sandwich, coffee, matcha },  // all numbers ≥ 0
    menu: { croissant, cookie, bagel, sandwich, coffee, matcha },        // all booleans
    staffCounts: { bakerySousChefs, deliSousChefs, baristaSousChefs, maintenanceGuys }, // all ints ≥ 0
    maintenanceTasks: string[],  // each must be "clean" | "repair_oven" | "repair_slicer" | "repair_espresso"
  }
}
```

**Implementation steps:**

1. Throw `unauthenticated` if no auth.
2. Read game doc. Verify `phase === "decide"` — throw `failed-precondition` otherwise.
3. Validate the decision:
   - All quantities ≥ 0
   - All staffCounts ≥ 0
   - `maintenanceTasks.length === decision.staffCounts.maintenanceGuys`
   - Each task in `maintenanceTasks` is one of `"clean" | "repair_oven" | "repair_slicer" | "repair_espresso"`
   - Throw `invalid-argument` with a descriptive message if any check fails.
4. Read config from `/games/{gameId}/config/params`. The relevant fields are `staffingCost.baseCost` and `unitCostPerProduct`.
5. Compute `staffingCost` using the escalation curve. For each of the 4 roles separately:
   ```
   escalationCurve = [1.0, 1.5, 2.25, 3.0]
   For index beyond 3: curve[i] = curve[i-1] + 0.75
   costForRole = sum of (baseCost * escalationCurve[i]) for i in 0..(staffCount-1)
   ```
   `totalStaffingCost = costForRole(bakerySousChefs) + costForRole(deliSousChefs) + costForRole(baristaSousChefs) + costForRole(maintenanceGuys)`
6. Compute `inventoryCost = sum of all decision.quantities values * config.unitCostPerProduct`.
7. Compute `totalCosts = staffingCost + inventoryCost`.
8. In a Firestore transaction:
   - Read current player doc.
   - Throw `failed-precondition` if `player.pendingDecision.submitted === true` (already submitted).
   - Write immutable snapshot to `/games/{gameId}/players/{uid}/decisions/round_{currentRound}` as a `DecisionDocument` (fields: `round`, `decision`, `staffingCost`, `inventoryCost`, `totalCosts`, `submittedAt: serverTimestamp()`).
   - Update player doc: `pendingDecision.submitted = true`, `pendingDecision.submittedAt = serverTimestamp()`.
   - Increment `games/{gameId}.submittedCount` by 1 using `FieldValue.increment(1)`.
9. Return `{ success: true, staffingCost, inventoryCost, totalCosts }`.

---

## TASK BE-5 — `simulateRound` Internal Function + `triggerSimulation` Callable

**What to build:** The revenue engine. This is the most complex task. Build it as a non-exported internal async function `simulateRound(gameId)` that is called by `advancePhase` (BE-3). Also export a `triggerSimulation` callable as a professor-only fallback.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

> ⚠️ **Important:** Pricing/elasticity coefficients and the demand model are being finalized in a separate branch. For the price term in the revenue formula, use a placeholder `avg_price * config.revenueModel.priceCoefficient` and leave the coefficient in `config/params`. Do not implement price elasticity logic — it will be merged separately.

### Step 1 — Load config
Read `/games/{gameId}/config/params` into a `config` object. You'll use `config.customerPoolMultiplier`, `config.attractivenessWeights`, `config.revenueModel`, `config.adBonuses`, `config.chefBonusPerPoint`, `config.machineHealthMultipliers`, `config.maintenance`, `config.credit`, `config.staffingCost.baseCost`, and `config.unitCostPerProduct`.

### Step 2 — Load all player decisions
Query the `/games/{gameId}/players` collection. For each player document load:
- `pendingDecision` (quantities, menu, staffCounts, maintenanceTasks, submitted)
- `pendingBids` (adBid: `{ adType, amount }`, chefBid: `{ skillLevel, amount }`)
- `cleanliness_pct`, `oven_health_pct`, `slicer_health_pct`, `espresso_health_pct`
- `chefSatisfactionScores` (map of chefId → `{ score, skillLevel, specialty, station }`)
- `budgetCurrent`, `cumulativeRevenue`, `creditBalance`

Also read their submitted decision snapshot from `/games/{gameId}/players/{uid}/decisions/round_{n}` for the cost values (`staffingCost`, `inventoryCost`) computed during `submitDecision`.

### Step 3 — Resolve ad auctions (sealed-bid first-price)
For each of `["TV", "Billboard", "Radio", "Newspaper"]`:
- Collect all players whose `pendingBids.adBid.adType === adType` and `amount > 0`.
- Find the highest bidder. On tie: `Math.random() < 0.5` to break it.
- Record `auctionResults.ads[adType] = { winnerId, winningBid }`.
- Deduct `winningBid` from winner's `budgetCurrent` in the working copy.

### Step 4 — Resolve chef auction
- Collect all players with `pendingBids.chefBid.amount > 0`.
- Find the highest bidder. On tie: random selection.
- Assign `auctionResults.chef = { winnerId, winningBid, skillLevel: pendingBids.chefBid.skillLevel }`.
- Deduct `winningBid` from winner's working `budgetCurrent`.

### Step 5 — Compute customer pool and allocate to players
Total pool = `config.customerPoolMultiplier * numPlayers` (where `numPlayers` is the number of player docs loaded).

For each player, compute attractiveness:
```
totalSousChefs = bakerySousChefs + deliSousChefs + baristaSousChefs
numActiveProducts = count of menu items where menu[item] === true
avg_price is placeholder: use config.revenueModel.basePriceAssumption (a static value from config)

attractiveness =
  (1 / avg_price) * config.attractivenessWeights.priceWeight
  + totalSousChefs * config.attractivenessWeights.staffWeight
  + (pendingBids.adBid?.amount ?? 0) * config.attractivenessWeights.adSpendWeight
  + numActiveProducts * config.attractivenessWeights.numProductsWeight
```

Ensure no player has attractiveness ≤ 0 (floor at 0.01). Sum all attractiveness scores. Allocate:
```
playerCustomers = Math.round((playerAttractiveness / totalAttractiveness) * totalPool)
```

### Step 6 — Compute revenue per player
For each player:
```
revenue =
  config.revenueModel.base
  + totalSousChefs * config.revenueModel.staffCoefficient
  + avg_price * config.revenueModel.priceCoefficient    // placeholder — do not change
  + (adBid?.amount ?? 0) * config.revenueModel.adSpendCoefficient
  + numActiveProducts * config.revenueModel.numProductsCoefficient
  + (Math.random() * (config.revenueModel.noiseMax - config.revenueModel.noiseMin) + config.revenueModel.noiseMin)
```

**Apply machine health multiplier:**
Determine the health tier for each station using `config.machineHealthMultipliers` (an array of `{ threshold, multiplier }` entries sorted descending by threshold — find the first where `pct >= threshold`):
- Bakery station → `oven_health_pct`
- Deli station → `slicer_health_pct`
- Barista station → `espresso_health_pct`

Apply the multiplier proportionally to the revenue contribution from products in that station (bakery products: croissant, cookie; deli: bagel, sandwich; barista: coffee, matcha).

**Apply chef skill bonus:**
If this player won the chef auction: `chefBonus = auctionResults.chef.skillLevel * config.chefBonusPerPoint`. Add `chefBonus` to revenue.

**Apply ad bonus:**
If this player won any ad slot: `adBonus = config.adBonuses[adTypeWon]`. Add to revenue.

**Apply chef satisfaction multiplier:**
Compute `kitchenSatisfactionScore` = average of all remaining chef scores in `chefSatisfactionScores` (default 100 if no specialty chefs). Apply as `revenue *= (kitchenSatisfactionScore / 100)` to base revenue only (not to bonuses).

### Step 7 — Apply costs and debt
```
totalCosts = staffingCost + inventoryCost   // read from the decision snapshot written by submitDecision
netRevenue = revenue - totalCosts
```
Update player's `budgetCurrent += netRevenue`.

If `netRevenue < 0` and `config.credit.overdraftEnabled`:
- `creditBalance += Math.abs(netRevenue)`
- `creditCost = creditBalance * config.credit.creditCostRate`
- If `config.credit.chargeTiming === "immediate"`: `budgetCurrent -= creditCost`
- Update `creditBalance` on the player working copy.

### Step 8 — Apply maintenance decay and restoration
For each player:
- `cleanliness_pct -= playerCustomers * config.maintenance.dirtinessDropPerCustomer` (floor 0)
- `oven_health_pct -= (quantities.croissant + quantities.cookie) * config.maintenance.machineHealthDropPerOrder` (floor 0)
- `slicer_health_pct -= (quantities.bagel + quantities.sandwich) * config.maintenance.machineHealthDropPerOrder` (floor 0)
- `espresso_health_pct -= (quantities.coffee + quantities.matcha) * config.maintenance.machineHealthDropPerOrder` (floor 0)

For each entry in `pendingDecision.maintenanceTasks` (one per maintenanceGuy):
- `"clean"` → `cleanliness_pct += config.maintenance.restoreRatePerHour * config.maintenance.operationalHoursPerRound`
- `"repair_oven"` → `oven_health_pct += ...`
- `"repair_slicer"` → `slicer_health_pct += ...`
- `"repair_espresso"` → `espresso_health_pct += ...`

Cap all bars at 100, floor at 0.

### Step 9 — Update chef satisfaction and departures
For each specialty chef in `chefSatisfactionScores` (key = chefId, value has `{ score, skillLevel, specialty, station }`):

Apply in order:
1. Base decay: `score -= config.maintenance.chefSatisfactionDecay[skillLevel]`
2. Cleanliness bonus/penalty:
   - `cleanliness_pct >= 70` → `score += 5`
   - `cleanliness_pct <= 30` → `score -= 5`
3. Machine health modifiers:
   - Any station machine below 40%: `score -= 5`
   - Chef's own primary station machine below 20%: additional `score -= 8`
   - All machines above 70%: `score += 3`
   - Chef's own primary station above 90%: additional `score += 5`
4. Overcrowding: if `totalSousChefs > 4`: `score -= 3 * (totalSousChefs - 4)`
5. Clamp `score` to range `[0, 100]`.
6. If `score <= config.maintenance.chefDepartureThreshold`: remove this chef from `chefSatisfactionScores`, push chef's name to `chefDepartures[]`.

After processing all chefs: compute `kitchenChefSatisfactionScore` = average of remaining chef scores (or 100 if none remain).

### Step 10 — Write all results
For each player, write within a single batched write (use `db.batch()`):

1. `/games/{gameId}/players/{uid}/rounds/round_{n}` — `RoundResultDocument`:
```js
{
  round: currentRound,
  revenue,
  customerCount: playerCustomers,
  staffingCost,
  inventoryCost,
  creditCost: creditCost ?? 0,
  adWon: auctionResults.ads entry where winnerId === uid, or null,
  chefWon: auctionResults.chef.winnerId === uid ? auctionResults.chef : null,
  chefSatisfactionScore: kitchenChefSatisfactionScore,
  chefDepartures: chefDepartures[],
  maintenanceBarsEnd: { cleanliness_pct, oven_health_pct, slicer_health_pct, espresso_health_pct },
  quantities: decision.quantities,
  createdAt: FieldValue.serverTimestamp(),
}
```

2. Update `/games/{gameId}/players/{uid}`:
```js
{
  budgetCurrent,
  cumulativeRevenue: FieldValue.increment(revenue),
  creditBalance,
  cleanliness_pct,
  oven_health_pct,
  slicer_health_pct,
  espresso_health_pct,
  chefSatisfactionScores,   // updated map
  lastRoundResult: { revenue, customerCount: playerCustomers, chefSatisfactionScore: kitchenChefSatisfactionScore, chefDepartures }
}
```

3. `/games/{gameId}/rounds/round_{n}` — `AggregateRoundDocument`:
```js
{
  round: currentRound,
  auctionResults: { ads: { TV, Billboard, Radio, Newspaper }, chef },
  classRevenue: sum of all player revenues,
  classCustomers: sum of all playerCustomers,
  createdAt: FieldValue.serverTimestamp(),
}
```

4. `/games/{gameId}/leaderboard/current` — `LeaderboardDocument`:
Build the `rankings` array by sorting all players descending by `cumulativeRevenue`. For each player: `{ uid, displayName, cumulativeRevenue, lastRoundRevenue: revenue, rankChange: previousRank - currentRank }`. Write `{ updatedAt: serverTimestamp(), rankings }`.

5. `/games/{gameId}/csvRows/{uid}/rounds/round_{n}` — `CsvRowsDocument`:
```js
{
  uid,
  round: currentRound,
  row: {
    day: currentRound,
    revenue,
    num_products: numActiveProducts,
    avg_price: config.revenueModel.basePriceAssumption,
    bakery_sous_chef_count: staffCounts.bakerySousChefs,
    deli_sous_chef_count: staffCounts.deliSousChefs,
    barista_sous_chef_count: staffCounts.baristaSousChefs,
    maintenance_guy_count: staffCounts.maintenanceGuys,
    ad_spend: pendingBids.adBid?.amount ?? 0,
    customer_count: playerCustomers,
    customer_satisfaction: kitchenChefSatisfactionScore,
    chef_satisfaction_score: kitchenChefSatisfactionScore,
    headchef_skill: auctionResults.chef?.winnerId === uid ? auctionResults.chef.skillLevel : 0,
    avg_cleanliness_pct: cleanliness_pct,
    avg_machine_health_pct: Math.round((oven_health_pct + slicer_health_pct + espresso_health_pct) / 3),
    croissant: quantities.croissant,
    cookie: quantities.cookie,
    bagel: quantities.bagel,
    sandwich: quantities.sandwich,
    coffee: quantities.coffee,
    matcha: quantities.matcha,
    ad_type: pendingBids.adBid?.adType ?? "none",
  }
}
```

### Step 11 — Advance to `results_ready`
After the batch commits successfully, update `/games/{gameId}` to `{ phase: "results_ready" }`.

### 5b — `triggerSimulation` Callable (professor fallback)
```js
exports.triggerSimulation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "...");
  const { gameId } = request.data;
  const game = await db.collection("games").doc(gameId).get();
  if (game.data().professorId !== request.auth.uid) throw new HttpsError("permission-denied", "...");
  await simulateRound(gameId);
  return { success: true };
});
```

---

## TASK BE-6 — `resetGame` Cloud Function

**What to build:** An `exports.resetGame` callable that wipes all round data and resets player state. Used during testing.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:** `{ gameId: string }`

**Implementation steps:**

1. Require auth, verify `professorId`.
2. Read config to get `startingBudget` for restoring player budgets.
3. Delete all documents in these subcollections using batched deletes (Firestore doesn't cascade — you must delete each document individually):
   - `/games/{gameId}/players/{uid}/decisions/*`
   - `/games/{gameId}/players/{uid}/rounds/*`
   - `/games/{gameId}/rounds/*`
   - `/games/{gameId}/leaderboard/*`
   - `/games/{gameId}/csvRows/{uid}/rounds/*`
4. For each player document, reset it to initial state:
```js
{
  budgetCurrent: config.startingBudget,
  cumulativeRevenue: 0,
  creditBalance: 0,
  cleanliness_pct: 100,
  oven_health_pct: 100,
  slicer_health_pct: 100,
  espresso_health_pct: 100,
  chefSatisfactionScores: {},
  pendingDecision: DEFAULT_PENDING_DECISION,  // the fixed constant from BE-0
  lastRoundResult: null,
}
```
5. Update game doc:
```js
{
  phase: "lobby",
  currentRound: 1,
  submittedCount: 0,
  startedAt: null,
  endedAt: null,
  phaseEndTime: null,
}
```
6. Return `{ success: true }`.

---

## TASK BE-7 — `exportCSV` Cloud Function

**What to build:** An `exports.exportCSV` callable that serializes all round rows for a player (or all players if professor) into a downloadable CSV string.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:** `{ gameId: string, uid?: string }`

**Implementation steps:**

1. Require auth. If `request.auth.uid.startsWith("professor_")`: return all players' rows. Otherwise: return only the calling player's rows.
2. Query the relevant `/games/{gameId}/csvRows/{uid}/rounds/*` paths. Collect all row documents.
3. Sort rows by `row.day` ascending, then by `uid` (for professor view).
4. Build a CSV string. The header row must exactly match this column order:
```
day,revenue,num_products,avg_price,bakery_sous_chef_count,deli_sous_chef_count,barista_sous_chef_count,maintenance_guy_count,ad_spend,customer_count,customer_satisfaction,chef_satisfaction_score,headchef_skill,avg_cleanliness_pct,avg_machine_health_pct,croissant,cookie,bagel,sandwich,coffee,matcha,ad_type
```
Each subsequent row is the values from `CsvRowsDocument.row` in the same column order, comma-separated.
5. Return `{ csv: string }`.

---

## TASK BE-8 — Professor Authentication

**What to build:** An `exports.createProfessorSession` callable that lets a professor log in with a passcode and receive a Firebase custom auth token.

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Input shape:** `{ passcode: string, gameId: string }`

**Implementation steps:**

1. No auth required on this endpoint (it creates the session).
2. Read `PROFESSOR_PASSCODE` from `process.env.PROFESSOR_PASSCODE` (set this via Firebase Functions config or Secret Manager — do not hardcode it).
3. If `request.data.passcode !== process.env.PROFESSOR_PASSCODE`: throw `unauthenticated` with message `"Invalid passcode"`.
4. Verify the game exists at `/games/{gameId}`.
5. Mint a custom Firebase Auth token:
```js
const customToken = await admin.auth().createCustomToken(`professor_${gameId}`, { role: "professor", gameId });
```
6. Return `{ customToken }`. The frontend will call `signInWithCustomToken(auth, customToken)`.

**Note on authorization checks:** In all other professor-gated functions (BE-1 through BE-6), the professor identity check should be:
```js
const isProfessor = request.auth.uid === `professor_${gameId}` || request.auth.uid === game.professorId;
if (!isProfessor) throw new HttpsError("permission-denied", "...");
```

---

## TASK BE-9 — Firestore Security Rules Update

**What to build:** Update `games/bakery-bash/backend/firestore.rules` to support the real-time listeners the frontend needs.

**File to edit:** `games/bakery-bash/backend/firestore.rules`

**Rules to add/verify:**

```
// Players can read the leaderboard
match /games/{gameId}/leaderboard/{docId} {
  allow read: if request.auth != null;
}

// Players can read class-wide round aggregates
match /games/{gameId}/rounds/{roundId} {
  allow read: if request.auth != null;
}

// Players can read their own round results
match /games/{gameId}/players/{playerId}/rounds/{roundId} {
  allow read: if request.auth != null && request.auth.uid == playerId;
}

// Professors can read all player documents under their game
match /games/{gameId}/players/{playerId} {
  allow read: if request.auth != null &&
    (request.auth.uid == playerId ||
     request.auth.uid == get(/databases/$(database)/documents/games/$(gameId)).data.professorId ||
     request.auth.uid == "professor_" + gameId);
}

// Players can read displayName and cumulativeRevenue on other players (for leaderboard) but NOT pendingDecision
// NOTE: Firestore field-level rules are not natively supported — enforce this in the leaderboard listener
// by only reading from /leaderboard/current, not from individual player docs.
```

Verify existing rules do not unintentionally allow clients to write to financial fields (`budgetCurrent`, `cumulativeRevenue`, `creditBalance`) — these must only be writable by Cloud Functions (server-side admin SDK).

---

## Notes for All Backend Tasks

- All dollar amounts: numbers (float), never strings.
- Timestamps: `FieldValue.serverTimestamp()` for writes; `Timestamp.fromMillis(Date.now() + n*1000)` for computed deadlines.
- Never hardcode game parameters — always read from `/games/{gameId}/config/params`.
- `currentRound` is 1-indexed. Subcollection IDs: `"round_1"`, `"round_2"`, etc.
- All financial writes must go through Cloud Functions — never from client.
- If a batch write exceeds 500 operations (possible with 30+ players × subcollection deletes in BE-6), split into multiple sequential batches.
