# Salary Showdown — Full Verification Run (test plan)

**Date:** 2026-07-27 · **Tree:** `main` @ `c93959b` · **Target:** DEV stack (emulators +
local build). Prod: read-only checks only. **Mission:** systematic browser-level
verification of every surface × state — especially the never-browser-seen playtest-polish
features — plus cross-role/multi-tab behavior, error-state rendering, and a ranked UI
punch list, so Dylan's human pass covers only genuinely human things.

**Prime directives:** find problems, fix nothing without asking · never report the
adjudicated hard rules / accepted quirks / parked items (handoff §6 + playtest report) ·
evidence per check, not assertion · `git rev-parse HEAD` before any git op · no prod
writes, no deploys, no commits without approval.

---

## 0. Execution shape

- **I drive the one browser pane sequentially** (javascript_tool + `element.click()`;
  raw-coordinate clicks are unreliable; `window.open` navigates in place, so the
  projector is opened via the panel button and checked sequentially).
- **Identity model:** one browser profile = one anonymous uid = one claimed seat.
  Multi-role checks run by sequential re-auth: sign out + clear `ss.gameId` → fresh
  anonymous uid → claim a different OPEN seat. CLI identities
  (`_playtest-cli.mjs`, stable email/password uids) hold every other seat.
- **Agents:** Sonnet workers for mechanical work (CLI bot players, admin dumps, static
  greps, evidence collation); stronger-model passes for judgment (findings verification,
  report triage). Workflow fan-outs where tasks are independent; browser work never
  delegated (single pane).
- **Emulator lifecycle is mine:** fresh restart before the run; restart on the
  degradation signature (`Transaction lock timeout` / listener stalls); one flake
  right after a source edit = hot reload, re-run once. Pre-approved.
- **State engineering is via real callables** (seed script + CLI). ONE sanctioned
  exception, flagged for approval: a scratch **admin-write** used to inject a synthetic
  `transition` marker (exact SCHEMA.md shape) into a dev-emulator game to drive the
  stuck-advance button and the §3a client gate — the only way to hold that state long
  enough to photograph. Marked SYNTHETIC in the report.
- **Evidence convention:** every check ID gets ≥1 of: screenshot (scratchpad,
  `evidence/<ID>-*.png`), `read_page`/`get_page_text` excerpt, console-log dump,
  admin-dump JSON. The report references evidence by check ID.
- **CLI quirks are not product bugs:** raw catalog prices, raw error codes,
  `d.bargain` vs `d.awards.bargain`.

## 1. Phase 0 — Baseline (blocking gate)

| ID | Check | Evidence |
|---|---|---|
| BAS-01 | `git rev-parse HEAD` = c93959b; branch main; worktree sibling branches untouched | transcript |
| BAS-02 | Fresh emulator boot (Functions 5101 · Firestore 8180 · Auth 9199 · UI 4100) | curl 4100 |
| BAS-03 | Backend suite 24 files/168 green (from backend/functions) | vitest output |
| BAS-04 | App unit 14/69 · `tsc -b` clean · `audit:ui` clean 64 files | outputs |
| BAS-05 | Integration 18/30 green (live emulators; browser-transport pin intact) | vitest output |
| BAS-06 | Dev server up via preview (5176); seed `--to R1:FREE_AGENCY` prints gameId+joinCode | transcript |

Backend and integration suites run sequenced (not parallel) with a cool-down; a
lock-timeout red → emulator restart + rerun before investigating.

## 2. Phase 1 — Static hard-rule sweep (Workflow, Sonnet finders + my judgment)

Code-level tripwires that browsers can't prove exhaustively. All read-only greps.

