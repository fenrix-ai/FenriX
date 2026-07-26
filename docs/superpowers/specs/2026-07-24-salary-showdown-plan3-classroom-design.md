# Salary Showdown — Plan 3: Classroom Surfaces & Production (design spec)

**Date:** 2026-07-24 · **Owner:** Dylan Massaro · **Status:** approved design, pre-plan
**Parent spec:** `docs/superpowers/specs/2026-07-14-salary-showdown-design.md` (authoritative game design; §11 mockups, §13 timeout defaults)
**Repo state at writing:** `main` @ `ac3e473` (Plans 1–2 + backend hardening merged; pushed to GitHub)

Plan 3 makes the game runnable in a classroom. Today every phase advance comes from a script;
there is no professor UI, no projector view, and no finale rendering. This spec covers both
halves of that gap and is split deliberately:

- **Plan 3a — Classroom surfaces.** Professor control panel, projector view, finale/reveal, and
  the small backend additions they need. Emulator-only; ends fully demoable on one laptop.
- **Plan 3b — Production.** Real Firebase project (Blaze), hosting, the 60–70-client load drill,
  and the pre-class checklist. Gated on Dylan creating the Blaze project; nothing in 3a depends
  on it.

3a and 3b get **separate implementation plans**, executed in that order.

---

## 1. Decisions locked during brainstorming (do not re-litigate in the plan)

1. **Timeline:** green light from the professor in principle; no class date yet. The 3b load
   drill is the gate for picking a date.
2. **Screens:** professor laptop + projector as an **extended display** (not mirrored). The
   panel (`/professor`) and projector (`/bigscreen`) are separate routes; the panel may show
   professor-only information (submission detail, controls) because the wall never sees it.
3. **Sequencing (Option B):** build 3a to done (tested + browser-verified on the emulator),
   then 3b. No deploy work inside 3a.
4. **Config knobs are read-only in the panel** except timers. `config.cap` / `config.totalRounds`
   remain decorative (Plan 1 ruling) — the panel displays them, never edits them.
5. **Timer defaults are panel-local**, not game config: stored in the panel's localStorage,
   editable there, auto-armed on each phase advance (with a disarm toggle). The server stores
   only the live timer state. No `config.timers` plumbing.
6. **The "We're done" signal for Front Office / Free Agency is a new GM-only callable**
   (`markDone`) writing a status flag — never a lock. GMs can keep acting after pressing it.
7. **V2 ideas** (alternating draft/play loop, top-3 bonus money, ticket-sale economy,
   facility/staff spending, trading) are **out of scope** — pitch-deck material only.

## 2. Verified code facts this design rests on (fact-checked 2026-07-24, 4-agent sweep)

- `rounds/{r}.standings` rows are `{teamId, name, wins, losses, pointDiff, pointsFor,
  tiebreakCoin, rank}` — **`previousRank` is absent** and must be added server-side
  (`sim.js:156-161`). Wins/losses are cumulative; ordering is wins → pointDiff → pointsFor →
  tiebreakCoin (seeded per round). `standingsSeed` on the game doc is vestigial (never read).
- The sim runs on **`enter:SIMULATE`** (`game.js:533-549`), writing `rounds/{r}` (games, awards,
  standings, boxCsv) in **one batch** whose existence is the hook's idempotency marker. With the
  §3a transition gate (client holds `fromPhase` until `transition` clears, `GameContext.tsx`),
  **`rounds/{r}` is guaranteed to exist before any client renders SIMULATE.** The projector
  animates from complete data; there is no exit-of-SIMULATE hook.
- `timerEndsAt` exists on the game doc and is only ever written to `null` (createGame,
  every advancePhase flip). `LedTimer` already counts down from any `toMillis()` value and
  renders `--:--` for null. No callable sets a timer today. `config.timers` does not exist.
- The reveal is written once by `enter:FINALE` to `reveal/latest` (`game.js:562-608`):
  `scatter` (pid, name, hype, salary|null, ti, isTrap, archetype), `perTeam` (best/worst signing
  with `valuePerDollar` over `spendLog`), `winsPerDollar`, and `trueWeights` — today only
  `{narrative, turnoverWeight: 1.5, defenseVisible: true}`. The backend imports the full private
  engine params at runtime: `ti_weights = {base: 6.0, scoring: 1.6, playmaking: 0.55,
  steal: 1.05, block: 1.0, rebound: 0.25, turnover: 1.5}` (`engine_params.json`), plus
  `hidden.json` per-player records. Rules: clients read `reveal/*` only when the game is
  finished; the professor always can; writes never.
