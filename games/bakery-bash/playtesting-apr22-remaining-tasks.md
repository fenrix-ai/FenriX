# Bakery Bash — Playtesting (Apr 22) Remaining Tasks

> **Supersedes:** PR #41 (`tasks/agent-task-files-apr-21`) and PR #44 (`new_changes_Apr_21_pt2`).
> Both will be closed without merge — this document is the consolidated, current-truth task list.

**Date:** 2026-04-22
**Branch base:** `feat/playtesting-apr22-tasks`
**Target:** May 1, 2026 live session

---

## How to Read This File

1. **Every task in the ✅ Already Shipped section is done** — verified against the current codebase on this branch. Do not redo.
2. **FE-R## = Frontend task**, **BE-R## = Backend task** (`R` = "remaining" after Apr 22 audit).
3. Each task lists: file paths, acceptance criteria, and code snippets where useful.
4. The **Priority** column is **P0** (MVP-blocking for May 1) or **P1** (polish, ship if time allows).

---

## ✅ Already Shipped — Do Not Redo

Verified present in the tree on `feat/playtesting-apr22-tasks` as of 2026-04-22:

### Game flow / structure
- **How to Play screen** — [HowToPlayPage.tsx](app/src/pages/HowToPlayPage.tsx) with 4 stage cards (Decisions / Ad Auction / Chef Auction / Results).
- **Phase order: auction before decisions** — `PHASE_ORDER = ['email','bid_ad','bid_chef','roster','decide','simulating','results_ready']` in [phases.js](backend/functions/modules/phases.js).
- **Bakery Simulation after decisions** — placement is correct (decide → simulating).
- **2-minute animated Simulate screen** — 30-day day/night cycle, SOLD OUT stamps, maintenance bars, revenue counter in [SimulatePhase.tsx](app/src/pages/phases/SimulatePhase.tsx).

### Header / phase indicators
- **Large "Decisions Round / Ad Auction / …" phase banner** — `.round-header__phase-banner` in [RoundHeader.tsx](app/src/components/game/RoundHeader.tsx) with `PHASE_LABELS` covering every phase.
- **"Decide Round" → "Decisions Round" rename** — verified: zero `"Decide Round"` occurrences in `src/`.
- **Active-role badge ("Your turn: Bidder" / "Active: Bidder")** — `.round-header__role-badge--active` in RoundHeader.
- **"Advertising" role label → "Bidder"** — `PLAYER_ROLE_LABELS.advertising === "Bidder"` + TeamPage description.

### Login / team
- **Team logo upload on join** — `uploadBytes` + `getDownloadURL` wired in [LandingPage.tsx](app/src/pages/LandingPage.tsx).
- **Team role deselection (× Clear)** — `setTeamRole({ role: null })` flow in [TeamPage.tsx](app/src/pages/TeamPage.tsx).
- **Team self-join by team number (1–8)** — PR #45 landed: students pick the same number to share a team doc; backend derives `teamId = team-{N}` at [index.js:601](backend/functions/index.js:601). All teammates share `roleAssignments`.
- **Phase grace/freeze timer** — PR #45: 5s grace banner after timer zero, 10s freeze overlay, then client auto-advances.
- **Live top-bid rendering in auction** — PR #38 FE-20: `rounds/{N}.topBids` subscribed in AuctionPage.
- **Professor Reset Game button + `resetGame` callable** — PR #42 shipped the button at [ProfessorPage.tsx:610](app/src/pages/ProfessorPage.tsx:610); backend callable exists in [index.js](backend/functions/index.js).
- **Create-Team vs Join-Team two-path landing flow** — PR #53 (FE-R01 + BE-R01 + BE-R02): `createTeam` + `getTeamsInLobby` callables + `joinGame` `teamId` param; LandingPage rewritten with toggle + selectable team-card grid. Legacy PR #45 `team-{N}` path preserved.
- **Round 2 data leak fix** — PR #53 (FE-R09 + BE-R04): `advanceGamePhase` now clears every player's `pendingDecision` + `pendingBids` + `pendingRosterAction` on each `→ email` transition (chunked batch, preserves `productPrices`); AuctionPage resets local pool/top-bids/inputs on `currentRound` change.

