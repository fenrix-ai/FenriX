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
| Current branch | `salary-showdown-plan3b` (Plan 3b, exit battery 2026-07-26; Plan 3a merged to `main` @ `92c7616` + handoff sync `7c659f3` on 2026-07-25) |
| Plan 3b HEAD | **`9c0140e`** (3a-backlog fixes + prod wiring + first production deploy + prod smoke + load drill + professor runbook) |
| `main` vs `origin/main` | **Pushed to GitHub 2026-07-24** (`fenrix-ai/FenriX`, PUBLIC — Dylan's explicit call, made knowing the repo carries `datagen/private/` answer key + the full spec; see §2a) |
| Production | **LIVE** — Firebase project `salary-showdown` (Blaze), Hosting `https://salary-showdown.web.app`, 12 callables + `(default)` Firestore in `us-west1`, anonymous auth on, $10 email budget alert armed (Dylan to verify, §4) |
| Backend test suite | **23 files / 150 tests green** |
| App unit suite | **13 files / 65 tests green** |
| App integration suite | **17 files / 29 tests green ×3 consecutive** (live emulators; browser-transport pin per §3) |
| UI-rules audit | clean, 64 files |

### 2a. Publication note (2026-07-24)

`main` was pushed to the **public** repo `fenrix-ai/FenriX` at Dylan's explicit direction, with the
trade-off surfaced first: the push includes `games/salary-showdown/datagen/private/`
(`engine_params.json`, `hidden_attributes.csv` — the answer key), the design spec, and the
generator, all of which reveal the hidden model. Dylan accepted the exposure. If that stance ever
changes, treat the content as already seen — rotating the dataset seed/dials in `datagen/config.py`
and regenerating is the honest remediation, not deleting files from history.

Unrelated pre-existing dirt in the working tree (NOT yours, leave alone): `quant_finance/README.md`
modified, plus untracked files under `games/bakery-bash/`, `quant_finance/local_llm/`, and a stray
`image (2).png`.

### Hardening branch commits (merged to `main` fast-forward 2026-07-23)

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

### What was DONE on the hardening branch (merged to `main` 2026-07-23)

4. **Backend hardening** — the four "fix-before-class" items from the original review:
   - **H-A**: `advancePhase` rewritten as **transactional flip-first with a `transition` resume
     marker**; `submitBids`/`submitLineup` made transactional. Closes the double-click
     double-resolution race, the FA-close hardship race, and the last-second-submit TOCTOU.
   - **H-B**: live box-score scaling corrected to the history file's binding **1.25 × tier-weight**
     model (was a minutes-ratio, ~+29% inflated). Restores live-vs-history fingerprint parity.
   - **H-C**: sold-then-released auction stars now **re-enter the FA rotation** as unsold claims.

---

## 3. ✅ RESOLVED (2026-07-23) — the season-E2E listener stall

**Root cause: the integration suite was driving a transport the product never ships, and that
transport is broken against the Firestore emulator. Nothing in our code was at fault.**

The causal chain, proven end to end:

1. **Wrong transport.** Vitest resolves modules with Vite's *server* conditions, which drop
   `browser`; and `@firebase/firestore`'s exports map lists `node` **before** `browser`. So
   `firebase/firestore` resolved to `dist/index.node.mjs` — the **gRPC** build. Students' laptops
   run the browser build over **WebChannel**. (A `resolve.conditions` tweak cannot fix this: `node`
   wins on order. Only an explicit alias can.)
2. **The emulator emits a malformed frame.** `cloud-firestore-emulator v1.20.4` loses a
   `ListenResponse` framing race on the commit→notify path. Its own log carries the proof:
   `INTERNAL: Failed to frame message` caused by
   `java.lang.IllegalStateException: knownLengthPendingAllocation reached 0`, at
   `ListenStreamManager.notifyDocumentListeners → CloudFirestoreV1ListenStream.notify →
   MessageFramer.writeKnownLengthUncompressed` (i.e. the proto's serialized size changed between
   `getSerializedSize()` and `writeTo()`). Timestamps match client-side failures to the second.
3. **The client stream desynchronises.** Its gRPC `StreamDecoder` reads protobuf payload bytes as a
   length prefix: `RESOURCE_EXHAUSTED: Received message larger than max (704834055 vs 4194304)` —
   a different garbage value every time (`0x2A02EA07`, `0x170A0C70`, … all protobuf field tags).
4. **Firestore then goes silent, by design.** Stream-level failures are classified retryable: the
   `onSnapshot` **error callback is never invoked** (only server-sent per-target errors reach it),
   backoff climbs to its **60 s maximum**, and there is **no watchdog for an open-but-silent
   stream**. Snapshot delivery simply stops. The 20–30 s `waitFor` expires first.

`season.itest.tsx` was the sole victim because it is the only test holding one long-lived,
multi-target Listen stream across a whole season of rapid commits.

**Direct evidence** (instrumented run): `[DIAG +635ms] game-doc SNAP 0:LOBBY` was the *only*
game-doc snapshot ever delivered; then `RESOURCE_EXHAUSTED` + `Using maximum backoff delay`; then
silence, with **no** `game-doc ERROR` line.

All three prior hypotheses are dead:

- **H1 (undisposed harness clients) — FALSE.** Each itest file runs in its **own forked process**
  (distinct PIDs verified in the logs; vitest pool `forks` + `isolate: true`), so apps cannot
  accumulate across files. `newClient()` creates **no Firestore instance at all** (Auth + Functions
  only). `season.itest.tsx` run alone passed **8/8** with zero stream errors.
- **H2 (the hardening design) — cleared *for this failure mode*.** Zero app files changed on this
  branch, and the defect is in the emulator's gRPC framing on the generic commit→notify path, which
  any write can trigger. (A first `main`-vs-branch A/B appeared to confirm this at 3/8 vs 5/9, but
  that run was **contaminated** — swapping backend sources hot-reloads the functions emulator and
  those three `main` failures were `FirebaseError: INTERNAL` callable errors, a different signature.
  **That comparison is retracted.** The transport fix's 10/10 + 3/3 result stands on its own.)
  H2 is *not* cleared for the separate defect in §3a below.
- **H3 (long-polling) — MOOT twice over.** The WebChannel build was never loaded, and
  `experimentalAutoDetectLongPolling` **already defaults to `true`** in this SDK version.

**The fix** (`games/salary-showdown/app/vitest.integration.config.ts`): pin the browser build with
an explicit alias plus `server.deps.inline` (the alias only bites if Vite, not Node's own ESM
loader, resolves). The suite now drives the **same WebChannel transport the classroom uses**.
**Test-config only — no product code changed.** `vite.config.ts` (dev server + unit tests) is
untouched; the browser already resolved the browser build naturally.

Result: **10/10 green**, then **3/3 consecutive green** on the final tree, versus 5/9 failing before.
`src/itest/transport.itest.ts` is a permanent tripwire that fails loudly if the pin ever stops
matching (e.g. a firebase upgrade renaming a dist file) — otherwise the suite would silently slide
back onto gRPC and the flake would return looking like a fresh mystery.

**Not a classroom risk.** Production talks to real Firestore over WebChannel; this defect is
emulator-only, on a transport the product never uses.

## 3a. ✅ RESOLVED (2026-07-23) — flip-first made a phase visible before its data existed

**Found while verifying §3's fix. Adjudicated by Dylan: option 1 — clients gate on the
`transition` marker.** Implemented in `GameContext.tsx` (the game-doc listener presents
`transition.fromRound/fromPhase` while the marker is set, so every screen keeps rendering the
fully-materialised phase until both hooks land); `transition.itest.tsx` pins the contract by
writing the exact mid-flight wire states and asserting hold-then-follow, with a mutation canary
proving the test fails against the ungated client. No backend change — flip-first and every race
it closed are untouched. Original investigation record follows.

H-A rewrote `advancePhase` as **flip-first**: one transaction writes the new `round`/`phase` (plus
the `transition` marker), and *only then* do the exit and enter hooks run
(`games/salary-showdown/backend/functions/src/game.js:188-199`). `main` did the opposite —
exit hook → enter hook → **then** write the phase (`git show 9e9cc80:…/game.js:149-156`).

Consequence: the enter hook is what *creates the phase's data* — `auctions/{round}` for AUCTION,
the `market/{round}` draw for FREE_AGENCY, `rounds/{r}` for SIMULATE. Under flip-first every client
is routed to the new screen **before that document exists**, and must rely on receiving the
creation snapshot afterwards.

**Measured, clean A/B** (emulator fully restarted per arm — no hot-reload contamination; measured
directly via the wave listener, so it does not depend on the rare failure reproducing):

| backend | wave-listener subscribes | saw `auctions/{round}` **missing** | season.itest failures |
|---|---|---|---|
| `main` (hooks-then-flip) | 25 | **0** | 0 |
| this branch (flip-first) | 21 | **14 (67%)** | 1 |

**Why it bites.** `AuctionPage`'s wave listener
(`games/salary-showdown/app/src/pages/AuctionPage.tsx:30-34`) has **no error callback**, and its
deps are `[gameId, round]` — so it never re-subscribes. If the creation snapshot is missed, `wave`
stays `null` and `AuctionPage` returns `null` forever: **a permanently blank screen with nothing
logged.** Confirmed directly — instrumented run showed `SNAP exists=false`, then silence for 20 s,
while an admin read proved the server had `auctions/1` with all five stars, `enter-1-AUCTION` in
the hooklog, and `transition: null` (i.e. the backend did everything correctly).

**Severity — read carefully, do not over-read.**
- Against **real Firestore**, a listener on a missing document reliably receives the later creation
  (that is what read-times/resume-tokens are for), so the expected production symptom is a **brief
  blank screen**, not a permanent one. The permanent case here is the emulator's weaker watch
  implementation — the same family as §3's framing race. This has **not** been verified against
  real Firestore.
- But the *window itself* is created by our design and is real in production: students will be
  routed to Star Auction / Draft Night / Simulate before that phase's data exists.
- The missing error callbacks are a genuine product resilience gap regardless of who is at fault.

**Options adjudicated (Dylan chose 1):**
1. **CHOSEN — gate on the `transition` marker.** The backend already writes the marker with the
   flip and deletes it after the enter hook; the client now treats `transition != null` as "this
   phase is still being set up" and holds the previous screen. Keeps every race H-A closed;
   removes the visible window. (`startSeason` needs no gate — its market draw and phase flip
   commit in one batch.)
2. Keep flip-first; harden the clients only (error callbacks + re-subscribe + explicit "setting
   up…" states). Not chosen as the fix; the listener-resilience gap remains a Plan 3 polish item.
3. Revert to hooks-then-flip — reopens the races H-A closed. Rejected.

### Known residue: the emulator degrades under sustained load

The same emulator throws `10 ABORTED: Transaction lock timeout` under back-to-back suite runs, which
makes the **backend** suite intermittently red (measured **2 of 6** consecutive runs; 115/115 green
on the other four). This is **pre-existing, not new**: the emulator log carries 18 such timeouts
dated Jul 17 (the original hardening session) alongside 345 from the 2026-07-23 stress runs. It is
also emulator-side, not a logic regression — the failures are lock timeouts, never assertion
failures. If the backend suite goes red, **restart the emulator and re-run before investigating.**

---

## 4. Plan 3 status — 3a DONE (2026-07-25), 3b DONE (2026-07-26)

**Plan 3a (classroom surfaces) is COMPLETE and merged** — `main` @ `92c7616`, 14 gated tasks
(spec: `docs/superpowers/specs/2026-07-24-salary-showdown-plan3-classroom-design.md`, plan:
`docs/superpowers/plans/2026-07-24-salary-showdown-plan3a-classroom.md`). The professor panel
(`/professor`), projector (`/bigscreen`), and the Finale/Reveal all exist, are itest-covered
(backend 23 files/150 · unit 60 · integration 16 files/26), and passed a controller-driven
full-season dress rehearsal in real Chrome. The whole-branch review's triaged 3b-start backlog
lives in `.superpowers/sdd/progress.md` (top items: resolve-stuck-advance affordance,
Clear-session button, useRoundDoc error callback, FinaleWall type-scale rewrap, RoundContext
rounds/{r-1} sourcing during decision phases).

**Plan 3b (production) is COMPLETE (2026-07-26)** — 8 gated tasks on `salary-showdown-plan3b` @ `9c0140e`:
the triaged 3a-start backlog (stuck-advance resolve button, Clear session, RoundContext
rounds/{r-1} sourcing during decision phases, FinaleWall bs-* rewrap, shared STEP_TITLES,
useRoundDoc error callback, CSV anchor fix, armed-key persistence), prod wiring (functions +
client + itest harness pinned to `us-west1`, hosting block, `.env.production.example`,
team-client `ss.gameId` sessionStorage → localStorage), first production deploy (project
`salary-showdown`, Blaze, `https://salary-showdown.web.app`, anonymous auth, $10 budget
alert), scripted prod smoke (`games/salary-showdown/app/scripts/prod-smoke.mjs`, all checks
PASS; manual checklist in `docs/superpowers/salary-showdown-prod-smoke.md`), the 63-client
load drill (report: `docs/superpowers/loadtests/2026-07-26-load-drill.md` — the class-date
gate), and the one-page professor runbook (`docs/superpowers/salary-showdown-RUNBOOK.md`).
Exit battery: backend 23/150 · unit 13/65 · integration 17/29 ×3 consecutive · `tsc -b`
clean · `audit:ui` clean (64 files).

**Still MANUAL for Dylan (nothing else remains):** (1) the 30-second drag QA at
`/game/lineup` on the DEPLOYED app — the dnd-kit gesture is provably un-automatable (§5);
(2) a deployed dress rehearsal — panel on the laptop, projector via Open projector, phones
joining over `https://salary-showdown.web.app`; (3) verifying the $10 budget alert is armed
in the Billing console and the alert email arrives; (4) the class-date decision, gated on
the load-drill report's verdict.

**3b facts locked 2026-07-25:** Firebase project **`salary-showdown`** (number 713437533994)
exists and **Blaze billing is PAID/ON** (Dylan confirmed). Region decision: **us-west1** for
Firestore AND Functions (co-located; client pins `getFunctions(app, 'us-west1')`). Console state
at planning time was a clean slate: no apps, Firestore API disabled, no resource location — the
3b plan provisions everything. Cost expectation set with Dylan: <$1 per class session or load
drill, $0 idle, $10 budget alert as tripwire (alerts don't hard-stop spend). CLI on this machine
is logged in and can see the project. `.firebaserc` default stays `salary-showdown-dev`; deploys
use an explicit `prod` alias.

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
4. **Deploy — DONE (3b).** Firebase project `salary-showdown` (Blaze), functions + Firestore in
   `us-west1`, anonymous auth, rules + indexes deployed, hosting at `https://salary-showdown.web.app`.
5. **Load drill — DONE (3b).** 63 web-SDK clients (21 franchises × 3 roles) against prod on
   classroom pacing; per-criterion verdicts in `docs/superpowers/loadtests/2026-07-26-load-drill.md`.

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
npx vitest run -c vitest.integration.config.ts   # integration: 13 files / 14 tests (needs live emulators)
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
  can flake once; re-run before investigating. (Verified again 2026-07-23: 4 files "failed"
  immediately after a source swap, then 19/19 green on a clean re-run.)
- **A long-lived emulator degrades.** The instance behind the 2026-07-23 investigation had been up
  **six days**. It throws `Transaction lock timeout` under sustained load (§3 residue) and its
  `ListenResponse` framing race is load-sensitive. Restart it before any measurement you intend to
  trust, and prefer a fresh instance for pre-class rehearsals.
- **The integration suite must stay on the browser Firestore build** — `src/itest/transport.itest.ts`
  enforces it. See §3 for why; do not "simplify" the alias out of `vitest.integration.config.ts`.
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
**Client contract (§3a):** while the marker is present, `GameContext` presents
`fromRound`/`fromPhase` — screens keep rendering the phase whose data exists, and follow only when
the marker clears. Any new client surface (professor panel, projector) must do the same or read the
marker deliberately.

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
