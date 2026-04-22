# Bakery Bash — Frontend Agent Tasks (Apr 21)

## Context for AI Agent

You are implementing the React/TypeScript frontend for a multiplayer bakery simulation game. The source root is `games/bakery-bash/app/src/`. State management uses React Context (`GameContext`) with a reducer pattern. Firebase is already initialized — import `db` (Firestore) and `functions` (Cloud Functions) from `src/lib/firebase.ts`.

**Rules for every component you touch:**
- Do not install new npm packages unless explicitly noted in the task
- CSS class names follow BEM: `block__element--modifier`. Add new classes to the existing stylesheet, never use inline styles
- Firebase callable functions are invoked as: `const fn = httpsCallable(functions, 'functionName'); await fn(data);`
- Firestore listeners use `onSnapshot(doc(db, 'path'), callback)` — always clean up in `useEffect` return
- All dispatch calls must match the `GameAction` union type in `GameContext.tsx` — do not add new action types without also updating the reducer
- Keep all monetary values as numbers (not strings) — only call `.toLocaleString()` at display time
- TypeScript — maintain type safety; import types from `src/types/game.ts`

---

## TASK FE-0 — Fix `DecidePhase.tsx` — Stale Broken Component

**Priority: CRITICAL — fix this first. This component references deleted field names and has inputs wired to nothing.**

**File to edit:** `src/pages/phases/DecidePhase.tsx`

**What is currently broken:**
- The component references `"Latte"` and `"Matcha Latte"` as product names — these were renamed to `"Coffee"` and `"Matcha"` in the current schema
- It renders a flat "Number of Staff" input that directly conflicts with the station-based `StaffCounts` system now handled in `StaffTab.tsx`
- It has price and quantity inputs that write to no state and submit nothing

**How to fix it:**

1. **Replace the entire component body** with a simple instructional view that tells players the sidebar tabs (Menu, Staff, Auction) are where they make decisions. The `DecidePhase` component should just be a wrapper with a submit button — all decision inputs live in the sidebar.

   Example layout:
   ```
   [Title: "Make Your Decisions"]
   [Description: "Use the Menu, Staff, and Auction tabs in the sidebar to set your round decisions."]
   [Submit Decisions button]
   [Confirmation message — shown after submit]
   ```

2. **Wire the Submit Decisions button:**
   - Import `httpsCallable` from `firebase/functions` and `functions` from `src/lib/firebase.ts`
   - On click, call the `submitDecision` Firebase callable with `{ gameId, decision: player.pendingDecision }` where `player` and `gameId` come from `useGame()`
   - Disable the button when: (a) no product has `quantities > 0` in `player.pendingDecision.quantities`, or (b) `player.pendingDecision.submitted === true`, or (c) the request is in flight
   - On success: dispatch `UPDATE_PLAYER` with the returned cost fields, and render a `"Decisions submitted — waiting for other teams…"` message in place of the button
   - On error: show an inline error message (do not use `alert()`)

3. **Remove entirely:** the old staff input, the old product name references, any unconnected price inputs.

---

## TASK FE-1 — Connect `MenuTab.tsx` Quantity Inputs to Firestore

**File to edit:** `src/components/game/tabs/MenuTab.tsx`

> ⚠️ **Do not implement pricing inputs or price-related state.** A teammate is adding price fields in a separate branch. Leave price display as read-only, showing `basePrice` from the product config. Only wire quantity inputs and the active/inactive toggle.

**What currently exists:** The tab renders product cards with base prices and quantity inputs. Neither is connected to `GameContext` or persisted to Firestore.

**Steps:**

1. Pull `player`, `gameId`, and `dispatch` from `useGame()`.

2. **Quantity inputs:** On change, write to Firestore with a 300ms debounce:
   - Document path: `/games/{gameId}/players/{uid}`
   - Field to update: `pendingDecision.quantities.{productId}` (e.g. `pendingDecision.quantities.croissant`)
   - Use `updateDoc(doc(db, 'games', gameId, 'players', uid), { ['pendingDecision.quantities.' + productId]: value })`
   - Also dispatch a local action to update `GameContext` immediately (optimistic update) so the UI doesn't wait for the Firestore round-trip

