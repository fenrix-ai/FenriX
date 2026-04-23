# Bakery Bash — Playtesting (Apr 22) Supplement

> **Read [playtesting-apr22-remaining-tasks.md](playtesting-apr22-remaining-tasks.md) first.** Dylan's consolidated doc is the source of truth for the May 1 session. This file only describes items from a separate playtesting review that are **not already covered** there.

**Date:** 2026-04-22
**Branch base:** `feat/playtesting-apr22-tasks`
**Target:** May 1, 2026 live session (P0) + follow-on polish (P1)

---

## Coordination Points (Read Before Starting)

Three items conflict with decisions already made in Dylan's doc or recently-shipped PRs. Resolve before picking up related tasks.

**C-1 — CSV archive needs a home.** Dylan's doc removes the header mail icon and keeps only the Results-screen download button. The supplement introduces *purchased* CSVs (data store) that need somewhere to be re-downloaded. Recommendation: surface purchased datasets on the Results screen next to the existing download button, and also inside the Data Store panel itself. Do not reinstate the header icon.

**C-2 — Burglar trigger model.** The current build fires burglars when cleanliness drops below 40%. Playtesting review asks for a rank-scaled probability model instead — top-of-leaderboard teams get robbed more often than bottom ones ("successful bakeries attract attention"). These are different mechanics entirely. Recommendation: replace the cleanliness trigger with rank-scaling; keep cleanliness tied to the new Food Safety Inspection mechanic.

**C-3 — Reset Game button removal.** Dylan's doc lists the Reset Game button as shipped in PR #42. Playtesting review asks to remove it as redundant with End Game. Straightforward, but notify PR #42's author that this undoes part of their work.

---

## Frontend — Supplement Tasks

### FE-S01 — Data Purchase Store (Decisions phase)  · P1

Add a "Buy Data" button to the Decisions sidebar that opens a store modal. The modal offers two purchasable datasets:

- **Tier 1 — Chef Specialty Guide** at **$15,000.** A lightweight reference showing which chef nationalities specialize in which products. Includes male and female portraits per nationality.
- **Tier 2 — Comprehensive Chef Profiles** at **$60,000.** A large dataset — at least 30 chef profiles per nationality — with monthly production per product, satisfaction scores, sous chef counts, cleanliness averages, purchase prices, and monthly revenue. Enough data for players to build a real predictive model.

Each card shows its price and a purchase button. If the team already owns a tier, the button should read "Owned" and be disabled. If the team's current budget is below the price, the button should read "Insufficient budget." On successful purchase, the team's budget is reduced and the CSV downloads immediately.

Include a "Your Purchased Datasets" list inside the modal so teams can re-download what they've bought at any time during the Decisions phase.

Do not hardcode the prices in the component — read them from game config values that the backend exposes.

---

### FE-S02 — Date Display on Email Screen and Event Cards  · P0

Each round corresponds to a calendar month (Round 1 = January, Round 2 = February, etc.). On the email/briefing screen, display the month name just below the "Round N" hero text — e.g., "Entering January." On any event card that references a specific day, show the formatted date (e.g., "January 14") instead of a raw day number.

---

### FE-S03 — Results Screen: Events Section with Event Cards  · P0

Replace the current flat burglar banner on the Results screen with a dedicated "Events" section below the metric cards. The section renders one card per curveball event that occurred during the round:

- **Food Safety Inspection card** — inspector character asset, the date of inspection, the cleanliness percentage reported, a color-coded rating badge (Excellent green / Compliant yellow / Needs Improvement orange / Hazardous red), and the foot traffic penalty applied.
- **Burglary card** — burglar character asset, the date of robbery, and the amount stolen.

If no events occurred, hide the Events section entirely. Keep the existing Simulation-screen burglar banner unchanged.

---

### FE-S04 — Results Timer Text Fix  · P0

The countdown on the Results screen currently reads "Last Chance to Submit: Ns." There are no submissions on Results, so this wording is misleading. Change it to "Seconds until next round: Ns."

---

### FE-S05 — Progress Bar with Croissant Tracker  · P1

