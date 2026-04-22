# Bakery Bash — Playtesting Task List (Apr 21)

**Player URL:** https://bakery-bash-54d12.web.app/
**Professor URL:** https://bakery-bash-54d12.web.app/professor
**Source root:** `games/bakery-bash/`

---

## HOW TO READ THIS FILE

The team already has detailed infrastructure task files:
- `games/bakery-bash/frontend-new-tasks-Apr-21.md` — FE-0 through FE-9 (Firestore wiring, professor dashboard, phase locking, etc.)
- `games/bakery-bash/backend-new-tasks-Apr-21.md` — BE-0 through BE-9 (Cloud Functions: createGame, startGame, advancePhase, submitDecision, simulateRound, etc.)

**This file contains only the tasks that came out of playtesting and are NOT already covered by those files.** Do not duplicate work — check the Apr 21 files before starting any task here.

**Tasks already done in code and removed from this list:**
- Station sous chef / maintenance visual separation — already implemented in `StaffTab.tsx` (lines 153–204)
- Station sublabels (e.g. "Croissant · Cookie") — already in `StaffTab.tsx`
- Product name corrections (Coffee / Matcha) — already in `MenuTab.tsx` and `game.ts`

---

## FRONT-END TASKS

**Stack:** React 18, TypeScript, Vite
**Source root:** `games/bakery-bash/app/src/`
**CSS convention:** BEM — `block__element--modifier`. Add new classes to `src/styles/global.css`. No inline styles. No new npm packages unless noted.
**State:** `GameContext` in `src/contexts/GameContext.tsx`. Use `useGame()` to read, `useGameDispatch()` to write. Match existing `GameAction` union type.
**Firebase:** import `db` (Firestore) and `functions` (Cloud Functions) from `src/lib/firebase.ts`.

---

### FE-P01 — Create "How to Play" Screen

**New file to create:** `src/pages/HowToPlayPage.tsx`
**Also edit:** `src/App.tsx` — add route `/how-to-play` pointing to `HowToPlayPage`

Create a standalone page that players can access before or during gameplay. It should be styled consistently with the rest of the app (use `PageShell`).

**Structure:** A vertical list of stage cards. Each card has a thematic tagline, a brief mechanic explanation, and an icon or label. Do not reveal optimal strategies — only explain *what* each phase is and *why* it exists.

**Stage cards to include (copy exactly):**

**Card 1 — Decisions Round**
- Label: `"Decisions"`
- Tagline: `"Your bakery, your call."`
- Body: `"Each round, your team decides what to stock, how many staff to hire, and which machines to keep running. Every choice has a cost — plan carefully, because what you spend now comes out of your profits."`

**Card 2 — Auction: Advertisements**
- Label: `"Ad Auction"`
- Tagline: `"The loudest bakery wins the crowd."`
- Body: `"Teams bid against each other for advertising slots. The highest bidder wins that ad for the entire round — one month of exclusive reach. Ownership resets at every auction, so no one can hold an ad forever. There are four ad types: TV, Radio, Newspaper, and Billboard."`

**Card 3 — Auction: Chef Hiring**
- Label: `"Chef Auction"`
- Tagline: `"Great chefs don't come cheap."`
- Body: `"One chef is available each round. Teams bid to recruit them. Each chef specializes in a station and independently boosts production there — their output adds on top of your existing team. Chef speed multipliers do not stack; each chef handles their own station's work separately."`

**Card 4 — Results**
- Label: `"Results"`
- Tagline: `"The receipts don't lie."`
- Body: `"After every round, see how your bakery performed — revenue, costs, customer traffic, and where you stand on the leaderboard. Study the results before the next round begins."`

**Add a "Back" button** that returns to the previous page (`useNavigate(-1)`).

---

### FE-P02 — Global Phase Banner (Session Indicator)

**File to edit:** `src/components/game/RoundHeader.tsx`

Read `phase` from `useGame()`. Display a large, always-visible banner at the top of the game screen that shows the human-readable name of the current phase. This must be prominent — large font, full-width, high-contrast background.

**Phase → display name mapping (implement as a constant object):**
```ts
const PHASE_LABELS: Record<GamePhase, string> = {
  lobby:         "Lobby",
  email:         "Briefing",
  decide:        "Decisions Round",
  bid:           "Auction",
  simulating:    "Simulating…",
  results_ready: "Results",
  game_over:     "Game Over",
};
```

Render as:
```tsx
<div className="round-header__phase-banner">
  {PHASE_LABELS[phase]}
</div>
```

Add `.round-header__phase-banner` to `global.css`: large font size (e.g. `1.5rem`), bold, full-width, centered, high-contrast background (use an existing CSS variable or add `--phase-banner-bg`). This should be visually distinct from the rest of the header.

---

### FE-P03 — "Decide Round" → "Decisions Round" Rename

