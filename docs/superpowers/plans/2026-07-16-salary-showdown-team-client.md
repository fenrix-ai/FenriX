# Salary Showdown — Team-Facing React Client Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The nine team-facing screens (Landing/Join, Lobby, Front Office, Free Agency, Star Auction, Set Lineup, Simulate, Results, Standings) as a React app running against the existing, finished backend on the Firebase emulator suite — every game action flowing through the eight production callables, every screen visually verifiable in the browser from a seeded demo game.

**Architecture:** A Vite + React 19 + TypeScript SPA at `games/salary-showdown/app/` (fresh code — Bakery Bash patterns ported, zero files copied). Three layers: a pure domain library (`lib/`) that mirrors the backend's money math and error contract for input-time gating and display; live-data contexts (`AuthContext`, `GameContext`) built on Firestore `onSnapshot`; and one page per screen routed by the server's `phase` field. The server stays the sole authority — the client never mutates Firestore directly except its own `displayName`.

**Tech Stack:** React 19, TypeScript, Vite, react-router-dom 7, firebase JS SDK 12 (anonymous auth, Firestore, callable functions — all against the emulator), @dnd-kit/core (lineup drag), vitest + @testing-library/react + jsdom (unit), vitest against the live emulator suite (integration).

**Roadmap context:** Plan 1 (backend, complete: 16 files / 102 tests green) froze the Firestore contract in `games/salary-showdown/backend/SCHEMA.md` + `README.md`. Plan 3 (professor panel, projector, finale, deploy) comes after this plan. Spec: `docs/superpowers/specs/2026-07-14-salary-showdown-design.md` (authoritative — its rules beat the mockups; the mockups are layout-authoritative only). Approved mockups: `.superpowers/brainstorm/59786-1784072265/content/{front-office-v5,free-agency-v2,star-auction-v2,set-lineup-v2,projector-shuffle}.html`.

**One additive backend change is in scope (Task 3):** a read-only `getLobby` callable. The Firestore rules (correctly) deny every read to non-members, so a client holding only a join code cannot render the franchise/role picker — `joinGame` demands a `teamId` the client has no legal way to discover. Plan 1's smoke test never hit this because it reads via the Admin SDK. Nothing else in the backend is touched by this plan.

## Global Constraints

Every task's requirements implicitly include this section. The doc shapes and signatures below were verified against `backend/functions/src/*.js` at HEAD (they correct two known drifts in the prose docs: `games/{id}.config` contains **only** `{cap, totalRounds}` — there is **no** `config.timers` key despite SCHEMA.md listing one — and the game doc also carries `professorUid`, `createdAt`, `standingsSeed`, which SCHEMA.md's field list omits).

### Scale envelope (a real class: 20–23 franchises, ~70 concurrent clients)

Every screen in this plan must stay inside this budget; if a task seems to need more, that is a plan bug to raise, not a thing to improvise.

- **Per-client read surface:** ~6 snapshot listeners (game doc, own membership, teams collection, current market doc, current auction doc + own private bids, current round doc) plus a one-time 175-doc catalog fetch. The heaviest payload is `rounds/{r}` (carries `boxCsv`): ~300–400KB at 20 teams → ~25MB/round of egress across 70 clients — cents on Blaze; spec §12 prices the whole session at ~$1. Never add a listener that fans out per-player or per-bid.
- **Bidding is sealed, and that is the load design, not just the game design.** `submitBids` writes ONLY the caller team's own `private/auction` doc — during the auction phase you have at most ~23 writers on ~23 *distinct* docs, zero shared-doc contention, and **no live shared bid state exists anywhere** for 70 clients to watch (nothing like a live top-bid ticker — the class of mid-phase fan-out that lagged under classroom load in Bakery Bash structurally cannot occur here). Resolution is one server-side pass at phase close by the single professor caller. Do not "improve" the auction screen with any live cross-team bid signal; secrecy and scale both forbid it.
- **Free agency is contention-free by rule:** non-exclusive copies mean there is no shared pool decrement and no player-taken race to lose; every `signPlayer` transacts on the caller's own team doc. The only contested write in the entire game is the unsold-star claim token, which is transactional server-side (`STAR_TAKEN` for the loser — already in the error table).
- **Hard bounds inherited from Plan 1 adjudications:** `rounds/{r}` approaches Firestore's 1MiB doc limit around **28+ teams**, and the >21-team balanced scheduler is descoped — so a session must cap at **21 franchises** until those land (professor-panel concern, Plan 3; a 70-student class at 3 per team ≈ 23, so the cap is a real instruction, not a footnote).
- **`getLobby` polling is bounded:** 3s interval, only while the Landing picker is open, stops on join — worst case ~130K reads across a 5-minute, 70-client join window (pennies). Do not tighten the interval.
- **Phase-close races at scale:** the client's duties are (a) always send `expectedPhase`/`expectedRound`, (b) let PhaseRouter yank the screen the instant `game.phase` changes — a submit clicked after the flip fails fast with a mapped message. The residual last-second-submit TOCTOU and the `advancePhase` double-click race are **backend** fixes (known review findings) whose windows widen with team count; do not attempt client-side workarounds beyond the two duties above.
- **The emulator is not production.** This plan proves correctness, not load: the deploy + load drill (Functions cold-start burst on 70 near-simultaneous `joinGame` calls, real-network listener behavior) is Plan 3's exit gate.

### Environment (exact values)

- Repo root: `/Users/dylanmassaro/FenriX`. App: `games/salary-showdown/app/`. Backend: `games/salary-showdown/backend/` (do not modify outside Task 3).
- Emulators — project `salary-showdown-dev`: Functions `127.0.0.1:5101`, Firestore `127.0.0.1:8180`, Auth `127.0.0.1:9199`, Emulator UI `127.0.0.1:4100`. Boot: `cd games/salary-showdown/backend/functions && npm run emu`. The Firestore emulator needs Java: prefix commands with `PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`. `firebase` is a **global** binary.
- Vite dev server: port **5176**, `--strictPort` (5173–5175 belong to other projects in `.claude/launch.json`).
- Backend test suite (must stay green — run after Task 3): `cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"`.
- App integration tests (`*.itest.tsx`) run inside the full emulator suite: `cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only functions,firestore,auth "cd ../app && npx vitest run -c vitest.integration.config.ts"`.

### Callable API (frozen — signatures verbatim from `backend/functions/src/game.js`)

All callables require a signed-in (anonymous) user. Role enforcement is server-side per callable.

| Callable | Payload | Returns | Caller |
|---|---|---|---|
| `createGame` | `{ teamNames: string[] }` (≥2) | `{ gameId, joinCode }` | any (creator becomes professor) |
| `getLobby` | `{ joinCode: string }` | `{ gameId, status, phase, round, teams: [{teamId, name, claimedRoles: string[]}] }` | any (added by Task 3) |
| `joinGame` | `{ joinCode, teamId, role: 'GM'\|'Scout'\|'Coach', displayName }` | `{ gameId, teamId, role }` | any |
| `startSeason` | `{ gameId }` | `{ phase: 'FREE_AGENCY' }` | professor |
| `advancePhase` | `{ gameId, expectedPhase, expectedRound }` | `{ round, phase }` | professor |
| `signPlayer` | `{ gameId, pid: number, years: number }` | `{ contract }` | GM |
| `cutRosterPlayer` | `{ gameId, pid: number }` | `{ deadMoney }` | GM |
| `submitBids` | `{ gameId, bids: { [pid]: {rate: number, years: number} } }` | `{ accepted: number }` | Scout |
| `submitLineup` | `{ gameId, lineup: {starters: number[], sixth: number, bench: number[], playstyle: string} }` | `{ ok: true }` | Coach |

**Ruling (restated inline wherever advancePhase is called):** `expectedPhase`/`expectedRound` are optional server-side but **mandatory in every call this plan makes** (seed script, tests). They are the double-click guard; a mismatch throws `failed-precondition` with message `PHASE_MISMATCH`, which callers treat as "already advanced — refetch, don't retry."

**Ruling:** `submitBids` must **always** send a plain object (empty `{}` to clear bids is fine). Sending `bids: null` destructively wipes the stored bid set server-side and surfaces an internal error — a known backend sharp edge this client must never trigger.

**Ruling:** `submitLineup` requires **every active roster pid to appear exactly once** across `starters + [sixth] + bench` (server check `all.length === activePids.length`). `bench` therefore holds *everyone not starting and not sixth* — 3 to 4 entries on a 9–10-man roster — and **order matters**: only `bench[0]` and `bench[1]` play and generate box scores (engine and sim both take `bench.slice(0, 2)`; spots 9–10 are inactive depth per spec §8.2). The lineup UI must expose this (Task 12).

### Error contract (frozen — verified by a full grep census of `HttpsError` throws)

Client-side, a callable failure is a `FirebaseError` with `code` `functions/<kind>` and `message` = the server string. **Match on `message`, not `code`**: `BAD_YEARS` arrives as `failed-precondition` from `signPlayer` but `invalid-argument` from `submitBids`. The complete inventory and the student-facing copy this plan renders:

| Server message | Thrown by | Student-facing copy |
|---|---|---|
| `CAP_EXCEEDED:{round}:{payroll}` | signPlayer | `Over the cap: round {round} payroll would hit ${payroll}M against the $100.0M cap.` |
| `POSITION_LOCK` | signPlayer | `Signing him would leave too few open slots to field 2 G / 2 W / 1 B.` |
| `STAR_TAKEN` | signPlayer | `Another team claimed this star first.` |
| `ALREADY_SIGNED` | signPlayer | `He is already under contract with your team.` |
| `NOT_IN_MARKET` | signPlayer | `He is not signable tonight.` |
| `ROSTER_FULL` | signPlayer | `Your roster is full — 10 players is the maximum.` |
| `BAD_YEARS` | signPlayer, submitBids | `That contract length is not available this round.` |
| `MIN_BID` | submitBids | `Bid is below tonight's league minimum.` |
| `BID_STEP` | submitBids | `Bids move in $0.1M steps.` |
| `NOT_IN_WAVE` | submitBids | `That star is not on tonight's block.` |
| `BAD_RATE` | submitBids | `Enter a valid salary figure.` |
| `PHASE_MISMATCH` | advancePhase | (never student-facing; harness/tests treat as "already advanced") |
| `BAD_PLAYSTYLE` | submitLineup | `Pick one of the five playstyles.` |
| `DUPLICATE_PLAYER` | submitLineup | `A player appears in two lineup spots.` |
| `NOT_ON_ROSTER` | submitLineup | `Your lineup does not match your current roster — it has been refreshed.` |
| `BAD_TEMPLATE` | submitLineup | `Starters must be exactly 2 Guards, 2 Wings, 1 Big, plus a Sixth Man.` |
| `BAD_SHAPE` | submitLineup | `The lineup did not submit cleanly — rearrange and resubmit.` |

