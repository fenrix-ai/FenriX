# Salary Showdown — Continuation Handoff

**Written:** 2026-07-23 · **Repo:** `/Users/dylanmassaro/FenriX` · **Owner:** Dylan Massaro (MGSC 310)

You are picking up an in-flight classroom-game project. Read this file end to end before touching
anything. It is the authoritative summary of state, open work, hard rules, and environment
gotchas. Everything here was verified at the time of writing.

---

## 1. What the project is

**Salary Showdown** (tagline *"regression to the rim"*) is a live, competitive NBA front-office
game for an MGSC 310 data-modeling class. It is the sibling of `games/bakery-bash/`.

- Students form **3-person franchises** (roles: **GM**, **Scout**, **Coach**), each owning exactly
  one submit button.
- A week before class they receive **two CSVs** and build regression models.
- Class day is one **75-minute, professor-paced, 5-round** live session played on laptops.
- **Most cumulative wins = champion.**

**The hidden pedagogical payload (this is the whole point):** the in-game market prices **hype**
(points, followers, reputation); **wins** come from **efficiency, ball security, and defense**.
Every hidden pattern is *provably recoverable by regression* from the pre-released data — the
dataset generator refuses to ship unless an 11-check harness proves it.

Planted in the data: **7 volume-scorer traps** (below the 0.94 points-per-shot break-even),
**6 aging legends** (decoder is age, not efficiency), an **18-player bargain cluster** (cheap
defenders), and **4 red-herring columns** (`ft_pct`, `years_pro`, `games_played`, `personality`).
Realized numbers on the shipped seed: student wins-model **R² = 0.70**, turnovers **−3.84 wins
each** (p<0.001), **payroll t = −0.03** and **hype t = 1.37** (both null), modeling team finishes
top-3 in **86%** of simulated seasons and wins the title in **48%**.

---

## 2. Exact repo state (verified at handoff)

| Fact | Value |
|---|---|
| Current branch | `salary-showdown-backend-hardening` @ **`d72a377`** |
| `main` | **`9e9cc80`** (Plan 1 + Plan 2 merged) |
| Local `main` vs `origin/main` | **69 commits ahead — NOTHING has ever been pushed to GitHub** |
| Backend test suite (hardening branch) | **19 files / 115 tests green** |
| App unit suite | **7 files / 30 tests green** |
| App integration suite | **11 files / 12 tests** — ⚠️ intermittently fails, see §3 |
| UI-rules audit | clean, 37 files |

Unrelated pre-existing dirt in the working tree (NOT yours, leave alone): `quant_finance/README.md`
modified, plus untracked files under `games/bakery-bash/`, `quant_finance/local_llm/`, and a stray
`image (2).png`.

### Hardening branch commits (not yet merged)

```
d72a377 fix: sim test — restore bargain-award discrimination canary with shared-pid fixture
4adb774 fix: released auction stars re-enter the FA rotation as unsold claims (spec §5/§13)
bf06e50 fix: sim box emission — history-parity 1.25×tier-weight scaling (spec §7.1)
360add4 fix: advance hardening — correct residual-scope comments, pin matching-expectation adoption
5e71612 fix: advancePhase — transactional flip-first with transition resume; transactional submits
```

### What is DONE and merged to `main`

1. **Dataset generator + shipped data** — `games/salary-showdown/datagen/` (Python, seed 310).
   `python3 generate.py` writes only if all 11 harness checks pass. Student package in
   `games/salary-showdown/data/`. Answer key + `engine_params.json` in `datagen/private/` (never ships).
2. **Backend game server** — `games/salary-showdown/backend/` (Firebase Cloud Functions +
   Firestore). 9 callables, idempotent phase machine, deterministic sim, frozen 23-column box-score
   CSV, finale reveal gated on game end. JS engine parity-proven against `datagen/engine.py`.
3. **Team-facing React client** — `games/salary-showdown/app/` (React 19 + TS + Vite + Firebase JS
   SDK). All nine screens built, reviewed, and browser-verified.

### What is DONE but NOT merged (this branch)

4. **Backend hardening** — the four "fix-before-class" items from the original review:
   - **H-A**: `advancePhase` rewritten as **transactional flip-first with a `transition` resume
     marker**; `submitBids`/`submitLineup` made transactional. Closes the double-click
     double-resolution race, the FA-close hardship race, and the last-second-submit TOCTOU.
   - **H-B**: live box-score scaling corrected to the history file's binding **1.25 × tier-weight**
     model (was a minutes-ratio, ~+29% inflated). Restores live-vs-history fingerprint parity.
   - **H-C**: sold-then-released auction stars now **re-enter the FA rotation** as unsold claims.