Add a persistent horizontal progress bar across the top of the screen (below the phase banner). The bar is divided into four milestones per round — Auction, Decisions, Simulation, Results — repeating for each round in the game. Completed milestones fill with solid yellow and show a full-opacity croissant icon; upcoming milestones show a low-opacity yellow fill with a low-opacity croissant. A larger, slightly animated croissant serves as the current-position tracker.

Hide the progress bar on the landing, lobby, team, and game-over screens.

---

### FE-S06 — How to Play: New Simulation Card + Copy Additions  · P1

The How to Play page already exists with four cards in the correct order. Add a fifth card for the Simulation phase with copy along the lines of: *"See your bakery come to life — spectate a simulation of your bakery running over the course of a month."*

Add brief copy to the existing cards:

- Ad Auction: note that each ad type attracts a different level of foot traffic, and this is something the team needs to figure out from their predictive model.
- Chef Auction: clarify that specialty chefs are not assigned to stations — their output contributes to the overall bakery — and that only sous chefs work stations. Note that specialties can be discovered by purchasing a chef dataset.
- Results: mention that curveball events (Food Safety Inspection, Burglary) may appear here, and that the CSV download includes one row per simulated day.

Audit the page for any remaining "Your Advertising Teammate" copy and replace it with "Your Bidder Teammate" for consistency with the role rename already shipped.

---

### FE-S07 — Professor Panel: Pre-Game Button State and Background Polish  · P0

The "+1 Minute" button is currently clickable before the game starts, which is inconsistent with other pre-game buttons that are visibly disabled. Apply the same disabled/opaque styling to this button when no game is active.

Separately, the professor panel text currently washes out against the page background. Add a solid warm-cream background panel (matching the bakery color theme) behind the control content to improve legibility.

---

### FE-S08 — Remove Round-Transition Lock from Professor Panel  · P0

The professor panel is currently locked during the round grace/freeze window that applies to player-facing screens. The professor should never be locked. Remove every `isLocked`/`phaseTransitioning` gate from professor-only actions (Advance, Pause, Resume, +1 Min, End Game) so the professor has full control at all times, including during round transitions.

---

### FE-S09 — Round 1 Email Auto-Advance After 5 Seconds  · P1

Round 1's email/briefing screen currently stalls until the backend auto-advances. Add a 5-second countdown on mount for Round 1 only, and auto-advance when it hits zero. Show a visible "Starting in Ns..." message during the countdown. Check with backend whether the client can trigger advance directly, or whether this requires shortening Round 1's email phase duration in config.

---

### FE-S10 — Remove "Reset Game" Button  · P0