Prose messages (no stable code — match exactly or by prefix): `market is closed`, `auction is closed`, `lineups are locked`, `only expiring contracts re-sign here`, `cut: pid {pid} not on roster` (prefix `cut:`), `{role} role already taken on that team` (kind `functions/already-exists` — the **sixth** HttpsError kind; README's list of five omits it), `sign in first`, `not in this game`, `GM only` / `Scout only` / `Coach only`, `bad join code`, `bad role`, `team not found`, `need at least 2 teams`, `already started`, `season not started`, `game over`, `professor only`, `game not found`. Unmapped errors render as: `That did not go through — try again.` plus the raw message in smaller type.

### Firestore document shapes (frozen — read-only to this client except own `displayName`)

```
games/{gameId}
  joinCode: string            status: 'lobby'|'active'|'finished'
  phase: 'LOBBY'|'FRONT_OFFICE'|'FREE_AGENCY'|'AUCTION'|'LINEUP'|'SIMULATE'|'RESULTS'|'FINALE'
  round: 0-5                  timerEndsAt: null   (ALWAYS null in Plan 2 — professor timers are Plan 3;
                                                   every timer component must render a null state)
  teamCount: number           standingsSeed: string
  professorUid: string        createdAt: Timestamp
  config: { cap: 100.0, totalRounds: 5 }          (NO timers key — never read config.timers.
                                                   cap/totalRounds are decorative; render nothing editable)
games/{gameId}/players/{uid}      { teamId, role: 'GM'|'Scout'|'Coach', displayName }
games/{gameId}/teams/{teamId}     (PUBLIC — all teams readable by every member)
  name, wins, losses, pointDiff, pointsFor
  roster:    [{ pid, rate, startRound, years, viaAuction, hardship }]
  deadMoney: [{ pid, rate, startRound, endRound }]
  spendLog:  [{ pid, rate, years, startRound, viaAuction, hardship }]   (append-only; cuts stay)
  lineup: { starters: number[5], sixth: number, bench: number[], playstyle } | null
  lineupLockedRound: number         hardshipUsed: number[]
games/{gameId}/teams/{teamId}/private/auction   { bids: {[pid]: {rate, years}}, round }  (own team only)
games/{gameId}/catalog/{pid}      the 26 players.csv columns as strings + pid: number
games/{gameId}/market/{round}     { available: number[], absentCounts: {pid: n}, unsoldPrices: {pid: listPrice} }
games/{gameId}/auctions/{round}   { stars: number[], results?: [{pid, teamId|null, rate, years, guaranteed}] }
games/{gameId}/rounds/{r}         { games: [{game_id, home, away, homeScore, awayScore}],   ← home/away are TEAM IDs
                                    awards: { roundMvp: {pid, teamId, line}, topScorer: {pid, teamId, pts},
                                              bargain: {pid, teamId, perDollar} },
                                    boxCsv: string (23-col header, team/opponent are DISPLAY NAMES),
                                    standings: [{teamId, name, wins, losses, pointDiff, pointsFor,
                                                 tiebreakCoin, rank}] }
games/{gameId}/reveal/latest      (Plan 3 — this client never reads it)
games/{gameId}/hooklog, /unsold   (server-only, deny-all — this client never reads them)
```

**Convention (adjudicated, restated):** `rounds/{r}.games[].home/away` are **teamIds**; `boxCsv`'s `team`/`opponent` columns are **display names**. Cross-reference box rows to teams by `name`, games to teams by id. `createGame` does not enforce name uniqueness — the professor keeps names unique (Plan 3 rename tool); this client just renders what it gets.

### Money math (client mirrors of `backend/functions/src/payroll.js` — formulas exact, server remains authority)

- `r01(x) = Math.round(x * 10) / 10` — every money figure is $M at one decimal.
- `askPrice(base, round) = r01(base * 1.08 ** (round - 1))` — round 1 = the CSV base exactly.
- `DISCOUNTS = {1: 1.0, 2: 0.92, 3: 0.85, 4: 0.80, 5: 0.75}`; `contractRate(ask, years) = r01(ask * DISCOUNTS[years])`. **No discount in auctions.**
- `minBid(round) = r01(2.0 * 1.08 ** (round - 1))` — bids in $0.1M steps.
- A contract signed in round r for Y years covers rounds `r … r+Y−1`; `maxYears = totalRounds − round + 1`.
- `payrollAt(team, r)` = Σ roster rates where `startRound ≤ r < startRound + years` + Σ deadMoney rates where `startRound ≤ r ≤ endRound`.
- Cap check = every covered round of the proposed contract must stay ≤ $100.0M (mirror of `capOkWith`). A single "after signing" number is NOT sufficient — the mock's sign drawer oversimplifies; use the per-round peak ("peak payroll $X.XM in round r").
- Unsold auction stars: list price = `market/{round}.unsoldPrices[pid]`, and the ask still inflates: `askPrice(unsoldPrices[pid], round)`.

### Game rules that tempt "sensible" deviations (each restated again inline in its task)

- **Free agency is NON-EXCLUSIVE (spec §4.2).** The market is a shared catalog of signable *copies*: signing NEVER removes a player from the table, any number of teams may sign the same player, and the table is static within a phase. Do not grey out, remove, or badge players "taken" after your own or anyone's signing. Only auction stars (and unsold-star claims) are exclusive.
- **Round 1 has no Front Office** — the season starts at `FREE_AGENCY`, round 1.
- **Playstyle strings, verbatim everywhere:** `Balanced`, `Run & Gun`, `3PT Barrage`, `Inside Attack`, `Lockdown`. One-sentence student descriptions, verbatim from spec §4.4: Balanced `Play your normal game.` · Run & Gun `Play fast. More shots.` · 3PT Barrage `Shoot more threes.` · Inside Attack `Feed your Big.` · Lockdown `Slow it down. Defend.`
- **Facts, never conclusions (spec §11).** No judgment labels, trend adjectives, or derived efficiency metrics anywhere. Exactly two sanctioned derived metrics exist in this plan: the **wins-per-payroll-dollar** column on Standings, and the **Bargain of the Round** award card — which names the winner and shows his *raw* stat line + salary, **never** the computed per-dollar figure (the server sends `perDollar`; do not render it).
- **No emojis anywhere in the product UI.** `★ ▲ ▼ ½` and chevrons are glyphs, allowed. **Hype renders only as ★ glyphs** (halves as `½`), never numerically — the free-agency mock showing `3.0` is superseded by spec §11.
- **Mockup sample numbers are never copied.** Layout and visual language come from the mocks; every number is recomputed from live data. Known mock lies include: a cap-breaching auction exposure labeled "Fits", an `$18M × 4` contract at round 3 (max is 3), a 4-card auction row (waves are exactly 5), `$4.42M` for a 2-year rate that actually rounds to `$4.4M` (`r01(4.8 × 0.92) = 4.4`), and hard-coded payroll-bar segment widths.
- **Arena Broadcast tokens (from the approved mocks, hex-exact):** background `linear-gradient(160deg,#0d1b2e,#132a4a)`; gold `#ffc94d`; text `#f2f5fa`; muted `#9fb4d0`; dim `#5f7396`; inset `#08101d`; border `#2c4a78`; card `linear-gradient(180deg,#1b3357,#14263f)`; track `#1d3050`; green `#3fa46a` / ok-text `#7ed492`; red `#c0392b` / negative-text `#ff7b6b`; badges G `#e0533f`, W `#2e86ab`, B `#7d5ba6`. Font `"Avenir Next","Segoe UI",sans-serif`; brand lines 900 italic uppercase gold; timers and all money/stat lines monospace (`ui-monospace,SFMono-Regular,Menlo,monospace`).

## File Structure

```
games/salary-showdown/app/
  package.json  vite.config.ts  vitest.integration.config.ts  tsconfig.json  tsconfig.app.json  tsconfig.node.json
  index.html  .gitignore
  scripts/seed-demo.mjs            # Task 2 — drives a demo game to any phase via the real callables
  src/
    main.tsx  App.tsx              # router shell
    test-setup.ts
    lib/firebase.ts                # emulator wiring (Task 1)
    lib/money.ts  lib/contracts.ts # payroll.js mirrors (Task 4)
    lib/errors.ts                  # error-code → student copy (Task 4)
    lib/boxfeed.ts                 # boxCsv parsing, this-ssn aggregates (Task 4)
    lib/arrange.ts                 # lineup auto-arrangement mirror (Task 4)
    types/models.ts                # frozen doc shapes as TS types (Task 4)
    styles/arena.css               # Arena Broadcast tokens + shared classes (Task 5)
    components/ui/*.tsx            # LedTimer, PayrollBar, PositionBadge, HypeStars, SectionCard,
                                   # TickerBar, ErrorNotice, StandingsTable (Tasks 5, 15)
    contexts/AuthContext.tsx  contexts/GameContext.tsx   # Task 6
    components/PhaseRouter.tsx     # phase → route follower (Task 6)
    itest/harness.ts               # emulator test helpers (Task 6)
    pages/LandingPage.tsx (T7)  LobbyPage.tsx (T8)  FrontOfficePage.tsx (T9)
    pages/FreeAgencyPage.tsx (T10)  AuctionPage.tsx (T11)  LineupPage.tsx (T12)
    pages/SimulatePage.tsx (T13)  ResultsPage.tsx (T14)  StandingsPage.tsx (T15)
games/salary-showdown/backend/functions/
  src/game.js  index.js            # Task 3 ONLY: append getLobby callable + export
  test/lifecycle.test.js           # Task 3: +2 tests
.claude/launch.json                # Task 1: append salary-showdown-app entry (do not touch existing entries)
```

Screen → mockup mapping (layout-authoritative; numbers always recomputed): Front Office → `front-office-v5.html`; Free Agency → `free-agency-v2.html` **Option B only** (the analyst table — Option A's card grid was explicitly rejected for this screen); Star Auction → `star-auction-v2.html` (sized for **five** cards); Set Lineup → `set-lineup-v2.html` (plus the active-bench distinction the mock hides); Results' standings snapshot + Standings page → `projector-shuffle.html` row anatomy at half-size, static (no shuffle animation — that is the projector's, Plan 3). Landing, Lobby, Simulate, Results are unmocked: build from spec §11.14's behavioral contracts in the Arena Broadcast language.

---
### Task 1: App scaffold, emulator wiring, dev-harness launch entry

**Files:**
- Create: `games/salary-showdown/app/package.json`, `vite.config.ts`, `vitest.integration.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/lib/firebase.ts`, `src/test-setup.ts`, `src/__sanity__/setup.test.tsx`
- Modify: `.claude/launch.json` (append one entry — do not touch existing entries)

**Interfaces:**
- Produces: `src/lib/firebase.ts` exporting `app`, `auth`, `db`, `functions` — all emulator-connected in dev/test. `npm run dev` serves on 5176. `npm test` runs unit tests (jsdom, excludes `*.itest.*`). Placeholder routes exist for `/`, `/lobby`, `/game/office`, `/game/market`, `/game/auction`, `/game/lineup`, `/game/simulate`, `/game/results`, `/standings`.

- [ ] **Step 1: Write the package + tool configs**

`games/salary-showdown/app/package.json`:
```json
{
  "name": "salary-showdown-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5176 --strictPort",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 5176 --strictPort",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "node scripts/seed-demo.mjs"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.1.0",
    "firebase": "^12.12.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.14.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.12.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "firebase-admin": "^12.0.0",
    "jsdom": "^29.0.2",
    "typescript": "~6.0.2",
    "vite": "^8.0.4",
    "vitest": "^4.1.5"
  }
}
```
(`firebase-admin` is a **dev-only** dependency for the seed script and integration harness — the Firestore rules correctly deny client reads pre-membership, so the harness reads game state via the Admin SDK, which bypasses rules against the emulator. It must never be imported from `src/`.)

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/*.itest.*'],
  },
});
```

`vitest.integration.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.itest.{ts,tsx}'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
```
(`fileParallelism: false` — integration files share one emulator; parallel games would work but interleaved logs are undebuggable for a Sonnet executor.)

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Salary Showdown</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
.demo-game.json
```

- [ ] **Step 2: Write the Firebase wiring**

`src/lib/firebase.ts` — the two hard-won Bakery Bash lessons are ported as patterns (fresh code): per-tab anonymous identity via session persistence, and a memory-only Firestore cache in dev so multi-tab playtesting can't corrupt a shared IndexedDB.

```ts
import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache,
} from 'firebase/firestore';
import {
  browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'fake-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'salary-showdown-dev',
};

export const app = initializeApp(firebaseConfig);

// Dev/test: memory-only Firestore cache. Multi-tab dev playtesting (each tab a
// distinct anonymous uid via session persistence) corrupts the SDK's shared
// IndexedDB cache; memory cache is per-tab and cannot. Production keeps the
// default persistent cache. The try/catch is the HMR guard: the app singleton
// survives hot reloads, and a second initializeFirestore on it throws.
export const db = (() => {
  if (!import.meta.env.DEV) return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    return getFirestore(app);
  }
})();

export const auth = getAuth(app);
export const functions = getFunctions(app);

declare global {
  // eslint-disable-next-line no-var
  var __SS_EMULATORS_CONNECTED__: boolean | undefined;
}

if (import.meta.env.DEV && !globalThis.__SS_EMULATORS_CONNECTED__) {
  globalThis.__SS_EMULATORS_CONNECTED__ = true; // HMR guard: connect once per tab
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  // Per-tab identity: session persistence gives each browser tab its own
  // anonymous uid, so one laptop can play GM, Scout, and Coach in three tabs.
  void setPersistence(auth, browserSessionPersistence);
}
```

- [ ] **Step 3: Write the router shell**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`src/App.tsx` (placeholder pages are replaced task by task; the route table is final):
```tsx
import { Route, Routes } from 'react-router-dom';

const Stub = ({ name }: { name: string }) => (
  <main style={{ color: '#f2f5fa', padding: 24 }}>
    <h1 style={{ color: '#ffc94d', fontStyle: 'italic', textTransform: 'uppercase' }}>
      Salary Showdown
    </h1>
    <p data-testid="stub">{name} — under construction</p>
  </main>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Stub name="Landing" />} />
      <Route path="/lobby" element={<Stub name="Lobby" />} />
      <Route path="/game/office" element={<Stub name="Front Office" />} />
      <Route path="/game/market" element={<Stub name="Free Agency" />} />
      <Route path="/game/auction" element={<Stub name="Star Auction" />} />
      <Route path="/game/lineup" element={<Stub name="Set Lineup" />} />
      <Route path="/game/simulate" element={<Stub name="Simulate" />} />
      <Route path="/game/results" element={<Stub name="Results" />} />
      <Route path="/game/conclusion" element={<Stub name="Finale (Plan 3)" />} />
      <Route path="/standings" element={<Stub name="Standings" />} />
    </Routes>
  );
}
```

`src/test-setup.ts`:
```ts
import '@testing-library/jest-dom';
```

`src/__sanity__/setup.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

test('router shell renders the landing stub', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  expect(screen.getByTestId('stub')).toHaveTextContent('Landing');
});
```

- [ ] **Step 4: Append the launch entry**

Add to the `configurations` array of `/Users/dylanmassaro/FenriX/.claude/launch.json` (leave every existing entry untouched):
```json
{
  "name": "salary-showdown-app",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "cwd": "games/salary-showdown/app",
  "port": 5176
}
```

- [ ] **Step 5: Install and run the unit suite**

Run: `cd games/salary-showdown/app && npm install && npx vitest run`
Expected: 1 file, 1 test passed.

- [ ] **Step 6: Boot the stack and verify in the browser**

Run (background): `cd games/salary-showdown/backend/functions && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu`
Wait for "All emulators ready". Then start the preview with the `salary-showdown-app` launch config.
What you should see: dark page, gold italic uppercase "SALARY SHOWDOWN", "Landing — under construction". Browser console shows the Firestore/Auth/Functions emulator connection notices and **zero errors**.

- [ ] **Step 7: Commit**

```bash
git add games/salary-showdown/app .claude/launch.json
git commit -m "feat(salary-showdown): app scaffold — Vite/React shell wired to the emulator suite"
```

---

### Task 2: Seeded demo game script

Every later task's browser verification depends on this: one command that drives a real game — through the production callables only — to any round/phase, leaving Team 1's seats open for the developer to claim in the browser.

**Files:**
- Create: `games/salary-showdown/app/scripts/seed-demo.mjs`

**Interfaces:**
- Produces: `npm run seed -- --to R1:AUCTION` (any of `R{1-5}:{FRONT_OFFICE|FREE_AGENCY|AUCTION|LINEUP|SIMULATE|RESULTS}` or `FINALE`), `--fill others|all` (default `others`: Teams 2–4 staffed by bots, Team 1's three seats left open), `--teams N` (default 4). Prints `gameId`, `joinCode`, open seats; writes `.demo-game.json` (`{ gameId, joinCode }`) for tests and manual poking.
- Consumes: backend callables (Global Constraints table), `backend/functions/src/data/players.json` (public catalog — safe to read; never touch `hidden.json`).

- [ ] **Step 1: Write the script**

`games/salary-showdown/app/scripts/seed-demo.mjs`:
```js
// Seed a demo Salary Showdown game on the emulator suite, via the REAL callables.
// Reads (teamIds, market, phase) go through firebase-admin because the Firestore
// rules deny client reads pre-membership — admin bypasses rules; dev-harness only.
// RULING (restated from Global Constraints): every advancePhase call sends
// expectedPhase + expectedRound. PHASE_MISMATCH means "already advanced": refetch.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(
  join(HERE, '../../backend/functions/src/data/players.json'), 'utf8'));
const byPid = Object.fromEntries(CATALOG.map((p) => [p.pid, p]));

admin.initializeApp({ projectId: 'salary-showdown-dev' });
const adb = admin.firestore();

// ---- CLI ------------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const target = arg('to', 'R1:FREE_AGENCY');           // e.g. R3:FRONT_OFFICE | FINALE
const fill = arg('fill', 'others');                    // others | all
const nTeams = Number(arg('teams', '4'));
const TEAM_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].slice(0, nTeams);

// ---- one emulator-authed client per persona --------------------------------
async function newClient(name) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'salary-showdown-dev' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5101);
  const cred = await signInAnonymously(auth);
  const call = (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data);
  return { uid: cred.user.uid, call };
}

// ---- money + lineup mirrors (kept local: the script must not import src/) ---
const r01 = (x) => Math.round(x * 10) / 10;
const minBid = (round) => r01(2.0 * 1.08 ** (round - 1));
const activePids = (team, round) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round).map((c) => c.pid);

function arrangeLineup(pids) {
  // Minutes-desc greedy 2G/2W/1B, matching the backend's autoRepair ordering.
  const sorted = [...pids].sort(
    (a, b) => Number(byPid[b].mins_per_game) - Number(byPid[a].mins_per_game));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of sorted) {
    const pos = byPid[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = sorted.filter((p) => !starters.includes(p));
  return { starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' };
}

// ---- phase actions for bot-staffed teams ------------------------------------
// Round-1 signing order interleaves positions (G,W,B,G,W,B,G,W) cheapest-first —
// RULING: this can never trip POSITION_LOCK, because the 2G/2W/1B floor is covered
// within the first three signings (same strategy as the backend smoke test).
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];

async function actFreeAgency(gameId, round, bots) {
  if (round !== 1) return; // bots build once on draft night; hardship covers the rest
  const market = (await adb.doc(`games/${gameId}/market/1`).get()).data();
  for (const bot of bots) {
    const pool = { G: [], W: [], B: [] };
    for (const pid of market.available) pool[byPid[pid].position].push(byPid[pid]);
    for (const pos of ['G', 'W', 'B'])
      pool[pos].sort((a, b) => Number(a.salary_per_round) - Number(b.salary_per_round));
    const used = new Set();
    let i = 0;
    for (const pos of SIGN_ORDER) {
      const p = pool[pos].find((x) => !used.has(x.pid));
      used.add(p.pid);
      const years = (i % 4) + 1; // mixed lengths → expiring-panel and cut material later
      await bot.gm.call('signPlayer', { gameId, pid: p.pid, years });
      i += 1;
    }
  }
}

async function actAuction(gameId, round, bots) {
  const wave = (await adb.doc(`games/${gameId}/auctions/${round}`).get()).data();
  for (const [i, bot] of bots.entries()) {
    const pid = wave.stars[i % wave.stars.length];
    // ALWAYS an object — never null (Global Constraints ruling).
    await bot.scout.call('submitBids',
      { gameId, bids: { [pid]: { rate: minBid(round), years: 1 } } });
  }
}

async function actLineup(gameId, round, bots) {
  for (const bot of bots) {
    const team = (await adb.doc(`games/${gameId}/teams/${bot.teamId}`).get()).data();
    await bot.coach.call('submitLineup',
      { gameId, lineup: arrangeLineup(activePids(team, round)) });
  }
}

// ---- main -------------------------------------------------------------------
const [, tgtRoundS, tgtPhase] = target === 'FINALE'
  ? [null, '5', 'FINALE'] : target.match(/^R([1-5]):([A-Z_]+)$/) ?? [];
if (!tgtPhase) { console.error(`bad --to: ${target}`); process.exit(1); }
const tgtRound = Number(tgtRoundS);

const prof = await newClient('prof');
const { gameId, joinCode } = await prof.call('createGame', { teamNames: TEAM_NAMES });
const teamsSnap = await adb.collection(`games/${gameId}/teams`).get();
const teamIds = TEAM_NAMES.map(
  (n) => teamsSnap.docs.find((d) => d.data().name === n).id);

const botTeamIdx = fill === 'all' ? teamIds.map((_, i) => i)
  : teamIds.map((_, i) => i).slice(1);
const bots = [];
for (const i of botTeamIdx) {
  const [gm, scout, coach] = await Promise.all(
    ['GM', 'Scout', 'Coach'].map((_, k) => newClient(`t${i}-${k}`)));
  await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM ${TEAM_NAMES[i]}` });
  await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `Scout ${TEAM_NAMES[i]}` });
  await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `Coach ${TEAM_NAMES[i]}` });
  bots.push({ teamId: teamIds[i], gm, scout, coach });
}

await prof.call('startSeason', { gameId });

let g = (await adb.doc(`games/${gameId}`).get()).data();
let guard = 0;
while (!(g.phase === tgtPhase && (tgtPhase === 'FINALE' || g.round === tgtRound))) {
  if (g.phase === 'FREE_AGENCY') await actFreeAgency(gameId, g.round, bots);
  if (g.phase === 'AUCTION') await actAuction(gameId, g.round, bots);
  if (g.phase === 'LINEUP') await actLineup(gameId, g.round, bots);
  await prof.call('advancePhase',
    { gameId, expectedPhase: g.phase, expectedRound: g.round });
  g = (await adb.doc(`games/${gameId}`).get()).data();
  guard += 1;
  if (guard > 40) throw new Error(`never reached ${target}; stuck at R${g.round}:${g.phase}`);
  console.log(`  -> R${g.round}:${g.phase}`);
}

writeFileSync(join(HERE, '../.demo-game.json'), JSON.stringify({ gameId, joinCode }, null, 2));
const open = fill === 'all' ? 'none' : `Team "${TEAM_NAMES[0]}": GM, Scout, Coach`;
console.log([
  '', `Seeded game at R${g.round}:${g.phase}`, `  gameId:   ${gameId}`,
  `  joinCode: ${joinCode}`, `  open seats: ${open}`,
  `  join at:  http://localhost:5176/`, '',
].join('\n'));
process.exit(0);
```

- [ ] **Step 2: Run it against the live emulators**

Emulators must be running (Task 1 Step 6). Run: `cd games/salary-showdown/app && npm run seed -- --to R1:AUCTION`
Expected output ends with:
```
  -> R1:AUCTION

Seeded game at R1:AUCTION
  gameId:   <20-char id>
  joinCode: <6 chars>
  open seats: Team "Alpha": GM, Scout, Coach
```

- [ ] **Step 3: Assert the seeded state**

Run: `cd games/salary-showdown/app && node -e "
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8180';
process.env.GCLOUD_PROJECT='salary-showdown-dev';
const admin=require('firebase-admin');admin.initializeApp({projectId:'salary-showdown-dev'});
const {gameId}=require('./.demo-game.json');
admin.firestore().collection('games/'+gameId+'/teams').get().then(s=>{
  s.forEach(d=>console.log(d.data().name, 'roster', d.data().roster.length));
  process.exit(0);});"`
Expected: all four teams at `roster 8` — Beta/Gamma/Delta from bot signings, Alpha from hardship, whose 8 entries all carry `hardship: true` (hardship runs at the FREE_AGENCY **exit** hook, so it has already fired by the time AUCTION opens — spec §13). To observe Alpha genuinely empty, seed `--to R1:FREE_AGENCY` instead. *(Corrected during execution: the original line expected `Alpha roster 0` at R1:AUCTION, which contradicts the spec's hardship timing and this plan's own Task 9 rationale.)*

- [ ] **Step 4: Run a full-season seed**

Run: `npm run seed -- --to FINALE --fill all`
Expected: the phase ticker walks all five rounds without error and ends `Seeded game at R5:FINALE`. (This proves the script's action loop survives every phase, including rounds 2–5 where bots only submit bids and lineups.)

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/app/scripts/seed-demo.mjs
git commit -m "feat(salary-showdown): seed-demo harness — drive a real emulator game to any phase"
```

---

### Task 3: `getLobby` callable (the one backend addition)

**Why this exists (ruling):** rules deny ALL reads to non-members — correct for gameplay, but it means a client holding only a join code cannot list teams or open roles, and `joinGame` requires a `teamId`. This read-only callable is the minimal, additive fix. It exposes only lobby-safe facts (team names, which roles are taken). No rules change, no schema change.

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js` (append one callable)
- Modify: `games/salary-showdown/backend/functions/index.js` (add one export)
- Modify: `games/salary-showdown/backend/functions/test/lifecycle.test.js` (append two tests)
- Modify: `games/salary-showdown/backend/README.md` (one row in the callable table)

**Interfaces:**
- Produces: `getLobby({ joinCode })` → `{ gameId, status, phase, round, teams: [{ teamId, name, claimedRoles: string[] }] }`; throws `not-found` `'bad join code'`, `unauthenticated` `'sign in first'`.

- [ ] **Step 1: Append the callable to `game.js`** (after `joinGame`, before `startSeason`)

```js
// Lobby discovery for clients that hold only a join code. Rules (correctly) deny
// every Firestore read to non-members, so the Landing screen cannot list teams or
// open roles on its own — joinGame demands a teamId the client has no legal way to
// learn. Read-only, lobby-safe facts only: names + which roles are taken. Anyone
// signed-in may call it (that is the point — callers are not members yet).
export const getLobby = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const joinCode = String(req.data.joinCode ?? '').toUpperCase();
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const g = games.docs[0];
  const [teams, members] = await Promise.all(
    [g.ref.collection('teams').get(), g.ref.collection('players').get()]);
  const claimed = {};
  for (const m of members.docs) {
    const d = m.data();
    (claimed[d.teamId] ??= []).push(d.role);
  }
  const { status, phase, round } = g.data();
  return {
    gameId: g.id, status, phase, round,
    teams: teams.docs.map((t) => ({
      teamId: t.id, name: t.data().name, claimedRoles: claimed[t.id] ?? [],
    })),
  };
});
```

- [ ] **Step 2: Export it**

`functions/index.js` — add `getLobby` to the existing export list from `./src/game.js`.

- [ ] **Step 3: Append two tests to `lifecycle.test.js`**

```js
it('getLobby returns teams and claimed roles for a join code, without membership', async () => {
  const { gameId, joinCode } = await call(createGame, { teamNames: ['Home', 'Away'] }, 'prof-gl');
  const teamsSnap = await db.collection(`games/${gameId}/teams`).get();
  const teamId = teamsSnap.docs.find((d) => d.data().name === 'Home').id;
  await call(joinGame, { joinCode, teamId, role: 'GM', displayName: 'Dana' }, 'stranger-1');
  const lobby = await call(getLobby, { joinCode }, 'stranger-2'); // NOT a member
  expect(lobby.gameId).toBe(gameId);
  expect(lobby.status).toBe('lobby');
  const home = lobby.teams.find((t) => t.name === 'Home');
  expect(home.teamId).toBe(teamId);
  expect(home.claimedRoles).toEqual(['GM']);
  expect(lobby.teams.find((t) => t.name === 'Away').claimedRoles).toEqual([]);
});

it('getLobby rejects a bad join code', async () => {
  await expect(call(getLobby, { joinCode: 'ZZZZZZ' }, 'stranger-3'))
    .rejects.toThrow('bad join code');
});
```
Also add `getLobby` to the `import`/destructure of callables at the top of the file.

- [ ] **Step 4: Run the full backend suite**

Run: `cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"`
Expected: 16 files, **104** tests, all pass (102 existing + 2 new).

- [ ] **Step 5: Document and commit**

Add to README's callable table: `| getLobby({ joinCode }) | Lobby discovery for non-members: team list + claimed roles, by join code. |`

```bash
git add games/salary-showdown/backend
git commit -m "feat(salary-showdown): getLobby callable — lobby discovery for clients holding only a join code"
```

---
### Task 4: Domain library — types, money math, error copy, box-feed parsing, lineup arrangement

Pure functions, no Firebase imports, exhaustively unit-tested. Every screen builds on these; getting the mirrors byte-exact here is what keeps the screens honest.

**Files:**
- Create: `src/types/models.ts`, `src/lib/money.ts`, `src/lib/contracts.ts`, `src/lib/errors.ts`, `src/lib/boxfeed.ts`, `src/lib/arrange.ts`
- Test: `src/lib/money.test.ts`, `src/lib/errors.test.ts`, `src/lib/boxfeed.test.ts`, `src/lib/arrange.test.ts`

**Interfaces (later tasks rely on these exact names):**
- `money.ts`: `r01(x)`, `CAP = 100.0`, `TOTAL_ROUNDS = 5`, `DISCOUNTS`, `askPrice(base, round)`, `contractRate(ask, years)`, `minBid(round)`, `maxYears(round)`, `fmtM(x)` → `"$4.4M"`.
- `contracts.ts`: `isActive(c, round)`, `activeContracts(team, round)`, `activePids(team, round)`, `payrollAt(team, round)`, `payrollSplitAt(team, round)` → `{cash, dead}`, `capOkWith(team, contract)` → `{ok, worstRound, worstPayroll}`, `expiringPids(team, round)`, `spendThroughRound(spendLog, round)`.
- `errors.ts`: `errorCopy(err)` → `{ headline: string, raw?: string }`.
- `boxfeed.ts`: `parseBoxCsv(csv)` → `BoxRow[]` (all 23 columns, numerics coerced), `seasonForm(rows)` → `Map<pid, {gp, ppg, fgPct}>` (league-wide, all copies), `teamRows(rows, teamName)`.
- `arrange.ts`: `arrangeLineup(activePids, catalog, prevLineup)` → `{starters, sixth, bench, playstyle}` — mirror of the backend's `autoRepair` (keep legal previous starters, fill by `mins_per_game` desc, keep previous sixth if still legal, playstyle carries, default `Balanced`).
- `models.ts`: `Phase`, `Role`, `Position`, `Contract`, `DeadMoney`, `Lineup`, `TeamDoc`, `GameDoc`, `CatalogPlayer`, `MarketDoc`, `AuctionDoc`, `RoundDoc`, `StandingsRow`, `Awards`, `PLAYSTYLES`, `PLAYSTYLE_BLURBS`.

- [ ] **Step 1: Write the types**

`src/types/models.ts`:
```ts
export type Phase = 'LOBBY' | 'FRONT_OFFICE' | 'FREE_AGENCY' | 'AUCTION' | 'LINEUP'
  | 'SIMULATE' | 'RESULTS' | 'FINALE';
export type Role = 'GM' | 'Scout' | 'Coach';
export type Position = 'G' | 'W' | 'B';

export interface Contract {
  pid: number; rate: number; startRound: number; years: number;
  viaAuction: boolean; hardship: boolean;
}
export interface DeadMoney { pid: number; rate: number; startRound: number; endRound: number }
export interface Lineup { starters: number[]; sixth: number; bench: number[]; playstyle: string }

export interface TeamDoc {
  name: string; wins: number; losses: number; pointDiff: number; pointsFor: number;
  roster: Contract[]; deadMoney: DeadMoney[]; spendLog: Contract[];
  lineup: Lineup | null; lineupLockedRound: number; hardshipUsed: number[];
}
export interface GameDoc {
  joinCode: string; status: 'lobby' | 'active' | 'finished'; phase: Phase; round: number;
  timerEndsAt: { toMillis(): number } | null; teamCount: number;
  config: { cap: number; totalRounds: number }; professorUid: string;
}
// The 26 players.csv columns arrive as strings (catalog docs mirror the CSV); pid is a number.
export interface CatalogPlayer {
  pid: number; player_id: string; name: string; position: Position; age: string;
  years_pro: string; hype: string; salary_per_round: string; auction_round: string;
  personality: string; scout_grade: string; social_media_followers: string;
  games_played: string; mins_per_game: string; pts_per_game: string;
  fg_attempts_per_game: string; fg_pct: string; three_pt_pct: string; ft_pct: string;
  rebounds_per_game: string; assists_per_game: string; steals_per_game: string;
  blocks_per_game: string; turnovers_per_game: string;
  prev_pts_per_game: string; prev_fg_pct: string; prev_mins_per_game: string;
}
export interface MarketDoc {
  available: number[]; absentCounts: Record<string, number>;
  unsoldPrices: Record<string, number>;
}
export interface AuctionDoc {
  stars: number[];
  results?: { pid: number; teamId: string | null; rate: number | null;
    years: number | null; guaranteed: number | null }[];
}
export interface GameResult {
  game_id: string; home: string; away: string; homeScore: number; awayScore: number;
}
export interface Awards {
  roundMvp: { pid: number; teamId: string; line: string };
  topScorer: { pid: number; teamId: string; pts: number };
  // bargain.perDollar exists on the wire but is NEVER rendered (spec §11: the award
  // shows the raw stat line + salary, not a computed stats-per-dollar figure).
  bargain: { pid: number; teamId: string; perDollar: number } | null;
}
export interface StandingsRow {
  teamId: string; name: string; wins: number; losses: number;
  pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
}
export interface RoundDoc {
  games: GameResult[]; awards: Awards; boxCsv: string; standings: StandingsRow[];
}

// Verbatim strings — spec §4.4. Never abbreviate, never re-word.
export const PLAYSTYLES = ['Balanced', 'Run & Gun', '3PT Barrage', 'Inside Attack', 'Lockdown'] as const;
export type Playstyle = (typeof PLAYSTYLES)[number];
export const PLAYSTYLE_BLURBS: Record<Playstyle, string> = {
  Balanced: 'Play your normal game.',
  'Run & Gun': 'Play fast. More shots.',
  '3PT Barrage': 'Shoot more threes.',
  'Inside Attack': 'Feed your Big.',
  Lockdown: 'Slow it down. Defend.',
};
```

- [ ] **Step 2: Write the money + contract mirrors**

`src/lib/money.ts` — formulas are exact mirrors of `backend/functions/src/payroll.js`; the server remains the authority, these gate inputs and drive display:
```ts
export const CAP = 100.0;
export const TOTAL_ROUNDS = 5;
export const INFLATION = 1.08;
export const DISCOUNTS: Record<number, number> = { 1: 1.0, 2: 0.92, 3: 0.85, 4: 0.8, 5: 0.75 };

export const r01 = (x: number) => Math.round(x * 10) / 10;
export const askPrice = (base: number, round: number) => r01(base * INFLATION ** (round - 1));
export const contractRate = (ask: number, years: number) => r01(ask * DISCOUNTS[years]);
export const minBid = (round: number) => r01(2.0 * INFLATION ** (round - 1));
export const maxYears = (round: number) => TOTAL_ROUNDS - round + 1;
export const fmtM = (x: number) => `$${x.toFixed(1)}M`;
```

`src/lib/contracts.ts`:
```ts
import type { Contract, DeadMoney, TeamDoc } from '../types/models';
import { CAP, TOTAL_ROUNDS, r01 } from './money';

export const isActive = (c: Contract, round: number) =>
  round >= c.startRound && round < c.startRound + c.years;
export const activeContracts = (team: TeamDoc, round: number) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round);
export const activePids = (team: TeamDoc, round: number) =>
  activeContracts(team, round).map((c) => c.pid);

const deadAt = (d: DeadMoney, round: number) => round >= d.startRound && round <= d.endRound;

export function payrollSplitAt(team: TeamDoc, round: number) {
  let cash = 0;
  for (const c of team.roster) if (isActive(c, round)) cash += c.rate;
  let dead = 0;
  for (const d of team.deadMoney) if (deadAt(d, round)) dead += d.rate;
  return { cash: r01(cash), dead: r01(dead) };
}
export const payrollAt = (team: TeamDoc, round: number) => {
  const { cash, dead } = payrollSplitAt(team, round);
  return r01(cash + dead);
};

// Mirror of capOkWith: the proposed contract must fit in EVERY covered round.
// A single "after signing" number is not enough (the FA mock oversimplifies) —
// surface worstRound/worstPayroll as "peak payroll $X.XM in round r".
export function capOkWith(team: TeamDoc, contract: Contract) {
  for (let i = 0; i < contract.years; i++) {
    const r = contract.startRound + i;
    if (r > TOTAL_ROUNDS) continue;
    const p = r01(payrollAt(team, r) + contract.rate);
    if (p > CAP + 1e-9) return { ok: false, worstRound: r, worstPayroll: p };
  }
  return { ok: true, worstRound: null as number | null, worstPayroll: null as number | null };
}

export const expiringPids = (team: TeamDoc, round: number) =>
  team.roster.filter((c) => c.startRound + c.years - 1 === round - 1).map((c) => c.pid);

// Payroll dollars committed through round R, from the append-only spendLog.
// A cut does NOT reduce this (dead money charges the same schedule) and a re-sign
// does not double-count (old and new contracts never overlap a round).
export const spendThroughRound = (spendLog: Contract[], round: number) =>
  r01(spendLog.reduce((s, c) => {
    const end = Math.min(c.startRound + c.years - 1, round);
    return s + c.rate * Math.max(0, end - c.startRound + 1);
  }, 0));
```

- [ ] **Step 3: Write the error-copy map**

`src/lib/errors.ts` — the Global Constraints error table as code. Match on **message** (BAD_YEARS arrives under two different kinds), then on the `already-exists` kind, then fall back:
```ts
import { FirebaseError } from 'firebase/app';
import { fmtM } from './money';

const TABLE: Record<string, string> = {
  POSITION_LOCK: 'Signing him would leave too few open slots to field 2 G / 2 W / 1 B.',
  STAR_TAKEN: 'Another team claimed this star first.',
  ALREADY_SIGNED: 'He is already under contract with your team.',
  NOT_IN_MARKET: 'He is not signable tonight.',
  ROSTER_FULL: 'Your roster is full — 10 players is the maximum.',
  BAD_YEARS: 'That contract length is not available this round.',
  MIN_BID: 'Bid is below tonight\'s league minimum.',
  BID_STEP: 'Bids move in $0.1M steps.',
  NOT_IN_WAVE: 'That star is not on tonight\'s block.',
  BAD_RATE: 'Enter a valid salary figure.',
  BAD_PLAYSTYLE: 'Pick one of the five playstyles.',
  DUPLICATE_PLAYER: 'A player appears in two lineup spots.',
  NOT_ON_ROSTER: 'Your lineup does not match your current roster — it has been refreshed.',
  BAD_TEMPLATE: 'Starters must be exactly 2 Guards, 2 Wings, 1 Big, plus a Sixth Man.',
  BAD_SHAPE: 'The lineup did not submit cleanly — rearrange and resubmit.',
  'market is closed': 'Free agency is closed.',
  'auction is closed': 'The auction is closed.',
  'lineups are locked': 'Lineups are locked for this round.',
  'only expiring contracts re-sign here': 'Only expiring contracts can re-sign in Front Office.',
};

export function errorCopy(err: unknown): { headline: string; raw?: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const cap = msg.match(/CAP_EXCEEDED:(\d+):([\d.]+)/);
  if (cap) {
    return { headline: `Over the cap: round ${cap[1]} payroll would hit ${fmtM(Number(cap[2]))} against the ${fmtM(100)} cap.` };
  }
  for (const key of Object.keys(TABLE)) if (msg.includes(key)) return { headline: TABLE[key] };
  if (msg.startsWith('cut:')) return { headline: 'That player is not on your roster.' };
  if (err instanceof FirebaseError && err.code === 'functions/already-exists') {
    return { headline: 'That seat was just taken — pick another role.' };
  }
  return { headline: 'That did not go through — try again.', raw: msg };
}
```

- [ ] **Step 4: Write the box-feed parser**

`src/lib/boxfeed.ts` — parses `rounds/{r}.boxCsv` (frozen 23-column header; `team`/`opponent` are display names). Quote-aware because team names are professor-entered free text:
```ts
export interface BoxRow {
  round: number; game_id: string; team: string; opponent: string;
  team_score: number; opp_score: number; win: number;
  player_id: number; player_name: string; position: string; tier: string;
  mins: number; pts: number; fgm: number; fga: number; three_pm: number; three_pa: number;
  rebounds: number; assists: number; steals: number; blocks: number; turnovers: number;
  playstyle: string;
}
const NUMERIC = new Set(['round', 'team_score', 'opp_score', 'win', 'player_id', 'mins',
  'pts', 'fgm', 'fga', 'three_pm', 'three_pa', 'rebounds', 'assists', 'steals',
  'blocks', 'turnovers']);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseBoxCsv(csv: string): BoxRow[] {
  const lines = csv.split('\n').filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const row: Record<string, string | number> = {};
    header.forEach((h, i) => { row[h] = NUMERIC.has(h) ? Number(vals[i]) : vals[i]; });
    return row as unknown as BoxRow;
  });
}

// League-wide live form per player_id, ALL rostered copies pooled (the feed is
// public like real NBA stats; free agency is non-exclusive, so one pid may have
// lines on several teams — the season average pools them, one number per player).
export function seasonForm(rows: BoxRow[]) {
  const acc = new Map<number, { gp: number; pts: number; fgm: number; fga: number }>();
  for (const r of rows) {
    const a = acc.get(r.player_id) ?? { gp: 0, pts: 0, fgm: 0, fga: 0 };
    a.gp += 1; a.pts += r.pts; a.fgm += r.fgm; a.fga += r.fga;
    acc.set(r.player_id, a);
  }
  const out = new Map<number, { gp: number; ppg: number; fgPct: number }>();
  for (const [pid, a] of acc) {
    out.set(pid, { gp: a.gp, ppg: a.pts / a.gp, fgPct: a.fga > 0 ? a.fgm / a.fga : 0 });
  }
  return out;
}

export const teamRows = (rows: BoxRow[], teamName: string) =>
  rows.filter((r) => r.team === teamName);
```

- [ ] **Step 5: Write the lineup arranger**

`src/lib/arrange.ts` — mirror of the backend's `autoRepair` (`lineup.js:23-44`), used to pre-fill the lineup screen so every active pid is placed before the coach starts dragging:
```ts
import type { CatalogPlayer, Lineup } from '../types/models';

export function arrangeLineup(
  active: number[], catalog: Map<number, CatalogPlayer>, prev: Lineup | null,
): Lineup {
  const byMins = [...active].sort(
    (a, b) => Number(catalog.get(b)!.mins_per_game) - Number(catalog.get(a)!.mins_per_game));
  const keep = (pid: number | null | undefined): pid is number =>
    pid != null && active.includes(pid);
  const need: Record<string, number> = { G: 2, W: 2, B: 1 };
  const starters: number[] = [];
  for (const pid of prev?.starters ?? []) {
    if (!keep(pid)) continue;
    const pos = catalog.get(pid)!.position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  for (const pid of byMins) {
    if (starters.includes(pid)) continue;
    const pos = catalog.get(pid)!.position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = byMins.filter((p) => !starters.includes(p));
  const sixth = keep(prev?.sixth) && !starters.includes(prev!.sixth)
    ? prev!.sixth : rest[0];
  const bench = rest.filter((p) => p !== sixth);
  return { starters, sixth, bench, playstyle: prev?.playstyle ?? 'Balanced' };
}
```

- [ ] **Step 6: Write the unit tests**

`src/lib/money.test.ts` — expected values hand-computed from the payroll.js formulas (note `contractRate(4.8, 2)` is **4.4**, not the mock's 4.42 — `r01(4.416) = 4.4`; recompute, never copy):
```ts
import { askPrice, contractRate, fmtM, maxYears, minBid, r01 } from './money';

test('askPrice: round 1 is the CSV base exactly; 8% compounds per round', () => {
  expect(askPrice(4.8, 1)).toBe(4.8);
  expect(askPrice(4.8, 3)).toBe(5.6);   // 4.8 * 1.1664 = 5.59872 → r01 → 5.6
  expect(askPrice(28.0, 5)).toBe(38.1); // 28 * 1.08^4 = 38.0938…
});
test('contractRate applies the discount then rounds to $0.1M', () => {
  expect(contractRate(4.8, 1)).toBe(4.8);
  expect(contractRate(4.8, 2)).toBe(4.4); // 4.416 — the mock’s $4.42M is a sample-number error
  expect(contractRate(4.8, 3)).toBe(4.1); // 4.08 → 4.1
  expect(contractRate(10, 5)).toBe(7.5);
});
test('minBid inflates the $2.0M league minimum', () => {
  expect(minBid(1)).toBe(2.0);
  expect(minBid(3)).toBe(2.3);  // 2 * 1.1664 = 2.3328
});
test('maxYears is rounds remaining', () => {
  expect(maxYears(1)).toBe(5);
  expect(maxYears(4)).toBe(2);
  expect(maxYears(5)).toBe(1);
});
test('r01 and fmtM', () => {
  expect(r01(4.416)).toBe(4.4);
  expect(fmtM(4.4)).toBe('$4.4M');
});
```

Append to the same file — contract math over a realistic team shape:
```ts
import { capOkWith, expiringPids, payrollAt, payrollSplitAt, spendThroughRound } from './contracts';
import type { TeamDoc } from '../types/models';

const team = {
  name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
  roster: [
    { pid: 1, rate: 40, startRound: 1, years: 3, viaAuction: false, hardship: false },
    { pid: 2, rate: 30, startRound: 2, years: 2, viaAuction: false, hardship: false },
  ],
  deadMoney: [{ pid: 3, rate: 10, startRound: 2, endRound: 3 }],
  spendLog: [
    { pid: 1, rate: 40, startRound: 1, years: 3, viaAuction: false, hardship: false },
    { pid: 2, rate: 30, startRound: 2, years: 2, viaAuction: false, hardship: false },
    { pid: 3, rate: 10, startRound: 1, years: 3, viaAuction: false, hardship: false },
  ],
  lineup: null, lineupLockedRound: 0, hardshipUsed: [],
} satisfies TeamDoc;

test('payrollAt = active rates + dead money per round', () => {
  expect(payrollAt(team, 1)).toBe(40);
  expect(payrollAt(team, 2)).toBe(80);  // 40 + 30 + 10 dead
  expect(payrollSplitAt(team, 3)).toEqual({ cash: 70, dead: 10 });
  expect(payrollAt(team, 4)).toBe(0);   // everything expired / dead money ended
});
test('capOkWith checks EVERY covered round and reports the peak', () => {
  const c = { pid: 9, rate: 21, startRound: 2, years: 2, viaAuction: false, hardship: false };
  const res = capOkWith(team, c);
  expect(res).toEqual({ ok: false, worstRound: 2, worstPayroll: 101 }); // 80 + 21
  expect(capOkWith(team, { ...c, rate: 20 }).ok).toBe(true);            // exactly 100.0 fits
});
test('expiringPids lists contracts whose last covered round was r-1', () => {
  expect(expiringPids(team, 4)).toEqual([1, 2]); // both end in round 3
  expect(expiringPids(team, 2)).toEqual([]);
});
test('spendThroughRound counts committed schedule, cut or not', () => {
  expect(spendThroughRound(team.spendLog, 1)).toBe(50);  // 40 + 10 (pid 3 cut later, still charged)
  expect(spendThroughRound(team.spendLog, 5)).toBe(210); // 120 + 60 + 30
});
```

`src/lib/errors.test.ts`:
```ts
import { errorCopy } from './errors';

test('CAP_EXCEEDED parses round and payroll into copy', () => {
  expect(errorCopy(new Error('CAP_EXCEEDED:3:104.2')).headline)
    .toBe('Over the cap: round 3 payroll would hit $104.2M against the $100.0M cap.');
});
test('coded messages map to student copy', () => {
  expect(errorCopy(new Error('BAD_YEARS')).headline)
    .toBe('That contract length is not available this round.');
  expect(errorCopy(new Error('ROSTER_FULL')).headline)
    .toBe('Your roster is full — 10 players is the maximum.');
});
test('prose messages: cut prefix and phase-closed strings', () => {
  expect(errorCopy(new Error('cut: pid 1104 not on roster')).headline)
    .toBe('That player is not on your roster.');
  expect(errorCopy(new Error('market is closed')).headline).toBe('Free agency is closed.');
});
test('unknown errors fall back with the raw message attached', () => {
  const r = errorCopy(new Error('some new server string'));
  expect(r.headline).toBe('That did not go through — try again.');
  expect(r.raw).toBe('some new server string');
});
```

`src/lib/boxfeed.test.ts`:
```ts
import { parseBoxCsv, seasonForm, teamRows } from './boxfeed';

const CSV = [
  'round,game_id,team,opponent,team_score,opp_score,win,player_id,player_name,position,tier,mins,pts,fgm,fga,three_pm,three_pa,rebounds,assists,steals,blocks,turnovers,playstyle',
  '1,R1-G001,"Alpha, LLC",Beta,101,99,1,1170,Tobias Beckett,B,starter,33,8,4,7,0,0,9,1,2,3,1,Balanced',
  '1,R1-G001,Beta,"Alpha, LLC",99,101,0,1170,Tobias Beckett,B,starter,30,6,3,6,0,0,7,1,1,2,0,Lockdown',
].join('\n');

test('parses the 23-column feed, quote-aware, numerics coerced', () => {
  const rows = parseBoxCsv(CSV);
  expect(rows).toHaveLength(2);
  expect(rows[0].team).toBe('Alpha, LLC');
  expect(rows[0].pts).toBe(8);
  expect(rows[1].playstyle).toBe('Lockdown');
});
test('seasonForm pools ALL copies of a pid (non-exclusive FA)', () => {
  const form = seasonForm(parseBoxCsv(CSV));
  expect(form.get(1170)).toEqual({ gp: 2, ppg: 7, fgPct: 7 / 13 });
});
test('teamRows filters by display name', () => {
  expect(teamRows(parseBoxCsv(CSV), 'Beta')).toHaveLength(1);
});
```

`src/lib/arrange.test.ts`:
```ts
import { arrangeLineup } from './arrange';
import type { CatalogPlayer } from '../types/models';

const mk = (pid: number, position: string, mins: string) =>
  [pid, { pid, position, mins_per_game: mins } as unknown as CatalogPlayer] as const;
const catalog = new Map([
  mk(1, 'G', '30'), mk(2, 'G', '28'), mk(3, 'G', '20'), mk(4, 'W', '32'),
  mk(5, 'W', '26'), mk(6, 'W', '18'), mk(7, 'B', '31'), mk(8, 'B', '22'),
]);
const active = [1, 2, 3, 4, 5, 6, 7, 8];

test('fresh arrangement: 2G/2W/1B by minutes, then sixth, then bench', () => {
  const l = arrangeLineup(active, catalog, null);
  expect(l.starters.sort()).toEqual([1, 2, 4, 5, 7]);
  expect(l.sixth).toBe(8); // highest-minutes non-starter (31→7 started; 22 next among rest order)
  expect(l.bench.sort()).toEqual([3, 6]);
  expect(l.playstyle).toBe('Balanced');
});
test('keeps legal previous starters and carries playstyle', () => {
  const prev = { starters: [3, 2, 6, 5, 8], sixth: 1, bench: [4, 7], playstyle: 'Lockdown' };
  const l = arrangeLineup(active, catalog, prev);
  expect(l.starters).toEqual([3, 2, 6, 5, 8]); // all still legal → kept verbatim
  expect(l.sixth).toBe(1);
  expect(l.playstyle).toBe('Lockdown');
});
test('drops a departed starter and backfills by minutes', () => {
  const prev = { starters: [1, 2, 4, 5, 7], sixth: 8, bench: [3, 6], playstyle: 'Balanced' };
  const nowActive = [2, 3, 4, 5, 6, 7, 8]; // pid 1 cut
  const l = arrangeLineup(nowActive, catalog, prev);
  expect(l.starters).toContain(3); // next guard by minutes fills the hole
  expect(l.starters).not.toContain(1);
});
```

- [ ] **Step 7: Run the unit suite**

Run: `cd games/salary-showdown/app && npx vitest run`
Expected: 5 files (incl. sanity), all tests pass. If `seasonForm` FG% or `capOkWith` peaks disagree, the mirror drifted from payroll.js — fix the mirror, never "adjust" the expectation.

- [ ] **Step 8: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): domain library — payroll mirrors, error copy, box-feed parser, lineup arranger"
```

---

### Task 5: Arena Broadcast design system + shared components

**Files:**
- Create: `src/styles/arena.css`, `src/components/ui/LedTimer.tsx`, `src/components/ui/PayrollBar.tsx`, `src/components/ui/PositionBadge.tsx`, `src/components/ui/HypeStars.tsx`, `src/components/ui/SectionCard.tsx`, `src/components/ui/TickerBar.tsx`, `src/components/ui/ErrorNotice.tsx`, `src/components/ui/PhaseHeader.tsx`
- Modify: `src/main.tsx` (import the stylesheet)
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- `<PhaseHeader title="Front Office" round={3} timerEndsAt={game.timerEndsAt} />` — brand line + LED timer.
- `<LedTimer endsAt={null | {toMillis()}} />` — renders `--:--` for null (**timerEndsAt is always null in Plan 2**; a countdown appears automatically once Plan 3's professor panel sets it).
- `<PayrollBar team={TeamDoc} round={number} />` — label + two-segment track, **widths computed** from `payrollSplitAt` (the mock hard-codes 70%/8% — sample-number error).
- `<PositionBadge pos="G" />`, `<HypeStars hype={3.5} />` (renders `★★★½` — hype is NEVER numeric in the UI), `<SectionCard num={2} title="Your roster" status="8 players">…</SectionCard>` (collapsible), `<TickerBar tag="SCOUT WIRE">…</TickerBar>`, `<ErrorNotice error={unknown|null} />`.

- [ ] **Step 1: Write the stylesheet**

`src/styles/arena.css` (tokens hex-exact from the approved mocks; every screen composes these classes):
```css
:root {
  --bg-a: #0d1b2e; --bg-b: #132a4a; --gold: #ffc94d; --text: #f2f5fa;
  --muted: #9fb4d0; --dim: #5f7396; --inset: #08101d; --border: #2c4a78;
  --card-a: #1b3357; --card-b: #14263f; --track: #1d3050;
  --green: #3fa46a; --ok: #7ed492; --red: #c0392b; --neg: #ff7b6b;
  --pos-g: #e0533f; --pos-w: #2e86ab; --pos-b: #7d5ba6;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; color: var(--text);
  background: linear-gradient(160deg, var(--bg-a) 0%, var(--bg-b) 100%);
  font-family: "Avenir Next", "Segoe UI", sans-serif; min-height: 100vh;
}
.page { max-width: 720px; margin: 0 auto; padding: 16px 16px 48px; }
.brand { color: var(--gold); font-weight: 900; font-style: italic;
  text-transform: uppercase; letter-spacing: 0.04em; }
.phase-head { display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; margin-bottom: 12px; }
.led { font-family: var(--mono); color: var(--gold); background: #000;
  border: 1.5px solid var(--gold); border-radius: 6px; padding: 4px 10px;
  font-size: 20px; letter-spacing: 0.08em; }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); } .dim { color: var(--dim); }
.ok { color: var(--ok); } .neg { color: var(--neg); }
.card { background: linear-gradient(180deg, var(--card-a), var(--card-b));
  border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.inset { background: var(--inset); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px; }
.payroll { position: sticky; top: 0; z-index: 10; background: var(--inset);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
.payroll .track { height: 8px; background: var(--track); border-radius: 4px;
  overflow: hidden; display: flex; margin-top: 6px; }
.payroll .cash { background: var(--green); height: 100%; }
.payroll .dead { background: var(--red); height: 100%; }
.badge { display: inline-block; min-width: 20px; text-align: center;
  border-radius: 4px; padding: 1px 5px; font-size: 12px; font-weight: 700;
  color: #fff; }
.badge.G { background: var(--pos-g); } .badge.W { background: var(--pos-w); }
.badge.B { background: var(--pos-b); }
.stars { color: var(--gold); letter-spacing: 0.05em; }
.section { border: 1px solid var(--border); border-radius: 10px; margin: 12px 0;
  background: linear-gradient(180deg, var(--card-a), var(--card-b)); }
.section > header { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  cursor: pointer; user-select: none; }
.section .num { background: var(--gold); color: #08101d; font-weight: 800;
  border-radius: 50%; width: 22px; height: 22px; display: inline-flex;
  align-items: center; justify-content: center; }
.section .title { text-transform: uppercase; font-weight: 700; letter-spacing: 0.03em; }
.section .status { margin-left: auto; color: var(--muted); font-size: 13px; }
.section .body { padding: 0 12px 12px; }
.ticker { background: var(--gold); color: #08101d; border-radius: 6px;
  padding: 6px 10px; display: flex; gap: 10px; align-items: center; font-size: 14px; }
.ticker .tag { background: var(--bg-a); color: var(--gold); font-weight: 800;
  padding: 2px 8px; border-radius: 4px; font-size: 12px; letter-spacing: 0.05em; }
.btn { border-radius: 8px; border: 1px solid var(--border); padding: 10px 16px;
  font-weight: 700; cursor: pointer; background: var(--track); color: var(--text); }
.btn.green { background: var(--green); border-color: var(--green); color: #04120a; }
.btn.gold { background: var(--gold); border-color: var(--gold); color: #08101d; }
.btn.cut { background: transparent; border-color: var(--red); color: var(--neg); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.error-notice { border: 1px solid var(--red); background: rgba(192, 57, 43, 0.12);
  color: var(--neg); border-radius: 8px; padding: 8px 12px; margin: 8px 0; }
.chip { border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px;
  background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; }
.chip.on { border-color: var(--gold); color: var(--gold); }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { text-align: right; color: var(--dim); font-weight: 600; padding: 6px 8px;
  cursor: pointer; white-space: nowrap; }
.table th.name, .table td.name { text-align: left; }
.table td { text-align: right; padding: 6px 8px; border-top: 1px solid var(--track);
  font-family: var(--mono); }
.table tr.sel { background: rgba(255, 201, 77, 0.12); }
.table tr:hover { background: rgba(255, 201, 77, 0.06); }
.row-flash-win { color: var(--ok); } .row-flash-loss { color: var(--neg); }
.drawer { border: 1px solid var(--gold); border-radius: 10px; padding: 14px;
  background: linear-gradient(180deg, var(--card-a), var(--card-b)); }
.slot { border: 1.5px dashed var(--border); border-radius: 8px; min-height: 56px;
  display: flex; align-items: center; justify-content: center; }
.slot.filled { border-style: solid; border-color: var(--green); }
.slot.sixth { border-color: var(--gold); }
.court { position: relative; height: 240px; border: 1px solid var(--border);
  border-radius: 10px; background: #1a3a5c; overflow: hidden; }
.court .arc { position: absolute; left: 15%; right: 15%; top: 35%; bottom: -40%;
  border: 2px solid rgba(255, 201, 77, 0.35); border-radius: 50%; }
```

- [ ] **Step 2: Write the components**

`src/components/ui/LedTimer.tsx`:
```tsx
import { useEffect, useState } from 'react';

// timerEndsAt is ALWAYS null in Plan 2 (professor timers land in Plan 3).
// The null state is the product, not a fallback — render a steady "--:--".
export function LedTimer({ endsAt }: { endsAt: { toMillis(): number } | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return <span className="led" data-testid="led">--:--</span>;
  const left = Math.max(0, Math.floor((endsAt.toMillis() - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return <span className="led" data-testid="led">{mm}:{ss}</span>;
}
```

`src/components/ui/PhaseHeader.tsx`:
```tsx
import { LedTimer } from './LedTimer';

export function PhaseHeader({ title, round, timerEndsAt }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
}) {
  return (
    <div className="phase-head">
      <div>
        <div className="brand">Salary Showdown</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>{title} · Round {round}</h1>
      </div>
      <LedTimer endsAt={timerEndsAt} />
    </div>
  );
}
```

`src/components/ui/PayrollBar.tsx`:
```tsx
import type { TeamDoc } from '../../types/models';
import { payrollSplitAt } from '../../lib/contracts';
import { CAP, fmtM, r01 } from '../../lib/money';

// Segment widths are COMPUTED percentages of the cap — the mock's hard-coded
// 70%/8% widths are a known sample-number error (spec §11 Mockup errata).
export function PayrollBar({ team, round }: { team: TeamDoc; round: number }) {
  const { cash, dead } = payrollSplitAt(team, round);
  const room = r01(CAP - cash - dead);
  return (
    <div className="payroll" data-testid="payroll-bar">
      <span className="mono">
        Payroll {fmtM(cash)}{dead > 0 ? <> + <span className="neg">{fmtM(dead)} dead</span></> : null}
        {' '}/ {fmtM(CAP)} cap · <span className={room < 0 ? 'neg' : 'ok'}>{fmtM(room)} room</span>
      </span>
      <div className="track">
        <div className="cash" style={{ width: `${Math.min(100, (cash / CAP) * 100)}%` }} />
        <div className="dead" style={{ width: `${Math.min(100, (dead / CAP) * 100)}%` }} />
      </div>
    </div>
  );
}
```

`src/components/ui/PositionBadge.tsx`:
```tsx
export const PositionBadge = ({ pos }: { pos: string }) => (
  <span className={`badge ${pos}`}>{pos}</span>
);
```

`src/components/ui/HypeStars.tsx`:
```tsx
// Hype renders ONLY as ★ glyphs (halves as ½) — never numerically (spec §11).
// ★ and ½ are glyphs, not emojis; the no-emoji rule is untouched.
export function HypeStars({ hype }: { hype: number }) {
  const full = Math.floor(hype);
  const half = hype - full >= 0.5;
  return (
    <span className="stars" aria-label={`hype ${hype} of 5`}>
      {'★'.repeat(full)}{half ? '½' : ''}
    </span>
  );
}
```

`src/components/ui/SectionCard.tsx`:
```tsx
import { useState, type ReactNode } from 'react';

export function SectionCard({ num, title, status, children, defaultOpen = true }: {
  num: number; title: string; status: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header onClick={() => setOpen((o) => !o)}>
        <span className="num">{num}</span>
        <span className="title">{title}</span>
        <span className="status">{status} {open ? '' : '· tap to expand'}</span>
      </header>
      {open && <div className="body">{children}</div>}
    </section>
  );
}
```

`src/components/ui/TickerBar.tsx`:
```tsx
import type { ReactNode } from 'react';

export const TickerBar = ({ tag, children }: { tag: string; children: ReactNode }) => (
  <div className="ticker"><span className="tag">{tag}</span><span>{children}</span></div>
);
```

`src/components/ui/ErrorNotice.tsx`:
```tsx
import { errorCopy } from '../../lib/errors';

export function ErrorNotice({ error }: { error: unknown | null }) {
  if (!error) return null;
  const { headline, raw } = errorCopy(error);
  return (
    <div className="error-notice" role="alert">
      {headline}{raw ? <div className="dim" style={{ fontSize: 12 }}>{raw}</div> : null}
    </div>
  );
}
```

Add `import './styles/arena.css';` as the first import in `src/main.tsx`.

- [ ] **Step 3: Write the component tests**

`src/components/ui/ui.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { HypeStars } from './HypeStars';
import { LedTimer } from './LedTimer';
import { PayrollBar } from './PayrollBar';
import type { TeamDoc } from '../../types/models';

test('LedTimer renders the steady null state (Plan 2 has no professor timers)', () => {
  render(<LedTimer endsAt={null} />);
  expect(screen.getByTestId('led')).toHaveTextContent('--:--');
});
test('HypeStars renders glyphs, never digits', () => {
  render(<HypeStars hype={3.5} />);
  const el = screen.getByLabelText('hype 3.5 of 5');
  expect(el).toHaveTextContent('★★★½');
  expect(el.textContent).not.toMatch(/\d/);
});
test('PayrollBar computes label and segment widths from the roster', () => {
  const team = {
    name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
    roster: [{ pid: 1, rate: 78.2, startRound: 1, years: 5, viaAuction: false, hardship: false }],
    deadMoney: [{ pid: 2, rate: 9.1, startRound: 1, endRound: 5 }],
    spendLog: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
  } satisfies TeamDoc;
  const { container } = render(<PayrollBar team={team} round={3} />);
  expect(screen.getByTestId('payroll-bar')).toHaveTextContent(
    'Payroll $78.2M + $9.1M dead / $100.0M cap · $12.7M room');
  expect((container.querySelector('.cash') as HTMLElement).style.width)
    .toBe('78.2%');  // computed, not the mock’s hard-coded 70%
  expect((container.querySelector('.dead') as HTMLElement).style.width).toBe('9.1%');
});
```

- [ ] **Step 4: Run, look, commit**

Run: `npx vitest run` — expected: all files pass.
Browser check: with the dev server up, the stub pages now render on the navy gradient with the gold brand line (arena.css is global).

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): Arena Broadcast design system + shared UI components"
```

---
### Task 6: Auth + Game contexts, phase router, integration-test harness

**Files:**
- Create: `src/contexts/AuthContext.tsx`, `src/contexts/GameContext.tsx`, `src/components/PhaseRouter.tsx`, `src/itest/harness.ts`
- Modify: `src/App.tsx` (wrap routes in providers + PhaseRouter)
- Test: `src/itest/contexts.itest.tsx`

**Interfaces:**
- `useAuth()` → `{ uid: string | null, ready: boolean }` (anonymous sign-in on mount; per-tab identity).
- `useGame()` → `{ gameId, setGameId(id), game: GameDoc|null, membership: {teamId, role, displayName}|null, team: TeamDoc|null, teams: Map<teamId, TeamDoc>, catalog: Map<pid, CatalogPlayer>, market: MarketDoc|null, call(name, data) }`. `call` wraps `httpsCallable` and rethrows the `FirebaseError` (screens catch and hand it to `ErrorNotice`).
- `<PhaseRouter />` — navigates to the route for `game.phase` whenever it changes (membership required). Route map: LOBBY→`/lobby`, FRONT_OFFICE→`/game/office`, FREE_AGENCY→`/game/market`, AUCTION→`/game/auction`, LINEUP→`/game/lineup`, SIMULATE→`/game/simulate`, RESULTS→`/game/results`, FINALE→`/game/conclusion`.
- `harness.ts` (integration tests only): `adminDb()`, `newClient(name)` → `{uid, call}`, `seedToPhase({ teams, fill, to })` → `{gameId, joinCode, teamIds, prof, bots}` — same drive loop as the seed script (kept separate on purpose: the script must not import `src/`, tests must not shell out; both restate the advancePhase ruling).

- [ ] **Step 1: Write the contexts**

`src/contexts/AuthContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../lib/firebase';

const Ctx = createContext<{ uid: string | null; ready: boolean }>({ uid: null, ready: false });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ uid: null as string | null, ready: false });
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setState({ uid: u.uid, ready: true });
      else void signInAnonymously(auth); // anonymous by design — no accounts in a classroom
    });
    return unsub;
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
```

`src/contexts/GameContext.tsx`:
```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { CatalogPlayer, GameDoc, MarketDoc, TeamDoc } from '../types/models';

interface Membership { teamId: string; role: string; displayName: string }
interface GameCtx {
  gameId: string | null; setGameId: (id: string | null) => void;
  game: GameDoc | null; membership: Membership | null; team: TeamDoc | null;
  teams: Map<string, TeamDoc>; catalog: Map<number, CatalogPlayer>;
  market: MarketDoc | null;
  call: <T = unknown>(name: string, data: unknown) => Promise<T>;
}
const Ctx = createContext<GameCtx>(null as unknown as GameCtx);
export const useGame = () => useContext(Ctx);

export function GameProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [gameId, setGameIdState] = useState<string | null>(
    () => sessionStorage.getItem('ss.gameId'));
  const [game, setGame] = useState<GameDoc | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [teams, setTeams] = useState<Map<string, TeamDoc>>(new Map());
  const [catalog, setCatalog] = useState<Map<number, CatalogPlayer>>(new Map());
  const [market, setMarket] = useState<MarketDoc | null>(null);

  const setGameId = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem('ss.gameId', id);
    else sessionStorage.removeItem('ss.gameId');
    setGameIdState(id);
  }, []);

  useEffect(() => { // game doc
    if (!gameId) { setGame(null); return; }
    return onSnapshot(doc(db, 'games', gameId),
      (s) => setGame(s.exists() ? (s.data() as GameDoc) : null),
      () => setGame(null)); // permission error pre-membership: stay null, Landing owns the flow
  }, [gameId]);

  useEffect(() => { // own membership doc
    if (!gameId || !uid) { setMembership(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'players', uid),
      (s) => setMembership(s.exists() ? (s.data() as Membership) : null),
      () => setMembership(null));
  }, [gameId, uid]);

  useEffect(() => { // all team docs (public to members) — Lobby, Standings, Results need them
    if (!gameId || !membership) { setTeams(new Map()); return; }
    return onSnapshot(collection(db, 'games', gameId, 'teams'), (snap) => {
      const m = new Map<string, TeamDoc>();
      snap.forEach((d) => m.set(d.id, d.data() as TeamDoc));
      setTeams(m);
    });
  }, [gameId, membership]);

  useEffect(() => { // catalog: 175 static docs — fetch once per game
    if (!gameId || !membership) { setCatalog(new Map()); return; }
    void getDocs(collection(db, 'games', gameId, 'catalog')).then((snap) => {
      const m = new Map<number, CatalogPlayer>();
      snap.forEach((d) => m.set(Number(d.id), d.data() as CatalogPlayer));
      setCatalog(m);
    });
  }, [gameId, membership]);

  useEffect(() => { // this round's market doc
    const round = game?.round ?? 0;
    if (!gameId || !membership || round < 1) { setMarket(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'market', String(round)),
      (s) => setMarket(s.exists() ? (s.data() as MarketDoc) : null));
  }, [gameId, membership, game?.round]);

  const call = useCallback(async <T,>(name: string, data: unknown): Promise<T> => {
    const res = await httpsCallable(functions, name)(data);
    return res.data as T;
  }, []);

  const team = membership ? teams.get(membership.teamId) ?? null : null;
  const value = useMemo(() => ({
    gameId, setGameId, game, membership, team, teams, catalog, market, call,
  }), [gameId, setGameId, game, membership, team, teams, catalog, market, call]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Write the phase router and wire App**

`src/components/PhaseRouter.tsx`:
```tsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import type { Phase } from '../types/models';

const ROUTE: Record<Phase, string> = {
  LOBBY: '/lobby', FRONT_OFFICE: '/game/office', FREE_AGENCY: '/game/market',
  AUCTION: '/game/auction', LINEUP: '/game/lineup', SIMULATE: '/game/simulate',
  RESULTS: '/game/results', FINALE: '/game/conclusion',
};

// The professor's advancePhase is the game's only clock; this component makes
// every team screen follow it. /standings is exempt — it is "always accessible"
// (spec §11.9): navigation TO it is manual, and we do not yank the user off it.
export function PhaseRouter() {
  const { game, membership } = useGame();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!game || !membership) return;
    if (pathname === '/standings') return;
    const want = ROUTE[game.phase];
    if (want && pathname !== want) nav(want, { replace: true });
  }, [game?.phase, membership, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
```

`src/App.tsx` — wrap everything (stubs remain until their tasks):
```tsx
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { PhaseRouter } from './components/PhaseRouter';

// …Stub unchanged…

export default function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <PhaseRouter />
        <Routes>{/* keep the existing Route elements from the Task 1 file
                    UNCHANGED here — this edit only wraps them in the two
                    providers and adds <PhaseRouter /> above them */}</Routes>
      </GameProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Write the integration harness**

`src/itest/harness.ts`:
```ts
// Integration-test harness. Reads via firebase-admin (rules deny client reads
// pre-membership; admin bypasses — emulator only). Actions via the REAL callables.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';

import admin from 'firebase-admin';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

if (admin.apps.length === 0) admin.initializeApp({ projectId: 'salary-showdown-dev' });
export const adminDb = () => admin.firestore();

let n = 0;
export async function newClient(name: string) {
  const app = initializeApp(
    { apiKey: 'fake-api-key', projectId: 'salary-showdown-dev' }, `${name}-${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5101);
  const cred = await signInAnonymously(auth);
  return {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(fns, fn)(data).then((r) => r.data as T),
    dispose: () => deleteApp(app),
  };
}
export type Client = Awaited<ReturnType<typeof newClient>>;

const r01 = (x: number) => Math.round(x * 10) / 10;
const minBid = (round: number) => r01(2.0 * 1.08 ** (round - 1));
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];

