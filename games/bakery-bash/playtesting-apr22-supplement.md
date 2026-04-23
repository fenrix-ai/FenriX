# Bakery Bash — Playtesting (Apr 22) Supplement

> **Read [playtesting-apr22-remaining-tasks.md](playtesting-apr22-remaining-tasks.md) first.** Dylan's consolidated doc is the source of truth for the May 1 session. This file only adds items from a separate playtesting review that are **not already covered** there.
>
> Task IDs use the `-S##` suffix ("supplement") to avoid collision with Dylan's `-R##` IDs.

**Date:** 2026-04-22
**Branch base:** `feat/playtesting-apr22-tasks`
**Target:** May 1, 2026 live session (P0) + follow-on polish (P1)

---

## Contradictions / Coordination Points (Read Before Starting)

Three items from the playtesting review conflict with decisions already made in Dylan's doc or recently-shipped PRs. Resolve these before picking up the related supplement tasks.

### C-1 — Mail icon removal vs. CSV archive modal
**Dylan's FE-R08** removes the CSV mail icon from `RoundHeader` entirely and keeps only the Results-screen Download CSV button. The supplement's **FE-S01 (Data Purchase Store)** introduces *purchased* CSVs (Tier 1 / Tier 2 chef datasets) that need somewhere to be re-downloaded after purchase.

**Resolution (recommended):** Do NOT reinstate the header mail icon. Instead, surface purchased CSVs as a small expandable list on the **Results screen** next to the existing Download CSV button, and also as a persistent list inside the Data Store panel itself (FE-S01) labeled `"Your Purchased Datasets"`. Confirm with product before implementing.

### C-2 — Burglar trigger: cleanliness-threshold vs. rank-scaled probability
Currently shipped (commits `438ce4a` + `6d4868c`): Burglar fires when cleanliness ≤ 40%. Fixed probability above that threshold, tied to hygiene.

Playtesting review asked for a **rank-scaled probability** model: top-of-leaderboard team has ~8% chance; bottom has ~0.05% chance. Motivation: *"Successful bakeries get robbed."*

**Resolution (recommended):** Replace the cleanliness-threshold model with the rank-scaled model — see **BE-S02**. The cleanliness → foot-traffic penalty stays, but becomes part of **Food Safety Inspection** (BE-S01), not burglary. Confirm with product before changing the existing mechanic.

### C-3 — "Reset Game" button removal
Dylan's doc lists `resetGame` + its UI button as shipped via PR #42. Playtesting review asked to **remove** the Reset Game button because it is redundant with End Game.

**Resolution:** Straightforward — see **FE-S10** and **BE-S06**. Just call out that this undoes recent PR #42 work so the author is aware.

---

## 🚧 Frontend — Supplement Tasks

Stack + CSS conventions: same as Dylan's doc.

### FE-S01 — Data Purchase Store (Decisions phase)  (P1)

**New feature.** Teams spend in-game budget to buy one-time CSV datasets during the Decisions phase.

**Files:**
- New: `app/src/components/game/DataStorePanel.tsx`
- `app/src/pages/GamePage.tsx` — mount the panel and its trigger
- `app/src/lib/csv.ts` — reuse download helper

**Steps:**
1. Add a `"Buy Data"` button in the Decisions sidebar (below the budget summary). Clicking opens `DataStorePanel` modal.
2. Modal contains two cards:
   - **Tier 1 — Chef Specialty Guide — $15,000**
     Body: *"Reveals which chef nationalities specialize in which products (male/female portraits included)."*
   - **Tier 2 — Comprehensive Chef Profiles — $60,000**
     Body: *"30+ chef profiles per nationality with monthly production, satisfaction, sous chef count, cleanliness, and revenue stats. Build a real predictive model."*
3. Each card's purchase button:
   - Disabled + reads `"Owned ✓"` if the team already owns the tier (`team.purchasedDatasets` contains it).
   - Disabled + reads `"Insufficient budget"` if `budgetCurrent < price`.
   - On click, calls `purchaseDataset` callable (see **BE-S04**) with `{ gameId, teamId, tier }`.
   - On success: update local budget from the returned `{ budgetCurrent }`, download the returned `csvContent` via `src/lib/csv.ts`, show a toast `"Dataset purchased"`.