| ID | Check |
|---|---|
| STA-01 | `perDollar` never rendered: every app/src usage site is types/wire only |
| STA-02 | Playstyle strings + 5 blurbs byte-verbatim at every render site |
| STA-03 | Hype renders only as ★ glyphs (no numeric hype anywhere in app/src) |
| STA-04 | DRP exclusion sites cross-check: validateSigning 9000+ reject · expiringPids · market draws · auction waves · bargain award · reveal scatter/best-worst — all six present in backend source |
| STA-05 | Every backend-thrown error code has an `errors.ts` student-copy entry (diff the sets) |
| STA-06 | advancePhase/setTimer call sites all send expectedPhase+expectedRound EXCEPT the panel stuck-advance raw site (exactly one) |
| STA-07 | submitBids call sites never pass null |
| STA-08 | Emoji sweep of app/src (sanctioned glyphs only) — independent of audit:ui |

## 3. Phase 2 — Surface × state browser matrix (me, sequential)

Seeded via `npm run seed -- --to <state>` (Alpha left open for the browser) unless noted.
Every surface additionally gets: **refresh-survival mid-phase** (hard reload → same
game/phase, no rejoin) and a **console-error sweep** (only sanctioned loud logs).
UI punch-list eyes on during every screenshot.

**State LOBBY (created live via panel):**
| ID | Check |
|---|---|
| LND-01 | Landing default render; Find game flow; `?code=` prefill |
| LND-02 | Bad join code → student-facing copy (not a raw code) |
| LBY-01 | Team pick → role claim → display name → lobby renders seats |
| LBY-02 | Taken-seat negative: fresh uid taps a claimed seat → "already taken" copy; SAME uid re-tap → re-admitted |
| LBY-03 | Two-tab same-seat live sync (second tab follows) |

**State R1:FREE_AGENCY (Draft Night):**
| ID | Check |
|---|---|
| FA-01 | FA table renders; asks are inflated `askPrice(base, r)` — spot-verify 3 rows against catalog dump |
| FA-02 | Non-exclusive: table static after signing (no removal/grey/"taken") — sign via CLI from a rival, confirm browser table unchanged |
| FA-03 | Sign flow in UI → roster panel updates live; payroll math updates |
| FA-04 | Cut flow → dead money renders |
| FA-05 | Error copy in real UI: ALREADY_SIGNED (re-sign own player) · CAP_EXCEEDED (engineer near-cap roster via CLI first, includes round+payroll numbers) · ROSTER_FULL (fill to 10) |
| FA-06 | "We're done" (GM) → panel light flips; done ≠ lock (can still sign after) |
| FA-07 | Scout + Coach read-only views (sequential re-auth) |
| FA-08 | Unsold auction star appears in a later round's market at `unsoldPrices` list price and IS exclusive (STAR_TAKEN on second signer via CLI; browser copy check) — folded into Phase 4 game |

**State R1:AUCTION:**
| ID | Check |
|---|---|
| AUC-UI-01 | Wave renders (stars, positions, hype as ★); Scout bid entry |
| AUC-UI-02 | MIN_BID / BID_STEP validation surfaces student copy (client- or server-side, either is fine — copy must be the mapped one) |
| AUC-UI-03 | Over-cap exposure meter warns but Lock in stays ENABLED (hard rule) |
| AUC-UI-04 | Submit → panel light; resubmit = last-write-wins (CLI dump) |
| AUC-UI-05 | PHASE_MISMATCH copy ("The phase just closed.") — submit after panel advances |

**State R1:LINEUP:**
| ID | Check |
|---|---|
| LIN-01 | Slots render; ACTIVE BENCH ("these two play") vs INACTIVE DEPTH zones present |
| LIN-02 | Playstyle blurbs byte-verbatim; no synergy meters |
| LIN-03 | Submit via CLI → browser reflects locked lineup; refresh keeps it |
| LIN-04 | (Drag gesture NOT attempted — documented un-automatable) |

**State R1:RESULTS (seed `--to R1:RESULTS`):**
| ID | Check |
|---|---|
| RES-01 | Record, BEST WIN / WORST LOSS cards correct vs rounds/1 dump |
| RES-02 | Awards carousel: MVP, Top Scorer, Bargain — bargain shows raw line + salary, NEVER perDollar |
| RES-03 | Box lines: all 23 columns, own team only, horizontal scroll container |
| RES-04 | CSV download: byte-identical to `rounds/1.boxCsv` (capture blob) |
| RES-05 | **NEW auction table**: every wave star in wave order, Name·Pos·winner·rate·years or Unsold; content matches `auctions/1.results` dump |
| RES-06 | Standings table + W/$ column (sanctioned exception) matches round doc |