**Files to search and edit:** Run a search across `src/` for any literal string `"Decide Round"` or `"decide round"` and replace with `"Decisions Round"` / `"decisions round"`. Key locations expected:
- `src/pages/phases/DecidePhase.tsx` — the `<h2>` title
- Any tab header, button label, or breadcrumb that refers to this phase by the old name

Note: The internal `GamePhase` type value `"decide"` in `src/types/game.ts` stays as-is — only the *display* strings change. Do not rename the type or the reducer action payloads.

---

### FE-P04 — Rename "Advertisements" Role to "Bidder"

**Files to search and edit:** Search `src/` for any string `"Advertisements"` used as a role label, tab name, or badge. Replace with `"Bidder"`.

The Bidder role is responsible for both the advertisement auction and the chef auction. If there is any descriptive copy explaining the role, update it to read: `"The Bidder places all auction bids — advertisements and chef hiring."` Do not rename any Firestore field or type — only display strings.

---

### FE-P05 — Larger "Active Role" Button

**File to locate and edit:** Search `src/` for the button or UI element that indicates which team member is currently allowed to interact with the interface (likely in `GamePage.tsx`, `GameSidebar.tsx`, or `RoundHeader.tsx`).

Once located, increase the visual size so it is impossible to miss. Apply or add a CSS modifier such as `btn--role-indicator`. The button should be at minimum 48px tall, full-width or prominently placed, and use a high-contrast color to stand out from surrounding controls. If this element does not yet exist, create it as a labelled `<div>` or `<button>` that reads the active role from `GameContext` and displays it clearly (e.g. `"Active: Bidder"` or `"Your Turn: Manager"`).

---

### FE-P06 — Login: Create Team & Join Team Flow

**File to edit:** `src/pages/LandingPage.tsx`

**Context:** The current `LandingPage.tsx` has a single "Join Game" form that mocks local state. It needs to be replaced with a two-path flow:
1. **Create Team** — team name + logo image upload
2. **Join Team** — select from a list of teams already in the lobby

**Steps:**

1. Replace the current single form with two buttons side by side: `"Create a Team"` and `"Join a Team"`. Clicking either reveals its respective form below (toggle state with `useState`).

2. **Create Team form fields:**
   - `"Team Name"` — text input, max 30 chars
   - `"Team Logo"` — `<input type="file" accept="image/*">`. On file selection, use `FileReader.readAsDataURL()` to show an inline preview (a 60×60px rounded image). Store the file in component state.
   - `"Game Code"` — text input (existing, max 8 chars, uppercase)
   - `"Submit"` button — on click:
     1. Upload the image to Firebase Storage at `teams/{gameId}/{uid}/logo.{ext}` using `uploadBytes` and `getDownloadURL` from `firebase/storage`.
     2. Call the `createTeam` Firebase callable with `{ gameId, teamName, logoUrl }`.
     3. On success: dispatch `JOIN_GAME` with the returned player/team data and `navigate("/lobby")`.
     4. On error: show inline error.

3. **Join Team form:**
   - `"Game Code"` — text input
   - After a valid game code is entered (6 chars, real-time validation), call the `getTeamsInLobby` Firebase callable with `{ gameId }` and display a list of existing teams as selectable cards. Each card shows the team name and logo.
   - `"Your Name"` — text input
   - `"Join"` button — on click: call `joinGame` callable (already exists in backend) with `{ joinCode, displayName, teamId }`. On success: dispatch `JOIN_GAME` and navigate to `/lobby`.

4. Keep the existing form field CSS classes (`form-field`, `form-field__label`, `form-field__input`) and add new BEM classes for the team selection cards (`team-select__card`, `team-select__logo`, `team-select__name`).

---

### FE-P07 — Professor Dashboard: Split Layout + Phase Labels + Collapse Create Form

**File to edit:** `src/pages/ProfessorPage.tsx`

This task supplements the Apr 21 `FE-6` task with specific layout and UX requirements from playtesting. Complete FE-6 first (professor login, game creation, phase controls, player monitoring), then apply these changes on top:

**1. Collapse "Create a new game" section after game starts:**
Add a boolean `gameStarted` state (true once `game.phase !== "lobby"`). When `gameStarted === true`:
- Hide all game-creation form fields (professor name, rounds input).
- Show only the join code and a "Copy Link" button.
- The copy button calls `navigator.clipboard.writeText(window.location.origin + '?code=' + game.joinCode)`.

**2. Split-column layout:**
Replace the current stacked layout (`professor-page__controls`) with a two-column grid:
```css
.professor-page__dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}
```
- **Left column** (`.professor-page__left`): join code display, copy button, and all phase control buttons (Start, Advance, Pause, End, Reset).
- **Right column** (`.professor-page__right`): live leaderboard and the player submission status table (from FE-6d).

**3. User-friendly phase name display:**
Add a `<div className="professor-page__phase-label">` that shows the current phase using the same `PHASE_LABELS` mapping from `FE-P02`. Place it above the control buttons. Example: `"Current Phase: Decisions Round"`.