export interface Seeded {
  gameId: string; joinCode: string; teamIds: string[]; prof: Client;
  bots: { teamId: string; gm: Client; scout: Client; coach: Client }[];
}

// Drives a game to `to` (e.g. 'R1:FREE_AGENCY', 'R3:FRONT_OFFICE', 'FINALE') with
// bots on every team except index 0 (fill: 'others') or on all (fill: 'all').
// RULING (restated): advancePhase always carries expectedPhase + expectedRound.
export async function seedToPhase(opts: {
  teams?: string[]; fill?: 'others' | 'all'; to: string;
}): Promise<Seeded> {
  const names = opts.teams ?? ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const prof = await newClient('prof');
  const { gameId, joinCode } =
    await prof.call<{ gameId: string; joinCode: string }>('createGame', { teamNames: names });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const idx = opts.fill === 'all' ? teamIds.map((_, i) => i) : teamIds.map((_, i) => i).slice(1);

  const bots: Seeded['bots'] = [];
  for (const i of idx) {
    const gm = await newClient(`gm${i}`), scout = await newClient(`sc${i}`),
      coach = await newClient(`co${i}`);
    await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId: teamIds[i], gm, scout, coach });
  }
  if (opts.to === 'LOBBY') return { gameId, joinCode, teamIds, prof, bots };

  await prof.call('startSeason', { gameId });
  const [, rS, ph] = opts.to === 'FINALE'
    ? [null, '5', 'FINALE'] : /^R([1-5]):([A-Z_]+)$/.exec(opts.to)!;
  let g = (await adminDb().doc(`games/${gameId}`).get()).data()!;
  let guard = 0;
  while (!(g.phase === ph && (ph === 'FINALE' || g.round === Number(rS)))) {
    if (g.phase === 'FREE_AGENCY' && g.round === 1) {
      const market = (await adminDb().doc(`games/${gameId}/market/1`).get()).data()!;
      const cat = await adminDb().collection(`games/${gameId}/catalog`).get();
      const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
      for (const bot of bots) {
        const pool: Record<string, { pid: number; sal: number }[]> = { G: [], W: [], B: [] };
        for (const pid of market.available as number[]) {
          const p = byPid[pid];
          if (p.salary_per_round !== '') {
            pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
          }
        }
        for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
        const used = new Set<number>();
        let i = 0;
        for (const pos of SIGN_ORDER) { // interleaved → can never trip POSITION_LOCK
          const p = pool[pos].find((x) => !used.has(x.pid))!;
          used.add(p.pid);
          await bot.gm.call('signPlayer', { gameId, pid: p.pid, years: (i % 4) + 1 });
          i += 1;
        }
      }
    }
    if (g.phase === 'AUCTION') {
      const wave = (await adminDb().doc(`games/${gameId}/auctions/${g.round}`).get()).data()!;
      for (const [i, bot] of bots.entries()) {
        await bot.scout.call('submitBids', { gameId, bids: {
          [wave.stars[i % wave.stars.length]]: { rate: minBid(g.round), years: 1 } } });
      }
    }
    // LINEUP: submit nothing — the exit hook's auto-repair carries every team
    // (proven by the backend smoke test); bots only need rosters and bids.
    await prof.call('advancePhase',
      { gameId, expectedPhase: g.phase, expectedRound: g.round });
    g = (await adminDb().doc(`games/${gameId}`).get()).data()!;
    if (++guard > 40) throw new Error(`stuck at R${g.round}:${g.phase}`);
  }
  return { gameId, joinCode, teamIds, prof, bots };
}
```

- [ ] **Step 4: Write the integration test**

`src/itest/contexts.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('membership + phase router: joined client lands on /lobby, follows startSeason', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  // The app under test has its own anonymous uid — join Team 1 AS that uid.
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Lobby'),
    { timeout: 15000 });
  await seeded.prof.call('startSeason', { gameId: seeded.gameId });
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Free Agency'),
    { timeout: 15000 });
}, 90000);
```

- [ ] **Step 5: Run both suites**

Unit: `cd games/salary-showdown/app && npx vitest run` — all pass (harness/itest files are excluded).
Integration: `cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only functions,firestore,auth "cd ../app && npx vitest run -c vitest.integration.config.ts"`
Expected: 1 file, 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): auth/game contexts, phase router, emulator test harness"
```