- **The professor uid can already read everything the panel needs**: `teams/{id}/private/*`
  (sealed bids) via `isProfessor` in the rule (`firestore.rules:34-37`), public team docs
  (`lineupLockedRound` is public), players, rounds. **No rules changes required for 3a.**
- Auth persistence: DEV = per-tab `browserSessionPersistence`; PROD = Firebase default local
  persistence shared across tabs. A `/bigscreen` tab opened via `window.open` from the panel
  inherits the professor session in **both** environments (PROD: shared persistence; DEV:
  sessionStorage is snapshot-copied into `window.open` tabs). A hand-typed URL works in PROD
  only — the panel's "Open projector" button is the supported path.
- The professor holds **no membership doc** (`players/{uid}`), so the team client's
  `PhaseRouter` (`if (!game || !membership) return`) never redirects `/professor` or
  `/bigscreen`, and `GameContext`'s membership-gated listeners stay dormant. The new surfaces
  need their own data layer.

## 3. Architecture

### 3.1 One new data layer; the team client is untouched

New **`ProfessorProvider`** (`app/src/contexts/ProfessorContext.tsx`) serving both new routes.
It does not reuse `GameContext` (membership-gated by design) and changes nothing in it.

- **Game id:** stored under a separate key `ss.profGameId` in **localStorage** (survives
  restarts; independent of the team-client `ss.gameId` sessionStorage story).
- **Subscriptions** (all professor-authorized under existing rules):
  - `games/{id}` — exposing BOTH the §3a transition-gated view (`round`/`phase` presented as
    `fromRound`/`fromPhase` while `transition` is set — same mapping as `GameContext`) and a
    raw `settling: boolean` so the panel can show "advancing…" and disable controls during hooks.
  - `teams` collection (names, records, `lineupLockedRound`, `doneRound`/`donePhase`).
  - `players` collection (lobby grid: who claimed which seat).
  - `rounds/{currentRound}` (scoreboard, standings, boxCsv export).
  - `auctions/{currentRound}` (wave context on the panel).
  - Per-team `teams/{id}/private/auction` — **for the submitted-light only.** The panel renders
    presence (`.round === currentRound`), never bid contents. 21 teams ⇒ ≤21 extra listeners on
    one client; inside the ~6-per-client scale envelope's intent (single privileged client).
  - `reveal/latest` when phase is FINALE.
- **Calls:** `createGame`, `startSeason`, `advancePhase` (always with
  `expectedPhase` + `expectedRound` — standing hard rule), and the three new callables below.

### 3.2 Routes

Added to `App.tsx` alongside existing routes: `/professor` (panel) and `/bigscreen` (projector).
Both render inside `AuthProvider` (anonymous sign-in as today) and `ProfessorProvider`.
`/bigscreen` is opened from the panel via `window.open('/bigscreen')` (auth inheritance per §2)
and is display-only: no interactive controls, safe to fullscreen on the wall.

## 4. Backend additions (all small, all tested)

### 4.1 `setTimer` — professor-only callable

`setTimer({gameId, action, seconds?, expectedPhase, expectedRound})`, transactional, validating
expectations against the live doc (PHASE_MISMATCH otherwise; matches advancePhase semantics).

| action | effect |
|---|---|
| `start` | `timerEndsAt = now + seconds`, `timerPausedMs = null` |
| `pause` | `timerPausedMs = max(0, endsAt − now)`, `timerEndsAt = null` |
| `resume` | `timerEndsAt = now + pausedMs`, `timerPausedMs = null` |
| `extend` | running: `endsAt += seconds`; paused: `pausedMs += seconds·1000` |
| `clear` | both null |

**Schema:** new game-doc field `timerPausedMs: number | null`. States: running (endsAt set) /
paused (pausedMs set) / off (both null). The advancePhase flip already nulls `timerEndsAt`; it
additionally nulls `timerPausedMs` — an additive key in the existing flip update object. No
other change to the hardened advance path.