**4. Per-team ready/submitted indicators:**
Extend the player monitoring table from FE-6d. In the `"Round Submitted"` column, instead of plain text, render a colored status dot:
```tsx
<span className={`status-dot status-dot--${player.pendingDecision?.submitted ? 'ready' : 'waiting'}`} />
```
Add to CSS:
```css
.status-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
.status-dot--ready   { background: #22c55e; }  /* green */
.status-dot--waiting { background: #ef4444; }  /* red */
```

---

### FE-P08 — Auction Phase: Move Before Decisions + "Chef Hiring" Notification

**Files to edit:**
- `src/pages/GamePage.tsx`
- `src/components/game/tabs/AuctionTab.tsx`

**1. Update phase UI order in `GamePage.tsx`:**
Currently the sidebar shows Menu → Staff → Auction tabs. The auction (bid phase) now runs *before* the decisions phase. The sidebar tabs during `"bid"` phase should show: Auction tab prominently with a banner saying `"Place your bids before the timer runs out!"`. The Menu and Staff tabs are visible but locked (read-only) during `"bid"` — they're for reference only, not for input. Apply `readOnly={true}` to `MenuTab` and `StaffTab` when `game.phase === "bid"`.

Note: The backend phase order is being updated in BE-P07. This FE change makes the UI reflect that new order.

**2. "Chef Hiring" notification badge in `AuctionTab.tsx`:**
Currently the auction tab has an `Ad Slots` section and a `Chef Hiring` section styled as tabs or equal sections, which confuses players into thinking Chef Hiring is a separate clickable tab.

Change the `Chef Hiring` section header to look like an informational notification badge rather than a nav element:
```tsx
<div className="auction-tab__next-notice">
  <span className="auction-tab__next-notice-label">Next Auction:</span>
  <span className="auction-tab__next-notice-value">Chef Hiring</span>
</div>
```
Add to CSS:
```css
.auction-tab__next-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--cream); /* or a light yellow/amber background */
  border-left: 4px solid var(--caramel);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  margin: 1rem 0;
}
```
The chef bidding form should appear below this notice, not as a separate tab header.

---

### FE-P09 — Advertisement Auction: Copy, $ Sign, and Input Width

**File to edit:** `src/components/game/tabs/AuctionTab.tsx`

**1. Replace ad taglines with thematic copy:**
In the ad card rendering, replace the plain ad type names with thematic descriptions. Use this mapping (exact copy):

```ts
const AD_COPY: Record<string, { headline: string; tagline: string }> = {
  TV:        { headline: "Television",  tagline: "Make your advertisements come to life with motion pictures!" },
  Radio:     { headline: "Radio",       tagline: "A few rhymes and a good chime will be sure to reel in loyal customers." },
  Newspaper: { headline: "Newspaper",   tagline: "Extra! Extra! Read all about it — at least let's hope they do." },
  Billboard: { headline: "Billboard",   tagline: "Plant your brand right in their path. Hard to miss, impossible to forget." },
};
```

Render each card with `headline` as the card title and `tagline` in smaller text below it.

**2. Add an auction ownership description** above the ad cards section:
```tsx
<p className="auction-tab__ad-description">
  The highest bidder for each ad claims it for the entire round — one full month of exclusive reach.
  Ownership resets at the next auction, so no team can hold an ad forever. May the best bid win!
</p>
```

**3. Fix the `$` sign placement:**
The bid input currently uses `placeholder="$0"` with the dollar sign inside. Replace with a wrapper that shows `$` as a fixed prefix label outside the input:
```tsx
<div className="auction-tab__bid-wrapper">
  <span className="auction-tab__bid-prefix">$</span>
  <input
    type="number"
    className="auction-tab__bid-input"
    placeholder="0"
    min={0}
    ...
  />
</div>
```
Add to CSS:
```css
.auction-tab__bid-wrapper { display: flex; align-items: center; gap: 4px; }
.auction-tab__bid-prefix  { font-weight: bold; font-size: 1rem; }
.auction-tab__bid-input   { width: 120px; }   /* was too narrow — widen to fit 6-digit bids */
```

---

### FE-P10 — Chef Auction: Card Redesign, Labels, Multipliers, and Error Messages

**File to edit:** `src/components/game/tabs/AuctionTab.tsx`

This task builds on the chef section overhaul in Apr 21 FE-3b. After FE-3b is complete (real-time listener on round doc), apply these additional improvements:

**1. Numbered labels:**
Each chef card must display a sequential number as its primary label (`#1`, `#2`, etc. — based on array index). This disambiguates chefs with identical names. Add:
```tsx
<span className="chef-card__number">#{index + 1}</span>
```