---

### Task 7: Landing page (`/`)

Unmocked screen — build from spec §11.14's contract in the Arena Broadcast language: join code + display name + franchise pick + role claim, open roles shown, first-tap-wins with a graceful "seat taken" retry.

**Scope ruling (restated):** franchise *creation* is not on this screen. The backend's `createGame` takes all team names up front and no add-team callable exists; curated names + the rename tool are the professor panel's job (Plan 3). This page only claims seats on existing teams. Late joins after round 1: the backend accepts a claim on any OPEN seat mid-game (that is how a crashed laptop rejoins); true spectator "observer" accounts are Plan 3.

**Files:**
- Create: `src/pages/LandingPage.tsx`
- Modify: `src/App.tsx` (replace the `/` stub)
- Test: `src/itest/landing.itest.tsx`

**Interfaces:**
- Consumes: `getLobby` (Task 3), `joinGame`, `useGame().setGameId`, `ErrorNotice`.
- Produces: on successful join → `setGameId(gameId)`; PhaseRouter takes over navigation.

- [ ] **Step 1: Write the page**

`src/pages/LandingPage.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { ErrorNotice } from '../components/ui/ErrorNotice';

interface LobbyTeam { teamId: string; name: string; claimedRoles: string[] }
interface LobbyInfo {
  gameId: string; status: string; phase: string; round: number; teams: LobbyTeam[];
}
const ROLES = ['GM', 'Scout', 'Coach'] as const;

export default function LandingPage() {
  const { call, setGameId } = useGame();
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code') ?? '');
  const [name, setName] = useState('');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // No realtime pre-membership (rules deny reads until joinGame lands), so the
  // team list refreshes by polling getLobby every 3s while the picker is open.
  const lookup = useCallback(async (c: string) => {
    try {
      setErr(null);
      setLobby(await call<LobbyInfo>('getLobby', { joinCode: c.trim().toUpperCase() }));
    } catch (e) { setLobby(null); setErr(e); }
  }, [call]);

  useEffect(() => {
    if (!lobby) return;
    timer.current = setInterval(() => void lookup(code), 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [lobby !== null, code, lookup]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = async (teamId: string, role: string) => {
    setBusy(true); setErr(null);
    try {
      await call('joinGame', { joinCode: code.trim().toUpperCase(), teamId, role,
        displayName: name.trim() || 'Anonymous' });
      setGameId(lobby!.gameId); // membership listener + PhaseRouter take it from here
    } catch (e) {
      setErr(e);              // "seat taken" etc. — refresh the picker immediately
      void lookup(code);
    } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <div className="brand" style={{ fontSize: 28 }}>Salary Showdown</div>
      <p className="muted">Enter the join code on the projector, pick your franchise, claim your seat.</p>
      <ErrorNotice error={err} />
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="inset mono" style={{ color: 'inherit', fontSize: 18, width: 120 }}
          placeholder="CODE" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="join code" />
        <input className="inset" style={{ color: 'inherit', fontSize: 16, flex: 1, minWidth: 140 }}
          placeholder="Your name" maxLength={24} value={name}
          onChange={(e) => setName(e.target.value)} aria-label="display name" />
        <button className="btn gold" disabled={code.length < 6 || busy}
          onClick={() => void lookup(code)}>Find game</button>
      </div>
      {lobby && (
        <>
          {lobby.status !== 'lobby' && (
            <p className="muted">Season in progress — you can still claim an open seat.</p>
          )}
          {lobby.teams.map((t) => (
            <div key={t.teamId} className="card" style={{ marginTop: 10, display: 'flex',
              alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ flex: 1 }}>{t.name}</strong>
              {ROLES.map((r) => {
                const taken = t.claimedRoles.includes(r);
                return (
                  <button key={r} className={taken ? 'chip' : 'chip on'} disabled={taken || busy}
                    onClick={() => void claim(t.teamId, r)}>
                    {r}{taken ? ' · taken' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
```
In `App.tsx`, replace `<Route path="/" element={<Stub name="Landing" />} />` with `<Route path="/" element={<LandingPage />} />` (import it).