### Auction
- **Thematic ad taglines (TV/Radio/Newspaper/Billboard)** — `AD_CARDS` desc strings in [AuctionPage.tsx](app/src/pages/AuctionPage.tsx:65).
- **`$` prefix outside bid input + wider input** — `.auction-page__bid-prefix` + `.auction-page__bid-input { width: 130px }`.
- **Per-chef Submit button + global "Submit All Bids"** — `handleSubmitSingleBid` + renamed button.
- **Timer-expired popup + input lock** — `showExpiredPopup` state + disabled inputs when `remaining <= 0`.
- **Chef bid "0" display bug fix** — `chefBidInputs` string state decoupled from number state.
- **Server-side bid timer enforcement** — `submitBids` checks `phaseEndsAt` (BE-N04 in index.js).
- **Chef nationality + flag emoji** — [ChefCard.tsx](app/src/components/game/ChefCard.tsx) renders `.chef-card__flag` + `.chef-card__nationality`.
- **`minBidFloor` generated server-side per skill tier** — [chef-system.js](backend/functions/modules/chef-system.js) `MIN_BID_FLOOR_MULTIPLIERS`.
- **Ad winner banner on Decide screen** — [AdWinnerBanner.tsx](app/src/components/game/AdWinnerBanner.tsx).

### Professor dashboard
- **Ready-to-advance indicator** — `.prof-phase-readiness` "🟢 All teams ready / 🔴 Waiting for N team(s)" in [ProfessorPage.tsx:532](app/src/pages/ProfessorPage.tsx:532).
- **Per-phase submission grid (green/red dots per team)** — already in ProfessorPage.
- **Extend round "+ 1 Min" button** — calls `extendPhase` callable (ProfessorPage:373).
- **`extendPhase` callable** — [index.js:2134](backend/functions/index.js:2134).

### Decisions screen
- **Per-item unit cost displayed** — `.product-tile__unit-cost` "Cost: $X.XX / unit" in [BakeryView.tsx:193](app/src/components/game/BakeryView.tsx:193).
- **"Total Committed This Round" ledger** — BakeryView:347.
- **"Buy Competitor Intel — $5,000" button** — [GameSidebar.tsx:95](app/src/components/game/GameSidebar.tsx:95).
- **`purchaseCompetitorInsight` callable** — [index.js:2163](backend/functions/index.js:2163).
- **Timer pauses (no client-side auto-advance) when hitting zero** — `.round-header__timer-expired` shows "Time's up — waiting for professor".

### Curveballs
- **Burglar event at ≤20% cleanliness** — [simulation.js](backend/functions/modules/simulation.js) writes `burglary` + `burglaryAmount`; Simulate + Results screens show banner.
- **Market watch removed** — explicitly dropped in commit `6d4868c`; no elasticity work needed.

### Results screen
- **Metric cards (Revenue / Customers / Satisfaction)** — `.results-phase__metric-card` in [ResultsPhase.tsx](app/src/pages/phases/ResultsPhase.tsx).
- **Standings leaderboard at bottom** — `.results-phase__leaderboard` (ResultsPhase:347).

---

## 🚧 Frontend — Remaining Tasks

**Stack:** React 18 + TypeScript + Vite. Source root: `games/bakery-bash/app/src/`.
**CSS:** BEM (`block__element--modifier`) in `src/styles/global.css`. No inline styles. No new npm packages unless noted.
**Firebase:** import `db` / `functions` / `storage` from `src/lib/firebase.ts`.

---

### ~~FE-R01 — Login: Create-Team vs Join-Team Two-Path Flow  (P0)~~ ✅ Shipped in PR #53

Landed with BE-R01 + BE-R02. See the "Already Shipped" section above.

---

### FE-R02 — StaffTab: Make "Sous Chef" Labels Explicit  (P0)

**Problem:** Playtesters said `"Bakery Station"`, `"Deli"`, `"Barista Station"` don't read as sous-chef hires. They're separate from Maintenance Guy but the *role* is invisible.

**File:** `app/src/components/game/tabs/StaffTab.tsx`

**Steps:**

1. Add a section header above the three station steppers:
```tsx
<h3 className="staff-tab__section-heading">Sous Chef Hires</h3>
<p className="staff-tab__section-sub">One sous chef per station boosts that station's throughput.</p>
```
Followed by the three `StationStepper` rows.