---

## 3. ⚠️ THE ONE OPEN THREAD — start here

**The app integration suite intermittently fails on `src/itest/season.itest.tsx`.**

Symptom: the rendered client's Firestore `onSnapshot` goes stale — the DOM stays on an old phase
(e.g. "Simulate · Round 2") while an admin read confirms the **server** already advanced to
`R3:FRONT_OFFICE`. The checkpoint `waitFor` then times out. No error callback fires. Reproduces
roughly **1 in 4** runs in isolation; it is always a *late* file in the serial run order.

A debug agent was dispatched with three ranked hypotheses and **died mid-investigation** (session
limit) after confirming the ~1-in-4 isolation repro. Its leading hypothesis, unproven:

- **H1 (favored):** `src/itest/harness.ts`'s `newClient()` creates ~9–12 Firebase client apps per
  seeded game and **never disposes them** (a `dispose()` exists but is unused). Across 11 serial
  itest files in one jsdom worker that is 100+ live apps with open WebChannel connections —
  late files' listeners starve. H-A's extra per-advance write volume (two game-doc writes instead
  of one) may have tipped an already-marginal condition.
- **H2:** something in H-A's write pattern itself breaks snapshot delivery under jsdom. **If the
  evidence points here, STOP and escalate** — that would implicate the hardening design and needs
  adjudication, not a patch.
- **H3:** jsdom + Firestore WebChannel needs long-polling. The pre-authorized fix is adding
  `experimentalAutoDetectLongPolling: true` (or `experimentalForceLongPolling`) to
  `initializeFirestore` in the **DEV branch only** of `src/lib/firebase.ts`.

**Discriminating test:** run `season.itest.tsx` **alone**, repeatedly. If it passes reliably alone
but fails in the full serial suite, H1 is confirmed → fix by disposing clients (a vitest
`setupFiles` teardown or a `disposeAll()` the harness returns is cleaner than editing 11 files).

**Do not** "fix" this with a longer timeout or a retry wrapper. Root-cause it.

**Definition of done for this thread:** root cause identified and fixed; full app integration suite
green **three consecutive runs**; backend suite still 115 green; then merge the hardening branch to
`main`.

---

## 4. What's left after that — Plan 3 (not started)

This is the real remaining body of work. **The game cannot be run in a classroom without it** —
today phases only advance via a script; there is no professor UI, no projector, no finale.

1. **Professor control panel** (`/professor`) — phase advance/pause, timers, per-team submission
   lights, force-advance (applies the same defaults as a §13 timeout), config knobs editable only
   between rounds, confirmation guards, full-game CSV export.
2. **Projector view** (`/bigscreen`) — mode follows phase: giant join code + teams-forming grid
   pre-game; phase name + countdown + submission grid during decisions; league-wide scoreboard
   flood during Simulate; and the **Standings Shuffle** after (rows re-rank bottom-up ~0.8s each,
   ▲/▼ arrows, top three shrouded until last, round 5 slows to ~3s for the championship reveal).
   `previousRank → newRank` is computed server-side at simulate close; the projector is pure playback.
3. **Finale / the Reveal** (`/game/conclusion`) — renders from the **server-generated static
   payload** already written at `reveal/latest`: hype-vs-TrueImpact scatter with traps/bargains
   labeled, engine weights vs. what a `league_history.csv` regression finds, per-team best/worst
   signing, wins-per-dollar ranking. Wall = podium + professor-stepped charts; laptops = scrollable
   debrief. **Note:** `trueWeights` in the payload currently ships only `{narrative,
   turnoverWeight, defenseVisible}` — the spec (§11.14) wants the full engine-weights-vs-regression
   comparison. Extend the payload before building the chart.