- [ ] **Step 2: Write the integration test**

`src/itest/landing.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { seedToPhase } from './harness';
import { auth } from '../lib/firebase';
import App from '../App';

test('landing: code → team list with taken seats → claim → lobby', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' }); // bots on Beta/Gamma/Delta
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  await user.type(screen.getByLabelText('join code'), seeded.joinCode);
  await user.type(screen.getByLabelText('display name'), 'Dana');
  await user.click(screen.getByRole('button', { name: 'Find game' }));

  await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument(), { timeout: 15000 });
  // Beta is fully staffed by bots — its three seats all read "taken".
  const betaCard = screen.getByText('Beta').closest('.card')!;
  expect(betaCard.textContent).toContain('GM · taken');
  // Alpha is open — claim GM and land in the lobby via PhaseRouter.
  const alphaCard = screen.getByText('Alpha').closest('.card')!;
  await user.click(Array.from(alphaCard.querySelectorAll('button'))
    .find((b) => b.textContent === 'GM')!);
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Lobby'),
    { timeout: 15000 });
}, 90000);
```

- [ ] **Step 3: Run integration + browser check**

Run the integration command (Global Constraints). Expected: 2 files, 2 tests pass.
Browser: with emulators up, `npm run seed -- --to R1:FREE_AGENCY` — wait, Landing is best seen in a lobby: `node scripts/seed-demo.mjs --to R1:FREE_AGENCY` advances past it, so seed a lobby-only game instead by running the script with `--to R1:FREE_AGENCY` **replaced by** the lobby stop: `npm run seed -- --to LOBBY` is not a script target — use the harness game from the itest OR create one manually: `node -e` with createGame is overkill; simplest: run `npm run seed -- --to R1:FREE_AGENCY`, copy the printed joinCode, open `http://localhost:5176/?code=<joinCode>` — the picker renders with "Season in progress — you can still claim an open seat."
What you should see: navy page, gold SALARY SHOWDOWN, code prefilled; after Find game: four team cards; Beta/Gamma/Delta's chips read "GM · taken / Scout · taken / Coach · taken", Alpha's three chips gold-outlined and clickable. Claiming GM navigates to the Free Agency stub (PhaseRouter following the live phase).

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): landing page — lobby discovery, seat claiming, seat-taken retry"
```

---

### Task 8: Lobby page (`/lobby`)

Unmocked — spec §11.14: rosters assemble live, rules carousel cycles the cheat-sheet rules, no ready-check ("the professor's start button is the gate"). Roles may be re-claimed freely until the season starts — leaving a seat is just closing the tab; the seat shows open again only in Plan 3's professor tools, so this page simply renders live membership truthfully.

**Files:**
- Create: `src/pages/LobbyPage.tsx`
- Modify: `src/App.tsx` (replace the `/lobby` stub)
- Test: `src/itest/lobby.itest.tsx`

**Interfaces:**
- Consumes: `useGame()` (game, membership, teams), Firestore `games/{id}/players` collection (members may read it — renders who claimed what), `PhaseHeader`.

- [ ] **Step 1: Write the page**

`src/pages/LobbyPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';

// Cheat-sheet rules, verbatim tone: facts and rules only, no strategy hints.
const RULES = [
  'Wins crown the champion.',
  '$100M hard cap, every round.',
  'Salaries are paid every round of the contract.',
  'Cut players still get paid — dead money stays on your cap.',
  'Prices rise about 8% each round.',
  'Roster: minimum 8, maximum 10. Starters: 2 G, 2 W, 1 B.',
  'One submit per phase: GM signs, Scout bids, Coach sets the lineup.',
];

interface Member { teamId: string; role: string; displayName: string }

export default function LobbyPage() {
  const { gameId, game, membership, teams } = useGame();
  const [members, setMembers] = useState<Member[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!gameId || !membership) return;
    return onSnapshot(collection(db, 'games', gameId, 'players'),
      (s) => setMembers(s.docs.map((d) => d.data() as Member)));
  }, [gameId, membership]);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % RULES.length), 5000);
    return () => clearInterval(id);
  }, []);

  if (!game || !membership) return null;
  return (
    <main className="page">
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt} />
      <div className="ticker" role="status">
        <span className="tag">HOUSE RULES</span><span>{RULES[slide]}</span>
      </div>
      <p className="muted">Join code on the projector: <span className="mono">{game.joinCode}</span>.
        Waiting for the professor to start the season.</p>
      {[...teams.entries()].map(([tid, t]) => (
        <div key={tid} className="card"
          style={{ marginTop: 10, outline: tid === membership.teamId ? '1.5px solid var(--gold)' : 'none' }}>
          <strong>{t.name}</strong>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            {['GM', 'Scout', 'Coach'].map((role) => {
              const m = members.find((x) => x.teamId === tid && x.role === role);
              return (
                <span key={role} className={m ? 'ok' : 'dim'}>
                  {role}: {m ? m.displayName : 'open'}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </main>
  );
}
```
Replace the `/lobby` stub in `App.tsx`.

- [ ] **Step 2: Write the integration test**

`src/itest/lobby.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('lobby shows live role claims and own-team highlight', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Casey',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);
  await waitFor(() => {
    expect(screen.getByText(/Coach: Casey/)).toBeInTheDocument();  // own claim, live
    expect(screen.getByText(/GM: GM1/)).toBeInTheDocument();       // bot on Beta
    expect(screen.getAllByText(/GM: open/).length).toBe(1);        // Alpha's GM still open
  }, { timeout: 15000 });
}, 90000);
```

- [ ] **Step 3: Run + browser check**

Integration run: 3 files, 3 tests pass.
Browser: claim a seat on the seeded game (Task 7 flow), land on /lobby.
What you should see: HOUSE RULES ticker cycling every 5s; four team cards; your team gold-outlined; staffed bot teams show `GM: GM Beta` etc. in green, open seats say `open` in dim slate; the line "Waiting for the professor to start the season." No start button exists on this screen — that is the professor's, by design.

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): lobby — live team assembly + house-rules carousel"
```

---
### Task 9: Front Office page (`/game/office`)

**Mockup:** `front-office-v5.html` — single scroll, sticky payroll bar, three numbered collapsible sections, player cards with the monospace two-line stat. Every number recomputed.

**Rulings restated for this screen:**
- The stat line is `this ssn X.X ppg / listed Y.Y ppg` — **raw numbers, no green/red delta coloring, no judgment labels** (spec §11.3: facts, never conclusions). `this ssn` is the league-wide live average over all rostered copies (Task 4 `seasonForm`); render `—` when the player has no live rounds.
- A **re-sign is an ordinary signing at the current ask** (spec §13): ask = `askPrice(base, round)` with the years slider and standard length discounts. For an expiring **auction-class** star (blank `salary_per_round`) the base is the hype curve — mirroring `validateSigning`'s exact base resolution.
- **"Let walk" is a UI-only decision** — no callable exists or is needed; the contract simply expires. It exists so the section can honestly report "n of n decided."
- **Tonight's market preview shows the auction block only** (name / position / hype — nothing else: no ages, no stats, no prices; the mock showing star ages is a listed erratum). The incoming-FA half of the mock's preview is **not renderable**: the FA draw happens server-side at Free Agency open (`enter:FREE_AGENCY`), so during Front Office `market/{round}` does not exist yet, and the client must not try to predict a server-seeded draw. Render the line "Free-agent pool refreshes when the market opens."
- The scout-wire ticker renders **flavor only** in Plan 2 — the professor hint line and its strength knob are Plan 3. Flavor must be data-free (no conclusions).
- Round 1 never reaches this screen (season starts at FREE_AGENCY); no special-casing needed beyond PhaseRouter.

**Files:**
- Create: `src/pages/FrontOfficePage.tsx`, `src/hooks/useSeasonForm.ts`
- Modify: `src/lib/money.ts` (add `hypeCurve`), `src/lib/money.test.ts`, `src/App.tsx` (replace stub)
- Test: `src/itest/frontoffice.itest.tsx`

**Interfaces:**
- Produces: `useSeasonForm()` → `Map<pid, {gp, ppg, fgPct}>` from all persisted `rounds/*` box feeds (used again by Free Agency and Lineup). `money.hypeCurve(hype)`.

- [ ] **Step 1: Add the hype-curve mirror**

Append to `src/lib/money.ts` (mirror of `payroll.js:11` — prices unsold stars and auction-class re-signs):
```ts
export const hypeCurve = (hype: number) => 2.0 + ((hype - 1.0) / 4.0) ** 1.35 * 24.0;
```
Append to `src/lib/money.test.ts`:
```ts
import { hypeCurve } from './money';
test('hypeCurve endpoints match payroll.js', () => {
  expect(hypeCurve(1.0)).toBe(2.0);
  expect(hypeCurve(5.0)).toBe(26.0);
  expect(r01(hypeCurve(3.5))).toBe(14.7); // 2 + (0.625^1.35)*24 = 14.726…
});
```

- [ ] **Step 2: Write the season-form hook**

`src/hooks/useSeasonForm.ts`:
```ts
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { parseBoxCsv, seasonForm, type BoxRow } from '../lib/boxfeed';

// Live form from every persisted round feed. Refetches when a new round doc can
// exist (game.round changes); rounds/* are immutable once written.
export function useSeasonForm() {
  const { gameId, membership, game } = useGame();
  const [form, setForm] = useState<Map<number, { gp: number; ppg: number; fgPct: number }>>(new Map());
  const [rows, setRows] = useState<BoxRow[]>([]);
  useEffect(() => {
    if (!gameId || !membership) return;
    void getDocs(collection(db, 'games', gameId, 'rounds')).then((snap) => {
      const all: BoxRow[] = [];
      snap.forEach((d) => all.push(...parseBoxCsv((d.data() as { boxCsv: string }).boxCsv)));
      setRows(all);
      setForm(seasonForm(all));
    });
  }, [gameId, membership, game?.round]);
  return { form, rows };
}
```

- [ ] **Step 3: Write the page**

`src/pages/FrontOfficePage.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { SectionCard } from '../components/ui/SectionCard';
import { TickerBar } from '../components/ui/TickerBar';
import { PositionBadge } from '../components/ui/PositionBadge';
import { HypeStars } from '../components/ui/HypeStars';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activeContracts, expiringPids } from '../lib/contracts';
import { askPrice, contractRate, fmtM, hypeCurve, maxYears } from '../lib/money';
import type { CatalogPlayer, Contract } from '../types/models';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

function StatLine({ p, form }: {
  p: CatalogPlayer; form: Map<number, { ppg: number }>;
}) {
  const live = form.get(p.pid);
  return (
    <div className="mono muted" style={{ fontSize: 13 }}>
      this ssn {live ? live.ppg.toFixed(1) : '—'} ppg / <span className="dim">listed {Number(p.pts_per_game).toFixed(1)} ppg</span>
    </div>
  );
}

export default function FrontOfficePage() {
  const { game, team, catalog, call, gameId } = useGame();
  const { form } = useSeasonForm();
  const [err, setErr] = useState<unknown>(null);
  const [walked, setWalked] = useState<Set<number>>(new Set());
  const [resignYears, setResignYears] = useState<Record<number, number>>({});
  const [cutTarget, setCutTarget] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 0;
  const expiring = useMemo(
    () => (team ? expiringPids(team, round) : []), [team, round]);
  const actives = useMemo(
    () => (team ? activeContracts(team, round) : []), [team, round]);
  const tonightStars = useMemo(
    () => [...catalog.values()].filter((p) => Number(p.auction_round) === round),
    [catalog, round]);

  if (!game || !team || catalog.size === 0) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const decidedCount = expiring.filter(
    (pid) => walked.has(pid) || actives.some((c) => c.pid === pid && c.startRound === round)).length;

  return (
    <main className="page">
      <PhaseHeader title="Front Office" round={round} timerEndsAt={game.timerEndsAt} />
      <PayrollBar team={team} round={round} />
      <ErrorNotice error={err} />

      <SectionCard num={1} title="Expiring deals" status={`${decidedCount} of ${expiring.length} decided`}>
        {expiring.length === 0 && <p className="dim">No contracts expired this round.</p>}
        {expiring.map((pid) => {
          const p = catalog.get(pid)!;
          // Re-sign = ordinary signing at the CURRENT ask (spec §13). Auction-class
          // stars have no list price: base = hypeCurve(hype), mirroring the server.
          const base = p.salary_per_round !== '' ? Number(p.salary_per_round) : hypeCurve(Number(p.hype));
          const ask = askPrice(base, round);
          const yrs = resignYears[pid] ?? 1;
          const done = walked.has(pid) || actives.some((c) => c.pid === pid && c.startRound === round);
          return (
            <div key={pid} className="card" style={{ marginTop: 8, display: 'flex', gap: 10,
              alignItems: 'center', flexWrap: 'wrap', opacity: done ? 0.55 : 1 }}>
              <span className="num">{initials(p.name)}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong>{p.name}</strong> <PositionBadge pos={p.position} />
                <span className="muted"> {p.age}y</span>
                <StatLine p={p} form={form} />
              </div>
              <span className="mono">asks {fmtM(ask)}/rd</span>
              <select className="inset" style={{ color: 'inherit' }} value={yrs} disabled={done || busy}
                aria-label={`years for ${p.name}`}
                onChange={(e) => setResignYears((m) => ({ ...m, [pid]: Number(e.target.value) }))}>
                {Array.from({ length: maxYears(round) }, (_, i) => i + 1).map((y) => (
                  <option key={y} value={y}>{y} rd — {fmtM(contractRate(ask, y))}/rd</option>
                ))}
              </select>
              <button className="btn green" disabled={done || busy}
                onClick={() => void act(() => call('signPlayer', { gameId, pid, years: yrs }))}>
                Re-sign
              </button>
              <button className="btn" disabled={done || busy}
                onClick={() => setWalked((s) => new Set(s).add(pid))}>Let walk</button>
            </div>
          );
        })}
      </SectionCard>

      <SectionCard num={2} title="Your roster" status={`${actives.length} players`}>
        {actives.map((c) => {
          const p = catalog.get(c.pid)!;
          const last = c.startRound + c.years - 1;
          return (
            <div key={c.pid} className="card" style={{ marginTop: 8, display: 'flex', gap: 10,
              alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="num">{initials(p.name)}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong>{p.name}</strong> <PositionBadge pos={p.position} />
                <span className="muted"> {p.age}y</span>
                <StatLine p={p} form={form} />
              </div>
              <span className="mono">{fmtM(c.rate)} × {last - round + 1} rd{c.hardship ? ' · hardship' : ''}</span>
              <button className="btn cut" disabled={busy} onClick={() => setCutTarget(c)}>Cut</button>
            </div>
          );
        })}
      </SectionCard>

      <SectionCard num={3} title="Tonight's market" status={`${tonightStars.length} stars on the block`}>
        <TickerBar tag="SCOUT WIRE">League office confirms tonight's auction class.</TickerBar>
        <div style={{ marginTop: 8 }}>
          {tonightStars.map((p) => (
            // Name / position / hype ONLY (spec §4.1) — the mock's star ages are a listed erratum.
            <div key={p.pid} className="inset" style={{ marginTop: 6, display: 'flex', gap: 10 }}>
              <strong style={{ flex: 1 }}>{p.name}</strong>
              <PositionBadge pos={p.position} />
              <HypeStars hype={Number(p.hype)} />
            </div>
          ))}
          <p className="dim" style={{ marginBottom: 0 }}>Free-agent pool refreshes when the market opens.</p>
        </div>
      </SectionCard>

      {cutTarget && (() => {
        const p = catalog.get(cutTarget.pid)!;
        const end = cutTarget.startRound + cutTarget.years - 1;
        const roundsCharged = end - round + 1; // cut round + every later covered round
        return (
          <div className="drawer" role="dialog" aria-label="confirm cut"
            style={{ position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 688, margin: '0 auto' }}>
            <strong>Cut {p.name}?</strong>
            <p className="mono" style={{ margin: '8px 0' }}>
              His roster spot opens now. {fmtM(cutTarget.rate)}/rd stays on your cap as dead money
              for {roundsCharged} round{roundsCharged === 1 ? '' : 's'} — {fmtM(cutTarget.rate * roundsCharged)} total.
            </p>
            <button className="btn cut" disabled={busy} onClick={() => void act(async () => {
              await call('cutRosterPlayer', { gameId, pid: cutTarget.pid });
              setCutTarget(null);
            })}>Confirm cut</button>{' '}
            <button className="btn" onClick={() => setCutTarget(null)}>Keep him</button>
          </div>
        );
      })()}
    </main>
  );
}
```
Replace the `/game/office` stub in `App.tsx`.

- [ ] **Step 4: Write the integration test**

`src/itest/frontoffice.itest.tsx` — Alpha (the open team) reaches R2 Front Office with 8 expired hardship contracts, which is exactly the screen's hard case:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('front office: expiring re-sign, then a mid-contract cut with dead money', async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  // Alpha had no GM in round 1 → hardship signed 8 one-round deals → all expiring now.
  await waitFor(() => expect(screen.getByText('0 of 8 decided')).toBeInTheDocument(),
    { timeout: 20000 });

  // Re-sign the first expiring player on a 2-round deal.
  const firstCard = screen.getAllByRole('button', { name: 'Re-sign' })[0].closest('.card')!;
  const select = within(firstCard as HTMLElement).getByRole('combobox');
  await user.selectOptions(select, '2');
  await user.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Re-sign' }));
  await waitFor(() => expect(screen.getByText('1 of 8 decided')).toBeInTheDocument(),
    { timeout: 15000 });

  // Cut him — a genuine mid-contract cut (2-round deal, cut in its first round).
  await user.click(screen.getByRole('button', { name: 'Cut' }));
  expect(screen.getByRole('dialog').textContent).toContain('dead money');
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.deadMoney).toHaveLength(1);
    expect(t.deadMoney[0].endRound).toBe(3);
  }, { timeout: 15000 });
}, 120000);
```

- [ ] **Step 5: Run + browser check**

Unit + integration runs green (4 itest files now).
Browser: `npm run seed -- --to R2:FRONT_OFFICE`, claim Alpha's GM seat, land on Front Office.
What you should see: sticky payroll bar at top (all cash green — hardship deals expired, so payroll may read $0.0M until you re-sign); Section 1 "EXPIRING DEALS — 0 of 8 decided" with eight cards, each showing `asks $X.XM/rd` (base × 1.08 — verify one by hand against players.csv), a years dropdown whose stops show the discounted per-round rate, Re-sign (green) and Let walk; Section 2 your roster; Section 3 the round-2 auction block — five names with position badge and gold stars only, no ages, no prices; SCOUT WIRE ticker. Cut flow: red-outline Cut → bottom modal states the exact dead-money math → Confirm → payroll bar grows a red dead segment.

- [ ] **Step 6: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): front office — expiring re-signs, cuts with dead-money modal, market preview"
```

---

### Task 10: Free Agency page (`/game/market`)

