# Salary Showdown — Playtest Polish (Auction Transparency + Default Role Player)

**Date:** 2026-07-26 · **Owner:** Dylan Massaro · **Provenance:** agent-playtest findings
(`docs/superpowers/playtests/2026-07-26-agent-playtest.md`), adjudicated by Dylan item-by-item.

Rulings recorded: playtest UX items 4 (Barrage blurb), 5 (cut/resign + FO door), 6 (BAD_SHAPE
copy) — ACCEPTED as-is. Engine items (possession conservation, margin bimodality) and the
dataset texture regeneration — PARKED for later revisit. This spec covers the three items
Dylan directed: auction-results transparency, the Default Role Player hardship redesign, and
two student-README lines.

## 1. Auction results transparency (Results screen)

**Problem.** Losing bidders learn nothing — not the clearing price, not the term, not even
that their own winning bid was skipped for cap/roster reasons. Bid calibration and the
winner's-curse lesson are invisible (playtest findings: Royals #12, Edge #1).

**Design.**

1. **Public facts table.** The team Results screen (`/game/results`), for round r, gains a
   "Star Auction · Round r" section listing EVERY star of that round's wave, in wave order:
   `Name · Pos · winner team name · $X.XM/rd · N yr` — or `Unsold` where no bid was awarded.
   Raw facts only: no per-dollar, no judgment labels, no bid counts, no bidder identities.
   Data source: `auctions/{r}` results (member-readable). If the stored result rows do not
   already carry `rate`/`years` for the winning contract, the backend adds them at
   resolution time (additive schema change, documented in SCHEMA.md).
2. **Private skip note.** When a team's TOP bid on a star was skipped at resolution (cap
   or roster-full skip — including when the star then fell through to another bidder), the
   resolution writes a team-private record (e.g. on that team's `private/auction` doc or a
   sibling private doc: `skipped: [{ pid, reason: 'cap' | 'roster' }]`). The Results screen
   renders, for the OWN team only: "Your winning bid on <Name> couldn't be awarded
   (<cap/roster>)." Sealed-bid privacy is otherwise intact — no other team can read it, and
   the public table never distinguishes "no bids" from "bids skipped".
3. **Scope guard.** Team Results screen only. No wall changes, no professor-panel changes,
   no live bid state anywhere (standing scale/secrecy rule).

## 2. Default Role Player (hardship redesign)

**Problem.** Hardship currently draws a real cheap player from the FA pool, cap-exempt at a
hype-curve price: payroll displays can exceed the "$100M hard cap" with no explanation, and
staying deliberately short farms a real free player every round (playtest: Edge #4, Hype #1,
auditor observation). Dylan's ruling: replace the mechanic — every hardship slot is filled by
a synthetic **"Default Role Player"** with identical stats for everyone, to keep it fair.

**Design.**

1. **Synthetic catalog entries.** `createGame` seeds the catalog with a fixed block of
   synthetic players (pids in a reserved 9000+ range, count and positions sufficient to fill
   a worst-case 0-player roster to the 8-man/2G-2W-1B floor with DISTINCT pids — e.g. three
   guards, three wings, two bigs). All are named exactly `Default Role Player`, all carry the
   SAME replacement-level stat block (clearly below league average — exact values pinned in
   the plan from the shipped data's bottom quartile), `salary_per_round` **0.0**, hype 1.0,
   never in any market draw, never in any auction wave.
2. **Hardship signing.** `runHardship` no longer touches the FA pool. Each deficit slot signs
   an unused synthetic of the needed position: `{ pid, rate: 0, years: 1, hardship: true }`.
   $0 means payroll displays stay at or under the cap — the "apparent cap breach" and the
   farming incentive both disappear (an exploiter now gets a deliberately weak player that
   every other team would get identically).
3. **Simulation.** Synthetics flow through lineup validation, the engine, and box scores
   exactly like real players (their catalog stat rows drive production). Their name appears
   in box CSVs — intended and legible ("Default Role Player, 12 min, 4 pts").
4. **Exclusions.** Synthetic pids are excluded from: the Bargain of the Round award (a $0
   rate would otherwise produce a degenerate per-dollar), the finale reveal's per-team
   best/worst signing, and wins-per-dollar spend (a $0 contract adds nothing to spendLog
   totals by construction — verified in the plan). They never appear in `reveal/latest`'s
   scatter (not part of the pre-released 175).
5. **Rules sync.** The parent spec's hardship clause and SCHEMA.md's hardship note are
   updated in the same change; the "cap-exempt by rule" language becomes "synthetic $0
   Default Role Player by rule". `hardship: true` stays on the contract as the marker.
   Existing hardship tests are rewritten to the new contract (selection order tests replaced
   by position-fill + distinct-pid tests).

## 3. Student README additions

Two lines added to `games/salary-showdown/data/README.md` (static file; datagen does not
write it — verified):

- "Rosters hold a maximum of 10 players; only 8 dress for a game."
- "Not every free agent is on the market every night — scout a deep board before class."

Tier minutes, collinearity, and every other discoverable pattern stay unmentioned (ruled).

## 4. Out of scope

Wall/projector changes · professor-panel changes · any engine/physics change · dataset
regeneration (parked) · the accepted playtest items 4/5/6 · prod redeploy (this ships to
emulator/dev now; the next prod deploy picks it up whenever Dylan schedules one).

## 5. Verification bar

Backend suite green with new tests (auction result rows carry rate/years; skip records
written for cap AND roster skips incl. fall-through; runHardship fills worst-case deficits
with distinct synthetics; awards/reveal exclusions); app unit + integration green with a
Results-section itest (public table + private note + rival-can't-see-note negative);
`npx tsc -b`; `npm run audit:ui` (facts-only copy in the new section); full-battery counts
recorded in the ledger.