**State R2:FRONT_OFFICE:**
| ID | Check |
|---|---|
| FO-01 | Expiring deals list; re-sign discount pricing spot-check (DISCOUNTS incl. 4yr max at R2 — 5yr absent) |
| FO-02 | Cut → dead money persists in payroll displays for covered rounds |
| FO-03 | GM-only actions; Scout/Coach views read-only |

**Standings / Simulate / Finale:**
| ID | Check |
|---|---|
| STD-01 | /standings mid-season state |
| SIM-01 | Student /game/simulate during flood; "Round complete." |
| FIN-01 | FINALE (seed `--fill all`): laptop debrief — scatter w/ traps+bargains labeled, engine-vs-regression weights, per-team best/worst, wins-per-dollar |
| FIN-02 | Reveal gate: reveal/latest unreadable pre-finish (covered by rules tests; browser check = conclusion route locked pre-FINALE) |

**Empty/partial states:** joined-but-alone team · team with zero signings at each
surface · Results with a wave where every star sold (no Unsold rows) — captured
opportunistically with IDs EMP-01..n.

## 4. Phase 3 — DRP deep-dive (headline new feature)

Custom game: browser claims a team, deliberately signs short (missing positions),
advance out of FA → hardship fires. Then, across a full defaults-driven season:

| ID | Check |
|---|---|
| DRP-01 | Roster surfaces show "Default Role Player" by name at $0/rd |
| DRP-02 | Payroll display stays ≤ cap — no apparent breach anywhere |
| DRP-03 | Lineup screen lists DRP; lineup containing DRP submits (CLI) and simulates |
| DRP-04 | Box lines + downloaded CSV carry DRP rows by name with stats |
| DRP-05 | FA table NEVER lists a DRP (UI scan + market dump every round) |
| DRP-06 | FO expiring list excludes DRP 1-round deals |
| DRP-07 | Awards never name a DRP across all 5 rounds (admin dump each round) |
| DRP-08 | Reveal: no DRP in scatter/best-worst; W/$ spend unaffected by $0 deals |
| DRP-09 | Re-issue: next round's hardship re-signs the same pid after expiry |
| DRP-10 | `signPlayer` pid 9001 via CLI → clean named rejection (server guard) |

## 5. Phase 4 — Auction transparency deep-dive

One engineered game (CLI rivals + browser team), possibly across 2 rounds, hitting
every resolution shape. Bids computed from payroll dumps first, then placed.

| ID | Check |
|---|---|
| AUC-01 | Normal win → public row winner/rate/years correct to the cent |
| AUC-02 | Zero-bid star → Unsold row |
| AUC-03 | Cap-skip: browser team's top bid unaffordable → publicly Unsold + own-team note "(salary cap)" |
| AUC-04 | Roster-full skip → note "(roster full)" |
| AUC-05 | Fall-through: top bid skipped, runner-up wins → winner public + skipped team STILL gets its note |
| AUC-06 | Rival invisibility: rival roles see no note (browser as rival; rules also deny the read — network tab) |
| AUC-07 | All three own-team roles see the note (sequential re-auth GM→Scout→Coach) |
| AUC-08 | Public table never distinguishes no-bid vs skipped; wave order preserved |
| AUC-09 | Skip note is round-stamped: after the NEXT round's results, the old note is gone |

## 6. Phase 5 — Professor panel, timers, recovery