2. Rename the per-station `title` props to prepend `"Sous Chef — "`:
```tsx
<StationStepper title="Sous Chef — Bakery (Croissant · Cookie)" … />
<StationStepper title="Sous Chef — Deli (Bagel · Sandwich)" … />
<StationStepper title="Sous Chef — Barista (Coffee · Matcha)" … />
```

3. Add a visual divider (or distinct card background) between sous chef steppers and the Maintenance Guy stepper:
```css
.staff-tab__section-heading { margin: 1rem 0 0.25rem; font-size: 1rem; letter-spacing: 0.05em; }
.staff-tab__section-sub { font-size: 0.85rem; color: #666; margin-bottom: 0.75rem; }
.staff-tab__maintenance-divider { border: 0; border-top: 2px solid var(--cream); margin: 1rem 0; }
```

4. Keep the existing "Maintenance Guy" section as-is, but precede it with `<hr className="staff-tab__maintenance-divider" />` and its own `<h3>Maintenance Crew</h3>`.

**Acceptance:** Visiting the Staff tab shows two clearly-labelled sections: "Sous Chef Hires" (three station steppers) and "Maintenance Crew" (one stepper + task assignments). Each station stepper title starts with `"Sous Chef —"`.

---

### FE-R03 — Chef Auction: Sequential #1, #2, … Numbering  (P0)

**Problem:** When two chefs have the same name, there's no disambiguator. Playtesters asked for a visible sequential number per card.

**Files:**
- `app/src/components/game/ChefCard.tsx`
- `app/src/pages/AuctionPage.tsx` — pass `index` to `ChefCard`

**Steps:**

1. Add an optional `cardIndex?: number` prop to `ChefCardProps`. Render it as the first element inside `.chef-card`:
```tsx
{typeof cardIndex === "number" && (
  <span className="chef-card__number">#{cardIndex + 1}</span>
)}
```

2. CSS:
```css
.chef-card__number {
  position: absolute;
  top: 6px;
  left: 8px;
  font-family: var(--font-pixel);
  font-size: 0.8rem;
  background: var(--caramel);
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 2;
}
.chef-card { position: relative; }  /* ensure absolute number anchors here */
```

3. In AuctionPage, pass `cardIndex={i}` when mapping over `chefPool`:
```tsx
{chefPool.map((chef, i) => (
  <ChefCard key={chef.id} chef={chef} cardIndex={i} … />
))}
```

4. **Error message wording:** in the `submitBids` error handler, replace any raw `minBidFloor` / internal-ID references with: `"Your bid for Chef #${index + 1} is below the Minimum Ask of $X,XXX. Please increase your bid."`  (backend already exposes `minBidFloor` — map it to `Minimum Ask` on render; raw error handling lives in [lib/errors.ts](app/src/lib/errors.ts) — extend `humanizeFunctionError` to translate this class of message.)

**Acceptance:** Each auction chef card shows `#1`…`#N` in the top-left. Bid rejection messages reference `Chef #N` + `Minimum Ask`, never `minBidFloor`.

---

### FE-R04 — Chef Card: Display Skill Multiplier Table  (P1)

**Problem:** Players don't know what skill tier buys them. The proposal spec has:
- Low: 1.0× non-specialty · 1.4× specialty
- Medium: 1.25× non-specialty · 1.75× specialty
- High: 1.6× non-specialty · 2.2× specialty

**File:** `app/src/components/game/ChefCard.tsx`

**Steps:**

1. Inside the chef card (below name + skill badge), add a compact 2-column multiplier table:
```tsx
const SKILL_MULTIPLIERS = {
  low:    { nonSpecialty: "1.0×",  specialty: "1.4×" },
  medium: { nonSpecialty: "1.25×", specialty: "1.75×" },
  high:   { nonSpecialty: "1.6×",  specialty: "2.2×" },
} as const;

<dl className="chef-card__multipliers">
  <dt>Non-specialty</dt>  <dd>{SKILL_MULTIPLIERS[chef.skill].nonSpecialty}</dd>
  <dt>Specialty</dt>      <dd>{SKILL_MULTIPLIERS[chef.skill].specialty}</dd>
</dl>
<p className="chef-card__multiplier-note">
  Multipliers do not stack. Each chef boosts their station independently — outputs add up.
</p>
```

