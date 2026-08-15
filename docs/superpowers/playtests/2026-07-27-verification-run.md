# Salary Showdown — Full Verification Run (2026-07-27)

**Tree:** `main` @ `c93959b` (plan committed at `be228e1`) · **Target:** DEV stack (fresh
emulators + local build); prod read-only only. **Plan:**
`docs/superpowers/plans/2026-07-27-salary-showdown-verification-run.md` — all 10 phases
executed. Every candidate finding below survived an adversarial verification pass
(9 independent refutation agents); adjudicated hard rules, accepted quirks, and parked
items were excluded throughout.

**Baseline:** backend 24 files/168 · app unit 14/69 · integration 18/30 · `tsc -b` clean ·
`audit:ui` clean 64 files — all green at the exact expected counts on a fresh emulator boot.
**Prod:** salary-showdown.web.app serves the PRE-polish bundle (polish markers absent,
pre-polish marker present); /professor and /bigscreen 200. No prod writes were made.

**Scale:** ~120 discrete checks across 4 games (2 seeded, 1 engineered 3-team panel game
driven R1→FINALE through the real professor panel, 1 seeded FINALE game), 4 browser tabs
(GM/Scout/rival-Coach/professor+walls), 8 CLI identities, 2 verification workflows
(8 static-sweep agents + 9 finding-verifiers). Zero student-tab console errors across the
entire live season.

---

## 1. REAL BUGS / GAPS (fix-worthy; none touched — your call)