**2. Nationality + flag:**
The chef data returned from Firestore (after BE-P02 is deployed) will include `nationality` and `nationalityCode` fields. Display a flag emoji above the chef name:
```tsx
<span className="chef-card__flag">{chef.flagEmoji}</span>
<span className="chef-card__nationality">{chef.nationality}</span>
```
If `flagEmoji` is not yet available from the backend, use a placeholder `"🌍"` until BE-P02 is deployed.

**3. Minimum Ask display:**
Each chef card must show the minimum bid floor, labeled as `"Minimum Ask"` (never `minBidFloor`). Read from `chef.minimumAsk` in the Firestore data:
```tsx
<span className="chef-card__minimum-ask">Minimum Ask: ${chef.minimumAsk.toLocaleString()}</span>
```

**4. Skill multiplier table:**
Add a description section inside each chef card that shows the multipliers for that chef's skill tier. Map `chef.skillTier` (`"low"`, `"medium"`, `"high"`) to these display values:
```ts
const SKILL_MULTIPLIERS = {
  low:    { label: "Low Skill",    nonSpecialty: "1.0x",  specialty: "1.4x" },
  medium: { label: "Medium Skill", nonSpecialty: "1.25x", specialty: "1.75x" },
  high:   { label: "High Skill",   nonSpecialty: "1.6x",  specialty: "2.2x"  },
};
```
Render as a small 2-column table inside the chef card:
```
| Item Type     | Multiplier |
| Non-specialty | 1.25x      |
| Specialty     | 1.75x      |
```
Below the table, add a note:
```
"Speed multipliers do not stack. Each chef independently boosts production at their own station. Total production is the sum of all chefs' individual outputs."
```

**5. Add a section description above the chef cards:**
```tsx
<p className="auction-tab__chef-description">
  Win this round's chef to boost production at their station. Each chef works independently —
  their output adds on top of your existing team's. Multipliers do not stack across chefs.
</p>
```

**6. Replace raw error messages:**
When bid submission fails because the bid is below the minimum ask, the current error message exposes internal variable names (e.g. `"Chef 'a13c5f38b9348c63' bid 30 is below minBidFloor 25000"`). Replace with a user-friendly string. In the error handler for `submitBids` (or wherever the error is caught in the auction tab):
```ts
const friendlyError = (raw: string): string => {
  if (raw.includes("minBidFloor") || raw.includes("minimum")) {
    const match = raw.match(/minBidFloor (\d+)/);
    const floor = match ? `$${parseInt(match[1]).toLocaleString()}` : "the minimum";
    return `Your bid is below the Minimum Ask of ${floor}. Please increase your bid.`;
  }
  return "Bid could not be submitted. Please try again.";
};
```

---

### FE-P11 — Chef Auction: Timer Enforcement, Multiple Bids, Submit Buttons

**File to edit:** `src/components/game/tabs/AuctionTab.tsx`

**1. Individual "Submit Bid" button per chef card:**
Each chef card currently has a bid input with no per-card submit. Add a `"Submit Bid"` button directly on each card:
```tsx
<button
  className="btn btn--small chef-card__submit"
  onClick={() => handleSubmitChefBid(chef.id)}
  disabled={timerExpired || !chefBids[chef.id]}
>
  Submit Bid
</button>
```
`handleSubmitChefBid(chefId)` calls the `submitBids` callable with just that chef's bid. This allows a player to engage in a single bid war without submitting everything at once.

**2. "Submit All Bids" button:**
Keep the existing single "Lock In Bids" / submit button but rename it to `"Submit All Bids"` and place it at the bottom of the full auction tab (below both ad and chef sections). It submits all pending ad and chef bids at once.

**3. Allow re-submission until timer expires:**
Remove any client-side logic that disables inputs or submission after a first submit. Players can change their bid and re-submit as many times as they like until the timer reaches zero. The backend (BE-P04) handles accepting the latest bid. Do not disable the input or button after one submission — only disable when `timerExpired === true`.

**4. Timer-expired popup:**
Track auction timer state. When the timer reaches zero, set `timerExpired = true`. If a player attempts to submit a bid after the timer expires, instead of submitting, show a modal or toast message:
```tsx
{showTimerPopup && (
  <div className="auction-tab__timer-popup">
    Auction timer is up! Results will be displayed shortly.
  </div>
)}
```
Dismiss the popup after 3 seconds. Block all bid inputs and buttons when `timerExpired === true` using the `disabled` prop.

**5. Disable all bid inputs after timer:**
When `timerExpired === true`, set `disabled={true}` on every bid `<input>` and every submit button in both the ad section and chef section.

---

### FE-P12 — Post-Auction Results Screen

**New file to create:** `src/pages/phases/AuctionResultsPhase.tsx`

**Also edit:** `src/pages/GamePage.tsx` — render `AuctionResultsPhase` when `phase === "auction_results"` (a new phase value — see BE-P07 for the backend phase that triggers this).

Create a screen that displays who won each auction slot immediately after both the ad and chef auction phases close.