2. CSS:
```css
.chef-card__multipliers { display: grid; grid-template-columns: auto auto; gap: 2px 8px; font-size: 0.75rem; margin-top: 0.4rem; }
.chef-card__multipliers dt { color: #666; }
.chef-card__multipliers dd { font-weight: bold; margin: 0; }
.chef-card__multiplier-note { font-size: 0.7rem; color: #666; margin: 0.3rem 0 0; font-style: italic; }
```

**Acceptance:** Each chef card shows the two multipliers for that chef's skill tier plus the "multipliers do not stack" note.

---

### FE-R05 — Auction Results Screen (Post-Auction Reveal)  (P1)

**Problem:** After the chef auction closes, players don't see a clear "who won what" summary before Decide. The `AdWinnerBanner` only shows on Decide and doesn't include the chef winner.

**Files:**
- New: `app/src/pages/phases/AuctionResultsPhase.tsx`
- Edit: `app/src/pages/GamePage.tsx` — render it during a short new "reveal" window
- Edit: `app/src/hooks/useGamePhaseNav.ts` (if needed)

**Design:**
1. Header: `"Auction Results — Round N"`.
2. **Ad Winners row:** 4 cards (TV / Radio / Newspaper / Billboard) each showing
   - Ad icon + thematic tagline (reuse copy from `AD_CARDS`)
   - Winner: team logo + team name + winning bid, OR `"Unclaimed"` if no bids
   - Read from `/games/{gameId}/rounds/round_{N}.auctionResults.ads`.
3. **Chef Winner card:** chef nationality flag + name + skill tier + winning team logo + winning bid; `"No chef hired"` fallback.
4. **Advertisement Reveal animation:** pick one of the 4 winning ads at random (`Math.random()`) and display it full-width with the winning team's logo overlaid as a simulated broadcast. If the chosen ad is unclaimed, show `"No winner this round"`.
5. Auto-advance after 8 seconds (professor can force-advance earlier via existing control).

**Implementation:** Since there's no dedicated `auction_results` phase in the backend state machine, gate this screen on **`basePhase === "roster"`** for the **first 8 seconds** after the phase transitions (use `phaseEndsAt` vs phase duration to compute elapsed). After 8 seconds, fall through to the existing RosterPhasePage.

Alternatively (cleaner), file follow-up BE task to add a `round_N_auction_results` phase between `bid_chef` and `roster` — left out of P0 to avoid state-machine churn before May 1.

**Acceptance:** When the chef auction closes, players see a reveal screen for ~8 seconds showing all 4 ad winners, the chef winner (with team logos), and one randomly-chosen animated ad with the winning team's logo. Then the Kitchen Roster page renders normally.

---

### FE-R06 — Kitchen Roster: "Head Chef" → "Basic Chef" + Nationality/Flag  (P0)

**Problem:** [RosterPhasePage.tsx:202](app/src/pages/RosterPhasePage.tsx:202) still labels the default slot `"Head Chef"`. Playtesters want `"Basic Chef"` to read as lower-tier.

**File:** `app/src/pages/RosterPhasePage.tsx`

**Steps:**

1. Rename the label: `Head Chef` → `Basic Chef` on line 202 (and anywhere else the string appears in this file).
2. Ensure each occupied slot card also renders the chef's nationality + flag emoji (from the roster data) and their skill tier badge — reuse `ChefCard` if the layout allows, otherwise inline the existing fields.
3. No backend / Firestore field renames — display-only.

**Acceptance:** The starter roster slot reads `"Basic Chef"`. Occupied slots show flag + nationality + skill tier.

---

### FE-R07 — Kitchen Roster: Card-Slot Grid + Lay-Off + New-Hire Staging  (P1)

**Problem:** Full playtesting ask is a card-slot grid with a `"Lay Off"` button per occupied slot and a separate `"New Hires Available"` row for chefs won this round. Current RosterPhasePage is functional but not the card layout spec'd.

**File:** `app/src/pages/RosterPhasePage.tsx`

**Steps:**

1. **Slot grid:** Render the active roster as a grid of 160×200px cards. Each card contains: chef pixel SVG, name (centered), flag + nationality, skill badge (colour-coded green/yellow/red), station assignment. Empty slots use a dashed border + `"+ Empty Slot"` placeholder.