**Timers are advisory pacing, not enforcement** (spec §13): expiry never blocks submissions
server-side; advancing is what closes a phase.

### 4.2 `markDone` — GM-only status flag for FO/FA

`markDone({gameId})`: role-gated GM, valid only in `FRONT_OFFICE` / `FREE_AGENCY`
(PHASE_MISMATCH otherwise), transactional update of the public team doc:
`{doneRound: round, donePhase: phase}`. Never a lock — signing/cutting stays open until the
phase closes; staleness is implicit in the pair (no clearing logic anywhere). Idempotent.

### 4.3 `setRevealStep` — professor-only finale stepping

`setRevealStep({gameId, step})`: requires `phase === 'FINALE'`; writes `revealStep:
number` (server-validated as an integer in `0..8` — a deliberate superset so the wall's step
list can grow without a backend change; the wall clamps to its own list, today 5 steps: podium
+ 4 charts per §6.5). Team laptops ignore it (their debrief is scrollable).

### 4.4 `previousRank` on standings rows

In `enter:SIMULATE`, before the existing single `batch.set` of `rounds/{r}`: read
`rounds/{r-1}`, build `teamId → rank`, stamp `previousRank` (number; `null` in round 1) onto
each `out.standings` row. Stays inside the same batch so the doc-exists idempotency guard is
undisturbed. One extra doc read per round.

### 4.5 `trueWeights` extension (+ datagen additive export)

The reveal's `trueWeights` grows to carry both sides of the finale comparison chart:

```
trueWeights: {
  narrative, defenseVisible,                    // unchanged
  engine: { base, scoring, playmaking, steal,   // full ti_weights from engine_params.json
            block, rebound, turnover },
  regression: {                                  // what students COULD have found
    winsR2: 0.70,
    turnoverCoef: -3.84, turnoverP: '<0.001',
    payrollT: -0.03, hypeT: 1.37,               // both null effects
  },
}
```

The regression block's provenance is the datagen harness (the same 11-check pipeline that
gates the dataset): datagen gains an **additive** export `reveal_weights.json` written next to
its other outputs and copied to `backend/functions/src/data/`, containing the engine vector and
the harness-measured regression results for the shipped seed. Student CSVs are untouched;
`python3 generate.py` must remain byte-identical for every existing output file. The FINALE
hook merges this file into `trueWeights`. `turnoverWeight` (the old field) is kept for
compatibility with anything already reading it.

**Sanctioned-reveal note for the plan-writer:** the "facts, never conclusions" rule and the
perDollar-never-renders rule govern **in-game team screens**. The FINALE is the sanctioned
reveal (parent spec §11.14): value-per-dollar, wins-per-dollar, trap/bargain labels, and the
weights comparison are exactly what it exists to show. Do not "fix" the finale by hiding them.

### 4.6 SCHEMA.md updates

Document: `timerPausedMs`, `revealStep`, team-doc `doneRound`/`donePhase`, standings
`previousRank`, extended `trueWeights`, and the client contract that timers are advisory.

## 5. `/professor` — the control panel

Single-page layout, phase-aware. Sections:

1. **Session header:** joinCode (large — this is what Dylan reads out if the wall dies), phase
   + round, settling indicator, "Open projector" button (`window.open('/bigscreen')`).