**Layout:**
1. **Header:** `"Auction Results"` with current round number.
2. **Ad Winners section:** A row of 4 cards (one per ad type: TV, Radio, Newspaper, Billboard). Each card shows:
   - Ad type name + thematic tagline (same copy as FE-P09)
   - Winner's team name and team logo (read from the round document in Firestore: `/games/{gameId}/rounds/round_{n}` → `auctionResults.ads[adType].winnerId`)
   - Winning bid amount
   - If no winner (no bids placed): show `"Unclaimed"`
3. **Chef Winner section:** A single card showing:
   - Chef name, nationality, skill tier
   - Winning team name and logo
   - Winning bid amount
4. **Advertisement Reveal animation:** Pick one of the 4 ad types at random (using `Math.random()` client-side). Display it full-width with the winning team's logo image overlaid, simulating an ad being broadcast. If that ad was unclaimed, show `"No winner this round"`.
5. **"Continue" button:** Visible to all players but only functional for the professor (or auto-advances after a timer). Calls `advancePhase`.

**Data source:** Subscribe to `/games/{gameId}/rounds/round_{currentRound}` via `onSnapshot`. The `auctionResults` field is written by the backend simulation (BE-5 in the Apr 21 file).

---

### FE-P13 — Kitchen Roster Screen Redesign

**File to locate and edit:** Search `src/` for any component named `KitchenRoster`, `ChefRoster`, or similar. If it doesn't exist yet, create `src/pages/phases/KitchenRosterPhase.tsx` and wire it into `GamePage.tsx` when `phase === "roster"` (or as a panel within the results/lobby phase — coordinate with the professor dashboard flow).

**Redesign requirements:**

**1. Slot cards:**
Replace any list/table UI with individual square cards for each chef slot. Each card should be ~160×200px and contain:
- A chef illustration (pixel-art SVG — see FE-P14 for the asset)
- Chef name (centered below illustration)
- Nationality + flag emoji
- Skill tier badge (`"Low"`, `"Medium"`, or `"High"` with a color-coded background: green/yellow/red)
- Station assignment label

**2. Empty slots:**
Unoccupied roster slots render the same card frame but with a dashed border, a `"+"` icon in the center, and the label `"Empty Slot"`.

**3. "Lay Off" button:**
Each occupied chef card has a `"Lay Off"` button at the bottom. On click:
- Show a `confirm()` dialog: `"Lay off [Chef Name]? This cannot be undone for this round."`
- On confirm: call the `layOffChef` Firebase callable with `{ gameId, chefId }` and optimistically update local state to show the slot as empty.