2. **Lay-Off button:** On each occupied card, render a secondary `"Lay Off"` button. Click → `confirm("Lay off {chef}?")` → call existing `layoffChef` callable with `{ gameId, chefId }` (already in [index.js](backend/functions/index.js)) → optimistic local state update.

3. **New Hires Available section:** Below the grid, if `auctionResults.chefWon` was set in the most recent round, render a separate row of cards for new chefs. Each has an `"Assign to Slot"` button → opens a mini picker of empty-slot indices → calls the existing assignment callable (or writes the assignment to `pendingDecision.chefAssignments` if the backend expects it there — verify against `submitDecision` contract).

4. CSS reuses `.chef-card` base styles; add:
```css
.roster-phase__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
.roster-phase__slot--empty { border: 2px dashed var(--caramel); background: var(--cream); display: flex; align-items: center; justify-content: center; min-height: 200px; }
.roster-phase__new-hires { margin-top: 2rem; padding-top: 1rem; border-top: 2px solid var(--cream); }
```

**Acceptance:** Roster page shows a responsive grid; occupied cards have a Lay Off button; new hires from the latest auction appear in a separate row with an Assign-to-Slot picker.

---

### FE-R08 — Remove Duplicate CSV Download Button  (P0)

**Problem:** [RoundHeader.tsx](app/src/components/game/RoundHeader.tsx) has a mail-icon CSV button at the top of every phase; the Results screen has its own Download CSV button. Playtesters found it confusing to have two paths.

**Decision:** Keep the Results-screen button (primary, explicit). Remove the header icon.

**Files:**
- `app/src/components/game/RoundHeader.tsx` — delete the `<button className="round-header__email">` block (lines ~168–174) and the `downloadResultsCsv` export helper.
- `app/src/pages/phases/ResultsPhase.tsx` — verify the existing `.results-phase__download` button still renders + downloads the CSV. If not, move the CSV serialization logic from RoundHeader into ResultsPhase (or a shared `src/lib/csv.ts` helper).

**Acceptance:** No mail/CSV icon in the round header. Results phase has exactly one `"Download CSV"` button that produces the correct 11-column file.

---

### ~~FE-R09 — Round 2 Data Leak: Frontend Dep-Array Fix  (P0)~~ ✅ Shipped in PR #53

Landed with BE-R04. AuctionPage now resets `backendPool` / `topBidsAd` / `topBidsChef` / `chefBidInputs` + regenerates placeholder pool on `currentRound` change.

---

## 🛠️ Backend — Remaining Tasks

**Stack:** Firebase Cloud Functions v2, Node 22. Entry: `games/bakery-bash/backend/functions/index.js`. Modules: `backend/functions/modules/`.
**Rules:** never hardcode game params — read from `config/params`. Monetary values as numbers. `FieldValue.serverTimestamp()` for timestamps.

---

### ~~BE-R01 — `createTeam` Callable  (P0)~~ ✅ Shipped in PR #53

Seat creator as `finance`, slug-collision loop, dup-name reject, `phase === 'lobby'` guard. Tested via `npm run test:create-join`.

---

### ~~BE-R02 — `getTeamsInLobby` Callable  (P0)~~ ✅ Shipped in PR #53

Returns `{ teamId, name, logoUrl, memberCount }[]`. Tested via `npm run test:create-join`.

---

### BE-R03 — Chef Pool: Exactly 12 per Round, No Name Duplicates  (P0)

**Files:**
- `games/bakery-bash/backend/functions/modules/config.js` — change `chefPoolSize` default
- `games/bakery-bash/backend/firestore-schema.js` — update the schema comment
- `games/bakery-bash/backend/functions/modules/chef-system.js` — dedupe names; generate exactly the configured count
- `games/bakery-bash/backend/functions/modules/__tests__/test-adversarial.js` — update the assertion

**Changes:**

1. **Config** — replace the range with a single number:
```js
// config.js:208
chefPoolSize: 12,                                // was: { min: 6, max: 8 }
```
Update the `deepMergeConfig` logic to treat `chefPoolSize` as a plain number (delete the `rawPoolSize` / `numberOrDefault` block for min/max and replace with a single `numberOrDefault(raw.chefPoolSize, d.chefPoolSize)`).