4. **Deploy** — real Firebase project, **Blaze plan required** (Cloud Functions aren't on Spark),
   anonymous auth, hosting. Everything today is emulator-only.
5. **Load drill** — actually stress 60–70 concurrent clients before betting a class on it.

---

## 5. Pre-class checklist (small, tracked, not yet done)

- **30-second manual drag QA** at `/game/lineup` — drag a bench guard onto a guard slot (should
  swap) and a wing onto a guard slot (should snap back). The dnd-kit gesture is **provably
  un-automatable** (4 independent attempts across 2 agents; synthetic pointer events don't satisfy
  its sensors). The underlying `place()` slot model is exhaustively unit-tested; only the gesture
  is unverified.
- **Prod `ss.gameId` persistence** — currently sessionStorage (per-tab). In production, auth
  persists in localStorage but `ss.gameId` does not, so a crashed laptop can't auto-resume. Decide
  localStorage persistence, paired with the taken-seat rejoin flow (already enabled: taken chips
  are clickable and the server arbitrates).
- **UI copy fix** — `app/src/lib/errors.ts` maps `STAR_TAKEN` to "Another team claimed this star
  first." That's wrong when a star's **own new owner** double-clicks sign (the claim gate fires
  unconditionally for everyone, by design). Better: "This star's claim has already been used this round."
- **Cap sessions at 21 franchises.** The `rounds/{r}` doc approaches Firestore's 1 MiB limit around
  28+ teams, and the >21-team balanced partial round-robin scheduler is **descoped**. A 70-student
  class at 3/team ≈ 23 franchises — so this is a real operational instruction for the professor
  material, not a footnote.

---

## 6. HARD RULES — adjudicated, do not re-litigate

These were each decided deliberately, several after review disputes. Violating them silently breaks
the pedagogy or the design.

- **Free agency is NON-EXCLUSIVE.** The FA market is a shared catalog of signable *copies*. Any
  number of teams may sign the same player; signing NEVER removes the row, greys it, or badges it
  "taken." The table is static within a phase. **Only auction stars are exclusive** (via an
  `unsold/{pid}` claim token). This removes click-race luck — the only constraint is your cap and
  your model.
- **Facts, never conclusions (spec §11).** Screens show raw stats and plain arithmetic, never value
  judgments, trend adjectives, or derived efficiency metrics. **Exactly two sanctioned exceptions:**
  the **wins-per-payroll-dollar** column on Standings, and the **Bargain of the Round** award
  (which names the winner and shows his *raw* stat line + salary — the wire carries a `perDollar`
  field that must **NEVER** be rendered).
- **No emojis anywhere in product UI.** `★ ▲ ▼ ½ ‹ ›` are glyphs and are fine. **Hype renders only
  as ★ glyphs, never numerically.**
- **Playstyle strings verbatim:** `Balanced`, `Run & Gun`, `3PT Barrage`, `Inside Attack`,
  `Lockdown`. Student-facing blurbs are exactly: "Play your normal game." / "Play fast. More
  shots." / "Shoot more threes." / "Feed your Big." / "Slow it down. Defend." Never re-worded, and
  **no derived synergy meters** on the lineup screen (that would leak the hidden model).
- **Recurring salaries, not lump sums.** A contract's rate is charged **every covered round**.
  Dead money on a cut persists for the round of the cut and every later covered round.
- **`advancePhase` callers must ALWAYS send `expectedPhase` + `expectedRound`.**
- **`submitBids` must always send a plain object** (`{}` to clear) — **never `null`** (destroys the
  stored bid set server-side).
- **Over-cap auction exposure is LEGAL** ("bid on everything, keep what resolves"). The exposure
  meter warns; it must never disable Lock in. Only min-bid/step violations block submission.
- **Bench order is the rule.** Only `bench[0]` and `bench[1]` play and generate box scores
  (`bench.slice(0,2)` in both engine and sim); roster spots 9–10 are inactive depth. The lineup UI
  makes this visible with separate "ACTIVE BENCH — these two play" and "INACTIVE DEPTH" zones.
- **Config knobs `config.cap` / `config.totalRounds` are decorative** — never expose as editable.
- **`games[].home/away` are teamIds; `boxCsv` `team`/`opponent` are display names.** Different
  conventions on purpose; join accordingly.
- **Mockup sample numbers are never authoritative** — recompute everything. Known mock errors are
  listed in spec §11 "Mockup errata."
- **HARD INVARIANT:** `joinGame` must RESOLVE before `setGameId(...)`. The game-doc listener never
  recovers from a `permission-denied`, so setting gameId pre-membership permanently strands the tab.

---

## 7. Key file paths

