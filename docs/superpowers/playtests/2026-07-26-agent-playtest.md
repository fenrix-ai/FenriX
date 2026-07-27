# Salary Showdown — Agent Playtest Report (2026-07-26)

**Setup:** live emulator game `RjgFt3JIkVNl9jKBF7Mp` (join code RJGFT3), 5 franchises × 3 seats
played by AI agents with distinct strategies, professor paced through the REAL `/professor`
panel in a browser by the controller. Full 5-round season to FINALE with the reveal stepped
1→5 and the season CSV exported. One data-auditor agent verified server writes in near-real
time. ~500 callable invocations, 67 adversarial probes, 172 audit checks.

## Headline: the pedagogy held under adversarial play

| Team (strategy) | Record | Diff | Season spend | W/$ |
|---|---|---|---|---|
| Regression Royals (real regression on the pre-release) | **17-3 · CHAMPION** | −6 | $263.7M | 0.064 |
| Edge Case (adversarial prober, played well between probes) | 14-6 | +309 | — | — |
| Scout's Honor (trusts scout grades) | 10-10 | +51 | — | — |
| Bargain Basement (minimum spend, autopilot) | 7-13 | −337 | $115.9M | 0.060 |
| Hype House (chases PPG/hype/followers) | **2-18 · LAST** | −17 | $508.9M | 0.004 |

- The modeler **won the title with a NEGATIVE point differential** and signed **0 of the 13
  planted traps**; its pre-game wins model scored Spearman ~0.78–0.80 against the hidden
  true-impact metric it had never seen. Hype correlated −0.105, salary −0.135.
- The hype-chaser scored the MOST total points in the league (2,060) and finished last,
  spending 16× more per win than the champion. All three of its marquee signings were
  flagged `isTrap: true` in the reveal.
- The trap bit twice by design: Scout's Honor re-signed its max-hype auction star at $27.9M
  (hypeCurve pricing) — the reveal showed him as their single worst-value player.
- Auditor: **zero data-integrity defects** across 172 checks; all 145 contracts re-derived
  to the cent; re-running `simulateRound` for round 5 reproduced the stored boxCsv
  **byte-identically** (17,762 chars). Standings, previousRank chain, box arithmetic
  (pts = 2·fgm + 3pm + ftm on all 800 rows), auction exclusivity, hardship replay, and the
  finale gate all verified exact.
- Professor UI: complete season run through the real panel with ZERO console errors after
  session start (the only errors were correct, loudly-logged permission-denied traces from a
  stale pre-restart gameId, recovered via the new Clear-session button). Auto-arm, advisory
  timer at 0:00, submission lights, both walls, reveal stepper, season-end confirm modal, and
  CSV export all behaved.

## REAL BUGS (server input guards; unreachable from the shipped UI, still fix-worthy)

1. **`signPlayer` with a non-numeric `pid` escapes as an uncaught NaN error** —
   `{"error":{"code":null,"message":"Data cannot be encoded in JSON: NaN"}}`. `Number(pid)`
   flows unchecked into salary math. The ONLY non-HttpsError seen in ~500 calls.
   Fix: `if (!Number.isFinite(pid)) throw new HttpsError('invalid-argument', 'BAD_PID')`.
2. **`submitBids` with a null per-star entry (`{"1140": null}`) leaks a raw V8 TypeError**
   ("Cannot read properties of null (reading 'rate')"). `lineup.js` has the BAD_SHAPE guard
   for exactly this class; `validateBids` never got the twin. One-line fix + test each.

## DOC DRIFT (repo docs vs shipped code)

3. `backend/SCHEMA.md` `rounds/{r}.games` omits `game_id` — which sim.js emits on every entry
   and the 23-column boxCsv uses as its join key. Undocumented load-bearing field.
4. The handoff §10 frozen money-math table omits the 5-year discount tier — `payroll.js`
   is `{1:1.0, 2:0.92, 3:0.85, 4:0.80, 5:0.75}`; 5-year deals are legal in round 1
   (maxYears = 6 − round), were exercised by 8 contracts in this game, and priced correctly.
5. Student-facing `data/README` gaps (pedagogy calls, Dylan decides what stays hidden):
   the 10-player roster cap; "150 free agents" vs the per-game ~112 rotation draw; fixed
   tier minutes (36/26/17); BAD_YEARS semantics.

## UX / DESIGN QUESTIONS (adjudication candidates, all small)

6. **Silent cap-skip on a winning auction bid** — Edge held the only bid on a star and lost
   him to the cap-skip rule with no feedback anywhere; "nobody bid" and "top bid couldn't be
   awarded" are indistinguishable. (The rule itself is correct and adjudicated.)
7. **Losing bidders never see clearing prices** — bidding can't be calibrated across rounds;
   the winner's-curse lesson stays invisible. Post-resolution prices are facts; a Results
   surface could carry them without violating secrecy (design call).