2. **Game lifecycle:** create game (team-names textarea, one per line, max 21 — hard cap
   enforced in UI copy and a length check; parent spec's `rounds/{r}` size ceiling), or resume
   an existing gameId (`ss.profGameId`), plus `startSeason` while in lobby.
3. **Phase control:** one primary Advance button (labelled with the concrete next phase, e.g.
   "Advance → Star Auction · R2"), always sending expectations; disabled while settling.
   **Confirmation guards:** advancing while any team's light is off opens a modal listing the
   un-submitted teams by name (facts only) with explicit confirm; the RESULTS·R5 → FINALE
   advance gets its own "end the season" confirm. Force-advance is this same path — exit hooks
   already apply every §13 timeout default; no new backend semantics.
4. **Timer strip:** live countdown mirroring `timerEndsAt`/`timerPausedMs`; Start (per-phase
   default), Pause/Resume, +30s, Clear; auto-arm toggle and **auto-advance toggle** (panel tab
   calls `advancePhase` at 0:00; a PHASE_MISMATCH loss to a manual click is swallowed
   silently). Defaults (localStorage, editable in a small settings popover): FO 3:00 · FA 2:30
   · Auction 2:00 · Lineup 1:30 · Simulate 1:00 · Results 1:30. If the panel tab dies, nothing
   auto-advances — the game waits (safe failure).
5. **Submission grid:** one row per team; light per current phase — FO/FA:
   `doneRound/donePhase` match · Auction: `private/auction.round === round` · Lineup:
   `lineupLockedRound === round` · Simulate/Results: no lights. Lights only; never bid
   contents.
6. **Round/standings context:** compact standings and scores from the last **completed**
   round, read-only — sourced from `rounds/{round}` during SIMULATE/RESULTS/FINALE and
   `rounds/{round-1}` during FRONT_OFFICE/FREE_AGENCY/AUCTION/LINEUP (hidden while no
   round is complete), with headers naming the round shown (`contextRound`).
7. **Export:** "Download season CSV" — client-side concatenation of `rounds/1..current`
   `boxCsv` (single header row), Blob download. 23-column format is frozen; no reformatting.
8. **Finale controls:** when phase is FINALE, chart stepper (‹ › + step names) driving
   `setRevealStep`.
9. **Config display:** cap / totalRounds shown read-only.

Errors surface as dismissible notices (reusing `ErrorNotice` patterns / `errors.ts` mapping).
No emojis anywhere (product-wide rule; glyphs like ‹ › ▲ ▼ ★ are fine).

## 6. `/bigscreen` — the projector

Mode follows the (transition-gated) phase. Dark, high-contrast, big type; no interactivity.

1. **LOBBY:** giant join code + join URL line; teams-forming grid (team name + GM/Scout/Coach
   chips filling with display names as claimed); "X of N seats filled".
2. **Decision phases (FO / FA / Auction / Lineup):** phase name (student vocabulary: Front
   Office · Draft Night · Star Auction · Lineup), round, huge LedTimer (shared paused/off
   rendering), submission grid mirroring the panel's lights (team name + filled/unfilled dot —
   public information by design; it's on the wall to create pace pressure).
3. **SIMULATE — scoreboard flood:** client-paced staggered reveal of all `rounds/{r}.games`
   as matchup score cards (~45s total, same cosmetic-pacing pattern as `SimulatePage`), ending
   in "Round complete." The data is complete before the phase renders (§2), so this is pure
   playback.
4. **RESULTS — the Standings Shuffle:** pure-function `computeShuffleSteps(standings)` →
   ordered step list from `previousRank`/`rank` (bottom-up reveal order, ▲/▼/— deltas, `NEW`
   when previousRank is null in round 1, shroud entries for the top three until last).
   Playback: ~0.8s per row; round 5 slows to ~3s for ranks 3-2-1 (championship reveal). Rest
   state: full table with deltas. The function is unit-tested exhaustively (ties, no-change
   rounds, round-1 nulls); playback is a dumb consumer of the step list.
5. **FINALE:** podium (top three from final standings) then charts stepped by `revealStep`:
   ① hype vs TrueImpact scatter with traps (volume traps + aging legends) and the bargain
   cluster labeled · ② engine weights vs regression-recovered comparison (`trueWeights.engine`
   vs `.regression`) · ③ wins-per-payroll-dollar ranking · ④ per-team best/worst signing.
   Charts are **hand-rolled SVG components** (no new chart dependency), theme-consistent
   with the app, unit-tested on their data→geometry transforms.

## 7. Team-client touches (the only ones)

- **"We're done" button** on FrontOfficePage + FreeAgencyPage, GM-only, calling `markDone`;
  after success shows "Marked done — you can still make changes until the phase closes."
- **LedTimer:** render the paused state (frozen mm:ss + "paused" text); drop the stale
  "timers are Plan 3" comment. Null handling unchanged.
- **`errors.ts` copy fix (pre-approved):** `STAR_TAKEN` → "This star's claim has already been
  used this round."
- **FinalePage** replaces the `/game/conclusion` stub: scrollable debrief rendering the full
  reveal payload (all four charts + team's own best/worst), ignoring `revealStep`.

## 8. Error handling summary

- New callables validate expectations transactionally; clients match on **message** not kind
  (existing rule), and `errors.ts` gains entries for any new codes (reuse PHASE_MISMATCH).
- Panel during `settling`: controls disabled — belt-and-suspenders atop the server's own
  double-advance protection (flip-first transaction; losers get PHASE_MISMATCH).
- Auto-advance failure: swallowed if PHASE_MISMATCH (someone advanced first), surfaced
  otherwise.
- Bigscreen is read-only; a dead listener degrades to a stale wall while the game continues —
  acceptable, and the panel's joinCode display is the fallback of record.
- A crashed advance (leftover `transition`) parks all surfaces on the old phase (§3a gate);
  the panel shows settling until the next advance adopts and finishes it — existing recovery,
  now visible.

## 9. Testing (3a exit bar)

- **Backend (emulator):** unit + integration for `setTimer` (5 actions × running/paused/off,
  PHASE_MISMATCH, flip clears pause), `markDone` (role gate, phase gate, idempotence),
  `setRevealStep` (professor gate, FINALE gate, clamp), `previousRank` (round 1 null; rounds
  2..5 equal prior stored ranks incl. tiebreak outcomes; idempotency guard undisturbed),
  `trueWeights` extended shape + `reveal_weights.json` presence. Full suite green
  (115 + new).
- **Datagen:** `generate.py` runs, 11 checks pass, all pre-existing outputs byte-identical,
  new `reveal_weights.json` matches harness numbers.
- **App:** unit tests for `computeShuffleSteps` and chart transforms; itests for panel
  (lights driven by real callables per phase, timer start/pause freeze across two rendered
  clients, done button, advance-with-confirm), bigscreen mode switching across a driven
  season, finale payload rendering (step-driven wall + scrollable laptop). Existing 14
  itests stay green ×3 consecutive.
- **Browser verification** (per environment gotchas: drive via `element.click()`):
  seeded demo game — panel on one tab, bigscreen via Open projector, two team tabs;
  walk a full season end-to-end watching lights, timer, flood, shuffle, and the stepped
  finale. Concrete "what you should see" checks in the plan.

## 10. Plan 3b — Production (separate plan; gated on Blaze project creation)

1. **Firebase project:** Dylan creates it + enables Blaze billing (console work only he can
   do). Then: anonymous auth on; Firestore (region decision at creation — default
   `us-central1` unless Dylan chooses closer; permanent); deploy rules + indexes + functions;
   **Hosting** — `firebase.json` has no hosting block today: add one (Vite `dist/`, SPA
   rewrite to `index.html`), `npm run build`, deploy. Budget alert configured.
2. **Prod smoke:** create a game from the deployed panel, join from ≥2 real devices, run a
   full 5-round season incl. finale. Fix-forward anything environmental.
3. **Load drill (the date-picking gate):** Node script spawning 63 synthetic clients
   (21 franchises × 3 roles) against **prod**, reusing itest-harness patterns: join, attach
   the real listener set, submit on schedule while a driver advances phases on classroom
   pacing. Measure per-flip p50/p95 snapshot lag, callable latency, error/retry counts;
   verify `rounds/{r}` payload size at 21 teams. Pass criteria in the plan (e.g. p95 phase-flip
   propagation under ~3s, zero listener deaths). Est. cost: single-digit dollars.
4. **Pre-class checklist:** `ss.gameId` sessionStorage → **localStorage** in the team client,
   browser-verified with the taken-seat rejoin flow (crashed laptop recovers in one click);
   Dylan's 30-second manual drag QA at `/game/lineup` (un-automatable gesture); one-page
   professor runbook — join instructions, per-phase script with timer defaults, force-advance
   guidance, **hard 21-franchise cap**, failure playbook (panel tab dies → reopen and resume
   by game id — the Resume field takes the game id, which the runbook has the professor
   write down pre-class; the panel header itself shows the joinCode; wall dies → read
   joinCode from panel).

## 11. Out of scope

V2 economy/trading/loop ideas · >21-team scheduler · `rounds/{r}` doc-size work ·
editable cap/totalRounds · spectator auth for hand-typed bigscreen URLs in dev ·
a11y/polish passes beyond the surfaces specified here.