2. **Schema doc** — update `firestore-schema.js:106` comment to `chefPoolSize: 12, // number — exact pool size per round`.

3. **chef-system.js `generateChefPool`:**
```js
// Before the for-loop, extract:
const poolSize = Number.isFinite(cfg.chefPoolSize) ? cfg.chefPoolSize : 12;
const usedNames = new Set();
const pool = [];
let attempts = 0;
while (pool.length < poolSize && attempts < poolSize * 12) {
  const chef = generateOneChef(cfg, round);
  if (!usedNames.has(chef.name)) {
    usedNames.add(chef.name);
    pool.push(chef);
  }
  attempts++;
}
return pool;
```
   Extract the existing single-chef construction into a `generateOneChef(cfg, round)` helper if it isn't already one. Ensure `CHEF_NATIONALITIES[nat].names[gender]` has ≥ 12 total unique entries across all nationalities+genders (currently has ~40 — plenty).

4. **Test update** — in `test-adversarial.js:1006`, change `assert(pool.length >= defaultCfg.chefPoolSize.min, …)` to `assert(pool.length === defaultCfg.chefPoolSize, 'pool size is exact, not a range')`.

**Acceptance:**
- Every auction round writes exactly 12 chefs to `rounds/round_{N}.chefPool`.
- No name collisions within a pool.
- Existing tests updated + green.

---

### ~~BE-R04 — Round Increment: Clear All Pending Round-Scoped Fields  (P0)~~ ✅ Shipped in PR #53

`resetPendingPlayerStateForRound` helper (chunked batch, 400/batch) wired into `advanceGamePhase` on every `→ email` transition. Clears `pendingDecision.{submitted,submittedAt,round,menu,quantities,sousChefCount,sousChefAssignments}`, `pendingBids.{ad,chef}`, `pendingRosterAction`. Preserves `pendingDecision.productPrices` (POST-01 carry-over). Tested via `npm run test:round-reset`.

Note: the `submissions/round_{N}_{phase}` docs (step 2 in the original plan) are already natively round-scoped — each round uses a distinct doc id, so they don't need clearing. Revisit if the dashboard ever surfaces them via a cross-round query.

---

### BE-R05 — `submitBids` Error Messages Use "Chef #N" + "Minimum Ask"  (P1)

**File:** `games/bakery-bash/backend/functions/index.js` (or the module where `submitBids` validates)

**Problem:** Current error message `"Chef 'a13c5f38…' bid 30 is below minBidFloor 25000"` exposes internal IDs and jargon.

**Fix:** When rejecting a chef bid below floor, look up the chef's position in the round's `chefPool` array and include it:
```js
const chefIndex = round.chefPool.findIndex((c) => c.id === chefId);
throw new HttpsError(
  'invalid-argument',
  `Your bid for Chef #${chefIndex + 1} ($${bid.toLocaleString()}) is below the Minimum Ask of $${chef.minBidFloor.toLocaleString()}.`
);
```

**Acceptance:** Rejected bids surface `"Chef #3 … Minimum Ask of $25,000"` style messages. No `minBidFloor` / raw ID appears in any user-visible path.

---

## 📋 Testing Checklist (for the new PR)

- [x] `/` landing page shows Create Team vs Join Team toggle (FE-R01) — PR #53
- [x] Create Team creates a named team, uploads logo, and routes to `/team` — PR #53
- [x] Join Team lists existing teams with logos + member counts; joining adds you to the team's roleAssignments — PR #53
- [ ] Staff tab clearly reads "Sous Chef Hires" + "Maintenance Crew" as two sections (FE-R02)
- [ ] Each station stepper title starts with "Sous Chef —" and names the products
- [ ] Chef cards show `#1`, `#2`, … in the top-left (FE-R03)
- [ ] Error messages reference "Chef #N" and "Minimum Ask", never `minBidFloor`
- [ ] Chef cards show skill-tier multiplier table + "do not stack" note (FE-R04)
- [ ] Auction reveal screen displays all 4 ad winners + chef winner with team logos for ~8s (FE-R05)
- [ ] Randomly-chosen ad plays with winning team's logo overlaid
- [ ] Roster slot reads "Basic Chef" (not "Head Chef") (FE-R06)
- [ ] Roster page shows card grid, Lay Off button per occupied slot, New Hires row (FE-R07)
- [ ] Round header has no CSV mail icon; Results screen has exactly one Download CSV button (FE-R08)
- [x] Start a Round 2 in the emulator — no Round 1 ad winners / decisions / bids visible anywhere (FE-R09 + BE-R04) — PR #53 (emulator test `test:round-reset`)
- [ ] Backend: every chef auction pool has exactly 12 chefs with unique names (BE-R03)
- [x] Backend: advancing to a new round clears every player's `pendingDecision` + `pendingBids` in one batch (BE-R04) — PR #53