| ID | Check |
|---|---|
| PRF-01 | Create session; 22-team block with exact cap copy; join code in header |
| PRF-02 | Resume by game id on a "different browser" (cleared storage); Clear session recovers a dead/foreign gameId |
| PRF-03 | Timer start/pause/resume/+30s/clear propagate to panel+wall+student ≤ ~2s; submission at 0:00 still accepted (advisory rule) |
| PRF-04 | Auto-arm + edited defaults persist across panel reload; a cleared timer does NOT re-arm |
| PRF-05 | Auto-advance fires at 0:00 |
| PRF-06 | Advance modal names exactly the missing teams; Advance anyway applies server defaults; final advance shows season-end confirm copy |
| PRF-07 | SYNTHETIC stuck advance (injected transition marker): Resolve button appears after ~10s; §3a gate holds student screens + walls on the OLD phase while marker present; resolve completes and screens follow |
| PRF-08 | Submission lights across FO/FA (markDone), AUCTION (bids), LINEUP (locks) |
| PRF-09 | CSV export: captured file has single header, all rounds, joins vs rounds docs |
| PRF-10 | Cap/rounds knobs render decorative, not editable |

## 7. Phase 6 — Bigscreen walls (via panel "Open projector", sequential)

| ID | Check |
|---|---|
| BSW-01 | LobbyWall: giant code, join line, live "X of N seats" as a seat is claimed |
| BSW-02 | DecisionWall: name-sorted grid, dots only (no bid contents), timer strip |
| BSW-03 | SimulateFlood: pacing, then "Round complete." |
| BSW-04 | StandingsShuffle: bottom-up ~0.8s rows, ▲/▼/—/NEW glyphs; R5 slowdown + top-3 shroud (observed during Phase 7 season) |
| BSW-05 | FinaleWall: bs-* scale, follows revealStep 1→5 |
| BSW-06 | Desktop-preset screenshots of every wall for the punch list (projector-scale judgment stays human) |

## 8. Phase 7 — Full-season live E2E in the real UI

4 teams: **Alpha = browser** (me), 3 CLI bot teams (Sonnet background agents with
distinct briefs, reusing the playtest CLI). **Professor = panel tab** (me). Play
R1→R5→FINALE at a realistic pace: every phase screen visited live each round,
walls opened at Simulate/Results, zero-console-error bar post-join, reveal stepped
1→5, CSV exported. This is also where BSW-04's R5 behavior and §3a hold-then-follow
get observed organically. Evidence: per-round screenshot set + final console dump +
season CSV.

## 9. Phase 8 — Prod read-only checks (no writes, no smoke season)

| ID | Check |
|---|---|
| PRD-01 | https://salary-showdown.web.app returns the app (200, correct title) |
| PRD-02 | Served bundle is PRE-polish: new-feature markers ('Star Auction · Round', auction-results testid) absent from prod JS; present in local build |
| PRD-03 | /professor and /bigscreen routes load; nothing created |

## 10. Phase 9 — Verification + deliverables

1. **Adversarial verify pass** (Workflow, stronger model): every candidate finding is
   attacked — Is it on the adjudicated/accepted/parked list? Is it a CLI/harness
   artifact? Does it reproduce twice? Only survivors are reported.
2. **Findings report** → `docs/superpowers/playtests/2026-07-27-verification-run.md`
   (committed only after approval): real bugs / design questions / UI-polish
   candidates / working-as-designed, each with check-ID evidence.
3. **UI punch list for the human pass**: ranked (P1 blocking-feel → P3 nice), each item
   with a screenshot, plus the provably-untestable list (dnd-kit drag; visual taste;
   projector physical look; real phones/cellular; prod smoke season pending OK).
4. **Ledger**: one-line records appended to `.superpowers/sdd/progress.md` at
   milestones (never `git add` it).

## 11. Risks / known constraints

- Emulator degradation mid-run → restart + re-verify protocol (pre-approved).
- Single browser profile → sequential role checks (planned, slower).
- Auction skip engineering needs exact cap arithmetic → compute from dumps before bidding.
- Sibling worktrees can transiently break `rev-parse` → retry once, never touch their branches.
- Timer-propagation timings in the pane are approximate; only order-of-seconds claims made.