### 1.1 Professor cannot resume on a different browser — the runbook's disaster-recovery row is illusory
The RUNBOOK says: *"On a different browser: paste the game id from your recovery note into
Existing game id, press Resume."* That path does not work and cannot work as built:
professor identity is the anonymous uid captured at `createGame` (`professorUid`), rules
grant professor reads to that uid only, and no callable ever rebinds it. A different
browser = a new anonymous uid → the panel hangs forever on "Connecting to session…" with
permission-denied on all three listeners (loudly logged, but no user-facing explanation).
**Repro:** fresh-identity tab + game id + Resume → permanent hang (screenshot in session).
**Consequence:** if the professor's laptop dies mid-class, there is no path to regain
control of the game — `advancePhase` is professor-only. Same-browser recovery (reopen tab /
reboot with persisted browser data) works and was verified.
**Verifier additions:** the Clear-session escape does render under "Connecting to
session…", but it only returns to the create/resume view — never to control. One
out-of-band emergency workaround exists: manually editing `games/{gameId}.professorUid`
in the Firebase console (owner access only, undocumented, and needs a page reload since
the cancelled listeners never retry).
**Candidates:** correct the runbook row (honest: "same browser only — do not lose the
laptop", plus the console workaround as the true emergency path), and/or add a recovery
mechanism (e.g. a professor key printed at create that a callable can redeem to rebind
`professorUid`). Severity: the trigger is rare, but this is the one scenario the recovery
kit exists for. **[HIGH — verifier CONFIRMED]**

### 1.2 `npm run seed` is broken — missing us-west1 region pin (repo tooling)
`app/scripts/seed-demo.mjs:41` calls `getFunctions(app)` with no region; the plan-3b T3
region move (2026-07-26) pinned `_playtest-cli.mjs`, `prod-smoke.mjs`, and the itest
harness to `us-west1` but missed the seed script, so every callable dies with
`functions/not-found`. One-line fix. Verified live (seed worked immediately once a patched
copy added the region); the verifier independently re-reproduced both failure and fix
against the committed script. **[MEDIUM — dev tooling, documented "verified" workflow
broken; verifier CONFIRMED]**

### 1.3 `seed-demo.mjs` crashes on synthetic pids — broken since the DRP redesign (repo tooling)
`arrangeLineup()` reads `byPid[pid].mins_per_game` / `.position` where `byPid` is built
from `players.json` (the 175 real players). Hardship now places synthetic pids (9001+) on
bot rosters at round boundaries → `TypeError` on undefined → any target crossing a
bot-hardship boundary dies (`--to FINALE`, `--fill all` past R2:LINEUP…). Verified live;
fixed in a scratch copy with a pidInfo fallback (900x=G/901x=W/902x=B, mins 0). The
verifier re-reproduced it independently (crash requires a target past a round-2+ LINEUP;
the server merges synthetics into its catalog at game.js:29 — the seed script never did).
**[MEDIUM — dev tooling; both 1.2 and 1.3 need fixing for the documented seed workflows
to work at all; verifier CONFIRMED]**

### 1.4 RUNBOOK says the GM places the auction bid — the server enforces Scout (doc drift)
Runbook per-phase table: *"Star Auction — GM places one sealed star bid."* Server:
`submitBids` requires role **Scout** (`memberWithRole(..., 'Scout')`, game.js:433);
SCHEMA.md agrees. On class day the professor would misdirect students hunting for the bid
button. One-word doc fix. **[MEDIUM — professor-facing doc, class-day confusion;
verifier CONFIRMED]**

### 1.5 No path back to the join form while a membership exists
`PhaseRouter.tsx` bounces every route except `/standings` to the current phase screen
whenever game+membership exist. Verified live: `/?code=NEWCODE` with an active membership
bounces into the old game, code ignored. Consequences: (a) in PROD (auth persists via the
SDK's default IndexedDB local persistence — the session-persistence override is DEV-gated;
`ss.gameId` persists in localStorage) a browser that ever joined a game cannot join a
different game from its normal profile — incognito/second-profile or clearing site data
are the workarounds; matters iff any device joins two games (rehearsal then class, two
sections, next term); (b) the prod-smoke manual checklist step *"open the join page again,
pick the same team and tap your OWN seat"* is unreachable as written — the same browser
that "lands straight back in the game" (that half is correct behavior) can never keep the
join page mounted; the re-admit path can only fire pre-membership. **[MEDIUM if devices
are ever reused across games; LOW for a single-session term. Checklist step needs
rewording either way — verifier CONFIRMED]**

### 1.6 Teammates' lineup screens go stale after the Coach submits
`LineupPage` seeds its local arrangement from `team.lineup` at mount only: a GM/Scout tab
that is already on `/game/lineup` keeps showing its local auto-arranged draft (wrong
playstyle highlighted, wrong slots) after the Coach locks a different lineup, until hard
refresh. There is also no team-visible "lineup locked" indicator anywhere on the screen
(only the professor's submission light reads `lineupLockedRound`). Verified live (Coach
locked Lockdown via callable; GM tab kept showing Balanced until reload). **Verifier
additions:** the team doc DOES stream live into the page's context — the UI discards it
(`|| slots` seed guard), and `AuctionPage` live-subscribes to the Scout's stored bids, so
this deviates from the app's own teammate-visibility pattern (oversight, not design). Any
remount fixes it (Standings round-trip, phase flip), and `lineupLockedRound` is already
public client-side, so a "locked" badge needs no backend change. **[LOW — classroom
confusion bounded to the ~90s phase; verifier CONFIRMED]**

### 1.7 Zero-spend team ranks #1 in Wins-per-dollar with a degenerate "1.000"
A team whose whole season is $0 hardship deals appears in the finale W/$ ranking as
"1.000 · 1 W · $0.0M committed" and ranks first — the `Math.max(1, spend)` guard
(game.js:763, plan-authored, so a display improvement rather than a regression) clamps
$0 to $1M, making the row claim "1 win per $M" beside "$0.0M committed" and topping
realistic ratios (~0.004–0.064) by ~15×. The adjacent best/worst table handles the same
team correctly ("—" / "No signings on record."). Requires a never-signs team that wins
≥1 game (0-win zero-spend ranks last) — realistic only for an abandoned franchise, which
the bimodal margins make able to steal a game. Fix: emit null below the clamp and render
"—" like its sibling. **[LOW — edge case; verifier CONFIRMED]**

### 1.8 DEV-ONLY: second-tab join strands on the seat picker until reload
Dev auth is per-tab (`browserSessionPersistence`) while `ss.gameId` is shared localStorage.
A second tab boots with gameId set + no membership → terminal permission-denied listeners;
after `joinGame` succeeds, `LandingPage:41 setGameId(sameValue)` bails in React — and the
listener effects key on `[gameId]`/`[gameId, uid]`, both unchanged, so even a forced
re-render would not resubscribe (a real fix targets the subscription lifecycle, e.g.
resubscribe after joinGame or an own-membership-doc read rule). Stranded on the picker
(seat IS claimed) until manual reload. Repro'd 3× deterministically. Prod immune to this
trigger (shared auth → membership at mount); a rare prod cousin exists if auth state is
ever lost while `ss.gameId` persists. The `GameContext.tsx:24-28` comment claims multi-tab
dev playtesting "still works" — overstated (each extra tab works only after one manual
reload when the join happened in that tab). **[LOW — dev workflow + comment truth;
whoever playtests locally will hit it; verifier CONFIRMED]**

## 2. DESIGN QUESTIONS (your call, small — all verifier-CONFIRMED as non-adjudicated)

- **2.1 Numeric hype tooltip inside the sanctioned reveal.** `ScatterTI.tsx:44` per-point
  hover tooltip prints the raw hype number (e.g. "hype 4.5"; hype spans 1.0–5.0). The
  chart's axis is already numeric hype by spec (§11's star-glyph rule and the numeric
  finale scatter coexist in the same spec section; the tooltip shipped verbatim from
  reviewed Plan 3a), so the finale carve-out is spec-internal but UNWRITTEN in the
  handoff §6 rule text. Deliverable: a one-line rule-scope clarification, probably no
  code change.