**Mockup:** `free-agency-v2.html` **Option B only** — the analyst table + right-rail sign drawer. Option A's card grid was explicitly rejected for this screen ("cards remain the Front Office language" — spec §11.4).

**Rulings restated for this screen:**
- **Non-exclusive market (spec §4.2).** The table is a shared catalog of signable copies: a successful signing NEVER removes, greys, or badges the row — yours or anyone's. Confirmation copy states the fact plainly: "Signed. He remains available to every team." Only *unsold auction stars* are exclusive (their claim can race → `STAR_TAKEN`).
- **The table is static within a phase** and shows **sticker stats** (players.csv numbers). Live form appears only inside the sign drawer as the `this ssn` line (`—` when none). Prices are always **tonight's ask** = `askPrice(base, round)` — noticing the 8% drift is the students' arithmetic, never a UI callout.
- **14 columns exactly:** Player, Pos, Age, Hype, $/rd, PPG, FGA, FG%, 3P%, REB, AST, **STL, BLK**, TOV. STL/BLK are deliberate additions over the mock — they are the columns that price the defensive bargain cluster; omitting them hides the signal in-app (spec §11.4). Hype renders as ★ glyphs.
- The chip row includes the **price chip** the mock forgot (spec erratum): `Under $8M`.
- **Cap line uses the per-round peak** (`capOkWith`), not the mock's single "after signing" figure.
- Round 1 variant: extended pool (75% draw) plus the **roster checklist** widget (min 8, 2G/2W/1B coverage).
- Cuts are legal in this phase server-side (adjudicated) but this screen deliberately surfaces no cut control — Front Office is the cut surface; the allowance exists for edge flows, not UI.

**Files:**
- Create: `src/pages/FreeAgencyPage.tsx`
- Modify: `src/App.tsx` (replace stub)
- Test: `src/itest/market.itest.tsx`

- [ ] **Step 1: Write the page**

`src/pages/FreeAgencyPage.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { HypeStars } from '../components/ui/HypeStars';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activeContracts, capOkWith } from '../lib/contracts';
import { askPrice, contractRate, fmtM, maxYears } from '../lib/money';
import type { CatalogPlayer } from '../types/models';

type Row = CatalogPlayer & { ask: number; inMarket: boolean };
const COLS = [
  ['name', 'Player'], ['position', 'Pos'], ['age', 'Age'], ['hype', 'Hype'],
  ['ask', '$/rd'], ['pts_per_game', 'PPG'], ['fg_attempts_per_game', 'FGA'],
  ['fg_pct', 'FG%'], ['three_pt_pct', '3P%'], ['rebounds_per_game', 'REB'],
  ['assists_per_game', 'AST'], ['steals_per_game', 'STL'], ['blocks_per_game', 'BLK'],
  ['turnovers_per_game', 'TOV'],
] as const;

export default function FreeAgencyPage() {
  const { game, team, catalog, market, call, gameId } = useGame();
  const { form } = useSeasonForm();
  const [chip, setChip] = useState<'tonight' | 'all'>('tonight');
  const [pos, setPos] = useState<'' | 'G' | 'W' | 'B'>('');
  const [cheap, setCheap] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'ask', dir: -1 });
  const [sel, setSel] = useState<number | null>(null);
  const [years, setYears] = useState(1);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const rows = useMemo<Row[]>(() => {
    if (!market) return [];
    const avail = new Set(market.available);
    const all: Row[] = [];
    for (const p of catalog.values()) {
      const unsoldBase = market.unsoldPrices[p.pid];
      const isFa = p.salary_per_round !== '';
      if (!isFa && unsoldBase == null) continue; // auction-class, not fallen through → not a market row
      const base = isFa ? Number(p.salary_per_round) : Number(unsoldBase);
      all.push({ ...p, ask: askPrice(base, round), inMarket: avail.has(p.pid) });
    }
    return all;
  }, [catalog, market, round]);

  const view = useMemo(() => {
    let v = rows.filter((r) => (chip === 'tonight' ? r.inMarket : true));
    if (pos) v = v.filter((r) => r.position === pos);
    if (cheap) v = v.filter((r) => r.ask < 8);
    if (q) v = v.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    const num = (r: Row, k: string) =>
      k === 'ask' ? r.ask : Number((r as unknown as Record<string, string>)[k]);
    return [...v].sort((a, b) => sort.key === 'name'
      ? sort.dir * a.name.localeCompare(b.name)
      : sort.dir * (num(a, sort.key) - num(b, sort.key)));
  }, [rows, chip, pos, cheap, q, sort]);

  if (!game || !team || !market || catalog.size === 0) return null;
  const actives = activeContracts(team, round);
  const counts = { G: 0, W: 0, B: 0 };
  for (const c of actives) counts[catalog.get(c.pid)!.position] += 1;

  const selRow = sel != null ? rows.find((r) => r.pid === sel) : null;
  const my = maxYears(round);
  const rate = selRow ? contractRate(selRow.ask, Math.min(years, my)) : 0;
  const proposed = selRow ? {
    pid: selRow.pid, rate, startRound: round, years: Math.min(years, my),
    viaAuction: false, hardship: false,
  } : null;
  const cap = proposed ? capOkWith(team, proposed) : null;
  const full = actives.length >= 10;
  const live = selRow ? form.get(selRow.pid) : null;

  const sign = async () => {
    if (!selRow) return;
    setBusy(true); setErr(null); setNote('');
    try {
      await call('signPlayer', { gameId, pid: selRow.pid, years: Math.min(years, my) });
      // NON-EXCLUSIVE (spec §4.2): the row stays exactly as it is — never grey it.
      setNote(`Signed ${selRow.name} — ${fmtM(rate)}/rd × ${Math.min(years, my)}. He remains available to every team.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <PhaseHeader title={round === 1 ? 'Draft Night' : 'Free Agency'} round={round}
        timerEndsAt={game.timerEndsAt} />
      <PayrollBar team={team} round={round} />
      {round === 1 && (
        <p className="mono" role="status">
          Roster checklist: {actives.length}/8+ players · G {counts.G}/2 · W {counts.W}/2 · B {counts.B}/1
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        <button className={chip === 'tonight' ? 'chip on' : 'chip'}
          onClick={() => setChip('tonight')}>In market tonight ({rows.filter((r) => r.inMarket).length})</button>
        <button className={chip === 'all' ? 'chip on' : 'chip'}
          onClick={() => setChip('all')}>All players ({rows.length})</button>
        {(['G', 'W', 'B'] as const).map((p2) => (
          <button key={p2} className={pos === p2 ? 'chip on' : 'chip'}
            onClick={() => setPos(pos === p2 ? '' : p2)}>{p2}</button>
        ))}
        <button className={cheap ? 'chip on' : 'chip'}
          onClick={() => setCheap(!cheap)}>Under $8M</button>
        <input className="chip" style={{ minWidth: 100 }} placeholder="Search"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="search players" />
      </div>
      <ErrorNotice error={err} />
      {note && <p className="ok" data-testid="sign-note">{note}</p>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>
              {COLS.map(([key, label]) => (
                <th key={key} className={key === 'name' ? 'name' : ''}
                  onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                  {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.pid} className={sel === r.pid ? 'sel' : ''}
                  style={{ cursor: r.inMarket ? 'pointer' : 'default',
                    opacity: r.inMarket ? 1 : 0.4 }}
                  onClick={() => { if (r.inMarket) { setSel(r.pid); setYears(1); setNote(''); } }}>
                  <td className="name" style={{ fontFamily: 'inherit' }}>{r.name}</td>
                  <td><PositionBadge pos={r.position} /></td>
                  <td>{r.age}</td>
                  <td><HypeStars hype={Number(r.hype)} /></td>
                  <td>{r.ask.toFixed(1)}</td>
                  <td>{Number(r.pts_per_game).toFixed(1)}</td>
                  <td>{Number(r.fg_attempts_per_game).toFixed(1)}</td>
                  <td>{Number(r.fg_pct).toFixed(3)}</td>
                  <td>{Number(r.three_pt_pct).toFixed(3)}</td>
                  <td>{Number(r.rebounds_per_game).toFixed(1)}</td>
                  <td>{Number(r.assists_per_game).toFixed(1)}</td>
                  <td>{Number(r.steals_per_game).toFixed(1)}</td>
                  <td>{Number(r.blocks_per_game).toFixed(1)}</td>
                  <td>{Number(r.turnovers_per_game).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selRow && (
          <aside className="drawer" style={{ width: 240, flexShrink: 0, position: 'sticky', top: 60 }}>
            <strong>{selRow.name}</strong>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
              <PositionBadge pos={selRow.position} /> · {selRow.age}y ·{' '}
              <HypeStars hype={Number(selRow.hype)} /> · asks {fmtM(selRow.ask)}/rd tonight
            </div>
            <div className="mono muted" style={{ fontSize: 13 }}>
              this ssn {live ? `${live.ppg.toFixed(1)} ppg` : '—'}
            </div>
            <div style={{ margin: '10px 0' }}>
              {Array.from({ length: my }, (_, i) => i + 1).map((y) => (
                <button key={y} className={years === y ? 'chip on' : 'chip'}
                  style={{ marginRight: 4 }} onClick={() => setYears(y)}>
                  {y} rd — {fmtM(contractRate(selRow.ask, y))}
                </button>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 13 }}>
              {fmtM(rate)} × {Math.min(years, my)} rds = {fmtM(rate * Math.min(years, my))} committed
            </div>
            <div className="mono" style={{ fontSize: 13, margin: '6px 0' }}>
              {full ? <span className="neg">Roster full — 10 players is the maximum.</span>
                : cap!.ok
                  ? <span className="ok">Fits — peak payroll stays under {fmtM(100)}.</span>
                  : <span className="neg">Exceeds cap in round {cap!.worstRound}: {fmtM(cap!.worstPayroll!)}.</span>}
            </div>
            <button className="btn green" style={{ width: '100%' }}
              disabled={busy || full || !cap!.ok} onClick={() => void sign()}>
              Confirm signing
            </button>
          </aside>
        )}
      </div>
    </main>
  );
}
```
Replace the `/game/market` stub in `App.tsx`.

- [ ] **Step 2: Write the integration test**

`src/itest/market.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('draft night: analyst table, sign drawer, non-exclusive row persists, ALREADY_SIGNED', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);

  // Round-1 draw = 75% of the 150-player FA pool = 112 rows in "In market tonight".
  await waitFor(() => expect(screen.getByText('In market tonight (112)')).toBeInTheDocument(),
    { timeout: 20000 });
  // The two decoder columns the mock omitted are present.
  expect(screen.getByText('STL')).toBeInTheDocument();
  expect(screen.getByText('BLK')).toBeInTheDocument();

  // Open the drawer on a known cheap player: search by a name from the market.
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const target = (market.available as number[])
    .map((pid) => byPid[pid])
    .filter((p) => p.salary_per_round !== '')
    .sort((a, b) => Number(a.salary_per_round) - Number(b.salary_per_round))[0];
  await user.type(screen.getByLabelText('search players'), target.name);
  await user.click(screen.getByText(target.name));
  // Round 1 ask = CSV base exactly (assert on the drawer's text, not getByText —
  // the string spans nested elements and would match multiple ancestors).
  await waitFor(() => expect(document.querySelector('.drawer')!.textContent)
    .toContain(`asks $${Number(target.salary_per_round).toFixed(1)}M/rd tonight`));

  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByTestId('sign-note'))
    .toHaveTextContent('He remains available to every team.'), { timeout: 15000 });
  // NON-EXCLUSIVE: the row is still in the table after signing.
  expect(screen.getByText(target.name)).toBeInTheDocument();

  // Signing the same copy again trips ALREADY_SIGNED, mapped to student copy.
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('He is already under contract with your team.'), { timeout: 15000 });
}, 120000);
```

- [ ] **Step 3: Run + browser check**

Integration run green (5 itest files).
Browser: `npm run seed -- --to R1:FREE_AGENCY`, claim Alpha GM.
What you should see: "DRAFT NIGHT · ROUND 1" header; roster checklist line `0/8+ players · G 0/2 · W 0/2 · B 0/1` climbing as you sign; chips with live counts (`In market tonight (112)`, `All players (150)` — round 1 has no unsold stars yet); 14-column sortable table, hype as gold stars, default sort $/rd descending; clicking a row opens the gold-bordered drawer: years chips each pricing the discounted rate (verify one: a $4.8M base at 2 rds reads $4.4M — not the mock's $4.42M), commitment line, green/red per-round cap line, Confirm. After signing, the row does NOT grey out (non-exclusive — this is correct, not a bug). Switch to "All players": non-drawn players render at 40% opacity, unclickable.

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): free agency — 14-column analyst table + sign drawer, non-exclusive semantics"
```

---
### Task 11: Star Auction page (`/game/auction`)

**Mockup:** `star-auction-v2.html` — rules box, star-card row, per-card bid boxes, exposure meter, gold lock-in. **The mock renders four cards; waves are normatively exactly five** (harness check 11) — size the flex row for five.

**Rulings restated for this screen:**
- Sealed **contract offers**: per-round salary × years; **winner = highest total guaranteed money (rate × years); no length discount in auctions** — length is the competitive lever. Winners pay their own structure; losers pay nothing.
- Min bid = `minBid(round)` = $2.0M × 1.08^(r−1), **$0.1M steps** — enforced at input time (the mock surfaces neither; spec §13 requires blocking obviously-invalid bids where knowable). Years 1…`maxYears(round)`; round 5 degenerates to a pure per-round bid (years locked at 1).
- **An over-cap worst case is LEGAL** (spec §4.3: "bid on everything, keep what resolves" — the resolution skip rule handles it). The exposure meter warns, it never blocks. Submitting is blocked only for below-min/step/years violations.
- Auction cards show **full stats** (this is the auction screen's contract — stats, age, hype, grade, followers, **no price**; the name/pos/hype-only restriction applies to the Front Office *preview*, not here).
- Bids are **freely revisable until the professor closes the phase**; resubmitting **overwrites the whole set**. Always send a plain object — `{}` clears; **never null** (destructive backend sharp edge).
- Scout submits; GM and Coach see the same screen read-only (everyone discusses, one clicks).

**Files:**
- Create: `src/pages/AuctionPage.tsx`
- Modify: `src/App.tsx` (replace stub)
- Test: `src/itest/auction.itest.tsx`

- [ ] **Step 1: Write the page**

`src/pages/AuctionPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { PositionBadge } from '../components/ui/PositionBadge';
import { HypeStars } from '../components/ui/HypeStars';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { payrollAt } from '../lib/contracts';
import { CAP, fmtM, maxYears, minBid, r01, TOTAL_ROUNDS } from '../lib/money';
import type { AuctionDoc } from '../types/models';

interface Draft { rate: string; years: number }
const fansM = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M fans` : `${Math.round(n / 1e3)}k fans`;

export default function AuctionPage() {
  const { game, team, catalog, membership, call, gameId } = useGame();
  const [wave, setWave] = useState<AuctionDoc | null>(null);
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const isScout = membership?.role === 'Scout';
  const my = maxYears(round);
  const floor = minBid(round);

  useEffect(() => { // tonight's wave
    if (!gameId || round < 1) return;
    return onSnapshot(doc(db, 'games', gameId, 'auctions', String(round)),
      (s) => setWave(s.exists() ? (s.data() as AuctionDoc) : null));
  }, [gameId, round]);

  useEffect(() => { // own team's stored bids (private doc, readable by teammates)
    if (!gameId || !membership) return;
    return onSnapshot(doc(db, 'games', gameId, 'teams', membership.teamId, 'private', 'auction'),
      (s) => {
        const d = s.data() as { bids?: Record<string, { rate: number; years: number }>; round?: number } | undefined;
        if (!d?.bids || d.round !== round) return;
        setDraft(Object.fromEntries(Object.entries(d.bids).map(
          ([pid, b]) => [Number(pid), { rate: b.rate.toFixed(1), years: b.years }])));
      });
  }, [gameId, membership, round]);

  const bids = useMemo(() => {
    const out: Record<number, { rate: number; years: number }> = {};
    for (const [pid, d] of Object.entries(draft)) {
      const rate = Number(d.rate);
      if (d.rate !== '' && Number.isFinite(rate) && rate > 0) {
        out[Number(pid)] = { rate: r01(rate), years: d.years };
      }
    }
    return out;
  }, [draft]);

  const problems = useMemo(() => {
    const out: Record<number, string> = {};
    for (const [pid, b] of Object.entries(bids)) {
      if (b.rate < floor - 1e-9) out[Number(pid)] = `Minimum tonight is ${fmtM(floor)}.`;
      else if (Math.abs(b.rate * 10 - Math.round(b.rate * 10)) > 1e-6) {
        out[Number(pid)] = 'Bids move in $0.1M steps.';
      }
    }
    return out;
  }, [bids, floor]);

  // Exposure: worst case if EVERY bid wins — peak payroll across covered rounds.
  // Over-cap exposure is LEGAL (spec §4.3); the meter informs, it does not block.
  const exposure = useMemo(() => {
    if (!team) return null;
    let worst = { round, payroll: 0 };
    for (let r = round; r <= TOTAL_ROUNDS; r++) {
      let p = payrollAt(team, r);
      for (const b of Object.values(bids)) if (r < round + b.years) p = r01(p + b.rate);
      if (p > worst.payroll) worst = { round: r, payroll: p };
    }
    return worst;
  }, [team, bids, round]);

  if (!game || !team || !wave || catalog.size === 0) return null;

  const lockIn = async () => {
    setBusy(true); setErr(null); setNote('');
    try {
      // ALWAYS a plain object — {} clears every bid; never send null.
      await call('submitBids', { gameId, bids });
      setNote(`Bids locked (${Object.keys(bids).length}) — you can revise until the phase closes.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <PhaseHeader title="Star Auction" round={round} timerEndsAt={game.timerEndsAt} />
      <PayrollBar team={team} round={round} />
      <div className="inset" style={{ border: '1.5px dashed var(--gold)', margin: '10px 0' }}>
        Sealed contract offers: salary per round × years. The most guaranteed money wins.
        Winners pay their own offer; losers pay nothing. Minimum tonight: <span className="mono">{fmtM(floor)}</span>
        {my > 1 ? ` · years 1–${my}` : ' · one-round offers only'}.
      </div>
      <ErrorNotice error={err} />
      {note && <p className="ok" role="status">{note}</p>}

      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {wave.stars.map((pid) => {
          const p = catalog.get(pid)!;
          const d = draft[pid] ?? { rate: '', years: 1 };
          const b = bids[pid];
          const g = b ? r01(b.rate * b.years) : null;
          return (
            <div key={pid} className="card" style={{ minWidth: 170, flex: '1 0 170px' }}>
              <strong>{p.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                <PositionBadge pos={p.position} /> {p.age}y · grade {p.scout_grade}
              </div>
              <HypeStars hype={Number(p.hype)} />
              <div className="mono muted" style={{ fontSize: 12, margin: '6px 0' }}>
                {Number(p.pts_per_game).toFixed(1)} p / {Number(p.fg_attempts_per_game).toFixed(1)} fga<br />
                {Number(p.fg_pct).toFixed(3)} fg / {Number(p.turnovers_per_game).toFixed(1)} to<br />
                {fansM(Number(p.social_media_followers))}
              </div>
              <input className="inset mono" style={{ color: 'inherit', width: '100%' }}
                placeholder={`$${floor.toFixed(1)}+`} inputMode="decimal" disabled={!isScout}
                aria-label={`salary for ${p.name}`} value={d.rate}
                onChange={(e) => setDraft((m) => ({ ...m, [pid]: { ...d, rate: e.target.value } }))} />
              <div style={{ margin: '6px 0' }}>
                {Array.from({ length: my }, (_, i) => i + 1).map((y) => (
                  <button key={y} className={d.years === y ? 'chip on' : 'chip'} disabled={!isScout}
                    onClick={() => setDraft((m) => ({ ...m, [pid]: { ...d, years: y } }))}>{y}</button>
                ))}
              </div>
              <div className="mono" style={{ fontSize: 13 }}>
                {problems[pid] ? <span className="neg">{problems[pid]}</span>
                  : g != null ? `= ${fmtM(g)} gtd` : <span className="dim">no bid</span>}
              </div>
            </div>
          );
        })}
      </div>

      {exposure && Object.keys(bids).length > 0 && (
        <p className="mono" role="status">
          Worst case if all bids win: peak payroll {fmtM(exposure.payroll)} / {fmtM(CAP)} (round {exposure.round}) —{' '}
          {exposure.payroll <= CAP
            ? <span className="ok">fits</span>
            : <span style={{ color: 'var(--gold)' }}>over the cap — over-cap wins are skipped at resolution, this is allowed</span>}
        </p>
      )}
      {isScout
        ? <button className="btn gold" style={{ width: '100%' }}
            disabled={busy || Object.keys(problems).length > 0} onClick={() => void lockIn()}>
            Lock in bids
          </button>
        : <p className="dim">The Scout submits this phase. Bids shown are your team's current sealed set.</p>}
    </main>
  );
}
```
Replace the `/game/auction` stub in `App.tsx`.

- [ ] **Step 2: Write the integration test**

`src/itest/auction.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('auction: five cards, min-bid gate, exposure meter, revisable overwrite', async () => {
  const seeded = await seedToPhase({ to: 'R1:AUCTION' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'IT Scout',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/auction']}><App /></MemoryRouter>);

  const wave = (await adminDb().doc(`games/${seeded.gameId}/auctions/1`).get()).data()!;
  expect(wave.stars).toHaveLength(5);
  await waitFor(() => {
    expect(screen.getAllByLabelText(/salary for /)).toHaveLength(5); // FIVE cards, not the mock's four
  }, { timeout: 20000 });

  const inputs = screen.getAllByLabelText(/salary for /);
  await user.type(inputs[0], '1.5'); // below the $2.0M round-1 minimum
  expect(await screen.findByText('Minimum tonight is $2.0M.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeDisabled();

  await user.clear(inputs[0]);
  await user.type(inputs[0], '8.0');
  const card0 = inputs[0].closest('.card')!;
  await user.click(Array.from(card0.querySelectorAll('button')).find((b) => b.textContent === '3')!);
  expect(card0.textContent).toContain('= $24.0M gtd');

  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]]).toEqual({ rate: 8.0, years: 3 });
  }, { timeout: 15000 });

  // Revise: overwrite the whole set with a different rate on the same star.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '9.5');
  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]].rate).toBe(9.5);
  }, { timeout: 15000 });
}, 120000);
```

- [ ] **Step 3: Run + browser check**

Integration run green (6 itest files).
Browser: `npm run seed -- --to R1:AUCTION`, claim Alpha **Scout**.
What you should see: dashed-gold rules box quoting the minimum ($2.0M in round 1); **five** star cards in a scrollable row, each with position badge, age, scout grade, gold stars, the monospace 3-line stat block ending in "X.XM fans", a salary input and years chips; typing 8.0 × 3 shows `= $24.0M gtd`; the exposure line appears ("Worst case if all bids win: peak payroll …") — push it over $100M and it turns gold with "over-cap wins are skipped at resolution, this is allowed" and the Lock in button STAYS enabled (legal by design); a sub-minimum bid disables it. As GM (second tab) the same screen is read-only.

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): star auction — five sealed-offer cards, exposure meter, revisable bids"
```

---

### Task 12: Set Lineup page (`/game/lineup`)

**Mockup:** `set-lineup-v2.html` — half-court with five position slots, gold Sixth Man seat, bench rail, five playstyle cards, rules-checking status line. **One deliberate addition over the mock:** the bench rail splits into "Active bench 1–2" and "Inactive depth" — the mock's undifferentiated rail hides that **array order silently decides who plays** (engine and sim take `bench.slice(0, 2)`; spots 9–10 add nothing — spec §8.2).

**Rulings restated for this screen:**
- **Deliberately dumb**: the status line does pure rules-checking (counts + playstyle name). No synergy meters, no derived quality signals of any kind — that would leak the hidden model (spec §11.6).
- Playstyle strings and one-sentence descriptions **verbatim** (Global Constraints). Balanced pre-selected; the previous round's playstyle carries.
- Every active pid must be placed (server: `NOT_ON_ROSTER` if counts mismatch) — the page pre-arranges everyone via `arrangeLineup` (Task 4) so the coach starts legal and drags to taste.
- Coach submits; resubmission overwrites freely until the phase closes; GM/Scout view read-only.

**Files:**
- Create: `src/pages/LineupPage.tsx`, `src/lib/slots.ts`
- Modify: `src/App.tsx` (replace stub)
- Test: `src/lib/slots.test.ts`, `src/itest/lineup.itest.tsx`

**Interfaces:**
- `slots.ts`: `SlotId = 'g1'|'g2'|'w1'|'w2'|'b1'|'sixth'|'bench1'|'bench2'|'depth'`; `Slots = { g1…bench2: number|null, depth: number[] }`; `fromLineup(lineup, catalog)`; `toLineup(slots, playstyle)` → the exact submit shape (bench = `[bench1, bench2, …depth]`); `place(slots, pid, target, catalog)` → new Slots or `null` if illegal (wrong position on a court slot); `isComplete(slots)`.

- [ ] **Step 1: Write the slot model (pure, unit-tested — the drag layer stays thin)**

`src/lib/slots.ts`:
```ts
import type { CatalogPlayer, Lineup } from '../types/models';

export type SlotId = 'g1' | 'g2' | 'w1' | 'w2' | 'b1' | 'sixth' | 'bench1' | 'bench2' | 'depth';
export interface Slots {
  g1: number | null; g2: number | null; w1: number | null; w2: number | null;
  b1: number | null; sixth: number | null; bench1: number | null; bench2: number | null;
  depth: number[];
}
const COURT: Record<string, 'G' | 'W' | 'B'> = { g1: 'G', g2: 'G', w1: 'W', w2: 'W', b1: 'B' };

export function fromLineup(l: Lineup, catalog: Map<number, CatalogPlayer>): Slots {
  const s: Slots = { g1: null, g2: null, w1: null, w2: null, b1: null,
    sixth: l.sixth ?? null, bench1: l.bench[0] ?? null, bench2: l.bench[1] ?? null,
    depth: l.bench.slice(2) };
  for (const pid of l.starters) {
    const pos = catalog.get(pid)!.position;
    if (pos === 'G') { if (s.g1 == null) s.g1 = pid; else s.g2 = pid; }
    else if (pos === 'W') { if (s.w1 == null) s.w1 = pid; else s.w2 = pid; }
    else s.b1 = pid;
  }
  return s;
}

// Submit shape: bench = [active1, active2, ...inactive depth] — ORDER IS THE RULE:
// only bench[0..1] play (engine/sim slice(0,2)); depth players get no minutes.
export function toLineup(s: Slots, playstyle: string): Lineup {
  return {
    starters: [s.g1!, s.g2!, s.w1!, s.w2!, s.b1!],
    sixth: s.sixth!,
    bench: [s.bench1, s.bench2, ...s.depth].filter((p): p is number => p != null),
    playstyle,
  };
}

export const isComplete = (s: Slots) =>
  [s.g1, s.g2, s.w1, s.w2, s.b1, s.sixth].every((p) => p != null);

function findSlot(s: Slots, pid: number): SlotId | null {
  for (const k of ['g1', 'g2', 'w1', 'w2', 'b1', 'sixth', 'bench1', 'bench2'] as const) {
    if (s[k] === pid) return k;
  }
  return s.depth.includes(pid) ? 'depth' : null;
}

// Move pid into target; the displaced occupant (if any) swaps back to pid's old
// slot. Position-illegal court drops return null (UI ignores the drop).
export function place(
  s: Slots, pid: number, target: SlotId, catalog: Map<number, CatalogPlayer>,
): Slots | null {
  if (target in COURT && catalog.get(pid)!.position !== COURT[target]) return null;
  const from = findSlot(s, pid);
  if (from === target) return s;
  const next: Slots = { ...s, depth: [...s.depth] };
  const displaced = target === 'depth' ? null : next[target];
  if (displaced != null && from != null && from in COURT
      && catalog.get(displaced)!.position !== COURT[from]) return null; // swap-back must be legal too
  // remove pid from its old home
  if (from === 'depth') next.depth = next.depth.filter((p) => p !== pid);
  else if (from != null) next[from] = null;
  // place pid
  if (target === 'depth') next.depth.push(pid);
  else next[target] = pid;
  // rehome the displaced occupant
  if (displaced != null) {
    if (from == null || from === 'depth') next.depth.push(displaced);
    else next[from] = displaced;
  }
  return next;
}
```

`src/lib/slots.test.ts`:
```ts
import { fromLineup, isComplete, place, toLineup, type Slots } from './slots';
import type { CatalogPlayer } from '../types/models';

const mk = (pid: number, position: string) =>
  [pid, { pid, position } as unknown as CatalogPlayer] as const;
const catalog = new Map([
  mk(1, 'G'), mk(2, 'G'), mk(3, 'G'), mk(4, 'W'), mk(5, 'W'),
  mk(6, 'W'), mk(7, 'B'), mk(8, 'B'), mk(9, 'G'),
]);
const base: Slots = { g1: 1, g2: 2, w1: 4, w2: 5, b1: 7, sixth: 8,
  bench1: 3, bench2: 6, depth: [9] };

test('toLineup: bench order encodes active-bench-then-depth', () => {
  const l = toLineup(base, 'Lockdown');
  expect(l.starters).toEqual([1, 2, 4, 5, 7]);
  expect(l.bench).toEqual([3, 6, 9]); // 3 & 6 play; 9 is inactive depth
  expect(l.playstyle).toBe('Lockdown');
});
test('place: position-illegal court drop is rejected', () => {
  expect(place(base, 4, 'g1', catalog)).toBeNull(); // Wing into a Guard slot
});
test('place: legal swap moves the displaced player back', () => {
  const next = place(base, 3, 'g1', catalog)!; // bench guard into g1
  expect(next.g1).toBe(3);
  expect(next.bench1).toBe(1); // displaced starter takes the vacated bench slot
});
test('place: depth promotion and demotion', () => {
  const up = place(base, 9, 'bench1', catalog)!;
  expect(up.bench1).toBe(9);
  expect(up.depth).toEqual([3]); // displaced bench1 lands in depth
  expect(isComplete(up)).toBe(true);
});
test('fromLineup round-trips a server lineup', () => {
  const s = fromLineup({ starters: [1, 2, 4, 5, 7], sixth: 8, bench: [3, 6, 9],
    playstyle: 'Balanced' }, catalog);
  expect(s).toEqual(base);
});
```

- [ ] **Step 2: Write the page**

`src/pages/LineupPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activePids } from '../lib/contracts';
import { arrangeLineup } from '../lib/arrange';
import { fromLineup, isComplete, place, toLineup, type SlotId, type Slots } from '../lib/slots';
import { PLAYSTYLES, PLAYSTYLE_BLURBS, type Playstyle } from '../types/models';

function Card({ pid }: { pid: number }) {
  const { catalog } = useGame();
  const p = catalog.get(pid)!;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: pid });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="inset"
      style={{ cursor: 'grab', padding: '6px 8px', fontSize: 13, touchAction: 'none',
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}>
      <strong>{p.name}</strong> <PositionBadge pos={p.position} />
      <div className="mono dim">{Number(p.pts_per_game).toFixed(1)} ppg · {Number(p.rebounds_per_game).toFixed(1)} reb</div>
    </div>
  );
}

function Slot({ id, pid, label, cls = '' }: {
  id: SlotId; pid: number | null; label: string; cls?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`slot ${pid != null ? 'filled' : ''} ${cls}`}
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minWidth: 110, padding: 4 }}>
      {pid != null ? <Card pid={pid} /> : <span className="dim" style={{ fontSize: 12 }}>{label}</span>}
    </div>
  );
}