4. Below the two cards, render a `"Your Purchased Datasets"` list with a re-download button for each owned tier (see C-1).
5. Do **not** hardcode `15000` / `60000` in the component. Read prices from the game document's `dataStorePrices` (mirrored from backend config).

**Acceptance:** During a `decide` phase, the "Buy Data" button opens the panel. Purchases deduct budget, trigger a CSV download, and persist as owned across the rest of the game (no double-purchase). Unowned tiers show the correct price.

**Depends on:** BE-S04.

---

### FE-S02 — Date System Display on Email / Briefing + Event Cards  (P0)

**Files:**
- `app/src/pages/EmailPhasePage.tsx` — show month name
- `app/src/pages/phases/ResultsPhase.tsx` — show event dates (used by FE-S03)

**Steps:**
1. On the email/briefing screen, render the round's month name below the `"Round N"` hero, e.g. `"Entering January"`. Source: new `roundResults[currentRound - 1].month` field (see **BE-S07**) or direct lookup from `ROUND_MONTHS` config shared with the client.
2. Wherever a curveball event is shown (FE-S03), display the event's `date` string (e.g., `"January 14"`) prominently on the card.

**Acceptance:** Each round's briefing shows `"Entering {Month}"`. Event cards show the actual calendar date of the event, not the day number.

**Depends on:** BE-S07.

---

### FE-S03 — Results Screen: Events Section (Food Inspector + Burglar Cards)  (P0)

Dylan notes a burglar *banner* on Simulate + Results already. This task replaces/augments that with a dedicated **Events** section on the Results page that renders **cards** for each curveball.

**File:** `app/src/pages/phases/ResultsPhase.tsx`
**Assets:** new — see ASSETS section.

**Steps:**
1. Below the existing metric cards, add a section heading `"Events"`. Show only if `roundResults[current].events?.length > 0`.
2. For each entry in `events`, render a card:
   - **`food_inspection`:** asset = `/assets/events/food-inspector.svg`, title `"Food Safety Inspection"`, body = date, cleanliness %, rating badge (Excellent green / Compliant yellow / Needs Improvement orange / Hazardous red), and traffic penalty (e.g., `"-10% foot traffic"`).
   - **`burglary`:** asset = `/assets/events/burglar.svg`, title `"Burglary"`, body = date of robbery + amount stolen (currency-formatted).