- **2.2 `HypeStars` aria-label carries the number** ("hype 3.5 of 5"). Visually
  stars-only; the accessibility tree gets the exact value — lossless vs the glyphs and
  correct a11y practice (shipped verbatim from reviewed Plan 2, pinned by ui.test.tsx).
  Accept + reconcile the component's own "never numerically" comment.
- **2.3 Unmapped join-code error prose — LOW, fix-worthy per your own precedent.** A wrong
  code renders the generic fallback ("That did not go through — try again." + dim raw
  `bad join code`). The message was cataloged as a known server prose message in Plan 2
  but never got a TABLE entry, and "try again" is affirmatively wrong advice on the
  most-trafficked pre-game error path. The ledger precedent is PHASE_MISMATCH (promoted
  to mapped copy in 3b because "generic fallback gives wrong advice"). Candidate entry:
  "No game found with that code — check the projector."

## 3. WORKING AS DESIGNED — verified with evidence (protect these)

Everything below was exercised in a real browser this run and behaved to spec:

- **Playtest-polish features (first browser exposure):** Results "Star Auction · Round r"
  public table (wave order, winner/rate/years, indistinguishable Unsold) matching
  `auctions/{r}` exactly; team-private skip notes for BOTH reasons — "(salary cap)" and
  "(roster full)" — visible to own-team roles, invisible to rivals (browser-verified),
  round-stamped (gone the next round); fall-through winners rendered publicly with no
  trace of the skip.
- **Default Role Player, end to end:** $0 payroll display (no phantom cap breach); renders
  by name with position badges + identical replacement stat lines in lineup UI, box
  tables, and CSVs; absent from FA tables/market draws/expiring lists/awards/reveal
  scatter/best-worst; re-issued after 1-round expiry; `signPlayer(9001)` cleanly rejected;
  zero-spend W/$ unaffected except the 1.7 edge above; "No signings on record." empty state.
- **Money math in the UI:** R1 asks = catalog base; R2+ asks = base × 1.08 (r01), including
  unsold-star list prices; contract ladder shows all five DISCOUNT tiers (5-yr legal at R1,
  ceiling shrinks later); FO re-sign asks = hypeCurve × inflation; cut modal states exact
  dead-money arithmetic; payroll bar renders "+ $X.XM dead" distinctly; CAP_EXCEEDED
  pre-blocked client-side with the same arithmetic the server enforces.