export default function LineupPage() {
  const { game, team, catalog, membership, call, gameId } = useGame();
  const [slots, setSlots] = useState<Slots | null>(null);
  const [style, setStyle] = useState<Playstyle>('Balanced');
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const isCoach = membership?.role === 'Coach';
  const active = useMemo(
    () => (team ? activePids(team, round) : []), [team, round]);

  useEffect(() => { // pre-arrange EVERY active pid (server requires all assigned)
    if (!team || catalog.size === 0 || active.length === 0 || slots) return;
    const arranged = arrangeLineup(active, catalog, team.lineup);
    setSlots(fromLineup(arranged, catalog));
    setStyle((arranged.playstyle as Playstyle) ?? 'Balanced');
  }, [team, catalog, active, slots]);

  if (!game || !team || !slots || catalog.size === 0) return null;

  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of [slots.g1, slots.g2, slots.w1, slots.w2, slots.b1]) {
    if (pid != null) counts[catalog.get(pid)!.position] += 1;
  }
  const legal = isComplete(slots) && counts.G === 2 && counts.W === 2 && counts.B === 1;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !isCoach) return;
    const next = place(slots, Number(e.active.id), e.over.id as SlotId, catalog);
    if (next) setSlots(next); // illegal drops are silently ignored (validation, not evaluation)
  };

  const submit = async () => {
    setBusy(true); setErr(null); setNote('');
    try {
      await call('submitLineup', { gameId, lineup: toLineup(slots, style) });
      setNote(`Lineup locked for round ${round} — you can revise until the phase closes.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <PhaseHeader title="Set Lineup" round={round} timerEndsAt={game.timerEndsAt} />
      <ErrorNotice error={err} />
      {note && <p className="ok" role="status">{note}</p>}
      <DndContext onDragEnd={onDragEnd}>
        <div className="court">
          <div className="arc" />
          <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, display: 'flex',
            justifyContent: 'center', gap: 24 }}>
            <Slot id="g1" pid={slots.g1} label="GUARD" />
            <Slot id="g2" pid={slots.g2} label="GUARD" />
          </div>
          <div style={{ position: 'absolute', top: '48%', left: '3%' }}>
            <Slot id="w1" pid={slots.w1} label="WING" />
          </div>
          <div style={{ position: 'absolute', top: '48%', right: '3%' }}>
            <Slot id="w2" pid={slots.w2} label="WING" />
          </div>
          <div style={{ position: 'absolute', bottom: '6%', left: 0, right: 0,
            display: 'flex', justifyContent: 'center' }}>
            <Slot id="b1" pid={slots.b1} label="BIG" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div><div className="dim" style={{ fontSize: 12 }}>SIXTH MAN</div>
            <Slot id="sixth" pid={slots.sixth} label="SIXTH" cls="sixth" /></div>
          <div><div className="dim" style={{ fontSize: 12 }}>ACTIVE BENCH — these two play</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Slot id="bench1" pid={slots.bench1} label="BENCH 1" />
              <Slot id="bench2" pid={slots.bench2} label="BENCH 2" />
            </div></div>
          <div style={{ flex: 1 }}>
            <div className="dim" style={{ fontSize: 12 }}>INACTIVE DEPTH — no minutes tonight</div>
            <DepthZone pids={slots.depth} />
          </div>
        </div>
      </DndContext>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {PLAYSTYLES.map((s) => (
          <button key={s} className="card" disabled={!isCoach}
            style={{ flex: '1 0 120px', textAlign: 'left', cursor: 'pointer',
              border: style === s ? '1.5px solid var(--gold)' : '1px solid var(--border)' }}
            onClick={() => setStyle(s)}>
            <strong>{s}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{PLAYSTYLE_BLURBS[s]}</div>
          </button>
        ))}
      </div>

      <p className="mono" role="status">
        Lineup: {counts.G} G · {counts.W} W · {counts.B} B — {legal ? 'Legal' : 'Incomplete'} · Playstyle: {style}
      </p>
      {isCoach
        ? <button className="btn green" style={{ width: '100%' }} disabled={!legal || busy}
            onClick={() => void submit()}>Submit lineup</button>
        : <p className="dim">The Coach submits this phase.</p>}
    </main>
  );
}

function DepthZone({ pids }: { pids: number[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'depth' });
  return (
    <div ref={setNodeRef} className="slot"
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minHeight: 56,
        display: 'flex', gap: 8, justifyContent: 'flex-start', padding: 4, flexWrap: 'wrap' }}>
      {pids.length === 0 ? <span className="dim" style={{ fontSize: 12 }}>empty</span>
        : pids.map((pid) => <Card key={pid} pid={pid} />)}
    </div>
  );
}
```
Replace the `/game/lineup` stub in `App.tsx`.

- [ ] **Step 3: Write the integration test**

`src/itest/lineup.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('lineup: pre-arranged legal, playstyle pick, submit locks the round', async () => {
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'IT Coach',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  // Alpha holds 8 hardship players → pre-arranged 5+1+2, zero depth, already legal.
  await waitFor(() => expect(screen.getByRole('status'))
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Balanced'), { timeout: 20000 });

  await user.click(screen.getByText('Lockdown'));
  expect(screen.getByRole('status')).toHaveTextContent('Playstyle: Lockdown');
  await user.click(screen.getByRole('button', { name: 'Submit lineup' }));

  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.lineupLockedRound).toBe(1);
    expect(t.lineup.playstyle).toBe('Lockdown');
    expect(t.lineup.starters).toHaveLength(5);
    expect(t.lineup.bench).toHaveLength(2);
  }, { timeout: 15000 });
}, 120000);
```

- [ ] **Step 4: Run + browser check**

Unit (slots.test.ts) + integration (7 itest files) green.
Browser: `npm run seed -- --to R1:LINEUP`, claim Alpha **Coach**.
What you should see: the half-court (gold arc on the navy court fill) with two GUARD slots up top, WING slots at the sides, BIG at the rim — all pre-filled green-bordered cards; the gold-bordered SIXTH MAN seat; "ACTIVE BENCH — these two play" with two cards; "INACTIVE DEPTH — no minutes tonight" (empty on an 8-man roster); dragging a bench guard onto a guard slot swaps the two; dragging a Wing onto a Guard slot snaps back (silently rejected — validation, not evaluation); five playstyle cards with their exact one-sentence blurbs, Balanced pre-selected; the status line reads `Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: …`; Submit turns the status note green. **No meters, scores, or quality hints anywhere on this screen** — that absence is the spec, not an omission.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): set lineup — half-court drag, explicit active-bench slots, playstyle cards"
```

---
### Task 13: Simulate page (`/game/simulate`)

Unmocked — spec §11.14: the team's games resolve as a cascade of mini-cards (opponent, final score, W/L color) into a terminal "Round complete — results ready" state; no inputs exist.

**Ruling (restated, conscious adaptation):** §11.14 describes the cascade as "server-paced at roughly 3 s/card," but the backend writes the whole `rounds/{r}` doc atomically at SIMULATE entry — there is nothing incremental to follow. The pacing is therefore **client-side and purely cosmetic** (interval = `min(3000, 45000 / games)` ms so any league size finishes inside the ~1-minute phase); the data underneath is server-final the moment the phase opens. If true server pacing is ever wanted, that is a Plan 3 backend change — do not fake it here beyond the reveal cadence.

**Files:**
- Create: `src/pages/SimulatePage.tsx`, `src/hooks/useRoundDoc.ts`
- Modify: `src/App.tsx` (replace stub)
- Test: `src/itest/simulate.itest.tsx`

**Interfaces:**
- `useRoundDoc(round)` → `RoundDoc | null` (onSnapshot of `rounds/{round}`; Results reuses it).

- [ ] **Step 1: Write the hook and page**

`src/hooks/useRoundDoc.ts`:
```ts
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import type { RoundDoc } from '../types/models';

export function useRoundDoc(round: number) {
  const { gameId, membership } = useGame();
  const [rd, setRd] = useState<RoundDoc | null>(null);
  useEffect(() => {
    if (!gameId || !membership || round < 1) { setRd(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'rounds', String(round)),
      (s) => setRd(s.exists() ? (s.data() as RoundDoc) : null));
  }, [gameId, membership, round]);
  return rd;
}
```

`src/pages/SimulatePage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';

export default function SimulatePage() {
  const { game, membership, teams } = useGame();
  const round = game?.round ?? 1;
  const rd = useRoundDoc(round);
  const [shown, setShown] = useState(0);

  const mine = useMemo(() => {
    if (!rd || !membership) return [];
    return rd.games
      .filter((g) => g.home === membership.teamId || g.away === membership.teamId)
      .map((g) => {
        const home = g.home === membership.teamId;
        return {
          id: g.game_id,
          opponent: teams.get(home ? g.away : g.home)?.name ?? '—',
          us: home ? g.homeScore : g.awayScore,
          them: home ? g.awayScore : g.homeScore,
        };
      });
  }, [rd, membership, teams]);

  useEffect(() => { // cosmetic client pacing — the data is already server-final
    if (mine.length === 0) return;
    setShown(0);
    const interval = Math.min(3000, 45000 / mine.length);
    const id = setInterval(() => setShown((n) => {
      if (n + 1 >= mine.length) clearInterval(id);
      return n + 1;
    }), interval);
    return () => clearInterval(id);
  }, [mine.length]);

  if (!game || !membership) return null;
  const done = mine.length > 0 && shown >= mine.length;
  return (
    <main className="page">
      <PhaseHeader title="Simulate" round={round} timerEndsAt={game.timerEndsAt} />
      {mine.length === 0 && <p className="muted">Crunching the round…</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mine.slice(0, shown).map((g) => (
          <div key={g.id} className="card mono" style={{ display: 'flex', gap: 12 }}
            data-testid={g.us > g.them ? 'game-win' : 'game-loss'}>
            <span className={g.us > g.them ? 'ok' : 'neg'}>{g.us > g.them ? 'W' : 'L'}</span>
            <span style={{ flex: 1 }}>vs {g.opponent}</span>
            <span>{g.us}–{g.them}</span>
          </div>
        ))}
      </div>
      {done && <p className="ok" role="status">Round complete — results ready.</p>}
    </main>
  );
}
```
Replace the `/game/simulate` stub in `App.tsx`.

- [ ] **Step 2: Write the integration test**

`src/itest/simulate.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('simulate: my three games cascade to a terminal state', async () => {
  const seeded = await seedToPhase({ to: 'R1:SIMULATE' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/simulate']}><App /></MemoryRouter>);

  // 4 teams → Alpha plays 3 games; cards appear over ~a few seconds of pacing.
  await waitFor(() => {
    const cards = [...screen.queryAllByTestId('game-win'), ...screen.queryAllByTestId('game-loss')];
    expect(cards).toHaveLength(3);
  }, { timeout: 60000 });
  expect(screen.getByRole('status')).toHaveTextContent('Round complete — results ready.');
}, 120000);
```

- [ ] **Step 3: Run + browser check**

Integration green (8 itest files).
Browser: `npm run seed -- --to R1:SIMULATE`, claim any Alpha seat.
What you should see: score cards appearing one at a time (~3s apart at 4 teams), each `W`/`L` colored green/red with the score, ending in "Round complete — results ready." No buttons, no inputs — the professor advances the room.

- [ ] **Step 4: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): simulate — client-paced score cascade over the server-final round"
```

---

### Task 14: Results page (`/game/results`)

Unmocked — spec §11.14: round record, Best Win / Worst Loss cards, own box lines (all 23 feed columns), awards carousel (~5 s auto-advance with manual arrows), CSV download named `boxscores_round_N.csv`, standings snapshot with the viewer's row highlighted.

**Rulings restated for this screen:**
- **Bargain of the Round shows the winner's raw stat line + salary — never the computed per-dollar figure.** The wire carries `awards.bargain.perDollar`; rendering it would cross the facts-not-conclusions line beyond the sanctioned exception (spec §11.14). The award's *existence* plants the concept; the number stays the students' job.
- The CSV download is the **verbatim server string** (`rounds/{r}.boxCsv`) — never re-serialize parsed rows; students must get byte-identical data every download.
- Awards may name players on other teams (league-wide awards) and, because free agency is non-exclusive, an award names a specific **rostered copy** (`pid` + `teamId`) — always render the team name with the player.

**Files:**
- Create: `src/pages/ResultsPage.tsx`, `src/components/ui/StandingsTable.tsx`
- Modify: `src/App.tsx` (replace stub)
- Test: `src/itest/results.itest.tsx`

**Interfaces:**
- `<StandingsTable rows={StandingsRow[]} highlightTeamId={string|null} wpd={Map<teamId,number>|null} />` — projector-shuffle row anatomy (rank / team / W-L / diff), static; `wpd` adds the wins-per-payroll-dollar column when provided (Standings page passes it; the Results snapshot does too — the column is spec'd "all game" on standings surfaces).

- [ ] **Step 1: Write the standings table**

`src/components/ui/StandingsTable.tsx`:
```tsx
import type { StandingsRow } from '../../types/models';

// Viewer-aware highlight (spec §11.12): team surfaces pass the viewer's franchise;
// the projector (Plan 3) passes none. wpd = wins-per-payroll-dollar — one of the
// two sanctioned derived metrics; informational only, it never affects rank order.
export function StandingsTable({ rows, highlightTeamId, wpd }: {
  rows: StandingsRow[]; highlightTeamId: string | null;
  wpd: Map<string, number> | null;
}) {
  return (
    <table className="table" data-testid="standings">
      <thead><tr>
        <th>#</th><th className="name">Team</th><th>W-L</th><th>Diff</th>
        {wpd && <th>W / $M</th>}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.teamId} className={r.teamId === highlightTeamId ? 'sel' : ''}>
            <td>{r.rank}</td>
            <td className="name" style={{ fontFamily: 'inherit', fontWeight: 700 }}>{r.name}</td>
            <td>{r.wins}-{r.losses}</td>
            <td>{r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</td>
            {wpd && <td>{(wpd.get(r.teamId) ?? 0).toFixed(3)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Write the page**

`src/pages/ResultsPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { parseBoxCsv, teamRows } from '../lib/boxfeed';
import { spendThroughRound } from '../lib/contracts';
import { fmtM } from '../lib/money';

// ALL 23 feed columns (spec §11.14: own box lines show the complete feed schema);
// the table is wide and lives inside an overflow-x scroll container.
const BOX_COLS = ['round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score',
  'win', 'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
  'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'playstyle'] as const;

export default function ResultsPage() {
  const { game, team, teams, membership, catalog } = useGame();
  const round = game?.round ?? 1;
  const rd = useRoundDoc(round);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 5000);
    return () => clearInterval(id);
  }, []);

  const my = useMemo(() => {
    if (!rd || !membership || !team) return null;
    const games = rd.games
      .filter((g) => g.home === membership.teamId || g.away === membership.teamId)
      .map((g) => {
        const home = g.home === membership.teamId;
        return { opponent: teams.get(home ? g.away : g.home)?.name ?? '—',
          us: home ? g.homeScore : g.awayScore, them: home ? g.awayScore : g.homeScore };
      });
    const wins = games.filter((g) => g.us > g.them);
    const losses = games.filter((g) => g.us < g.them);
    const best = wins.sort((a, b) => (b.us - b.them) - (a.us - a.them))[0] ?? null;
    const worst = losses.sort((a, b) => (b.them - b.us) - (a.them - a.us))[0] ?? null;
    return { record: `${wins.length}–${losses.length}`, best, worst,
      box: teamRows(parseBoxCsv(rd.boxCsv), team.name) };
  }, [rd, membership, team, teams]);

  const wpd = useMemo(() => {
    const m = new Map<string, number>();
    for (const [tid, t] of teams) {
      const spend = spendThroughRound(t.spendLog ?? [], round);
      m.set(tid, spend > 0 ? t.wins / spend : 0);
    }
    return m;
  }, [teams, round]);

  if (!game || !team || !rd || !my || !membership) return null;

  const download = () => {
    // Verbatim server string — never re-serialize; students get byte-identical data.
    const url = URL.createObjectURL(new Blob([rd.boxCsv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'),
      { href: url, download: `boxscores_round_${round}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const awardTeam = (tid: string) => teams.get(tid)?.name ?? '—';
  const bargain = rd.awards.bargain;
  const bargainContract = bargain
    ? teams.get(bargain.teamId)?.roster.find((c) => c.pid === bargain.pid)
      ?? teams.get(bargain.teamId)?.spendLog.slice().reverse().find((c) => c.pid === bargain.pid)
    : null;
  const bargainRows = bargain
    ? teamRows(parseBoxCsv(rd.boxCsv), awardTeam(bargain.teamId))
        .filter((r) => r.player_id === bargain.pid)
    : [];
  const bargainLine = bargainRows.length
    ? `${(bargainRows.reduce((s, r) => s + r.pts, 0) / bargainRows.length).toFixed(1)} pts · ${
       (bargainRows.reduce((s, r) => s + r.rebounds, 0) / bargainRows.length).toFixed(1)} reb · ${
       (bargainRows.reduce((s, r) => s + r.steals + r.blocks, 0) / bargainRows.length).toFixed(1)} stocks per game`
    : '';

  const slides = [
    <div key="mvp"><strong>Round MVP</strong> — {catalog.get(rd.awards.roundMvp.pid)?.name}{' '}
      ({awardTeam(rd.awards.roundMvp.teamId)}) · <span className="mono">{rd.awards.roundMvp.line}</span></div>,
    <div key="top"><strong>Top Scorer</strong> — {catalog.get(rd.awards.topScorer.pid)?.name}{' '}
      ({awardTeam(rd.awards.topScorer.teamId)}) · <span className="mono">{rd.awards.topScorer.pts} pts</span></div>,
    <div key="bargain"><strong>Bargain of the Round</strong> — {bargain
      ? <>{catalog.get(bargain.pid)?.name} ({awardTeam(bargain.teamId)}) ·{' '}
          {/* Raw line + salary ONLY — perDollar is on the wire but is never rendered. */}
          <span className="mono">{bargainLine}{bargainContract ? ` · ${fmtM(bargainContract.rate)}/rd` : ''}</span></>
      : '—'}</div>,
  ];

  return (
    <main className="page">
      <PhaseHeader title="Results" round={round} timerEndsAt={game.timerEndsAt} />
      <h2 className="mono" style={{ fontSize: 34, margin: '4px 0' }}>{my.record}</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {my.best && <div className="card" style={{ flex: 1, minWidth: 180 }}>
          <div className="dim">BEST WIN</div>
          <span className="ok mono">{my.best.us}–{my.best.them}</span> vs {my.best.opponent}</div>}
        {my.worst && <div className="card" style={{ flex: 1, minWidth: 180 }}>
          <div className="dim">WORST LOSS</div>
          <span className="neg mono">{my.worst.us}–{my.worst.them}</span> vs {my.worst.opponent}</div>}
      </div>

      <div className="card" style={{ margin: '12px 0' }} data-testid="awards">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="chip" aria-label="previous award"
            onClick={() => setSlide((s) => (s + 2) % 3)}>‹</button>
          <div style={{ flex: 1 }}>{slides[slide]}</div>
          <button className="chip" aria-label="next award"
            onClick={() => setSlide((s) => (s + 1) % 3)}>›</button>
        </div>
      </div>

      <details open>
        <summary className="muted" style={{ cursor: 'pointer' }}>Your box lines</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>{BOX_COLS.map((c) => <th key={c} className={c === 'player_name' ? 'name' : ''}>{c}</th>)}</tr></thead>
            <tbody>
              {my.box.map((r, i) => (
                <tr key={`${r.player_id}-${i}`}>
                  {BOX_COLS.map((c) => (
                    <td key={c} className={c === 'player_name' ? 'name' : ''}>
                      {String(r[c as keyof typeof r])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <button className="btn gold" onClick={download} style={{ margin: '10px 0' }}>
        Download boxscores_round_{round}.csv — whole league, every line
      </button>

      <StandingsTable rows={rd.standings} highlightTeamId={membership.teamId} wpd={wpd} />
    </main>
  );
}
```
Replace the `/game/results` stub in `App.tsx`.

- [ ] **Step 3: Write the integration test**

`src/itest/results.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('results: record, box lines, awards without perDollar, highlighted snapshot', async () => {
  const seeded = await seedToPhase({ to: 'R1:RESULTS' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'IT S',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/results']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument(),
    { timeout: 20000 });
  // Record sums to Alpha's 3 games.
  const [w, l] = screen.getByRole('heading', { level: 2 }).textContent!.split('–').map(Number);
  expect(w + l).toBe(3);
  // Box lines: 8 players took the floor for Alpha (5 + sixth + 2 active bench).
  await waitFor(() => {
    const table = screen.getAllByRole('table')[0];
    expect(table.querySelectorAll('tbody tr').length).toBe(3 * 8);
  });
  // The bargain award never shows the computed per-dollar number.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  if (rd.awards.bargain) {
    expect(screen.getByTestId('awards').textContent)
      .not.toContain(String(rd.awards.bargain.perDollar));
  }
  // Snapshot highlights the viewer's row.
  const sel = screen.getByTestId('standings').querySelector('tr.sel');
  expect(sel?.textContent).toContain('Alpha');
}, 120000);
```

- [ ] **Step 4: Run + browser check**

Integration green (9 itest files).
Browser: `npm run seed -- --to R1:RESULTS`, claim an Alpha seat.
What you should see: the big monospace record ("2–1"); BEST WIN green / WORST LOSS red cards with scores and opponents; the awards card cycling every 5 s (arrows work) — Bargain of the Round reads like "Tobias Beckett (Gamma) · 7.7 pts · 8.1 reb · 3.4 stocks per game · $2.0M/rd" with **no ratio anywhere**; your 24 box rows (3 games × 8 players) in a scrollable monospace table; the gold CSV button downloads `boxscores_round_1.csv` whose first line is the frozen 23-column header; the standings snapshot with your row gold-washed and a `W / $M` column at three decimals.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): results — record, box lines, awards carousel, CSV download, snapshot"
```

---

### Task 15: Standings page (`/standings`) + persistent nav link

**Files:**
- Create: `src/pages/StandingsPage.tsx`
- Modify: `src/components/ui/PhaseHeader.tsx` (add the always-available Standings link), `src/App.tsx` (replace stub)
- Test: `src/itest/standings.itest.tsx`

**Rulings restated:** `/standings` is "always accessible" (spec §11.9) — PhaseRouter already exempts it, and the link lives in every screen's header. Columns: W-L, point diff, **wins-per-payroll-dollar** (sanctioned metric #1 — informational, never affects order; rank order comes verbatim from the server's tiebreak chain, coin flip included). Definition of the metric, fixed here so every surface agrees: **cumulative wins ÷ payroll dollars charged through the most recently played round**, from the public append-only `spendLog` (`spendThroughRound`, Task 4) — cuts don't reduce the denominator (committed money is never recovered; that is the lesson).

- [ ] **Step 1: Add the header link**

In `PhaseHeader.tsx`, next to the LED timer:
```tsx
import { Link, useLocation } from 'react-router-dom';
// inside the component's returned .phase-head, after <LedTimer …/>:
//   {pathname !== '/standings' && (
//     <Link to="/standings" className="chip" style={{ alignSelf: 'center' }}>Standings</Link>
//   )}
```
(Full component after the change — replace the file:)
```tsx
import { Link, useLocation } from 'react-router-dom';
import { LedTimer } from './LedTimer';

export function PhaseHeader({ title, round, timerEndsAt }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
}) {
  const { pathname } = useLocation();
  return (
    <div className="phase-head">
      <div>
        <div className="brand">Salary Showdown</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>{title}{round > 0 ? ` · Round ${round}` : ''}</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {pathname !== '/standings' && <Link to="/standings" className="chip">Standings</Link>}
        <LedTimer endsAt={timerEndsAt} />
      </div>
    </div>
  );
}
```
(LedTimer moves inside a flex wrapper; the Lobby's `round={0}` now renders without "· Round 0".)

- [ ] **Step 2: Write the page**

`src/pages/StandingsPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { spendThroughRound } from '../lib/contracts';
import type { RoundDoc, StandingsRow } from '../types/models';

export default function StandingsPage() {
  const { game, gameId, teams, membership } = useGame();
  const [latest, setLatest] = useState<{ round: number; rows: StandingsRow[] } | null>(null);

  useEffect(() => { // most recently played round's standings snapshot
    if (!game || !membership || !gameId) return;
    void getDocs(collection(db, 'games', gameId, 'rounds'))
      .then((snap) => {
        let best: { round: number; rows: StandingsRow[] } | null = null;
        snap.forEach((d) => {
          const r = Number(d.id);
          if (!best || r > best.round) best = { round: r, rows: (d.data() as RoundDoc).standings };
        });
        setLatest(best);
      });
  }, [game?.round, game?.phase, membership, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const wpd = useMemo(() => {
    if (!latest) return null;
    const m = new Map<string, number>();
    for (const [tid, t] of teams) {
      const spend = spendThroughRound(t.spendLog ?? [], latest.round);
      m.set(tid, spend > 0 ? t.wins / spend : 0);
    }
    return m;
  }, [teams, latest]);

  if (!game || !membership) return null;
  return (
    <main className="page">
      <PhaseHeader title="Standings" round={latest?.round ?? 0} timerEndsAt={game.timerEndsAt} />
      {latest
        ? <StandingsTable rows={latest.rows} highlightTeamId={membership.teamId} wpd={wpd} />
        : <p className="muted">No games in the books yet.</p>}
      <p style={{ marginTop: 14 }}><Link to="/game/office" className="chip">Back to the game</Link></p>
    </main>
  );
}
```
Replace the `/standings` stub in `App.tsx`. Note the back link can point at any game route — PhaseRouter immediately corrects it to the live phase.

- [ ] **Step 3: Write the integration test**

`src/itest/standings.itest.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('standings: server rank order, viewer highlight, W/$M column', async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' }); // round 1 played
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByTestId('standings')).toBeInTheDocument(),
    { timeout: 20000 });
  // Row order must be the SERVER's rank order, verbatim.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  const names = [...screen.getByTestId('standings').querySelectorAll('tbody td.name')]
    .map((td) => td.textContent);
  expect(names).toEqual(rd.standings.map((s: { name: string }) => s.name));
  expect(screen.getByText('W / $M')).toBeInTheDocument();
  expect(screen.getByTestId('standings').querySelector('tr.sel')?.textContent).toContain('Alpha');
  // PhaseRouter must NOT yank us off this always-accessible page.
  await new Promise((r) => setTimeout(r, 1500));
  expect(screen.getByTestId('standings')).toBeInTheDocument();
}, 120000);
```

- [ ] **Step 4: Run + browser check**

Integration green (10 itest files).
Browser: from any game screen, the header now carries a Standings chip; the page shows the latest snapshot, your row highlighted, `W / $M` at three decimals (Alpha's is high — hardship rosters are cheap; that's the Moneyball metric quietly doing its job). Back link returns you to the live phase.

- [ ] **Step 5: Commit**

```bash
git add games/salary-showdown/app/src
git commit -m "feat(salary-showdown): standings page — server rank order, viewer highlight, wins-per-dollar"
```

---
### Task 16: Full-season E2E, UI-rules audit, app README

**Files:**
- Create: `src/itest/season.itest.tsx`, `scripts/audit-ui-rules.mjs`, `games/salary-showdown/app/README.md`
- Modify: `games/salary-showdown/app/package.json` (`audit:ui` runs the node script), `src/itest/harness.ts` (extract `driveTo` — exact code below)

- [ ] **Step 1: Extract `driveTo` in the harness**

In `src/itest/harness.ts`, split `seedToPhase` so a test can keep driving an existing game (the season E2E joins the app's user first, then advances the same game). Replace the drive loop inside `seedToPhase` with this exported function (complete code — the bot-action logic is the same as Task 6's, now reading from `seeded` and guarded so repeated `driveTo` calls on one game never double-sign):
```ts
// Drive an existing seeded game onward to `to`. Starts the season if still in
// lobby. RULING unchanged: advancePhase always carries expectedPhase + expectedRound.
export async function driveTo(seeded: Seeded, to: string): Promise<void> {
  let g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
  if (g.status === 'lobby') {
    await seeded.prof.call('startSeason', { gameId: seeded.gameId });
    g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
  }
  const [, rS, ph] = to === 'FINALE' ? [null, '5', 'FINALE'] : /^R([1-5]):([A-Z_]+)$/.exec(to)!;
  let guard = 0;
  while (!(g.phase === ph && (ph === 'FINALE' || g.round === Number(rS)))) {
    if (g.phase === 'FREE_AGENCY' && g.round === 1) {
      const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
      const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
      const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
      for (const bot of seeded.bots) {
        const t = (await adminDb().doc(
          `games/${seeded.gameId}/teams/${bot.teamId}`).get()).data()!;
        if (t.roster.length > 0) continue; // already built (repeated driveTo call)
        const pool: Record<string, { pid: number; sal: number }[]> = { G: [], W: [], B: [] };
        for (const pid of market.available as number[]) {
          const p = byPid[pid];
          if (p.salary_per_round !== '') {
            pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
          }
        }
        for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
        const used = new Set<number>();
        let i = 0;
        for (const pos of SIGN_ORDER) { // interleaved → can never trip POSITION_LOCK
          const p = pool[pos].find((x) => !used.has(x.pid))!;
          used.add(p.pid);
          await bot.gm.call('signPlayer',
            { gameId: seeded.gameId, pid: p.pid, years: (i % 4) + 1 });
          i += 1;
        }
      }
    }
    if (g.phase === 'AUCTION') {
      const wave = (await adminDb().doc(
        `games/${seeded.gameId}/auctions/${g.round}`).get()).data()!;
      for (const [i, bot] of seeded.bots.entries()) {
        await bot.scout.call('submitBids', { gameId: seeded.gameId, bids: {
          [wave.stars[i % wave.stars.length]]: { rate: minBid(g.round), years: 1 } } });
      }
    }
    // LINEUP: nothing — the exit hook's auto-repair carries every team.
    await seeded.prof.call('advancePhase',
      { gameId: seeded.gameId, expectedPhase: g.phase, expectedRound: g.round });
    g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    if (++guard > 40) throw new Error(`stuck at R${g.round}:${g.phase}`);
  }
}
```
`seedToPhase` then ends with (replacing everything after the bot joins — the `startSeason` call and the old loop are deleted; `driveTo` owns both now):
```ts
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };
  if (opts.to !== 'LOBBY') await driveTo(seeded, opts.to);
  return seeded;
```
Re-run the whole integration suite after this refactor — every earlier itest must stay green (that is the refactor's test).

- [ ] **Step 2: Write the season E2E**

`src/itest/season.itest.tsx` — one rendered client rides a full season on PhaseRouter alone:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('a joined client follows a whole season, lobby to finale', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'E2E GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Waiting for the professor/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:FREE_AGENCY');
  await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:AUCTION');
  await waitFor(() => expect(screen.getAllByLabelText(/salary for /)).toHaveLength(5),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:RESULTS');
  await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'R3:FRONT_OFFICE');
  await waitFor(() => expect(screen.getByText('Expiring deals')).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'FINALE');
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Finale (Plan 3)'),
    { timeout: 30000 });
}, 300000);
```

- [ ] **Step 3: Write the audit script**

`scripts/audit-ui-rules.mjs` (heuristic tripwires for the three easiest rules to break silently):
```js
// UI-rules audit: (1) no emojis anywhere in src (glyphs ★▲▼½ are fine and not
// in these ranges); (2) never read config.timers (it does not exist on the wire);
// (3) no judgment adjectives in string literals (facts, never conclusions).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;
const JUDGMENT = /(['"`])[^'"`]*\b(underperforming|declining|washed|a steal|overpaid|overpriced|elite pick|great value)\b[^'"`]*\1/i;

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f) && !/\.(test|itest)\./.test(f)) files.push(p);
  }
})('src');