---

## ⚠️ In-Flight Parallel PRs (Coordinate Before Starting)

Two other PRs are open against `main` that overlap with tasks here. Check their merge status before picking up a task:

- **[PR #47 — UI polish: 12-chef strip, briefing modal, banners, station layout](https://github.com/fenrix-ai/FenriX/pull/47)** (open, `feature/ui-polish-chefs-briefing-stations`)
  - **Covers BE-R03** — sets `chefPoolSize` to flat 12 and matches the client placeholder. If this PR merges first, skip BE-R03 (but audit the name-dedup portion — PR #47 may not include it).
  - Also adds horizontal scrolling chef strip (already partially on `main` per earlier work) and briefing-modal CSS. No conflict with FE-R## tasks.

- **[PR #49 — Fix Bakery Bash pricing and professor flows](https://github.com/fenrix-ai/FenriX/pull/49)** (open, `bakery-bash-live-fixes`, Codex-authored)
  - Claims to add `resetGame` — but PR #42 already shipped this. **Review the diff carefully** — it may be a rewrite that conflicts with the existing callable, or it may be a no-op if the existing one already works.
  - Genuinely new pieces: (a) professor auth now reads `submissions/*` via game-doc `professorUid` instead of requiring the `professor: true` custom claim (removes a deploy-script dependency); (b) `submitPrices` public-invoker access for live-prod deployment.
  - Touches [index.js](backend/functions/index.js) and [firestore.rules](backend/firestore.rules) — merge conflicts possible with BE-R01/BE-R02 + BE-R04 if both ship at once.

- **[PR #46 — phase-switch delay, shared team joining, role takeover](https://github.com/fenrix-ai/FenriX/pull/46)** (**closed, not merged**)
  - Proposed: 7s delay + countdown banner before auto page-switch, team-name input on LandingPage (not team number), `takeoverTeamRole` callable for disconnected teammates.
  - **Reviewed by maintainer and rejected** — the phase delay was later re-implemented more cleanly in PR #45's grace/freeze timer. Team-name input + takeover did not land. If we want those, pull them back in as separate tasks here (they're not urgent for May 1).

**Pending review (open against `main`):**
- [PR #53 — named team create/join flow + round-advance state reset](https://github.com/fenrix-ai/FenriX/pull/53) (branch `feat/team-flow-and-round-reset`) — covers FE-R01, BE-R01, BE-R02, FE-R09, BE-R04. Ships the "Already Shipped" entries listed at the top of this doc. Coordinate with PR #49 before merging — both touch `joinGame` in [index.js](backend/functions/index.js).

**Already merged recently (confirmed on `main` / this branch):**
- PR #50 — rejoin after game start
- PR #48 — "Round N" hero briefing (replaces earlier FE-6 work)
- PR #45 — team self-join + phase timer grace/freeze
- PR #43 — POST-01 dynamic pricing (Finance role)
- PR #42 — FE tasks from PR#41 + roster layout
- PR #40 — SubmissionLock / ghost buttons / dev panel gating

## 🔗 Cross-References

- **Design spec:** [GAME_DESIGN_PROPOSAL.md](GAME_DESIGN_PROPOSAL.md)
- **Existing roadmap:** [projectRoadmap.md](projectRoadmap.md)
- **Superseded PRs:** #41 (`tasks/agent-task-files-apr-21`), #44 (`new_changes_Apr_21_pt2`) — close without merge; this doc is the new source of truth.
- **Recent playtesting commits already on branch `feat/playtesting-apr22-tasks`:**
  - `438ce4a` — UX polish, simulation animation, market elasticity, burglar curveball
  - `6d4868c` — drop market watch, surface burglar on sim screen, raise cleanliness threshold