3. Replace the existing flat burglar banner with these cards (keep the Simulate-screen banner from commit `6d4868c` unchanged — it's live during the sim animation).

**Acceptance:** If a round triggers an inspection and/or burglary, the Results page shows one card per event with the matching asset, date, and details.

**Depends on:** BE-S01, BE-S02, BE-S05.

---

### FE-S04 — Results Timer Text Fix  (P0)

**File:** `app/src/pages/phases/ResultsPhase.tsx`

**Steps:**
1. Change the pre-advance countdown string from `"Last Chance to Submit: __ s"` to `"Seconds until next round: __ s"`. There are no submissions on Results.

**Acceptance:** Countdown on Results reads `"Seconds until next round: …"`.

---

### FE-S05 — Progress Bar (game-loop indicator)  (P1)

**New component.** Horizontal progress bar with a croissant tracker that advances through major milestones.

**Files:**
- New: `app/src/components/game/ProgressBar.tsx`
- `app/src/components/game/RoundHeader.tsx` — mount below the phase banner
- `app/public/assets/products/croissant.svg` — reuse

**Steps:**
1. Bar is divided into `4 × totalRounds` sections. Per round: **Auction → Decisions → Simulation → Results**.
2. Completed milestones = solid yellow fill + full-opacity croissant icon. Upcoming = low-opacity yellow + low-opacity croissant. Between sections place a divider croissant at low opacity.
3. Map `phase` to milestone:
   - `bid_ad`, `bid_chef` → Auction
   - `decide` → Decisions
   - `simulating` → Simulation
   - `results_ready` → Results
   - `email`, `roster` → roll into the adjacent milestone (do not render their own section).
4. Hide on `LandingPage`, `LobbyPage`, `TeamPage`, `ConclusionPage`.

**Acceptance:** Throughout gameplay, a yellow progress bar with croissant icons visually shows which milestone of which round the team is in.

---

### FE-S06 — How to Play: Simulation Card + Results Curveball Recap + "Bidder" Copy Audit  (P1)

**File:** `app/src/pages/HowToPlayPage.tsx`

Dylan confirms the page exists with 4 cards and the role label is already "Bidder". This task only adds the missing content beats from the playtesting review.

**Steps:**
1. Add a 5th card **Simulation** between Chef Auction and Results: *"See your bakery come to life! Spectate a simulation of your bakery running over the course of a month."*
2. In the Ad Auction card, add a one-liner: *"Each ad type attracts a different level of foot traffic — factor this into your model."*
3. In the Chef Auction card, add: *"Specialty chefs are not assigned to a station — their production contributes to overall output. Only sous chefs work stations."*
4. In the Results card, add: *"Curveball events may appear here — including Food Safety Inspections and Burglaries. Download your round CSV for one row per simulated day."*
5. Audit the page for any remaining `"Your Advertising Teammate…"` copy and change it to `"Your Bidder Teammate…"`.

**Acceptance:** 5 cards in order: Ad Auction → Chef Auction → Simulation → Decisions → Results. Copy additions above are visible. No `"Advertising Teammate"` string remains.

> **Note:** Verify the current order of Decisions vs. Simulation — Dylan's `PHASE_ORDER` is `bid_ad → bid_chef → roster → decide → simulating`. How-to-Play should match that flow: **Ad Auction → Chef Auction → Decisions → Simulation → Results**.

---

### FE-S07 — Professor Panel: +1 Minute Pre-Game Disable + Colored Background  (P0)

**File:** `app/src/pages/ProfessorPage.tsx`

**Steps:**
1. Disable the `"+1 Minute"` button when `phase === 'lobby'` or no game exists. Apply the same opaque / `:disabled` styling used on other pre-game-unavailable buttons.
2. Add a solid warm-cream background panel (e.g., `background: var(--cream)`) behind the control panel content so text stops washing out against the page background.

**Acceptance:** `"+1 Minute"` is visibly disabled pre-game; professor text is legible against a distinct panel background.

---

### FE-S08 — Professor Panel: Remove Round-Transition Lock  (P0)

**File:** `app/src/pages/ProfessorPage.tsx`

**Problem:** The professor panel currently disables controls during the round grace/freeze window (shared with the player timer). The professor should never be locked.

**Steps:**
1. Audit every button for `isPhaseLocked` / `phaseTransitioning` / `graceActive` gating and remove it from professor-only actions (`advance`, `pause`, `resume`, `extend`, `end`).
2. Keep the read-only `"Phase transitioning…"` banner if useful for context, but do not disable controls.

**Acceptance:** The professor can hit Advance / Pause / Resume / +1 Min / End at any point, including during the 5s grace and 10s freeze windows.

---

### FE-S09 — Round 1 Email Auto-Advance (5s)  (P1)

**File:** `app/src/pages/EmailPhasePage.tsx`

**Problem:** Round 1's email screen stalls until the backend auto-advances (~30s depending on phase duration). Players want it to skip quickly.

**Steps:**
1. On mount during `currentRound === 1 && basePhase === 'email'`, start a 5s countdown.
2. When the countdown hits zero, either (a) trigger the existing advance-phase callable if the client can (preferred), or (b) show a `"Ready to start — waiting for professor…"` message and rely on backend auto-advance at the phase duration.
3. Render a visible `"Starting in Ns…"` text during the countdown.

**Acceptance:** Round 1 email screen advances (or surfaces a ready state) 5s after it renders.

> Confirm with backend team whether FE can trigger phase advance or whether this requires shortening Round 1's `email` phase duration in config (e.g., `phaseDurations.email_r1: 5`).

---

### FE-S10 — Remove "Reset Game" Button  (P0)

**File:** `app/src/pages/ProfessorPage.tsx`

**Problem:** Reset Game and End Game serve the same purpose (wipe round state, close the game). Having two buttons confused playtesters.

**Steps:**
1. Delete the Reset Game button and any handler it calls.
2. Keep End Game and verify its handler cleanly finalizes the game (transitions to `game_over`, finalizes leaderboard).

**Note:** This undoes part of PR #42. Notify that PR's author.

**Acceptance:** Only End Game is visible in the professor panel.

**Depends on:** BE-S06.

---

### FE-S11 — Team Page: Multi-Role Claim  (P1)

**File:** `app/src/pages/TeamPage.tsx`

Dylan's doc confirms **deselection** is already shipped (`× Clear`). This task adds **multi-role** support so a 2-person team can cover all three roles.

**Steps:**
1. Allow a single player to hold multiple roles *simultaneously* as long as each role isn't already held by a teammate.
2. Render three states per role button:
   - **Owned by current player:** filled + checkmark. Clicking deselects (existing behavior).
   - **Owned by another teammate:** greyed out + teammate's display name.
   - **Unclaimed:** default clickable.
3. Update `GameContext`'s `player.role` usage — it becomes `PlayerRole[]`. Wrap single-role reads at the boundary: `roles = Array.isArray(player.role) ? player.role : player.role ? [player.role] : []`.
4. Update `SubmissionLock` and any phase-gating components to check membership (`roles.includes('advertising')`) rather than equality.

**Acceptance:** On a 2-player team, one player can claim both "Bidder" and "Finance" while the other claims "Operations". Phase-gating permits either player to submit for any role they hold.

**Depends on:** BE-S08.

---

### FE-S12 — Chef Auction Card: Horizontal Layout with Portrait + Name  (P1)

**File:** `app/src/components/game/ChefCard.tsx`

Dylan's FE-R03/R04 add sequential numbering and a multiplier table to the card but don't specify layout. Playtesting review asks for a **horizontal** card with the chef's portrait asset on the **left** and text on the right.

**Steps:**
1. Switch `.chef-card` from the current vertical layout to a two-column horizontal grid: left column = chef portrait SVG from `/assets/chefs/{nationality}-{gender}.svg`, right column = existing content (number badge, name, flag, nationality, skill badge, multiplier table from FE-R04).
2. Display the chef's name prominently at the top of the right column.
3. Keep specialties hidden (backend sanitation unchanged).
4. Ensure the card remains compatible with the grid used on `AuctionPage`; adjust `grid-template-columns` if the wider card breaks the layout (e.g., switch to `minmax(280px, 1fr)`).

**Acceptance:** Chef cards on the Auction page show the portrait on the left and all text info on the right. All existing FE-R03/R04 features remain visible.

---

### FE-S13 — Simulation Overhaul: Bakery Scene + Neutral Customers + Sellout Stamps  (P1)

**File:** `app/src/pages/phases/SimulatePhase.tsx`

Dylan confirms the 30-day animation and SOLD OUT stamps are already shipped. Playtesting review adds a fuller visual treatment.

**Steps:**
1. Add a composed bakery-scene background (register, counter, pastry display case, oven, barista bar with coffee + matcha) — new asset `/assets/scene/bakery-interior.svg`.
2. Place specialty chef portrait SVGs inside the kitchen area of the scene; scale with `staffCounts` (tiny count badges for sous chefs per station; a single maintenance figure using the existing `maintenance-guy.svg`).
3. Animate neutral customer figures moving through the counter area. New asset: `/assets/characters/customer.svg` (gender/race neutral). Density proportional to that day's foot traffic.
4. Keep the existing SOLD OUT stamp behavior. Verify menu quantity display is visible alongside the scene.
5. Tune animation pacing: ~200–300ms per simulated day so a 30-day month lasts 6–9 seconds (Dylan notes 2min elsewhere; confirm current duration and adjust if it feels too long or too short).

**Acceptance:** Simulate phase shows a full bakery interior with chefs, sous chef counts, maintenance, and animated customers. Menu items + SOLD OUT stamps still work.

> If art assets aren't ready, stub with labeled colored rectangles so layout + animation logic can land now and swap assets later.

---

### FE-S14 — Game Over Screen UI Polish  (P1)

**File:** `app/src/pages/ConclusionPage.tsx`

**Steps:**
1. Add a prominent winner announcement — trophy icon or celebratory banner above the winning team's name + logo.
2. Show full leaderboard with all teams ranked by cumulative revenue.
3. Expandable per-team per-round revenue breakdown.
4. Bakery-themed visual polish (confetti / pastry particles, warm palette, gentle animations).
5. Route any CSV download through the same helper used elsewhere (`src/lib/csv.ts`).

**Acceptance:** Game Over screen reads as a finished, polished endgame — not a debug summary.

---

## 🛠️ Backend — Supplement Tasks

### BE-S01 — Food Safety Inspection: 4-Tier Penalty Scale  (P0)

**New mechanic.** Cleanliness score drives a 4-tier rating that applies a foot-traffic penalty and generates an event for the Results screen.

**Files:**
- New: `backend/functions/modules/curveballs.js` (or extend whatever module currently owns burglar logic)
- `backend/functions/modules/simulation.js` — invoke pre-customer-allocation
- `backend/functions/modules/config.js` — tier constants

**Steps:**
1. Add to `config.js`:
   ```js
   FOOD_INSPECTION_TIERS: [
     { min: 95, max: 100, rating: 'Excellent',         trafficPenalty: 0.00 },
     { min: 80, max: 94,  rating: 'Compliant',         trafficPenalty: 0.05 },
     { min: 60, max: 79,  rating: 'Needs Improvement', trafficPenalty: 0.10 },
     { min: 0,  max: 59,  rating: 'Hazardous',         trafficPenalty: 0.15 },
   ]
   ```
2. Export `evaluateFoodInspection(cleanlinessPct, round, monthDays)`:
   - Compute tier from cleanliness.
   - Pick a random inspection day within the month (always run; even "Excellent" produces a clean card).
   - Return `{ type: 'food_inspection', date: getGameDate(round, day), cleanlinessPct, rating, trafficPenalty }`.
3. In `simulation.js`, apply `trafficPenalty` multiplicatively to foot traffic **before** customer allocation runs.
4. Push the event into `roundResults[].events` (see BE-S05).
5. Calibrate maintenance decay so that 1 "clean" maintenance guy reliably keeps cleanliness in Compliant range, and 2 keeps it Excellent.

**Acceptance:** Cleanliness 72% → rating "Needs Improvement", −10% foot traffic, event card on Results.

---

### BE-S02 — Burglar: Rank-Scaled Probability  (P1)

**Replaces** the current cleanliness-threshold burglar mechanic (commits `438ce4a` + `6d4868c`). See **C-2** above and confirm with product before shipping.

**Files:** `backend/functions/modules/curveballs.js`, `backend/functions/modules/simulation.js`, `backend/functions/modules/config.js`

**Steps:**
1. Add to `config.js`:
   ```js
   BURGLARY: {
     probTop: 0.08,        // rank 1
     probBottom: 0.0005,   // last rank
     stealPctMin: 0.05,
     stealPctMax: 0.15,
   }
   ```
2. Export `rollBurglar(rank, totalTeams, grossRevenue, round, monthDays, rng = Math.random)`:
   - Probability = linear interpolation between `probTop` and `probBottom` based on rank.
   - If rolled: random day in month, steal uniform random fraction between `stealPctMin` and `stealPctMax` of gross revenue. Return `{ type: 'burglary', date, amountStolen }`. Else return `null`.
3. `rank` input = **pre-simulation** rank (leaderboard entering the round). Tie-break by prior cumulative revenue.
4. In `simulation.js`, after gross revenue is computed, call `rollBurglar`, subtract `amountStolen` from `revenueNet`, append event to `roundResults[].events`.
5. Remove the cleanliness-triggered burglar path from `simulation.js` + the related config knobs added in commit `6d4868c`.
6. Unit tests with a seeded RNG across 10,000 rolls confirm probabilities within ±0.5% of spec.

**Acceptance:** Top-ranked team is burgled ~8% of rounds; bottom ~0.05%. Stolen amount always 5–15% of that round's gross. Cleanliness no longer triggers burglary.

---

### BE-S03 — Date System: Month-Length Days + `date` Column in CSV  (P0)

**Files:**
- New: `backend/functions/modules/date-utils.js`
- `backend/functions/modules/config.js` — `ROUND_MONTHS`
- `backend/functions/modules/simulation.js` — use month-length day count
- `backend/functions/modules/csv-export.js` — add `date` column

**Steps:**
1. Add to `config.js`:
   ```js
   ROUND_MONTHS: [
     { name: 'January',  days: 31 },
     { name: 'February', days: 28 },
     { name: 'March',    days: 31 },
     { name: 'April',    days: 30 },
     { name: 'May',      days: 31 },
   ]
   ```
2. Create `date-utils.js` with `getMonthForRound(round)` and `getGameDate(round, day)` (returns `"Month Day"`).
3. In `simulation.js`, replace the hardcoded 30-day loop with `getMonthForRound(round).days`. Adjust any downstream per-day averages that assumed 30.
4. In `csv-export.js`, make `date` the **first column** of each row, populated via `getGameDate(round, dayIndex + 1)`.
5. Attach `month` to the written round result so the frontend can show `"Entering {Month}"` (see FE-S02).
6. Update existing CSV snapshot tests for the new column and variable row counts.

**Acceptance:** Round 1 CSV has 31 rows starting `"January 1"`. Round 2 has 28 starting `"February 1"`. `roundResults[].month` is set.

---

### BE-S04 — `purchaseDataset` Callable + Tier 1/2 CSV Generators  (P1)

**New feature.** Backend for FE-S01.

**Files:**
- New: `backend/functions/modules/data-store.js`
- `backend/functions/index.js` — `exports.purchaseDataset`
- `backend/functions/modules/config.js` — prices

**Steps:**

1. Add to `config.js`:
   ```js
   dataStorePrices: {
     tier1_chefOverview: 15000,    // ~3% of $500k starting budget
     tier2_chefProfiles: 60000,    // ~12% of starting budget, ≈ advanced chef minBidFloor
   }
   ```
   Expose via the existing `numberOrDefault` override pattern.

2. **Tier 1 CSV** (static): columns `nationality, male_asset, female_asset, specialties`. Rows map directly to `CHEF_NATIONALITIES` in config (French → croissant, coffee; Japanese → matcha, croissant; Italian → sandwich, coffee; American → bagel, cookie).

3. **Tier 2 CSV** (generated): ≥120 rows (≥30 per nationality). Columns: `nationality, skill_level, avg_monthly_quantity_{product×6}, avg_satisfaction_score, avg_sous_chefs_worked_with, avg_cleanliness_score, purchase_price, avg_monthly_revenue`. Production per product reflects existing multipliers (novel/intermediate/advanced × specialty/nonSpecialty × base 30 u/day × 30 days), plus ±15% jitter seeded by `gameId` for deterministic re-downloads.

4. **Callable contract:**
   ```js
   exports.purchaseDataset = onCall(async (request) => {
     // input: { gameId, teamId, tier: 'tier1' | 'tier2' }
     // auth: caller must belong to teamId
     // phase: must be *_decide; else failed-precondition
     // budget: budgetCurrent >= price; else failed-precondition (no loan shark for data)
     // idempotency: if already owned, return { alreadyOwned: true, csvContent, ... }
     // on success: decrement budgetCurrent; push to team.purchasedDatasets
     // return: { budgetCurrent, csvContent, filename }
   });
   ```
   All mutation in a single Firestore transaction.

5. Data purchases **do not** count toward `totalSpent` for loan-shark purposes.

**Acceptance:** Calling `purchaseDataset` during a decide phase succeeds once per tier per team, decrements budget, persists ownership, and returns the CSV. Second call returns `alreadyOwned: true` with the same CSV content.

---

### BE-S05 — Event Persistence Shape for Results Cards  (P0)

**File:** `backend/firestore-schema.js`, `backend/functions/modules/simulation.js`

**Steps:**
1. Extend `RoundResult` with:
   ```ts
   events: Array<
     | { type: 'food_inspection', date: string, cleanlinessPct: number, rating: string, trafficPenalty: number }
     | { type: 'burglary', date: string, amountStolen: number }
   >
   ```
2. Write events atomically with the rest of the round result in `simulation.js` (same transaction as revenue / satisfaction).
3. Document the shape in `firestore-schema.js`.

**Acceptance:** Each player's round result contains an `events` array; FE-S03 can render cards directly from it.

**Depends on:** BE-S01, BE-S02, BE-S03.

---

### BE-S06 — Remove `resetGame` Callable  (P0)

**File:** `backend/functions/index.js`

**Steps:**
1. Delete `exports.resetGame` and its implementation (shipped in PR #42).
2. Confirm `endGame` fully handles lifecycle cleanup (transition → `game_over`, finalize leaderboard, settle budgets). If not, port any missing logic from `resetGame` into `endGame` before deletion.
3. Remove `resetGame` references from `firestore.rules` if any.

**Acceptance:** `resetGame` no longer exists; `endGame` handles all end-of-game cleanup.

---

### BE-S07 — Attach Month Name to Round Results  (P0)

Small task — spin-off of BE-S03 for frontend integration.

**File:** `backend/functions/modules/simulation.js`

**Steps:** When writing a round result, include `month: getMonthForRound(round).name`. Used by FE-S02.

**Acceptance:** `roundResults[N-1].month === 'January'` for round 1, etc.

---

### BE-S08 — Multi-Role Support (role array + permission updates)  (P1)

**Files:**
- `backend/firestore-schema.js` — update `PlayerDocument.role` to `PlayerRole[]`
- `backend/functions/index.js` — role claim/toggle callable
- `backend/functions/modules/phases.js` — `canSubmitDecision`, `canSubmitBids`, etc.

**Steps:**
1. Schema: `role: PlayerRole[]` (previously singular). No data migration required — games are short-lived; wrap reads at the boundary: `roles = Array.isArray(r) ? r : r ? [r] : []`.
2. Role toggle callable:
   - **Claim:** only if no other teammate holds the role. Append to caller's roles.
   - **Release:** remove from caller's roles.
   - **Blocked:** if another teammate holds the role, throw `already-exists`.
   - `solo` stays a special case (one player, all roles).
3. Update `phases.js` permission helpers to accept `roles: PlayerRole[]` and return true if **any** role in the array is permitted for the current phase.
4. Tests: claim, toggle-off, blocked-by-other-player, multi-role player submitting for multiple phases.

**Acceptance:** Two-player team can distribute 3 roles between them with any combination of ownership.

---

## ASSETS — New SVGs Required

| Asset | Path | Used By | Notes |
|-------|------|---------|-------|
| Food Inspector character | `app/public/assets/events/food-inspector.svg` | FE-S03 | Match existing chef illustration style. |
| Burglar character | `app/public/assets/events/burglar.svg` | FE-S03 | Playful/cartoony; on-theme with bakery. |
| Neutral customer | `app/public/assets/characters/customer.svg` | FE-S13 | Gender/race neutral; simple enough to repeat in a crowd animation. |
| Bakery interior scene | `app/public/assets/scene/bakery-interior.svg` | FE-S13 | Composite: register, counter, pastry case, oven, barista bar. |

If art isn't ready, stub with labeled colored rectangles so layout + animation can land now.

---

## Dependency Graph

- FE-S01 ⟵ BE-S04
- FE-S02 ⟵ BE-S07 (⟵ BE-S03)
- FE-S03 ⟵ BE-S01, BE-S02, BE-S05
- FE-S10 ⟵ BE-S06
- FE-S11 ⟵ BE-S08

Independent of backend (safe to parallelize): FE-S04, FE-S05, FE-S06, FE-S07, FE-S08, FE-S09, FE-S12, FE-S13, FE-S14.

Backend-only (no frontend dep): BE-S01 (can be paired with FE-S03 later), BE-S02, BE-S03, BE-S05, BE-S06, BE-S07, BE-S08.

---

## Priority Summary

**P0 (must ship by May 1):**
- FE-S02, FE-S03, FE-S04, FE-S07, FE-S08, FE-S10
- BE-S01, BE-S03, BE-S05, BE-S06, BE-S07

**P1 (ship if time):**
- FE-S01, FE-S05, FE-S06, FE-S09, FE-S11, FE-S12, FE-S13, FE-S14
- BE-S02, BE-S04, BE-S08