let bad = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of [['emoji', EMOJI], ['judgment-language', JUDGMENT]]) {
      if (re.test(line)) { console.error(`${f}:${i + 1} ${name}: ${line.trim()}`); bad++; }
    }
    if (line.includes('config.timers')) {
      console.error(`${f}:${i + 1} reads config.timers (does not exist on the wire)`); bad++;
    }
  });
}
if (bad) { console.error(`\naudit:ui FAILED — ${bad} finding(s)`); process.exit(1); }
console.log(`audit:ui clean — ${files.length} files scanned`);
```
In `package.json`, add the script: `"audit:ui": "node scripts/audit-ui-rules.mjs"` (Task 1 deliberately shipped no audit script — it first exists here).

- [ ] **Step 4: Write the app README**

`games/salary-showdown/app/README.md`:
```markdown
# Salary Showdown — Team Client (Plan 2)

React + Vite + Firebase JS SDK, always against the emulator suite in dev.

## Quickstart
1. Emulators: `cd ../backend/functions && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu`
2. Demo game: `npm run seed -- --to R1:FREE_AGENCY` (leaves Team Alpha's seats open;
   prints the join code; `--fill all` staffs every team, `--to R3:FRONT_OFFICE` /
   `--to FINALE` etc. jump phases)
3. App: `npm run dev` → http://localhost:5176/?code=<joinCode>

## Tests
- Unit: `npm test`
- Integration (needs the full emulator suite):
  `cd ../backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only functions,firestore,auth "cd ../app && npx vitest run -c vitest.integration.config.ts"`
- UI rules: `npm run audit:ui`

The Firestore/callable contract this client is written against is frozen in
`../backend/SCHEMA.md` + `../backend/README.md` and restated in the Plan 2
document (`docs/superpowers/plans/2026-07-16-salary-showdown-team-client.md`,
Global Constraints).
```

- [ ] **Step 5: Final verification sweep**

Run, in order, all green before calling the plan done:
1. `cd games/salary-showdown/app && npx vitest run` — unit suite.
2. The integration command (Global Constraints) — now 11 itest files including the season E2E.
3. `cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"` — backend suite still 16 files / 104 tests (Task 3 added 2).
4. `npm run audit:ui` — clean.
5. Browser walkthrough: `npm run seed -- --to R1:FREE_AGENCY`, then play Team Alpha through one full round by hand in three tabs (GM signs 8, Scout bids, Coach sets lineup; advance phases with a scratch `node -e` advancePhase call or re-seed per phase), eyeballing each screen against its mockup.

- [ ] **Step 6: Commit**

```bash
git add games/salary-showdown/app
git commit -m "feat(salary-showdown): season E2E, UI-rules audit, app README — team client complete"
```

---

## Execution notes for the reviewer between tasks

- Task order is dependency order; Tasks 7–15 each assume every earlier task's exports exactly as written in their Interfaces blocks.
- Tasks 9–15's integration tests all lean on the Task 6 harness and the fact that **Team Alpha is bot-free**: hardship staffs it with 8 cheap one-round contracts each round, which conveniently exercises the expiring panel (8 expirings every Front Office), keeps its payroll trivial, and leaves all three seats claimable by tests and by you in the browser.
- Nothing in this plan touches `datagen/`, `firestore.rules`, or any backend file except the Task 3 callable. If a screen seems to need more server surface than the Global Constraints expose, that is a plan bug to raise, not something to improvise around.







