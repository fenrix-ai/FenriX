# PR: new_changes_Apr_21_pt2

**Branch:** `new_changes_Apr_21_pt2`
**Base:** `main`
**Type:** Specification / task document only — this PR contains no code changes.
**Date:** 2026-04-22

> **How to use this document:** Each section below is a self-contained task written for an AI agent or developer. Read the task, find the referenced files, and implement exactly what is described. Do not implement anything not listed here. Check the ✅ Already Shipped section first — do not redo completed work.

---

## ✅ Already Shipped — Do Not Redo

The following items from the original playtesting session have already been implemented on `main` or in the `feature/ui-polish-chefs-briefing-stations` branch (PRs #38–#48):

- Chef cards with nationality + flag emoji (`ChefCard.tsx`)
- Pixel-art chef SVG assets (`public/assets/chefs/*.svg`)
- Kitchen Roster redesigned as card slots with Lay Off button (`RosterPhasePage.tsx`)
- Results phase overhauled — maintenance bars, chef satisfaction, product breakdown (`ResultsPhase.tsx`)
- Professor dashboard fully wired — game creation, phase controls, per-player monitoring (`ProfessorPage.tsx`)
- Team page with role selection — Operations / Advertising / Finance (`TeamPage.tsx`)
- Auction page fully built — ad + chef sections with real Firestore listener (`AuctionPage.tsx`)
- Ad SVG assets — TV, Radio, Newspaper, Billboard (`public/assets/ads/*.svg`)
- Real-time Firestore listeners + phase auto-navigation (`useGameListener.ts`, `GamePhaseListener.tsx`)
- Dynamic pricing — price inputs, `submitPrices` callable (`PriceInput.tsx`)
- Briefing / email phase redesigned — "Round N" pixel hero with floating bakery sprites (`EmailPhasePage.tsx`)
- Market email modal — round briefing content rendered from Firestore (`MarketEmailModal.tsx`)
- Ad winner banner component (`AdWinnerBanner.tsx`)
- Budget summary + Loan Shark callout components (`BudgetSummary.tsx`, `LoanSharkCallout.tsx`)
- Submission lock component (`SubmissionLock.tsx`)
- Full backend module suite — simulation, chef system, phases, revenue, customer allocation, loan shark, CSV export (`backend/functions/modules/`)
- 12 chefs per round (flat pool, up from 6–8) — `backend/functions/modules/config.js`
- Horizontal scrolling chef card strip in auction — compact 138px cards (`AuctionPage.tsx`, `global.css`)
- Round briefing modal styled — scrim, framed card, subject header, padded body (`global.css`)
- Station layout (Bakery / Deli / Barista) rendered side-by-side at laptop widths (`global.css`)
- KPI tile CSS fixed — labels and values no longer run together (`global.css`)
- Per-phase submission grid on professor dashboard — green/submitted vs pending per team (`ProfessorPage.tsx`)

---

## FRONT-END TASKS

**Stack:** React 18, TypeScript, Vite
**Source root:** `games/bakery-bash/app/src/`
**CSS:** BEM — `block__element--modifier`. All new classes in `src/styles/global.css`. No inline styles. No new npm packages unless noted.
**Firebase:** import `db` and `functions` from `src/lib/firebase.ts`.
**State:** `GameContext` via `useGame()` / `useGameDispatch()`. Match the `GameAction` union type.

---

### FE-N01 — "How to Play" Screen

**Create:** `src/pages/HowToPlayPage.tsx`
**Edit:** `src/App.tsx` — add `<Route path="/how-to-play" element={<HowToPlayPage />} />`

A standalone page accessible before gameplay begins (link it from `LandingPage.tsx`). Use `PageShell`. Render four stage cards in a vertical list. Each card has a label badge, a tagline, and a 2–3 sentence body. Do not hint at strategy — only explain what each phase does and why it exists.

**Card content (copy exactly as written):**

| Label | Tagline | Body |
|---|---|---|
| `Decisions` | `"Your bakery, your call."` | `"Each round, assign staff to stations, set how much to stock, and decide which maintenance jobs to prioritise. Every hire and every unit ordered costs money — spend wisely, because it all comes out of your revenue."` |
| `Ad Auction` | `"The loudest bakery wins the crowd."` | `"Teams bid competitively for four advertising slots: TV, Radio, Newspaper, and Billboard. The highest bidder holds that ad for the entire round. Ownership resets every auction — no team can hold an ad forever."` |
| `Chef Auction` | `"Great chefs don't come cheap."` | `"One chef pool is available each round. Teams bid to recruit them. Each chef independently boosts production at their station — their output adds on top of your existing team's. Chef speed multipliers do not stack across chefs."` |
| `Results` | `"The receipts don't lie."` | `"After every round, see your revenue, costs, customer count, and where you stand on the leaderboard. Review carefully — the next round starts right after."` |

Add a `"← Back"` button using `useNavigate(-1)`.

---

### FE-N02 — Large Phase Banner in Round Header

**File:** `src/components/game/RoundHeader.tsx`

Read `phase` from `useGame()`. Add a prominent full-width banner at the top of the header that displays the human-readable phase name. It must be impossible to miss — large font, high-contrast.

**Mapping to implement as a constant (covers all phases including new ones):**

```ts
const PHASE_LABELS: Record<string, string> = {
  lobby:         "Lobby",
  email:         "Briefing",
  decide:        "Decisions Round",
  bid_ad:        "Ad Auction",
  bid_chef:      "Chef Auction",
  roster:        "Kitchen Roster",
  simulating:    "Round in Progress…",
  results_ready: "Results",
  game_over:     "Game Over",
};
```

Use `parseGamePhase(phase, currentRound).base` to extract the base phase string before looking it up. Render as:

```tsx
<div className="round-header__phase-banner">
  {PHASE_LABELS[parsedBase] ?? phase}
</div>
```

CSS: `.round-header__phase-banner { font-size: 1.4rem; font-weight: bold; text-align: center; width: 100%; padding: 0.5rem; background: var(--honey); letter-spacing: 0.05em; }`.

---

### FE-N03 — Rename "Advertising" Role Display Label to "Bidder"

**Files to search and update:** `src/pages/TeamPage.tsx`, `src/types/game.ts` (display labels only), `src/components/game/RoundHeader.tsx`, any component showing role name to the player.

The internal role value `"advertising"` stays unchanged in the TypeScript type and in all Firestore reads/writes. Only the **displayed label** changes. Find `PLAYER_ROLE_LABELS` (or equivalent) in `game.ts` and update:

```ts
advertising: "Bidder",   // was "Advertising" or "Ad Manager"
```

Also update any tooltip or description copy that explains what the Bidder role does:
`"The Bidder places all auction bids — advertisements and chef hiring."`

---

### FE-N04 — Larger Active-Role Indicator Button

**File:** locate the element in `src/components/game/RoundHeader.tsx` or `src/pages/GamePage.tsx` that shows the active player's role.

The role indicator should be at minimum **48px tall**, styled as a pill or badge with a high-contrast colour (use `var(--caramel)` background and white text). If the current player is the active role-owner for this phase, show `"Your turn: [Role]"`. Otherwise show `"Active: [Role]"`.

```tsx
<div className={`round-header__role-badge ${isMyTurn ? 'round-header__role-badge--active' : ''}`}>
  {isMyTurn ? `Your turn: ${roleLabel}` : `Active: ${roleLabel}`}
</div>
```

CSS:
```css
.round-header__role-badge {
  min-height: 48px;
  padding: 0.6rem 1.4rem;
  border-radius: 24px;
  font-size: 1rem;
  font-weight: bold;
  background: var(--cream);
  display: inline-flex;
  align-items: center;
}
.round-header__role-badge--active {
  background: var(--caramel);
  color: #fff;
}
```

---

### FE-N05 — Join Screen: Option to Deselect Role

**File:** `src/pages/TeamPage.tsx`

Currently, once a player picks a role from the picker, there is no way to un-pick it (return to "no role selected" state). Add an **"× Clear"** or **"Unassign"** button next to the currently claimed role. Clicking it calls the `setTeamRole` callable with `{ gameId, teamId, role: null }` to release the role, and updates local state to show no role selected.

The button should only appear if the player has already claimed a role. Style it as a ghost/secondary button (`btn--ghost`) adjacent to the role pill.

Also update the role picker to show a "No role yet" placeholder state when `role === null`, with instructional text: `"Pick a role to unlock your team's controls."`

---

### FE-N06 — Team Logo Upload on Join Screen

**File:** `src/pages/LandingPage.tsx`

Currently the join form only collects name, team number, and game code. Add an optional **team logo upload** field. The logo is associated with the team and displayed on the results / auction reveal screens.

**Steps:**
1. Add `<input type="file" accept="image/png,image/jpeg,image/webp" />` labelled `"Team Logo (optional)"`.
2. On file select, use `FileReader.readAsDataURL()` to show a 60×60px circular preview inline.
3. On `joinGame` submit: if a file is selected, upload it to Firebase Storage at `teams/{gameId}/{teamNumber}/logo.{ext}` using `uploadBytes` + `getDownloadURL` from `firebase/storage`. Pass the returned `logoUrl` as an additional field in the `joinGame` callable payload.
4. If no file is selected, pass `logoUrl: null` — the backend should accept this gracefully (no breaking change).
5. CSS for preview: `.join-form__logo-preview { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }`.

---

### FE-N07 — Professor Dashboard: "Ready to Advance" Indicator

**File:** `src/pages/ProfessorPage.tsx`

The existing submission grid shows who has submitted for each phase. Add a separate, prominent **"Ready to Advance"** indicator at the top of the controls column. This is distinct from individual submission status — it shows whether *all* teams have submitted (i.e. the professor can safely advance).

```tsx
const allReady = roster.length > 0 &&
  roster.every(player => submissions[player.uid]?.status === 'submitted');

<div className={`prof-phase-readiness prof-phase-readiness--${allReady ? 'go' : 'wait'}`}>
  {allReady
    ? '🟢 All teams ready — safe to advance'
    : `🔴 Waiting for ${roster.filter(p => submissions[p.uid]?.status !== 'submitted').length} team(s)`}
</div>
```

CSS:
```css
.prof-phase-readiness {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-weight: bold;
  font-size: 0.95rem;
  margin-bottom: 1rem;
}
.prof-phase-readiness--go   { background: #dcfce7; color: #166534; border: 2px solid #22c55e; }
.prof-phase-readiness--wait { background: #fee2e2; color: #991b1b; border: 2px solid #ef4444; }
```

---

### FE-N08 — Briefing Screen: Market Watch Tied to Foot Traffic Elasticity

**Files:** `src/pages/EmailPhasePage.tsx`, `src/components/game/MarketEmailModal.tsx`

Currently the Market Watch email displays trend information but it is not connected to actual foot traffic elasticity in the simulation.

**Front-end change:** When the `MarketEmailModal` is open, parse the `marketInsights` data from the round document (`rounds/round_{N}.marketInsights`) and highlight which products are shown as "in demand" this round. Render each highlighted product with a visual indicator (e.g. an upward arrow icon, a green badge reading `"Trending"`).

Add a one-line tooltip or footnote below the highlighted items:
`"Items marked as trending are seeing higher customer demand this round."`

Do not display the actual multiplier value — players should observe the effect through gameplay, not be told the exact coefficient.

---

### FE-N09 — Decisions Screen: Item Cost, Round Total, and Timer Controls

**File:** `src/pages/GamePage.tsx` and `src/components/game/BakeryView.tsx`

**1. Show cost per item:**
In each product tile in `BakeryView.tsx`, display the per-unit inventory cost below the quantity input. Read `config.unitCostPerProduct` from `GameContext` (or a locally known constant until the config listener is wired). Display as: `"Cost: $X.XX / unit"`.

**2. Display total spent this round:**
Add a running total below the product list that sums `quantity × unitCost` across all active products plus the current staffing cost. Label it `"Total Committed This Round: $X,XXX"`. This should update in real time as the player adjusts quantities or staff.

**3. Fix timer: pause the game when the phase timer hits zero, do not auto-advance:**
In `src/components/game/RoundHeader.tsx`, when the countdown timer reaches `0`, do **not** auto-navigate or call any advance function client-side. Instead, show a `"Time's up — waiting for professor"` message. The professor controls phase advancement; the timer reaching zero is informational only.

**4. Option to extend the round (+1 minute button) — Professor only:**
In `src/pages/ProfessorPage.tsx`, add an `"+ 1 Min"` button next to the phase timer display. On click, call a `extendPhase` callable (see BE-N02) with `{ gameId, extraSeconds: 60 }`. Disable this button during `simulating` and `game_over` phases.

**5. Competitor CSV purchase:**
Add a `"Buy Competitor Intel — $5,000"` button in the Decisions sidebar (visible to the Finance role only). On click:
- Show a confirmation dialog: `"Spend $5,000 to see all teams' submitted quantities and prices from the last round?"`
- On confirm: call the `purchaseCompetitorInsight` callable (see BE-N03) with `{ gameId, round: currentRound - 1 }`.
- On success: display the returned CSV data in a modal table (team name | product | quantity | price), then allow download as a `.csv` file.

---

### FE-N10 — Auction: Phase Order (Auction Before Decisions)

**Files:** `src/pages/GamePage.tsx`, `src/pages/AuctionPage.tsx`, `src/components/GamePhaseListener.tsx`

The current phase order is `email → decide → bid_ad → bid_chef → roster → simulating → results_ready`. The auction should run **before** decisions.

**Required order:** `email → bid_ad → bid_chef → roster → decide → simulating → results_ready`

**Front-end changes needed when BE-N01 ships the reordered backend:**
1. In `GamePhaseListener.tsx` (or `useGamePhaseNav.ts`), update the navigation map so `bid_ad` and `bid_chef` navigate to `/auction` from the email phase, and `decide` navigates to `/game` only after the roster phase.
2. In `AuctionPage.tsx`, update any instructional copy that currently says "before decisions" — it should now be the natural first step, so the copy can simply say `"Bid now to secure your ads and chefs for this round."`.
3. The `AdWinnerBanner` component (currently shown at the top of the decide phase) should still work because auction results are resolved before the decide phase — no change needed there.

Note: This task is blocked on BE-N01. Do not implement the frontend navigation change until the backend phase order is confirmed deployed.

---

### FE-N11 — Auction: Fix "0" Display Bug for Chef Bids

**File:** `src/pages/AuctionPage.tsx`

When a player types a bid for a chef, the input field briefly or persistently shows `"0"` rather than the typed value. This is likely caused by `parseInt(e.target.value) || 0` returning `0` when the input is a partial string (e.g. the user typed `"1"` and the field shows `"0"` for a frame).

**Fix:** Change the bid input value binding to use a string state (not a number) so partial inputs render correctly:

```tsx
// Replace:
value={pendingChefBids[chef.id] ?? 0}
onChange={(e) => setChefBid(chef.id, parseInt(e.target.value, 10) || 0)}

// With:
value={chefBidInputs[chef.id] ?? ''}
onChange={(e) => {
  const raw = e.target.value;
  setChefBidInput(chef.id, raw);                          // string state for display
  const parsed = parseInt(raw, 10);
  if (!isNaN(parsed) && parsed >= 0) setChefBid(chef.id, parsed);  // number state for submission
}}
```

Maintain two separate state slices: `chefBidInputs: Record<string, string>` (what the input shows) and `pendingChefBids: Record<string, number>` (what gets submitted). The submit handler reads from `pendingChefBids`.

---

### FE-N12 — Auction: Ad Thematic Taglines and Ownership Description

**File:** `src/pages/AuctionPage.tsx`

Currently the ad cards show generic descriptions (`"Reaches the most customers"`, etc.). Replace with thematic copy that fits the bakery setting. Also add an ownership explanation above the ad cards section.

**Thematic taglines (replace the `desc` field in `AD_CARDS`):**

```ts
const AD_CARDS: readonly AdCard[] = [
  { id: "TV",        label: "Television",  icon: "/assets/ads/tv.svg",
    desc: "Make your advertisements come to life with motion pictures!" },
  { id: "Radio",     label: "Radio",       icon: "/assets/ads/radio.svg",
    desc: "A few rhymes and a good chime will be sure to reel in loyal customers." },
  { id: "Newspaper", label: "Newspaper",   icon: "/assets/ads/newspaper.svg",
    desc: "Extra! Extra! Read all about it — at least let's hope they do." },
  { id: "Billboard", label: "Billboard",   icon: "/assets/ads/billboard.svg",
    desc: "Plant your brand right in their path. Hard to miss, impossible to forget." },
];
```

**Ownership description** — add this paragraph above the ad cards grid:

```tsx
<p className="auction-page__ad-description">
  The highest bidder for each ad holds it for the entire round — one full month of exclusive
  reach. Ownership resets every auction, so no team can hold a slot forever. May the best
  bid win!
</p>
```

---

### FE-N13 — Auction: $ Prefix Outside Input and Wider Bid Field

**File:** `src/pages/AuctionPage.tsx` and `src/styles/global.css`

**1. $ sign outside the input:**
The dollar sign is currently inside the input (`placeholder="$0"`). Wrap each bid input in a flex container with a fixed `$` prefix:

```tsx
<div className="auction-page__bid-wrapper">
  <span className="auction-page__bid-prefix">$</span>
  <input
    type="number"
    className="auction-page__bid-input"
    placeholder="0"
    min={0}
    value={...}
    onChange={...}
  />
</div>
```

```css
.auction-page__bid-wrapper { display: flex; align-items: center; gap: 4px; }
.auction-page__bid-prefix  { font-weight: bold; font-size: 1rem; line-height: 1; }
.auction-page__bid-input   { width: 130px; }
```

**2. Wider bid input:**
The current input is too narrow to show a 6-digit number. Set `width: 130px` minimum (or `min-width: 130px` if the layout is flexible). Verify that a bid of `$250,000` is fully visible without clipping.

---

### FE-N14 — Auction: Timer Expired Popup and Input Lock

**File:** `src/pages/AuctionPage.tsx`

**1. Popup when timer runs out:**
The auction tab has a `remaining` countdown. When `remaining` reaches `0`, show a toast or inline message that overlays the bid inputs:

```tsx
{timerExpired && (
  <div className="auction-page__timer-expired" role="alert">
    Auction timer is up! Results will be displayed shortly.
  </div>
)}
```

Auto-dismiss after 4 seconds. CSS: fixed position, centered, high contrast (dark background, white text, large font).

**2. Disable all inputs after timer:**
When `timerExpired === true`, set `disabled={true}` on every bid `<input>` and every submit button (both per-chef and the global submit). Any submit attempt while `timerExpired` is true should not call the callable — instead show the same expired message.

**3. Allow re-submission until timer expires:**
Remove any client-side logic that permanently disables a bid input or marks bids as "locked" after first submission. Players can change bids and re-submit as many times as they want while `timerExpired === false`.

---

### FE-N15 — Auction: Individual Submit + Submit All Bids Buttons

**File:** `src/pages/AuctionPage.tsx`

Currently there is a single `"Submit Bids"` button at the bottom. Extend this:

**1. Per-chef "Submit Bid" button:**
Add a small `"Submit"` button directly on each chef card's action slot (the `action` prop of `ChefCard`):
```tsx
action={
  <button
    className="btn btn--small chef-card__submit"
    disabled={timerExpired || !pendingChefBids[chef.id]}
    onClick={() => handleSubmitSingleChefBid(chef.id)}
  >
    Submit Bid
  </button>
}
```

`handleSubmitSingleChefBid(chefId)` calls `submitBids` with only that chef's bid.

**2. Keep global "Submit All Bids" button:**
Rename the existing bottom button from `"Submit Bids"` to `"Submit All Bids"`. It submits all pending ad and chef bids in one call.

---

### FE-N16 — Results Screen: Leaderboard, Metric Cards, Single CSV Button

**File:** `src/pages/phases/ResultsPhase.tsx`

**1. Leaderboard panel:**
Add a ranked standings section at the bottom of the results screen. Read from the leaderboard state in `GameContext` (populated by the `useGameListener` leaderboard subscription). Render as:
```tsx
<div className="results-phase__leaderboard">
  <h3 className="results-phase__section-title">Standings</h3>
  {leaderboard.map((entry, i) => (
    <div key={entry.uid} className="results-phase__rank-row">
      <span className="results-phase__rank">#{i + 1}</span>
      <span className="results-phase__team-name">{entry.displayName}</span>
      <span className="results-phase__team-revenue">
        ${entry.cumulativeRevenue.toLocaleString()}
      </span>
    </div>
  ))}
</div>
```

**2. Metric cards:**
Replace the current plain `results-phase__stat` label/value rows with large visual cards. Each card has a prominent number, a smaller label, and a background tint per category:
```css
.results-phase__metric-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.results-phase__metric-card  { padding: 1.5rem; border-radius: 8px; text-align: center; }
.results-phase__metric-value { font-size: 2rem; font-weight: bold; display: block; }
.results-phase__metric-label { font-size: 0.85rem; color: #555; }
.results-phase__metric-card--revenue  { background: #f0fdf4; }
.results-phase__metric-card--cost     { background: #fff7ed; }
.results-phase__metric-card--customer { background: #eff6ff; }
```

**3. Single CSV download button:**
Search `ResultsPhase.tsx` for any secondary mail icon, email link, or duplicate download trigger. Remove it. Keep only the primary large `"Download CSV"` button. There should be exactly one CSV action on this screen.

---

### FE-N17 — Fix Round 2 Displaying Round 1 Data

**Files:** `src/hooks/useGameListener.ts`, `src/pages/phases/ResultsPhase.tsx`, `src/pages/AuctionPage.tsx`

**Bug:** When the game advances to Round 2, some screens continue to show Round 1 data (ad winners, decisions).

**Root cause checklist:**

1. In `useGameListener.ts`, find the `onSnapshot` listener that subscribes to the player's round result document (e.g. `players/{uid}/rounds/round_{N}`). Verify its `useEffect` dependency array includes `currentRound`. If it does not, it will stay subscribed to `round_1` forever. Fix: `useEffect(() => { ... }, [gameId, uid, currentRound])`.

2. In `AuctionPage.tsx`, find any subscription to `rounds/round_{N}`. Verify `currentRound` is in the dependency array of the `useEffect` wrapping the `onSnapshot` call.

3. In `GameContext.tsx`, check the `ADVANCE_ROUND` reducer case. When the round advances, reset `roundResults` to `[]` (or filter to only keep results from completed rounds) so stale data from the previous round is not rendered on the new round's results screen.

---

### FE-N18 — In-Play Round: 2-Minute Animated Simulation Screen

**File:** `src/pages/phases/SimulatePhase.tsx`

Currently this screen shows only a spinner with `"Kitchen is busy…"`. Replace it with a 2-minute animated visual representing a full month of bakery operation.

**Layout:**
- **Left panel** — live menu display. Shows all active products with their names and icons. Once a product "sells out" (track a simulated depletion), stamp it with a red `"SOLD OUT"` overlay badge. The depletion timing should be randomised per product but all sell out by day 25–28.
- **Centre panel** — bakery visual. Display the team's ad (read `adWon` from `GameContext` and show the matching ad SVG from `public/assets/ads/`). Animate pixel-art customer sprites walking in during the day. Use the existing `customer-walk-spritesheet.svg` asset from `assets/svg/characters/`.
- **Right panel** — live status. Show the four maintenance bars (`cleanliness`, `ovenHealth`, `slicerHealth`, `espressoHealth`) animating gradually downward over 2 minutes, starting from the values in `GameContext.maintenanceBars`. Do not read live Firestore values — simulate the decay client-side for visual effect only.
- **Top bar** — revenue counter. Starts at `$0` and animates upward to `latest.revenueNet` (if known from a prior result) or a placeholder amount. Use a smooth `requestAnimationFrame` counter that reaches the target by the last 10 seconds.

**Day/night cycle:**
- 30 days × 4 seconds each = 120 seconds total.
- During the first 3 seconds of each day: bright background, customers walking in/out.
- During the last 1 second of each day: dark/night background, no customers, bakery lights on.
- Show a small day counter: `"Day X / 30"` in the top corner.
- Use CSS animation (`@keyframes`) for the background colour shift: day = `#fff7e6` (warm cream), night = `#1a1a2e` (dark navy).

**Implementation notes:**
- All animation is purely client-side and cosmetic — it does not wait for or reflect real simulation results.
- Use a single `useEffect` with a `setInterval` that ticks every 4000ms to advance the day counter.
- When the 120-second timer completes, the component does not navigate — phase navigation is handled by `GamePhaseListener` when the backend writes `results_ready`.
- Use `prefers-reduced-motion` media query to disable the day/night cycle and customer animation for accessibility, showing just the day counter and revenue bar.

---

## BACK-END TASKS

**Stack:** Firebase Cloud Functions v2, Node.js 22
**Entry point:** `games/bakery-bash/backend/functions/index.js`
**Modules:** `backend/functions/modules/`
**Rules for every function:** never hardcode game params — read from `config/params`. All monetary values as numbers. Timestamps via `FieldValue.serverTimestamp()`.

---

### BE-N01 — Phase Order Change: Auction Before Decisions

**File:** `games/bakery-bash/backend/functions/modules/phases.js`

**Current order:** `email → decide → bid_ad → bid_chef → roster → simulating → results_ready`
**Required order:** `email → bid_ad → bid_chef → roster → decide → simulating → results_ready`

In `phases.js`, find the `PHASE_ORDER` array (or equivalent transition map) and update it to place `bid_ad`, `bid_chef`, and `roster` before `decide`.

**Acceptance criteria:**
- `advanceGamePhase` called on a game in `round_N_email` transitions to `round_N_bid_ad`.
- `round_N_roster` transitions to `round_N_decide`.
- `round_N_decide` transitions to `simulating`.
- All existing lifecycle tests in `backend/functions/modules/__tests__/test-lifecycle.js` pass with the new order (update the expected sequence in the tests).

---

### BE-N02 — `extendPhase` Callable (Professor +1 Minute)

**File:** `games/bakery-bash/backend/functions/index.js`

**New callable:** `exports.extendPhase = onCall(async (request) => { ... })`

**Input:** `{ gameId: string, extraSeconds: number }`

**Steps:**
1. Require professor auth (`request.auth.uid === game.professorUid` or has `professor: true` custom claim).
2. Read the game doc. Verify it is in an active round phase (not `lobby`, `simulating`, `game_over`).
3. Cap `extraSeconds` at 300 (5 minutes max per extension).
4. Update `game.phaseEndsAt = Timestamp.fromMillis(game.phaseEndsAt.toMillis() + extraSeconds * 1000)`.
5. Return `{ success: true, newPhaseEndsAt: updatedTimestamp }`.

---

### BE-N03 — `purchaseCompetitorInsight` Callable

**File:** `games/bakery-bash/backend/functions/index.js`

**New callable:** `exports.purchaseCompetitorInsight = onCall(async (request) => { ... })`

**Input:** `{ gameId: string, round: number }`

**Steps:**
1. Require auth. Only callable during `round_N_decide` phase (to prevent early-game intel).
2. Verify `round` is ≥ 1 and < `currentRound` (cannot buy intel for the current round, only past rounds).
3. Read `config.competitorInsightCost` (default: 5000 if not set).
4. Deduct `competitorInsightCost` from the calling player's `budgetCurrent`. If insufficient funds, throw `failed-precondition` with message `"Insufficient budget to purchase competitor insight."`.
5. Query all players' decision documents at `/games/{gameId}/players/{uid}/decisions/round_{round}`.
6. Build and return a CSV string with columns: `team_name, product, quantity, price`. Include all teams' decisions for that round.
7. Write a record to `/games/{gameId}/players/{callerUid}/purchases/insight_round_{round}` so the transaction is auditable.
8. Return `{ csv: string, costDeducted: number }`.

---

### BE-N04 — Server-Side Timer Enforcement for Bids

**File:** `games/bakery-bash/backend/functions/index.js` — function `submitBids`

At the start of `submitBids`, read the game doc and check `phaseEndsAt`:

```js
const phaseEnd = game.data().phaseEndsAt;
if (phaseEnd && Timestamp.now().toMillis() > phaseEnd.toMillis()) {
  throw new HttpsError(
    "failed-precondition",
    "The auction timer has expired. No more bids are accepted."
  );
}
```

Return the error message exactly as written above — the frontend uses this string to trigger the timer-expired popup (FE-N14).

---

### BE-N05 — Market Watch Elasticity Integration

**Files:** `games/bakery-bash/backend/functions/modules/round-preferences.js`, `games/bakery-bash/backend/functions/modules/customer-allocation.js`

**Goal:** Products flagged as "in demand" in the round's `marketInsights` should drive a foot traffic multiplier in the simulation.

**Rule:** For each product marked as `trending: true` in `rounds/round_{N}.marketInsights.trendingProducts`:
- Apply a **2× customer attractiveness multiplier** to players who stocked that product (i.e. `quantities[product] > 0`).
- Apply a **0.85× multiplier** to foot traffic for products that are *not* trending in this round (representing customers shifting demand away from those items).

**Implementation:**
1. In `round-preferences.js`, when generating `marketInsights`, write `trendingProducts: string[]` (array of product keys) to the round doc. Pick 1–2 products at random per round weighted by a configurable `trendWeight` in `config/params`.
2. In `customer-allocation.js`, inside `computeAttractiveness` (or equivalent), read `trendingProducts` from the round doc and apply the multipliers above to the attractiveness score per player per product.
3. The multiplier values (`2.0` for trending, `0.85` for non-trending) should be stored in `config/params` as `marketInsights.trendBoost` and `marketInsights.trendPenalty` so they can be tuned without a deploy.

---

### BE-N06 — Curveball: Burglar Event on Maintenance Deficit

**File:** `games/bakery-bash/backend/functions/modules/simulation.js`

**New mechanic:** If a player ends a round with `cleanliness_pct < 20` (configurable as `config.curveballs.burglaryThreshold`), there is a chance a burglar event fires, reducing their next-round starting budget.

**Implementation:**
1. After maintenance decay is applied in `simulateRound`, check each player's `cleanliness_pct`.
2. If below threshold, roll `Math.random()`. If below `config.curveballs.burglaryChance` (default `0.25` — 25% chance), trigger the burglar.
3. Deduct `config.curveballs.burglaryAmount` (default `$10,000`) from the player's `budgetCurrent`.
4. Add `burglary: true` and `burglaryAmount: number` to the player's `RoundResultDocument` for the round.
5. The frontend reads `result.burglary` in `ResultsPhase.tsx` and shows a banner: `"🔓 Your bakery was broken into! A maintenance deficit left you vulnerable. –$10,000."`
6. Add `curveballs: { burglaryThreshold: 20, burglaryChance: 0.25, burglaryAmount: 10000 }` to `GameConfigDocument` defaults in `firestore-schema.js`.

---

### BE-N07 — Team Logo Storage Support

**File:** `games/bakery-bash/backend/firestore.rules` and `games/bakery-bash/backend/functions/index.js`

**Firebase Storage rules:** Add a rule allowing authenticated users to upload to `teams/{gameId}/{teamNumber}/logo.*`. Max file size: 2MB. Allowed content types: `image/png`, `image/jpeg`, `image/webp`.

**Firestore:** In `joinGame` (or wherever the player doc is created), accept an optional `logoUrl: string | null` field in the callable input. If provided, write it to the player document as `teamLogoUrl`. No validation needed beyond ensuring it is a string that starts with `https://firebasestorage.googleapis.com`.

---

## What changed (from original `new_changes_Apr_21_pt2` PR)

This PR replaces the earlier version of `new_changes_Apr_21_pt2` which attempted to include code changes and caused merge conflicts. This version is **description-only** — it documents tasks for AI agents and developers without modifying any source files.

**Also incorporated from `feature/ui-polish-chefs-briefing-stations` (PR #44):**
- 12-chef pool — confirmed shipped in that branch, removed from this task list
- Horizontal chef card strip — confirmed shipped, removed
- Round briefing modal styled — confirmed shipped, removed
- Station layout fix — confirmed shipped, removed

**New tasks added from April 22 playtesting notes:**
- FE-N05 (deselect role on join screen)
- FE-N07 (ready-to-advance professor indicator)
- FE-N08 (market watch elasticity on briefing screen)
- FE-N09 (decisions: item cost, total, timer fix, extend button, competitor CSV)
- FE-N10 (auction phase order change)
- FE-N11 (auction bid "0" display bug)
- FE-N18 (2-minute in-play animation screen)
- BE-N01 (phase order rewrite)
- BE-N02 (extendPhase callable)
- BE-N03 (purchaseCompetitorInsight callable)
- BE-N04 (server-side bid timer enforcement)
- BE-N05 (market watch elasticity in simulation)
- BE-N06 (burglar curveball mechanic)
- BE-N07 (team logo storage)

---

## Testing Checklist

- [ ] `npm run dev` — no TypeScript errors on startup
- [ ] Navigate to `/how-to-play` — 4 stage cards visible with correct copy
- [ ] Phase banner in `RoundHeader` shows correct label for each phase
- [ ] Join screen: select a role, then click "Clear" — role resets to unassigned
- [ ] Join screen: upload a logo image — preview appears, logo URL submitted with `joinGame`
- [ ] Decisions screen: item costs visible per product, running total updates on qty change
- [ ] Timer reaches 0 in decisions — no auto-advance, "waiting for professor" message shown
- [ ] Professor: `"+ 1 Min"` button adds 60s to the phase timer
- [ ] Professor: `"🟢 All teams ready"` shows only when all teams have submitted
- [ ] Auction: bid `"0"` bug — type a number and confirm it displays correctly without flashing 0
- [ ] Auction: timer expires — all inputs disabled, popup appears, re-submit blocked
- [ ] Auction: individual Submit Bid on a single chef works; Submit All Bids works
- [ ] Results: leaderboard visible, metric cards render with background tints, only one CSV button
- [ ] Round 2: confirm no Round 1 data appears on results or auction screens
- [ ] Simulate phase: day/night cycle runs for 30 days, revenue counter animates
- [ ] Backend: `extendPhase` callable tested in emulator
- [ ] Backend: `purchaseCompetitorInsight` deducts $5,000 and returns CSV
- [ ] Backend: `submitBids` after `phaseEndsAt` returns `failed-precondition` with expected message
- [ ] Backend: trending product doubles attractiveness for players who stocked it
- [ ] Backend: burglar fires at ≤20% cleanliness with 25% probability, deducts $10,000

---

## Checklist

- [ ] Code reviewed by AI and manually
- [ ] No console errors or warnings
- [ ] Tested on desktop and mobile browsers
- [ ] Commit messages follow conventions (present tense, imperative)
- [ ] All new BEM class names added to `global.css`
- [ ] No hardcoded game parameters — all in `config/params`
- [ ] `PHASE_LABELS` mapping in `RoundHeader.tsx` covers all phases including new order
- [ ] `curveballs` config block added to `GameConfigDocument` defaults
- [ ] Firebase Storage rules updated for team logo uploads