3. **Active/inactive product toggle:** On toggle change:
   - Write `pendingDecision.menu.{productId}: boolean` to the same player doc (same pattern, no debounce needed — it's a single boolean flip)
   - Dispatch local update

4. **Price display:** Show `basePrice` as plain text (no input). Do not add any editable price field.

5. **Read-only mode:** Accept a `readOnly: boolean` prop. When true, replace all inputs and toggles with plain text values. Add a `"Submitted"` badge to the tab header. (This prop is wired by FE-9.)

---

## TASK FE-2 — Connect `StaffTab.tsx` to Firestore

**File to edit:** `src/components/game/tabs/StaffTab.tsx`

**What currently exists:** The staff tab displays 4 station steppers (bakerySousChefs, deliSousChefs, baristaSousChefs, maintenanceGuys) and maintenance bars, but none of the stepper changes or task assignments persist to Firestore.

**Steps:**

1. **Stepper changes:** On any increment/decrement, debounce 300ms then write the full `staffCounts` object to Firestore:
   ```
   updateDoc(playerRef, { 'pendingDecision.staffCounts': staffCounts })
   ```
   Also dispatch a local optimistic update to `GameContext`.

2. **Maintenance task dropdown changes:** On any task assignment change, write the full `maintenanceTasks` array (no debounce — it's a dropdown, not a text input):
   ```
   updateDoc(playerRef, { 'pendingDecision.maintenanceTasks': maintenanceTasks })
   ```

3. **Live maintenance bars:** Subscribe to the player's own Firestore doc via `onSnapshot`. When the snapshot changes, dispatch `SET_MAINTENANCE_BARS` with the new values of `cleanliness_pct`, `oven_health_pct`, `slicer_health_pct`, `espresso_health_pct`. Set up the subscription in a `useEffect` and clean it up in the return function.

4. **Dynamic staffing cost display:** Compute and show the current total staffing cost below the steppers. Use this client-side calculation (must match the backend exactly):
   ```ts
   const BASE_COST = 50;
   const escalationCurve = (n: number): number => {
     const fixed = [1.0, 1.5, 2.25, 3.0];
     let prev = 3.0;
     const result: number[] = [...fixed];
     for (let i = 4; i <= n; i++) { prev = prev + 0.75; result.push(prev); }
     return result.slice(0, n).reduce((sum, m) => sum + BASE_COST * m, 0);
   };
   const totalStaffingCost =
     escalationCurve(staffCounts.bakerySousChefs)
     + escalationCurve(staffCounts.deliSousChefs)
     + escalationCurve(staffCounts.baristaSousChefs)
     + escalationCurve(staffCounts.maintenanceGuys);
   ```
   Display as: `"Estimated staffing cost: $X"`.

5. **Read-only mode:** Accept a `readOnly: boolean` prop. When true, replace steppers with plain number labels, hide dropdowns, and show a `"Submitted"` badge.

---

## TASK FE-3 — Overhaul `AuctionTab.tsx`

**File to edit:** `src/components/game/tabs/AuctionTab.tsx`

**What currently exists:** The tab has 4 hardcoded ad type cards and 3 hardcoded chef cards with no Firestore connection.

### 3a — Ad Auction Section

1. Keep the 4 ad type cards: `TV`, `Radio`, `Newspaper`, `Billboard`.

2. **Top Bid display:** Add a `"Current Top Bid: $X"` label to each ad card. Subscribe to `/games/{gameId}/rounds/round_{n}` via `onSnapshot`. Read `auctionResults.ads[adType].winningBid` and display it live. If the round doc doesn't exist yet, show `"$0"`. **Style this prominently** — large font, high contrast background — it was flagged in the meeting as too small and hard to read.

3. **Bid input:** Each ad card has a number input. When the player changes the input, write to Firestore:
   ```
   updateDoc(playerRef, { 'pendingBids.adBid': { adType, amount: value } })
   ```
   Debounce 300ms. A player can only bid on one ad type at a time — when a different ad card's input is changed, clear the previous bid input in local state (do not write a null bid to Firestore, just clear the input).

### 3b — Chef Auction Section

1. **Remove the 3 hardcoded chef cards.** Replace with a real-time listener on the round document (`/games/{gameId}/rounds/round_{n}`) to show the available chef for this round. Read `auctionResults.chef.skillLevel` and `auctionResults.chef.specialty` (if the round doc exists). If no round doc yet (first round), show a placeholder chef card with "Chef Available — Bid to Win".

2. **Display** the chef's skill level badge (e.g. `"Skill: 72/100"`) and specialty label (e.g. `"Specialty: Matcha"`) prominently.

3. **Top chef bid:** Show `"Current Top Chef Bid: $X"` using the same pattern — read from the round doc, style prominently.

4. **Bid input:** On change, write to Firestore:
   ```
   updateDoc(playerRef, { 'pendingBids.chefBid': { skillLevel: chefSkillLevel, amount: value } })
   ```

### 3c — Lock In Bids Button

Add a `"Lock In Bids"` button at the bottom of the auction tab:
- On click: call the `submitBids` Firebase callable (same pattern as `submitDecision` — it validates and records bids). If `submitBids` is not yet deployed, show the button but disable it with a `"Coming soon"` tooltip.
- After a successful lock, show a `"Bids locked ✓"` confirmation and disable all bid inputs.

5. **Read-only mode:** Accept a `readOnly: boolean` prop. When true, all bid inputs and the lock button are disabled. Show a `"Bids locked"` badge in the tab header.

---

## TASK FE-4 — Overhaul `ResultsPhase.tsx`

**File to edit:** `src/pages/phases/ResultsPhase.tsx`

**What currently exists:** The component only shows `revenue`, `customerCount`, and `customerSatisfaction`. The `RoundResult` type has many more fields that are not displayed.

**Data source:** Read from `roundResults[roundResults.length - 1]` via `useGame()`. This will be populated when `useGameListener` (FE-5) dispatches `ADD_RESULT`.

**Add the following sections (in order):**

1. **Budget Summary Row:**
   - Show: `Budget Before: $X` → `Budget After: $Y`
   - Show `Staffing Cost: $X`, `Inventory Cost: $X`
   - If `creditCost > 0`: show `Loan Cost: $X` in red text with a `"Debt interest"` label

2. **Auction Results:**
   - Show which ad slot the player won, e.g. `"Won: TV Ad ✓"` or `"No ad won this round"`
   - Show whether they won the chef auction: `"Chef Hired: [Specialty] (Skill: X)"` or `"Chef auction lost"`

3. **Chef Satisfaction Panel:**
   - Show `chefSatisfactionScore` as a labeled percentage bar (reuse the bar component style from `StaffTab`)
   - If `chefDepartures` is non-empty: show a warning banner for each departed chef, e.g. `"⚠ Chef Marie left — satisfaction fell too low"`

4. **Maintenance Bars (end-of-round state):**
   - Show `cleanliness_pct`, `oven_health_pct`, `slicer_health_pct`, `espresso_health_pct` as labeled bars
   - Source these from `result.maintenanceBarsEnd`

5. **Products Sold Table:**
   - Show a small table: `Product | Units Sold`
   - Source from `result.quantities` (units ordered) — note: actual units sold may be lower if supply exceeded demand; if the round result includes a `sold` breakdown, use that; otherwise use `quantities`

---

## TASK FE-5 — Create `useGameListener.ts` Hook

**File to create:** `src/hooks/useGameListener.ts`

**What it does:** Sets up all real-time Firestore `onSnapshot` listeners and keeps `GameContext` in sync. This is the most critical integration task — without it, the frontend is static and never responds to phase changes, player updates, or simulation results.

**Call this hook inside `GamePage.tsx`** once `gameId` is non-null in context: `useGameListener(gameId)`.

**Implement these 5 listeners inside the hook:**

### Listener 1 — Game Document
```ts
onSnapshot(doc(db, 'games', gameId), (snap) => {
  const data = snap.data() as GameDocument;
  if (data.phase !== currentPhase) dispatch({ type: 'SET_PHASE', payload: data.phase });
  if (data.phaseEndTime) dispatch({ type: 'SET_TIMER', payload: data.phaseEndTime });
  if (data.currentRound !== currentRound) dispatch({ type: 'ADVANCE_ROUND', payload: data.currentRound });
});
```
Read `currentPhase` and `currentRound` from `useGame()` to avoid unnecessary re-dispatches.

### Listener 2 — Player Document
```ts
onSnapshot(doc(db, 'games', gameId, 'players', uid), (snap) => {
  const data = snap.data() as PlayerDocument;
  dispatch({ type: 'UPDATE_PLAYER', payload: { budgetCurrent: data.budgetCurrent, cumulativeRevenue: data.cumulativeRevenue } });
  dispatch({ type: 'SET_MAINTENANCE_BARS', payload: {
    cleanliness_pct: data.cleanliness_pct,
    oven_health_pct: data.oven_health_pct,
    slicer_health_pct: data.slicer_health_pct,
    espresso_health_pct: data.espresso_health_pct,
  }});
  dispatch({ type: 'SET_CHEF_SATISFACTION', payload: data.chefSatisfactionScores });
});
```

### Listener 3 — Current Round Result
```ts
// Listen to the player's result for the current round
const roundPath = `games/${gameId}/players/${uid}/rounds/round_${currentRound}`;
onSnapshot(doc(db, roundPath), (snap) => {
  if (snap.exists()) {
    dispatch({ type: 'ADD_RESULT', payload: snap.data() as RoundResult });
  }
});
```
Re-create this listener whenever `currentRound` changes (include `currentRound` in the `useEffect` dependency array).

### Listener 4 — All Players (for professor monitor + leaderboard)
```ts
onSnapshot(collection(db, 'games', gameId, 'players'), (snap) => {
  const players = snap.docs.map(d => ({ uid: d.id, ...d.data() })) as Player[];
  dispatch({ type: 'SET_PLAYERS', payload: players });
});
```

### Listener 5 — Leaderboard
```ts
onSnapshot(doc(db, 'games', gameId, 'leaderboard', 'current'), (snap) => {
  if (snap.exists()) {
    const leaderboard = snap.data() as LeaderboardDocument;
    dispatch({ type: 'SET_LEADERBOARD', payload: leaderboard.rankings });
  }
});
```

**Cleanup:** Return an unsubscribe function from the `useEffect` that calls all 5 unsubscribe functions returned by `onSnapshot`.

**Make sure all 5 `GameAction` types referenced above (`SET_PHASE`, `SET_TIMER`, `ADVANCE_ROUND`, `UPDATE_PLAYER`, `SET_MAINTENANCE_BARS`, `SET_CHEF_SATISFACTION`, `ADD_RESULT`, `SET_PLAYERS`, `SET_LEADERBOARD`) exist in `GameContext.tsx`'s `GameAction` union type and are handled in the reducer.** If any are missing, add them.

---

## TASK FE-6 — Professor Dashboard

**File to edit:** `src/pages/ProfessorPage.tsx`

**What currently exists:** All 4 control buttons are disabled with a placeholder message. Needs to become a fully functional control panel.

### 6a — Professor Login Form
Before rendering any controls, show a passcode entry form if the user is not authenticated as a professor:
1. Input field: `"Professor Passcode"` + `"Game ID"` + `"Login"` button
2. On submit: call `createProfessorSession({ passcode, gameId })` Firebase callable
3. On success: call `signInWithCustomToken(auth, customToken)` (import `auth` from `src/lib/firebase.ts`) and store `gameId` in component state
4. On error: show `"Invalid passcode"` inline

### 6b — Game Creation Form
After login, if no game is active:
1. Show a form with `"Professor Name"` input and `"Number of Rounds"` (default 5)
2. On submit: call `createGame({ professorName, totalRounds })` callable
3. Display the returned `joinCode` prominently — large monospace font, with a `"Copy"` button (use `navigator.clipboard.writeText(joinCode)`)

### 6c — Phase Control Buttons
Wire all 4 existing buttons. Read `game.phase` from a live Firestore listener (same pattern as FE-5 Listener 1) for this page's local state:

- **Start Game** → calls `startGame({ gameId })`; disable once `game.phase !== "lobby"`
- **Advance Round** → calls `advancePhase({ gameId })`; button label changes based on `game.phase`:
  - `"email"` → label: `"Open Decision Phase"`
  - `"decide"` → label: `"Open Bidding"`
  - `"bid"` → label: `"Run Simulation"`
  - `"results_ready"` → label: `"Next Round"` (or `"End Game"` if on last round)
  - Disable during `"simulating"`
- **Pause / Resume** → toggle `paused` field directly: `updateDoc(doc(db, 'games', gameId), { paused: !game.paused })`. Label changes to `"Resume"` when `game.paused === true`
- **End Game** → show a browser `confirm()` dialog first, then call `advancePhase` until `game_over` or write `{ phase: "game_over" }` directly

### 6d — Real-time Player Monitoring Table
Below the controls, show a table with a live `onSnapshot` on `/games/{gameId}/players`. Columns:
| Bakery Name | Budget | Round Submitted | Last Revenue | Total Revenue |

- `"Round Submitted"` column: show `"✓"` if `pendingDecision.submitted === true`, else `"Pending"`
- Show aggregate above the table: `"X / Y teams submitted"` — read `game.submittedCount` and `game.totalPlayers` from the game doc listener

### 6e — Reset Button
Add a `"Reset Game"` button styled with the `btn--danger` CSS modifier. On click:
1. Show `window.confirm("This will delete all round data and reset all players. Are you sure?")`.
2. If confirmed: call `resetGame({ gameId })` callable.
3. On success: reload the page or reset local state to the login form.

---

## TASK FE-7 — Leaderboard Live Sync

**File to edit:** `src/pages/LeaderboardPage.tsx`

**What currently exists:** The leaderboard sorts a local `players` array that is never updated from Firestore after initial page load.

**Steps:**

1. The leaderboard data comes from `useGameListener` (FE-5) via the `SET_LEADERBOARD` dispatch — it will be available in `GameContext` as a `leaderboard` field (or similar — check what the reducer stores it under after FE-5 is implemented).

2. Replace the local sort with the server-sorted `rankings` array from `/games/{gameId}/leaderboard/current`. The backend already returns it sorted by `cumulativeRevenue` descending.

3. **Populate the empty `"Revenue (Round)"` column** with `lastRoundRevenue` from each ranking entry.

4. **Add a `rankChange` column** using the `rankChange` field (positive = moved up, negative = moved down, 0 = no change):
   - `rankChange > 0` → show `"▲ +X"` in green
   - `rankChange < 0` → show `"▼ X"` in red
   - `rankChange === 0` → show `"—"`

5. Each row should show `displayName` as the primary label (this is the bakery/team name).

---

## TASK FE-8 — Remove Dev Panel Bypass Before Production

**Files to audit and edit:**
- `src/components/ui/DevNav.tsx` — the dev navigation component
- `src/pages/GamePage.tsx` — likely imports and renders `DevNav`
- `src/pages/LandingPage.tsx` — has a TODO (around line 33) noting the join code is not validated

**Steps:**

1. Search the `src/` directory for any of: `DevNav`, `devPanel`, `bypass`, `isDev`. Note every file that references them.

2. In each file found: remove the import and the usage of the dev panel component. Remove any `isDev` conditional logic that bypasses auth or join validation.

3. Delete `src/components/ui/DevNav.tsx` entirely.

4. In `LandingPage.tsx`: replace the mock `joinGame` call with a real Firebase callable invocation:
   ```ts
   const joinGameFn = httpsCallable(functions, 'joinGame');
   await joinGameFn({ gameCode: enteredCode, displayName });
   ```
   If the callable returns an error (invalid code, game not found, already started), show an inline error message.

5. After these changes, there should be no way to enter the game without a valid join code and an active game session.

**Do this before May 1st — the dev bypass must not be live during the student session.**

---

## TASK FE-9 — Phase-Aware Read-Only UI Locking

**Files to edit:**
- `src/pages/phases/DecidePhase.tsx`
- `src/components/game/tabs/MenuTab.tsx`
- `src/components/game/tabs/StaffTab.tsx`
- `src/components/game/tabs/AuctionTab.tsx`

**What this does:** Once a player submits decisions, all decision inputs should become read-only so they can't be changed mid-round. The tabs also lock when the game phase moves past the decision/bidding window.

**Steps:**

1. In `DecidePhase.tsx`: compute `readOnly`:
   ```ts
   const readOnly = player.pendingDecision.submitted === true || game.phase !== 'decide';
   ```
   Pass `readOnly` as a prop to `MenuTab`, `StaffTab`, and (separately) `AuctionTab`.

2. In `MenuTab.tsx`: accept `readOnly: boolean`. When `readOnly === true`:
   - Replace all quantity inputs with plain `<span>` text values
   - Replace all toggles with static labels
   - Add a `"Submitted"` badge next to the tab header title (e.g. a `<span className="tab__badge tab__badge--submitted">Submitted</span>`)

3. In `StaffTab.tsx`: accept `readOnly: boolean`. When `readOnly === true`:
   - Replace steppers with plain number labels
   - Hide the maintenance task dropdowns, show task names as text
   - Add a `"Submitted"` badge

4. In `AuctionTab.tsx`: accept `readOnly: boolean`. The read-only condition for auction is different:
   ```ts
   const auctionReadOnly = player.pendingBids?.locked === true || game.phase !== 'bid';
   ```
   When `auctionReadOnly === true`:
   - Disable all bid inputs and the "Lock In Bids" button
   - Show a `"Bids Locked"` badge

5. **Do not add phase-conditional rendering inside the tab components themselves.** The tabs always render; the `readOnly` prop controls whether inputs are active. Phase routing (which full-page component renders) is handled in `GamePage.tsx`.

---

## Notes for All Frontend Tasks

- Firebase callable functions: `const fn = httpsCallable(functions, 'fnName'); const result = await fn(data); result.data` holds the return value
- Firestore real-time listener: `const unsub = onSnapshot(doc(db, path), callback)` — call `unsub()` in `useEffect` cleanup
- All dispatch calls must match `GameAction` in `GameContext.tsx`. If a new dispatch type is needed, add it to both the union type and the reducer switch statement
- Keep monetary values as `number` everywhere except display — call `.toLocaleString('en-US', { style: 'currency', currency: 'USD' })` only in JSX
- Phase routing lives in `GamePage.tsx`. Do not duplicate phase checks inside tabs
- BEM CSS: `block__element--modifier`. New classes go in the existing `global.css` or component stylesheet — not inline