| What | Path |
|---|---|
| **Authoritative spec** | `docs/superpowers/specs/2026-07-14-salary-showdown-design.md` (422 lines) |
| Plan 1 (backend, executed) | `docs/superpowers/plans/2026-07-15-salary-showdown-backend.md` |
| Plan 2 (client, executed) | `docs/superpowers/plans/2026-07-16-salary-showdown-team-client.md` |
| **Process ledger (read this)** | `.superpowers/sdd/progress.md` — append-only, every task + review adjudication for Plans 1, 2 and the hardening session |
| Firestore contract | `games/salary-showdown/backend/SCHEMA.md` |
| Backend quickstart + callables | `games/salary-showdown/backend/README.md` |
| App quickstart | `games/salary-showdown/app/README.md` |
| Approved UI mockups | `.superpowers/brainstorm/59786-1784072265/content/{front-office-v5,free-agency-v2,star-auction-v2,set-lineup-v2,projector-shuffle}.html` |
| Generator dials | `games/salary-showdown/datagen/config.py` |
| Pitch deck (built 2026-07-23) | `~/Desktop/Salary-Showdown-Pitch.pptx` |

**`.superpowers/sdd/progress.md` is the single most valuable file for context** — it records every
task, every review verdict, every accepted minor, and every plan defect found and fixed. Note the
per-task report files in `.superpowers/sdd/` recycle names across plans and have been overwritten;
the ledger is the durable record.

---

## 8. Environment & commands (all verified)

```bash
# Emulators (Java is required and NOT on the default PATH)
cd games/salary-showdown/backend/functions
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu
# Ports: Functions 5101 · Firestore 8180 · Auth 9199 · Emulator UI 4100
# `firebase` is a GLOBAL binary. Project id: salary-showdown-dev

# Backend tests — against ALREADY-RUNNING emulators (preferred):
cd games/salary-showdown/backend/functions && npx vitest run       # expect 19 files / 115 tests
# Backend tests — booting their own emulator (ports must be FREE):
cd games/salary-showdown/backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" \
  firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"

# App
cd games/salary-showdown/app
npm run dev                        # Vite on port 5176 (--strictPort; 5173-5175 belong to other projects)
npx vitest run                     # unit: 7 files / 30 tests
npx vitest run -c vitest.integration.config.ts   # integration: 11 files / 12 tests (needs live emulators)
npm run audit:ui                   # UI-rules tripwire (emoji / config.timers / judgment language)
npx tsc -b

# Seed a demo game at any phase (leaves team "Alpha" fully open for you to claim)
npm run seed -- --to R1:FREE_AGENCY      # also R2:FRONT_OFFICE, R1:AUCTION, R1:LINEUP, R1:RESULTS, FINALE
npm run seed -- --to FINALE --fill all   # all teams bot-staffed
# prints gameId + joinCode; join at http://localhost:5176/?code=<JOINCODE>

# Data harness (regenerates the shipped dataset; fails closed)
cd games/salary-showdown/datagen && python3 generate.py   # expect all 11 checks PASS, byte-identical output
```

### Environment gotchas learned the hard way

- **The emulator's `firebase emulators:exec` will fail if a suite is already holding the ports.**
  Prefer running tests directly against a long-lived emulator instance and only use `exec` when
  ports are free.
- **The functions emulator hot-reloads on source change** — a test run immediately after an edit
  can flake once; re-run before investigating.
- **Browser-pane raw-coordinate clicks are unreliable** across tabs (a verified-center click landed
  on a `<p>`). Drive UI verification with `javascript_tool` and `element.click()` instead.
- **This machine has no LibreOffice and no `pdftoppm`** — pptx visual QA must be analytical.
- **`pip` is PEP-668 blocked** — use a venv (`python3 -m venv .venv`).
- Vite dev server has died between sessions more than once; just restart it.

---

## 9. Process that has been working (recommended to continue)

The whole project has been executed with the **superpowers** skills, and it has caught a lot:

1. **`superpowers:brainstorming`** → **`superpowers:writing-plans`** → save to
   `docs/superpowers/plans/YYYY-MM-DD-<name>.md`.
2. Execute with **`superpowers:subagent-driven-development`**: a fresh implementer subagent per
   task, then a **review gate** (spec compliance + code quality) on every diff before moving on.
3. Log every task completion + review adjudication to `.superpowers/sdd/progress.md`.
4. Finish with **`superpowers:finishing-a-development-branch`**.