**4. New hires staging section:**
Below the main roster grid, add a `"New Hires Available"` section. This shows a separate row of cards for chefs won in the most recent auction (read from the round result: `chefWon` field on the player's round document). Each new hire card has the same design as a roster card plus a `"Assign to Slot"` button. Clicking it prompts the player to select an empty slot from the main grid.

**5. Rename "Head Chef" → "Basic Chef":**
Search `src/` for any string `"Head Chef"` used as a display label and replace with `"Basic Chef"`. This refers to the default starter chef tier. Do not rename any Firestore field or type — display strings only.

---

### FE-P14 — Replace Emoji Chef Asset with Pixel-Art SVG

**Files to edit:** Any component that renders a chef emoji (e.g. `"👨‍🍳"` or `"🧑‍🍳"`) as the chef illustration.

**Steps:**
1. The pixel-art chef spritesheet SVG already exists at `games/bakery-bash/assets/svg/characters/chef-walk-spritesheet.svg`. Copy it into `games/bakery-bash/app/public/assets/characters/chef.svg`.
2. Replace all inline emoji chef representations with `<img src="/assets/characters/chef.svg" className="chef-card__avatar" alt="Chef" />`.
3. Add to CSS: `.chef-card__avatar { width: 64px; height: 64px; image-rendering: pixelated; }`.
4. For the barista station chef, use `barista-walk-spritesheet.svg` in the same way.

---

### FE-P15 — Round Results: Leaderboard, Card Layout, Remove Duplicate CSV

**File to edit:** `src/pages/phases/ResultsPhase.tsx`

This task supplements Apr 21 FE-4 with additional layout and data requirements from playtesting. Complete FE-4 first, then apply:

**1. Leaderboard panel:**
Add a `"Leaderboard"` section at the bottom of the results screen. Read from `GameContext` leaderboard state (populated by FE-5 Listener 5). Render as a ranked list:
```tsx
<div className="results-phase__leaderboard">
  <h3>Standings</h3>
  {leaderboard.map((entry, i) => (
    <div key={entry.uid} className="results-phase__rank-row">
      <span className="results-phase__rank">#{i + 1}</span>
      <img src={entry.logoUrl} className="results-phase__team-logo" />
      <span className="results-phase__team-name">{entry.displayName}</span>
      <span className="results-phase__team-revenue">${entry.cumulativeRevenue.toLocaleString()}</span>
    </div>
  ))}
</div>
```

**2. Card layout for metrics:**
Replace the current `results-phase__stat` rows (plain text label + value) with large metric cards. Each card has a bold value, a smaller label, and a background color per metric type:
```tsx
<div className="results-phase__metric-cards">
  <div className="results-phase__metric-card results-phase__metric-card--revenue">
    <span className="results-phase__metric-value">${latest.revenue.toLocaleString()}</span>
    <span className="results-phase__metric-label">Revenue</span>
  </div>
  {/* repeat for Net Revenue, Staffing Cost, Inventory Cost, Customers */}
</div>
```
Add CSS:
```css
.results-phase__metric-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.results-phase__metric-card  { padding: 1.5rem; border-radius: 8px; text-align: center; }
.results-phase__metric-value { font-size: 2rem; font-weight: bold; display: block; }
.results-phase__metric-label { font-size: 0.875rem; color: #666; }
.results-phase__metric-card--revenue { background: #f0fdf4; }
```

**3. Remove duplicate CSV download:**
Search `ResultsPhase.tsx` for any `<a>` or `<button>` element that triggers a CSV download or sends a CSV email. Keep only **one** — the primary large `"Download CSV"` button. Remove the secondary mail icon / email button entirely.

---

### FE-P16 — Fix Round 2 Displaying Round 1 Data

**Files to investigate:** `src/pages/GamePage.tsx`, `src/pages/phases/ResultsPhase.tsx`, `src/pages/phases/AuctionResultsPhase.tsx` (new), and `src/hooks/useGameListener.ts` (from FE-5).

**Bug:** When Round 2 starts, it incorrectly shows ad winners and decisions from Round 1.

**Root cause to check:**
1. In `useGameListener.ts` (FE-5), Listener 3 (round result) uses `currentRound` in the Firestore path. Verify the `useEffect` dependency array includes `currentRound` so the listener re-subscribes when the round increments. If not, the listener stays bound to `round_1`'s document.
2. In `ResultsPhase.tsx` and `AuctionResultsPhase.tsx`, confirm all data reads use the *current* round from `useGame().currentRound` and not a stale closure or hardcoded `round_1`.
3. In `GameContext.tsx`, verify the `ADVANCE_ROUND` action properly updates `currentRound` (currently it increments by 1 but doesn't reset `roundResults` — confirm this is intentional and that `roundResults` is indexed by round number, not appended blindly).

**Fix:** Ensure Listener 3's `useEffect` has `[gameId, uid, currentRound]` as dependencies so it unsubscribes from the old round document and re-subscribes to the new one when `currentRound` changes.

---

---

## BACK-END TASKS

**Stack:** Firebase Cloud Functions v2 (Node.js 20)
**Entry point:** `games/bakery-bash/backend/functions/index.js`
**Schema:** `games/bakery-bash/backend/firestore-schema.js`
**Imports already set up at top of `index.js`:** `onCall`, `HttpsError`, `db`, `FieldValue`, `Timestamp`

**Note:** Core Cloud Functions (createGame, startGame, advancePhase, submitDecision, simulateRound, exportCSV, professor auth, security rules) are in `backend-new-tasks-Apr-21.md` (BE-0 through BE-9). Only new tasks from playtesting are listed below.

---

### BE-P01 — Fix Chef Name Generation: No Duplicates

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Where this is called:** In the function that generates available chefs for an auction round (likely part of `simulateRound` or a helper called when creating a round document).

**Problem:** Multiple chefs in the same auction have the same name (e.g. three "Aikos" or two "Marcels"). This happens because names are drawn randomly from a pool without deduplication.

**Fix:** Track used names within a single generation call. When generating the list of N chefs for a round, use a `Set` to prevent reuse:

```js
function generateChefs(count) {
  const usedNames = new Set();
  const chefs = [];
  let attempts = 0;
  while (chefs.length < count && attempts < count * 10) {
    const candidate = generateSingleChef();
    if (!usedNames.has(candidate.name)) {
      usedNames.add(candidate.name);
      chefs.push(candidate);
    }
    attempts++;
  }
  return chefs;
}
```

Also verify the name pool is large enough (at least 40+ unique names across all nationalities combined) to avoid forced collisions when generating 9 chefs.

---

### BE-P02 — Chef Nationality: Assign and Expose

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Where this is called:** The `generateSingleChef()` helper (or wherever chef data is constructed before writing to Firestore).

**Steps:**

1. Define a nationality pool. Each entry has a `nationality` string, a `flagEmoji`, and a `names` array:
```js
const CHEF_NATIONALITIES = [
  { nationality: "French",   flagEmoji: "🇫🇷", names: ["Marie", "Pierre", "Amélie", "Jean", "Claire"] },
  { nationality: "Japanese", flagEmoji: "🇯🇵", names: ["Aiko", "Kenji", "Yuki", "Haru", "Mei"] },
  { nationality: "Italian",  flagEmoji: "🇮🇹", names: ["Marco", "Sofia", "Luca", "Giulia", "Enzo"] },
  { nationality: "Mexican",  flagEmoji: "🇲🇽", names: ["Carlos", "Rosa", "Miguel", "Elena", "Diego"] },
  { nationality: "Indian",   flagEmoji: "🇮🇳", names: ["Priya", "Arjun", "Divya", "Raj", "Nisha"] },
  { nationality: "American", flagEmoji: "🇺🇸", names: ["Jake", "Emma", "Tyler", "Maya", "Cody"] },
  { nationality: "Korean",   flagEmoji: "🇰🇷", names: ["Ji-ho", "Soo-yeon", "Min-jun", "Ha-eun", "Tae-yang"] },
  { nationality: "Brazilian",flagEmoji: "🇧🇷", names: ["Gabriel", "Isabela", "Lucas", "Ana", "Rafael"] },
];
```

2. When generating a chef, pick a random nationality entry, then pick a random name from that entry's `names` array. Attach `nationality`, `flagEmoji`, and `nationalityCode` (lowercase ISO, e.g. `"fr"`) to the chef object.

3. Write these fields to the chef record in Firestore so the frontend can read them via the round document listener.

---

### BE-P03 — Consistently Generate 9 Chefs Per Auction Round

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Where this is called:** Wherever chefs are generated and written to the round document or made available for auction.

**Fix:** Replace any variable-count or per-round-config chef count with a hardcoded constant of 9:

```js
const CHEFS_PER_ROUND = 9;
```

Call `generateChefs(CHEFS_PER_ROUND)` on every round. Write the resulting array to `/games/{gameId}/rounds/round_{n}` under `availableChefs`. The frontend reads this to display the 9 chef cards.

---

### BE-P04 — Allow Multiple Bid Re-Submissions Until Timer Expires

**File to edit:** `games/bakery-bash/backend/functions/index.js`
**Relevant function:** `exports.submitBids` (from Apr 21 BE task — if not yet implemented, this is the spec update for when it is)

**Problem:** Bid submission is currently treated as a one-time lock. Players cannot update their bid once submitted, even if time remains on the auction.

**Fix:** Change bid submission from an append/lock to an overwrite. When a player submits a bid:

```js
// Instead of checking if bids are already submitted, just overwrite:
transaction.update(playerRef, {
  'pendingBids.adBid': decision.adBid,
  'pendingBids.chefBid': decision.chefBid,
  'pendingBids.lastSubmittedAt': FieldValue.serverTimestamp(),
});
// Do NOT set a "locked" or "submitted" flag for bids — only decisions get that treatment
```

Remove any check that throws `failed-precondition` for "already submitted" on bid calls. The auction resolves based on `pendingBids` at the time `simulateRound` runs — whatever is there at that moment is the final bid.

---

### BE-P05 — Server-Side Timer Enforcement: Reject Bids After Timer

**File to edit:** `games/bakery-bash/backend/functions/index.js`
**Relevant function:** `exports.submitBids`

**Problem:** Players can submit bids after the auction timer has expired (after `phaseEndTime` has passed).

**Fix:** At the start of `submitBids`, read the game's `phaseEndTime` and compare to `Timestamp.now()`:

```js
const game = await db.collection("games").doc(gameId).get();
if (game.data().phase !== "bid") {
  throw new HttpsError("failed-precondition", "Auction is not currently open.");
}
const phaseEnd = game.data().phaseEndTime;
if (phaseEnd && Timestamp.now().toMillis() > phaseEnd.toMillis()) {
  throw new HttpsError(
    "failed-precondition",
    "The auction timer has expired. No more bids are accepted."
  );
}
```

Return the error code `"failed-precondition"` with the message above — the frontend (FE-P11) uses the error message to trigger the timer-expired popup.

---

### BE-P06 — Include Minimum Ask in Chef Data

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Where this is called:** The chef generation helper (BE-P01 area).

**Fix:** Add a `minimumAsk` field to each generated chef object. The minimum ask varies by skill tier:
```js
const MINIMUM_ASK = { low: 5000, medium: 15000, high: 25000 };

// When generating a chef:
chef.minimumAsk = MINIMUM_ASK[chef.skillTier];
```

Write `minimumAsk` to the chef's record in the round document. The `submitBids` function should validate that the submitted bid ≥ the chef's `minimumAsk` for that round:

```js
if (chefBid.amount < chef.minimumAsk) {
  throw new HttpsError(
    "invalid-argument",
    `Your bid for Chef #${chefBid.chefIndex} is below the Minimum Ask of $${chef.minimumAsk.toLocaleString()}. Please increase your bid.`
  );
}
```

Note the error message uses `chefIndex` (1-based) and `Minimum Ask` — never `minBidFloor` or internal variable names.

---

### BE-P07 — Phase Order Change: Auction Before Decisions

**File to edit:** `games/bakery-bash/backend/functions/index.js`
**Relevant function:** `exports.advancePhase` (Apr 21 BE-3)

**Current phase order:** `email → decide → bid → simulating → results_ready`
**New phase order:** `email → bid → auction_results → decide → simulating → results_ready`

**Changes to the transition map in `advancePhase`:**
```js
// Old:
// email → decide → bid → simulating
// New:
const PHASE_TRANSITIONS = {
  "email":           "bid",
  "bid":             "auction_results",   // new phase: show results of auction
  "auction_results": "decide",
  "decide":          "simulating",
  "simulating":      "results_ready",
  "results_ready":   // → "email" (next round) or "game_over"
};
```

**New `"auction_results"` phase:**
- Add `"auction_results"` to the `GamePhase` type in `games/bakery-bash/app/src/types/game.ts`.
- When transitioning `bid → auction_results`, trigger `resolveAuctions(gameId)` — an internal function that runs only the auction resolution steps from `simulateRound` (Steps 3 and 4 from the Apr 21 BE-5 spec) and writes `auctionResults` to `/games/{gameId}/rounds/round_{n}`. Does **not** run revenue simulation (that still happens when `decide → simulating`).
- Duration from config: add `phaseDurations.auction_results` (e.g. 30 seconds for teams to review results).

**Update `GameConfigDocument` default in `firestore-schema.js`:** add `"auction_results": 30` to `phaseDurations`.

---

### BE-P08 — Team Creation with Logo Upload

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**New function to add:** `exports.createTeam`

This is called by the frontend (FE-P06) when a player creates a new team during login.

**Input shape:**
```js
{
  gameId: string,
  teamName: string,    // max 30 chars
  logoUrl: string,     // Firebase Storage download URL (uploaded by frontend before calling this)
}
```

**Steps:**
1. Require `request.auth`. Validate `teamName` length (2–30 chars, no profanity — skip profanity filter for now, just length check).
2. Read game doc. Verify `phase === "lobby"`.
3. Check that `teamName` is not already taken in this game: query `/games/{gameId}/teams` where `name == teamName`. Throw `already-exists` if found.
4. Write a new document to `/games/{gameId}/teams/{teamId}` (auto-generated):
```js
{
  name: teamName,
  logoUrl,
  createdBy: request.auth.uid,
  createdAt: FieldValue.serverTimestamp(),
  memberUids: [request.auth.uid],
}
```
5. Update the player's document at `/games/{gameId}/players/{uid}` to include `teamId` and `teamLogoUrl`.
6. Return `{ teamId, teamName, logoUrl }`.

---

### BE-P09 — Lobby Teams Listing Endpoint

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**New function to add:** `exports.getTeamsInLobby`

Called by the frontend (FE-P06 Join Team flow) to populate the list of teams a player can join.

**Input shape:** `{ gameId: string }`

**Steps:**
1. Require `request.auth`.
2. Read game doc. Verify it exists.
3. Query `/games/{gameId}/teams` (all documents).
4. Return `{ teams: [{ teamId, name, logoUrl, memberCount }] }`.
   - `memberCount` = length of `memberUids` array on each team document.

---

### BE-P10 — Round 2 Data Bug: Isolate Round Data

**File to edit:** `games/bakery-bash/backend/functions/index.js`

**Bug:** Round 2 displays ad winners and decisions from Round 1.

**Investigation checklist:**

1. In `simulateRound(gameId)`, verify that when writing `auctionResults` to `/games/{gameId}/rounds/round_{n}`, the `n` variable is read from the game document at the time of simulation — not cached from a previous call. Add a fresh `db.collection("games").doc(gameId).get()` at the start of `simulateRound` to get the current `currentRound`.

2. In `advancePhase`, when transitioning `results_ready → email` (round increment), verify `submittedCount` is reset to 0 AND that `pendingDecision.submitted` is reset to `false` on all player documents:
```js
// After incrementing currentRound, reset all players' submission flags:
const playersSnap = await db.collection("games").doc(gameId).collection("players").get();
const batch = db.batch();
playersSnap.docs.forEach(doc => {
  batch.update(doc.ref, {
    'pendingDecision.submitted': false,
    'pendingDecision.submittedAt': null,
    'pendingBids.adBid': { adType: null, amount: 0 },
    'pendingBids.chefBid': { skillLevel: 0, amount: 0 },
  });
});
await batch.commit();
```

3. Verify that the round result document path uses the **post-increment** `currentRound` value, not the pre-increment value. Log `currentRound` before and after the increment to confirm.

---

*Last updated: 2026-04-21 | Post-playtesting session*
*Infrastructure tasks (Firestore wiring, Cloud Functions): see `frontend-new-tasks-Apr-21.md` and `backend-new-tasks-Apr-21.md`*