Remove the Reset Game button from the professor panel. End Game serves the same function and the redundancy confuses playtesters. Keep End Game and ensure its handler cleans up everything Reset Game did. (See C-3 — notify PR #42's author.)

---

### FE-S11 — Team Page: Allow Multi-Role Claim  · P1

Role deselection is already shipped. This task adds multi-role support: a single player can hold multiple roles simultaneously as long as no teammate already holds them. This matters for two-person teams who need to cover all three roles.

Each role button should render in one of three states: owned by the current player (filled + checkmark, clickable to deselect), owned by another teammate (greyed out, shows that teammate's name), or unclaimed (default clickable). Downstream components that gate submission by role (SubmissionLock, phase-permission checks) need to check membership in the player's role array rather than a single-value equality.

---

### FE-S12 — Chef Auction Card: Horizontal Layout with Portrait on Left  · P1

Restructure the chef auction card into a two-column horizontal layout. The left column shows the chef's portrait SVG (sourced from the existing nationality/gender asset set). The right column shows the chef's name at the top, followed by the sequential number badge, flag, nationality, skill tier, and multiplier table — all of which come from Dylan's FE-R03 and FE-R04.

Keep specialties hidden (backend sanitation is unchanged). If the wider card breaks the auction page grid, widen the grid column minimum to accommodate.

---

### FE-S13 — Simulation Phase Visual Overhaul  · P1

The 30-day simulation animation, maintenance bars, and SOLD OUT stamps are already shipped. This task adds a fuller visual treatment:

- A composed bakery-interior background with a register, counter, pastry display case, oven, and a barista bar with coffee and matcha setups.
- Specialty chef portraits placed inside the kitchen area, with small count badges or figures representing sous chefs per station, and a single maintenance figure.
- Gender/race neutral customer figures animating through the counter area. Density should scale roughly with that day's foot traffic.
- Existing menu display and SOLD OUT stamps remain in place alongside the scene.
- Review the current per-day animation pacing. Target roughly 6–9 seconds for a 30-day month — adjust if the current duration feels too fast or too slow.

If art assets aren't ready when implementation starts, stub with labeled colored rectangles so layout and animation logic can land first.

---

### FE-S14 — Game Over Screen UI Polish  · P1

The Game Over screen is functional but visually underdeveloped. Add a prominent winner announcement with a trophy or celebratory banner above the winning team's name and logo. Show the final leaderboard with all teams ranked by cumulative revenue, and make each row expandable to reveal a per-round revenue breakdown. Add bakery-themed polish — confetti or pastry particles, warm palette, gentle entry animations. Route any CSV download on this screen through the same helper used elsewhere for consistency.

---

## Backend — Supplement Tasks

### BE-S01 — Food Safety Inspection with Four-Tier Penalty Scale  · P0

Add a cleanliness-based rating system that applies a foot traffic penalty and generates an event for the Results screen. The four tiers are:

- **Excellent** (95–100% cleanliness) — no foot traffic penalty.
- **Compliant** (80–94%) — 5% penalty.
- **Needs Improvement** (60–79%) — 10% penalty.
- **Hazardous** (below 60%) — 15% penalty.

Every round, evaluate the team's cleanliness at simulation time, determine the tier, and pick a random inspection day within the month. Emit a `food_inspection` event with the date, cleanliness percentage, rating, and penalty. The penalty should be applied multiplicatively to foot traffic *before* customer allocation runs. All tiers produce an event card (yes, including Excellent — teams like seeing their win).

Calibrate the maintenance-guy effect so that one cleaning maintenance guy reliably keeps cleanliness in the Compliant range, and two keep it Excellent.

---

### BE-S02 — Rank-Scaled Burglar Probability  · P1

Replace the current cleanliness-triggered burglar mechanic with a rank-based probability model. See C-2 and confirm with product before shipping.

Each round, after gross revenue is computed, roll for burglary. The probability scales with the team's pre-simulation leaderboard rank: the top team has an 8% chance, the bottom team has a 0.05% chance, with linear interpolation in between. If the roll hits, pick a random day in the month and steal a uniformly random 5–15% of that round's gross revenue. Subtract the stolen amount from net revenue and emit a `burglary` event with the date and amount.

Remove the existing cleanliness-threshold burglary path and its related config knobs. Seed the randomness for testability — a deterministic test run with thousands of rolls should confirm probabilities land within a reasonable tolerance of the spec.

---

### BE-S03 — Date System: Calendar Months and Date Column in CSV  · P0

Each round corresponds to a real calendar month. Round 1 is January (31 days), Round 2 February (28 days), Round 3 March (31 days), Round 4 April (30 days), Round 5 May (31 days). Replace the hardcoded 30-day simulation loop with a lookup that uses the round's actual month length. Adjust any downstream per-day averages that assumed 30.

Add a `date` column as the first column of every CSV row, formatted as "Month Day" (e.g., "January 1" through "January 31" for Round 1). Attach the month name to the written round result so the frontend can display "Entering {Month}" on the briefing screen.

Update existing CSV snapshot tests to reflect the new column and variable row counts.

---

### BE-S04 — Data Purchase Store: `purchaseDataset` Callable and CSV Generators  · P1

Backend counterpart to FE-S01. Add prices for the two tiers to config ($15,000 and $60,000, exposed through the existing config override pattern so professors can tune without redeploying).

**Tier 1** is a small static CSV mapping each chef nationality to its specialty products and portrait asset paths. Fixed content — generate once at module load.

**Tier 2** is generated programmatically with at least 30 rows per nationality (120+ total). Columns cover nationality, skill level, average monthly quantities per product, average satisfaction score, average sous chef count, average cleanliness, purchase price, and average monthly revenue. Production values should reflect the existing skill-tier and specialty multipliers, with roughly ±15% jitter seeded by the game ID so the dataset is deterministic if re-downloaded within the same game.

The `purchaseDataset` callable accepts a game ID, team ID, and tier. It requires authentication and verifies the caller belongs to the team. It rejects if the current phase isn't a Decisions phase, or if the team already owns the tier (returning the existing CSV in that case for re-download), or if the team's budget is below the price. On success, it deducts the price from the team's budget, persists ownership, and returns the CSV content and suggested filename. All state changes happen in a single Firestore transaction.

Data purchases do not count toward the round's `totalSpent` for loan-shark purposes — this is a cash-only transaction.

---

### BE-S05 — Event Persistence for Results Cards  · P0

Extend the round-result shape with an `events` array that the Results screen reads from. Each event is either a `food_inspection` (date, cleanliness percentage, rating, foot traffic penalty) or a `burglary` (date, amount stolen). Events are written to Firestore atomically with the rest of the round result. Document the new field in the Firestore schema reference.

This is the persistence contract for FE-S03, BE-S01, and BE-S02.

---

### BE-S06 — Remove `resetGame` Callable  · P0

Delete the `resetGame` callable that was shipped in PR #42. Before deletion, audit `endGame` to confirm it handles the full end-of-game cleanup (transition to `game_over`, leaderboard finalization, budget settlement). If `resetGame` did anything `endGame` doesn't, port that logic into `endGame` first. Remove any references to `resetGame` from security rules.

---

### BE-S07 — Attach Month Name to Round Results  · P0

Small spin-off of BE-S03. When writing each round's result, include a `month` string field set to the calendar month name (January, February, etc.). The frontend (FE-S02) reads this directly to render "Entering {Month}" on the briefing screen.

---

### BE-S08 — Multi-Role Support  · P1

Change the player's `role` field from a single value to an array. No data migration is required — games are short-lived; wrap any legacy single-value reads at the boundary.

Update the role claim/release logic so a player can add a role only if no teammate holds it, and can release any role they currently hold. If another teammate already holds the role, the claim fails with an `already-exists` error. The `solo` role remains a special case (one player, all roles).

Update phase permission helpers (which currently check equality like `role === 'advertising'`) to check membership in the array instead, so a player holding multiple roles can submit for any phase owned by any of their roles. Add tests covering claim, release, blocked-by-teammate, and multi-role submission flows.

---

## Assets to Create

Four new SVGs are required:

- **Food Inspector character** — rendered on the Food Safety Inspection event card. Should match the existing chef illustration style.
- **Burglar character** — rendered on the Burglary event card. Playful/cartoony to stay on theme.
- **Neutral customer** — used in the simulation animation to represent foot traffic. Gender and race neutral, simple enough to repeat in a crowd.
- **Bakery interior scene** — the composed background for the Simulation phase, with register, counter, pastry display case, oven, and barista bar.

If art isn't ready when implementation starts, stub with labeled colored rectangles so layout and animation can be built now and assets swapped in later.

---

## Dependencies

- FE-S01 depends on BE-S04.
- FE-S02 depends on BE-S07 (which depends on BE-S03).
- FE-S03 depends on BE-S01, BE-S02, and BE-S05.
- FE-S10 depends on BE-S06.
- FE-S11 depends on BE-S08.

Independent of backend (safe to parallelize): FE-S04, FE-S05, FE-S06, FE-S07, FE-S08, FE-S09, FE-S12, FE-S13, FE-S14.

Backend-only (no frontend dependency): BE-S02, BE-S03, BE-S05, BE-S06, BE-S07, BE-S08. BE-S01 pairs naturally with FE-S03.

---

## Priority Summary

**P0 (must ship by May 1):** FE-S02, FE-S03, FE-S04, FE-S07, FE-S08, FE-S10, BE-S01, BE-S03, BE-S05, BE-S06, BE-S07.

**P1 (ship if time):** FE-S01, FE-S05, FE-S06, FE-S09, FE-S11, FE-S12, FE-S13, FE-S14, BE-S02, BE-S04, BE-S08.