8. **Hardship's cap exemption renders as an apparent cap breach** — Edge sat at $101–104M
   "against a $100M hard cap" with no UI labeling of the exempt portion (worked exactly as
   coded; auditor verified cap-exempt-by-rule). Also an exploit shape: staying one guard
   short farms a free cap-exempt player every round — 3-for-3 this game. Rules decision.
9. **Cut-then-re-sign double-pay is legal and unwarned** (dead money + live contract for the
   same player, same round; correctly cap-counted) — UI warning candidate.
10. **FO one-way door**: a re-signed-then-cut player is unrecoverable in FRONT_OFFICE yet
    freely signable in FREE_AGENCY minutes later — copy could say so.
11. **"3PT Barrage" blurb says "Shoot more threes." but the mechanic raises 3P% accuracy,
    not attempt share** (measured: 3PA share 23.3%→23.4%, 3P% 0.205→0.314). Blurbs are
    verbatim-frozen hard rules — this needs Dylan-level adjudication either way (rewording
    vs. engine attempt-mix shift vs. accept).

## ENGINE / TUNING OBSERVATIONS (design-discussion tier, mostly datagen dials or V2)

12. **Possessions are not conserved between opponents** — team FGA is roster-driven (corr
    0.888 with own-roster minute-scaled FGA); 21/50 games had a >30% possession imbalance,
    max 1.94×. The modeler won every possession-adjacent stat in one game and lost 44–107.
    Stats correlate with wins but not through a mechanism students can reason about.
13. **Bimodal margins**: 52% of games decided by ≤2 points, 8% total in the 3–10 band —
    the logistic winner-enforcement pulling hard. Consequence: point differential decouples
    from record (champion at −6, last place at −17). The fairness targets rely on this
    enforcement; the dial (logistic k) is a spec §15 tuning knob if wanted.
14. **Playstyle is a huge lever, invisible in the pre-release** — controlled round-5
    experiment (identical roster/lineup/opponents, style only): dropping Lockdown cost
    ~13 pts/game of defense; history win-means across styles span 1.94 wins vs within-style
    SD 12–20, so students choose nearly blind. (History interactions ARE recoverable
    per the harness — the magnitude live still surprised a strong modeler.)
15. **Duplicate-copy stat divergence in the same game** is spec-intended (non-exclusive FA),
    but one copy posted 65 pts on 30/43 FG while the other copy of the same player posted 26
    in the identical game — the magnitude is a plausibility outlier worth a datagen look.
16. **`league_history.csv` has no team FGA/possessions column**, so the single biggest
    scoring driver can't be modeled; a correct regression actively down-weights scoring
    volume. Natural candidate for the PARKED dataset-texture regeneration.
17. **`roster`/`deadMoney` arrays retain expired entries server-side** (UI filters
    correctly; naive sums overcount). If intended, one SCHEMA.md sentence documents it.

## Confirmed working (protect these)

Phase gates (every endpoint × every wrong phase → clean named errors) · role enforcement ·
CAP_EXCEEDED naming the correct blocking round with exact payroll (7/7 hand-reconciled) ·
all 8 malformed-lineup probes → 8 distinct correct codes · over-cap auction exposure + cap-skip
+ roster-skip + unsold walk rule · dead-money windows · hardship selection order (2/2 replay) ·
star exclusivity & claim tokens · spendLog totals (hand-reconstructed to the cent, $494.4) ·
salary~hype R² 0.871 with pts coefficient collapsing to ≈0 ("price ≠ value" is provable) ·
last-write-wins resubmits · §3a transition gate (no blank screens all season) · finale reveal
gating + payload shape (7 engine weights, matches reveal_weights.json verbatim).

## Playtest-harness errata (mine, for the record — NOT product findings)

My CLI/briefs caused several false positives, all identified in-session: bids described as
"per-key" (real contract: full overwrite — and the real UI always submits the full set);
"7 box rows per team" (correct: 8 — I forgot the sixth man); "years 1–4" (5 is legal in R1);
CLI read `d.bargain` instead of `d.awards.bargain` (awards were never null); CLI showed raw
catalog prices without computing `askPrice` inflation (the real FA table computes it); CLI
error envelope produced `code: null` shapes the product never emits. The Workflow harness
also stringifies `args` (franchise thunks died on `teams[p.team]`; recovered by launching
franchises as plain background agents — and the auditor re-derived the gameId on its own).

## Artifacts

- Findings files: `findings-edge.md` (802 lines), `findings-scouts.md`, `findings-bargain.txt`,
  `findings-royals.md` (agent-authored content, saved by controller), `session-log.txt` (hype),
  `final-audit.json` (auditor) — all in this directory.
- Box CSVs r1–r5, market dumps r1–r5, `reveal-RjgFt3JIkVNl9jKBF7Mp.json`.
- Temp harness scripts (kept for reuse, untracked): `app/scripts/_playtest-cli.mjs`,
  `backend/functions/scripts/_playtest-admin.mjs`.