**Model split that worked well (user's explicit preference):** **Sonnet** implementers for tasks
where the plan contains complete code (they are excellent faithful transcribers); a **stronger
model** for the review gates, for environment-fighting foundation tasks, and for any BLOCKED
re-dispatch. Across 16 Plan-2 tasks the gates caught **6 defects — every one authored by the plan,
zero by the implementers**, which is exactly what the split is for.

**Plans must be written for Sonnet executors:** complete code in every step, zero placeholders,
game rules restated inline wherever a "sensible" deviation is tempting, and a runnable verification
step ending every task (bias toward emulator-backed integration + browser checks with concrete
"what you should see" descriptions).

---

## 10. Frozen integration contracts (for any new client work)

**Callables** (all require anonymous auth; role enforced server-side):
`createGame({teamNames})` · `getLobby({joinCode})` · `joinGame({joinCode, teamId, role, displayName})` ·
`startSeason({gameId})` · `advancePhase({gameId, expectedPhase, expectedRound})` ·
`signPlayer({gameId, pid, years})` · `cutRosterPlayer({gameId, pid})` ·
`submitBids({gameId, bids})` · `submitLineup({gameId, lineup})`

**Error codes** — match on the **message**, not the kind (`BAD_YEARS` arrives as
`failed-precondition` from signPlayer but `invalid-argument` from submitBids):
`CAP_EXCEEDED:{round}:{payroll}` · `POSITION_LOCK` · `STAR_TAKEN` · `ALREADY_SIGNED` ·
`NOT_IN_MARKET` · `ROSTER_FULL` · `BAD_YEARS` · `MIN_BID` · `BID_STEP` · `NOT_IN_WAVE` · `BAD_RATE` ·
`PHASE_MISMATCH` · `BAD_PLAYSTYLE` · `DUPLICATE_PLAYER` · `NOT_ON_ROSTER` · `BAD_TEMPLATE` ·
`BAD_SHAPE`. Plus prose messages and a sixth HttpsError kind, `already-exists` (role seat taken).
The full map with student-facing copy is in `app/src/lib/errors.ts` and the Plan 2 Global Constraints.

**Money math** (mirrors of `backend/functions/src/payroll.js`, in `app/src/lib/money.ts`):
`r01(x) = round(x*10)/10` · `askPrice(base, r) = r01(base * 1.08^(r-1))` ·
`DISCOUNTS {1:1.0, 2:0.92, 3:0.85, 4:0.80, 5:0.75}` · `minBid(r) = r01(2.0 * 1.08^(r-1))` ·
`hypeCurve(h) = 2.0 + ((h-1)/4)^1.35 * 24` · cap check must pass in **every covered round**.

**New schema field from H-A:** `games/{gameId}.transition = {fromRound, fromPhase, toRound, toPhase}`
— present only while an advance's hooks are resolving; a leftover marker means a crashed advance and
the next `advancePhase` call adopts and finishes it. Documented in `SCHEMA.md`.

**Scale envelope:** ~6 snapshot listeners per client; the heaviest payload is `rounds/{r}` (~300–400KB
at 20 teams). Sealed bids mean **no live shared bid state** — never add a cross-team bid signal
(secrecy and scale both forbid it; a live top-bid ticker is what lagged a previous Bakery Bash session).

---

## 11. Deferred / parked (do NOT start without asking)

- **V2 game-design ideas the owner raised, still unscoped:** playoffs for the top *X* teams; making
  the **Coach** *be* the playstyle rather than picking it; a "summer training" phase. He explicitly
  said to leave these for now.
- Spec §14 parking lot: trades between class teams, performance-driven repricing, hot/cold streaks,
  injuries, durability, personality-with-teeth.
- The >21-team scheduler and the `rounds/{r}` doc-size work (see §5).

---

## 12. Suggested first moves

1. Read `.superpowers/sdd/progress.md` (especially the hardening section at the end).
2. `git status` and confirm you're on `salary-showdown-backend-hardening` @ `d72a377`.
3. Boot emulators, run the backend suite (expect 115 green) to confirm a sane baseline.
4. Attack §3 — the season-E2E listener stall — with `superpowers:systematic-debugging`.
5. Once green ×3, merge to `main` via `superpowers:finishing-a-development-branch`.
6. Then brainstorm + write **Plan 3** and execute it with the gated subagent workflow.

Ask before: pushing to GitHub (nothing has ever been pushed), starting V2 features, or changing any
rule in §6.