- **Auction rules:** min-bid/step inline-block (the sanctioned exceptions), over-cap
  exposure warns but never disables Lock in ("over-cap wins are skipped at resolution,
  this is allowed"), full-set resubmit = last-write-wins.
- **Roles:** Scout gets detail panels with disabled Confirm + "The GM signs this phase.";
  Coach-only lineup submit ("The Coach submits this phase."); GM-only done/cut/re-sign;
  taken-seat and already-signed copy exact.
- **Professor panel:** 21-franchise cap copy verbatim; timers (auto-arm, pause/resume/+30s/
  clear, per-phase default editor) propagate to students + walls in ~1-2s; advisory rule
  proven (signings accepted after 0:00); auto-advance at 0:00; cleared timer stays cleared
  across reload; force-advance modal names exactly the missing teams; final-advance
  confirm copy exact; submission lights across FA (done), AUCTION (bids), LINEUP (locks);
  stuck-advance: Resolve button appears ~10s into a (synthetically injected) crashed
  advance, students hold the old phase with zero blank screens, resolve adopts and
  finishes hooks; Clear session recovers a dead/stale session; season CSV = single header,
  240 rows, rounds 1–5.
- **Walls:** LobbyWall (giant code, live seat counter ticked 8→9); DecisionWall (name-
  sorted dots only + big countdown); SimulateFlood (+"Round complete."); StandingsShuffle
  — all four glyph states (NEW/▲/▼/—), bottom-up reveal caught mid-animation with top
  ranks shrouded "— ?", R5 slowdown confirmed (~3s/row vs ~0.8s); FinaleWall follows the
  reveal stepper (1–5, clamps at ends).
- **Integrity spot checks:** downloaded round CSV byte-identical to `rounds/r.boxCsv`
  (length + rolling hash); standings/W-$ recomputed exact; previousRank chain (null at R1);
  bargain award renders raw line + salary only (perDollar verified absent from the DOM);
  finale weights match `reveal_weights.json` verbatim; auction resolution reconstructed
  to the cent (guaranteed-money order, cap/roster skip reasons, claim tokens; all five
  stars re-enter the next market at list price × inflation via walk/cut/no-bid paths).
- **Resilience:** refresh-survival mid-phase on every surface tested; two-tab same-seat
  live sync; §3a transition gate held through every flip (zero blank screens all run);
  /standings exemption held across a phase flip.
- **Static sweeps (8 agents):** perDollar never rendered; playstyle strings + blurbs
  byte-verbatim (od -c) with no synergy meters; DRP exclusions present at all six backend
  sites; every thrown error code has student copy; expectations on every advancePhase/
  setTimer call site except the one deliberate raw stuck-advance site; submitBids can
  never send null; emoji sweep clean (68 files).

## 4. UI PUNCH LIST — for your human pass (ranked)

**P1**
1. **FinaleWall chart scale.** The reveal charts render small on the wall (~¼ width, small
   axis text; screenshot in session transcript at step 2 "Hype vs Reality"). This is the
   projector-eyeball item 3b deferred to you — from my 1280×800 capture it will read as
   tiny from the back of a classroom. Judge on real hardware; likely wants the bs-* clamp
   scale applied to chart internals (axis font, dot radius, chart width).

**P2**
2. **"We're done" gives no acknowledgment** — no label change, no disable, no checkmark;
   the GM can't tell it registered (server flag verified set). One state toggle.
3. **Professor panel "Connecting to session…" has no failure explanation** when the
   browser isn't the game's professor (ties to finding 1.1) — the only diagnosis is the
   console. One line of copy ("This browser isn't the professor of that game…").
4. **Join-code error copy** (design question 2.3) — one TABLE entry.

**P3**
5. Wall/panel say "Draft Night" for FREE_AGENCY in every round (`phaseNames.ts`
   unconditional) while the student page says "Draft Night" only at R1 then
   "Free Agency" — wall vs laptop disagree R2–5. Unify one way.
6. Pluralization: "1 players" (roster counter), "1 teams haven't submitted" (advance modal).
7. Join screen team cards and panel Franchises chips render in creation order — the walls
   are name-sorted (3b T2); sort these two for consistency.
8. Sign-panel label "this ssn —" — cryptic; consider "this season".
9. Landing page is top-left anchored with a large empty region below the join card on
   desktop; consider vertical centering or the "regression to the rim" tagline.

## 5. Provably untestable without a human (as planned)

- The dnd-kit drag gesture (4 prior failed automation attempts; not re-attempted — the
  `place()` slot model is unit-tested, only the gesture needs your 30 seconds).
- Projector physical look (contrast/type scale at distance) — see P1.
- Real phones, cellular path, crashed-laptop rejoin with truly persisted auth — prod-smoke
  manual checklist items (note 1.5's correction to one step).
- Prod scripted smoke season (not run — needs your OK; read-only checks passed).
- The in-window phase-close toast ("The auction is closed.") — the copy mapping is
  unit-tested and the toast pipeline is proven via other errors; the sub-second transition
  window defeated scripted timing twice.

## 6. Evidence & artifacts

- Evidence log: session scratchpad `evidence-log.md` (check-ID-indexed, ~120 entries);
  screenshots inline in the session transcript; server dumps in scratchpad.
- Static-sweep + verification workflow outputs (17 agents total) in session workflow dirs.
- Untracked helpers left for reuse (same convention as the playtest CLI):
  `app/scripts/_seed-demo-patched.mjs` (region pin + synthetic-aware arrangeLineup —
  patches for findings 1.2/1.3), `backend/functions/scripts/_inject-stuck-advance.mjs`
  (the approved synthetic crashed-advance injector).
- Games left on the dev emulator: FL34KF (R1 FA), JX7ESP (R2 RESULTS), TKIA8S (FINALE),
  WGYNWG (FINALE, the grand game). All inert.
