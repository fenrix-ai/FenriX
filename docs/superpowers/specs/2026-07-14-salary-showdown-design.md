# Salary Showdown — Game Design Spec

*Tagline: "regression to the rim"*

**Date:** 2026-07-14
**Status:** Approved design, pre-implementation
**Sibling game:** Bakery Bash (`games/bakery-bash/`) — reuses its architecture patterns, fresh codebase

---

## 1. Purpose & Concept

A competitive, live-in-class NBA front-office simulation for an MGSC 310 class (data-driven decision making). Students form 3-person franchises, receive a scouting dataset a week before class, and use regression/modeling skills to build a roster of fictional basketball players under a salary cap. The team whose analysis finds the market's hidden inefficiencies wins the most games.

The core lesson, engineered into the data: **the market pays for hype; wins come from efficiency, ball security, and defense.** Moneyball, playable in 75 minutes.

Design contract: *smart beats lucky, but never boringly* (see §10 Validation Harness for the quantified version).

## 2. Winner & Target Variable

- **Target variable: WINS.** Most cumulative wins across the season is champion.
- Tiebreaker: point differential.
- A **wins-per-payroll-dollar** column appears on the standings screen all game (the Moneyball metric, quietly planted) — it is informational only and does not affect ranking.
- V2 (parked): playoff bracket finale seeded by regular-season record.

## 3. Session Logistics

- **Format:** one live class session, ~75 minutes, professor-controlled phases with timers (same pacing model as Bakery Bash).
- **Class:** ~60–70 students → ~20–23 franchises.
- **Teams:** 3 students, distinct roles, each role owns its submit button (everyone discusses, one person clicks):
  - **GM** — Front Office cuts/re-signs + Free Agency signings
  - **Scout** — Star Auction bids; leads data analysis pre-class and between rounds
  - **Coach** — lineup tier submissions
- Team-size fallback: teams of 2 merge Scout+GM; solo players get all three buttons.
- **Rounds:** 5. Each round every team plays every other team once (full round-robin, ~19 games/round at 20 teams, ~95-game season).

### Session timeline (75 min)

| Minutes | Page | Notes |
|---|---|---|
| 0–5 | Landing/Join | join code on projector |
| 5–10 | Lobby | rules carousel, roles claimed |
| 10–27 | Round 1 | no Front Office; extended "Draft Night" FA (~9 min), auction, lineup, sim, results |
| 27–60 | Rounds 2–4 | full loop, ~11 min each |
| 60–70 | Round 5 | full loop; years slider capped at 1; stacked final auction wave |
| 70–75 | Finale | champion, awards, the Reveal |

## 4. The Round Loop (rounds 2–5)

1. **Front Office** (~3 min) — GM submits. Roster table (sticker stats vs. actual season output with green/red deltas; contract = rate × rounds left), payroll bar vs. cap with dead money shaded, expiring-contracts panel (re-sign at renewal price or let walk), cut flow with dead-money confirmation modal, tonight's market preview (incoming FAs + auction stars: name/position/hype only), scouting news banner (flavor + one soft hint; hint strength is a professor knob). Market inflation ticks at phase open.
2. **Free Agency** (~2.5 min) — GM submits. **Rotating market:** round 1 opens with a large pool (~75% of all free agents); each later round the signable list is a fresh server-seeded random subset (~40–50%) — identical for every team. Unavailable players remain visible but greyed ("not in market tonight"), so pre-game analysis of the full pool stays useful. Anti-frustration guard: a player absent two consecutive rounds is guaranteed into the next draw. Cut/walked players join the rotation; expiring re-signs are exempt (incumbent right lives in Front Office). Rotation × inflation is the urgency engine: waiting risks both reappearance and +8% pricing. Live season stats shown beside sticker stats. Sign flow = years slider (see §5). Signings commit instantly (shared pool — no inter-team conflict). Round 1 variant: extended timer, build min-8 roster, roster checklist widget enforces position coverage.
3. **Star Auction** (~2 min) — Scout submits. 4–6 exclusive star cards (stats, age, hype — no price). Sealed bid = **per-round salary** offered; live cap validation ("Not enough cap room" hard-blocks overbids). Teams may bid on multiple stars and may win multiple if cap fits.
4. **Set Lineup** (~1.5 min) — Coach submits. 5 starter slots (2 Guards / 2 Wings / 1 Big, enforced), 1 Sixth Man, rest Bench. No derived synergy meters shown (would leak the hidden model). Timeout → last valid lineup carries over (round 1: auto-arrangement).
5. **Simulate** (~1 min) — no inputs. Team screens: your ~19 games resolve as a rapid cascade of mini-cards. Projector: league-wide scoreboard flood.
6. **Results** (~1.5 min) — round record ("13–6"), Best Win / Worst Loss highlight cards, own box lines, awards carousel (**Round MVP · Top Scorer · Bargain of the Round** — best stats per salary dollar), **league-wide box score CSV download**, standings snapshot. Awards are recognition only, no gameplay effect.

Round 1 skips Front Office (no roster exists yet).

## 5. Economy

- **Hard salary cap per round: $100M** (tunable). Payroll = sum of active contract rates + dead money. The game blocks any signing/bid that would exceed the cap in any remaining round. No debt mechanic.
- **Contracts — the years slider.** Signing sets contract length (1 to rounds-remaining). Longer = cheaper per-round rate:

| Length | Rate multiplier |
|---|---|
| 1 round | 100% |
| 2 rounds | 92% |
| 3 rounds | 85% |
| 4 rounds | 80% |
| 5 rounds | 75% |

- Salary is **paid every round** of the contract (recurring payroll, not lump sum).
- **Dead money:** cutting a player frees his roster spot but his per-round rate stays on your payroll for every remaining contract round. Committed money is never recovered.
- **Expiration:** when a contract ends the player returns to the market. The incumbent team may re-sign during Front Office at the current renewal price (base rate × inflation).
- **Market inflation:** all unsigned list rates and renewal quotes rise **~8% per round** (professor knob). Rewards teams that analyzed early and act with conviction.
- **Auction contracts:** winning bid = per-round salary for the remainder of the season (rest-of-season deal, no slider). Dead-money rule applies if cut.
- **Auction resolution:** at phase close, sort all bids descending; award each star to its highest bidder whose cap still fits (bids that no longer fit after an earlier win are skipped); ties broken randomly. Losers pay nothing. Winning prices are public (price discovery).
- **Roster limits:** min 8 (must cover 2G/2W/1B lineup), max 10. Round-1 timeout with an illegal roster → system autofills cheapest legal players (deliberately mediocre).
- Base rates (indicative, tuned in playtesting): journeymen $3–6M, starters $8–15M, stars $18–28M per round.

## 6. Players & Positions

- **~175 fictional players** (~150 free agents + ~25 auction-class stars across 5 waves). Fictional = full control of the data-generating process; no advantage for NBA fans.
- **Positions:** Guard / Wing / Big. Lineup template 2G/2W/1B.
- **Hype (1–5★):** public reputation rating. Drives salary; deliberately ignores efficiency, defense, turnovers, and age.

## 7. Datasets

### 7.1 Pre-release package (T−7 days, via LMS/email)

Framing: *"Your ownership group hired you as a front office. Draft night is Thursday. Come with a plan."* No graded pre-work — preparation is its own reward (inflation and draft-night time pressure punish cold starts organically).

**`players.csv`** — one row per player (~175). Full contract — column order is frozen; additions append at the end (§7.4):

| # | Column | Type / range | Gameplay mapping |
|---|---|---|---|
| 1 | `player_id` | int, unique, stable | Utility — join key across all files |
| 2 | `name` | text, unique | Utility — display, awards, trash talk |
| 3 | `position` | `G` / `W` / `B` | **Mechanical** — lineup slot eligibility; stat profiles differ by position (normalize within) |
| 4 | `age` | int 19–38 | **Mechanical** — sets the age-drift multiplier (§9.3); the only stat column that is a direct sim input |
| 5 | `years_pro` | int 0–19 | Red herring — decoy duplicate of `age` (correlated-columns lesson) |
| 6 | `hype` | 1.0–5.0, halves | Trap fuel — generated the salary; predicts price, not performance |
| 7 | `salary_per_round` | $M, 2.0–28.0; blank for auction-class | **Mechanical** — per-round payroll charge via contract; cost, not quality |
| 8 | `auction_round` | int 1–5; blank for free agents | **Mechanical** — which round the star hits the block. Revealed deliberately: rewards cap planning rounds ahead |
| 9 | `personality` | `Leader` / `Professional` / `Quiet` / `Diva` / `Hothead` | Red herring in V1 — pure flavor; narrative-resistance lesson ("Divas were fine all along"). V2 chemistry hook (§14) |
| 10 | `scout_grade` | `A+` … `D` | Noisy-honest — weakly correlated with TrueImpact (target r ≈ 0.3): beats guessing, loses to models. The non-fan's starting prior |
| 11 | `social_media_followers` | int, 10k–20M | Trap fuel — feeds hype, zero sim weight ("10M followers ≠ good at basketball") |
| 12 | `games_played` | int 40–82 | Red herring (V2 durability hook) |
| 13 | `mins_per_game` | 8–38 | Context — last season's role + sample-size warning; tier assignment sets minutes in-game, not this |
| 14 | `pts_per_game` | 2–30 | Emission of usage × efficiency; main hype driver. Trap fuel alone, honest when paired with attempts |
| 15 | `fg_attempts_per_game` | 2–24 | The decoder — emission of usage; `pts ÷ fga` unlocks scoring value's sign |
| 16 | `fg_pct` | .38–.62 | Honest, underpriced — emission of efficiency (heavy TrueImpact weight) |
| 17 | `three_pt_pct` | .20–.45 | Honest, double-duty — efficiency + spacing-synergy eligibility |
| 18 | `ft_pct` | .55–.95 | Red herring — near-zero sim weight |
| 19 | `rebounds_per_game` | 1–13 | Honest, underpriced — defense/rebounding emission |
| 20 | `assists_per_game` | 0.5–10 | Honest — playmaking emission (the one honest stat hype partially sees) |
| 21 | `steals_per_game` | 0.2–2.5 | Honest, underpriced — defense emission |
| 22 | `blocks_per_game` | 0–2.8 | Honest, double-duty — defense + rim-protection synergy |
| 23 | `turnovers_per_game` | 0.5–4.5 | The poison column — heaviest negative TrueImpact weight, invisible to hype |
| 24 | `prev_pts_per_game` | number | Honest — time machine |
| 25 | `prev_fg_pct` | number | Honest — time machine |
| 26 | `prev_mins_per_game` | number | Honest — YoY deltas vs. `age` draw the aging curve pre-game |

Information architecture: **4 mechanical** (`position`, `age`, `salary_per_round`, `auction_round`) · **~10 honest evidence** · **4 trap fuel** (`pts`, `hype`, `salary`, `followers`) · **4 red herrings** (`years_pro`, `games_played`, `ft_pct`, `personality`) · rest utility/context.

**`league_history.csv`** — 90 rows (30 fictional teams × 3 seasons; `season` column). Columns: `team_name`, `season`, `wins`, `losses`, team-level `pts_per_game`, `fg_pct`, `3p_pct`, `ft_pct`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers`, `total_payroll`, `avg_hype`.

This is the **outcome table**: regressing `wins` on the rest reveals the sim's true weights. Integrity guarantee: **generated by running the actual game engine** over a synthetic league — never hand-written — so every discoverable relationship is true in the game students play.

**Scouting memo** (1 page): column definitions, season rules, zero strategy hints.
**Player cheat sheet** (printable): round loop, role ownership, cap/dead-money rules, base-rate tables. No spoilers.

### 7.2 In-game data feed — round box scores

After every Simulate phase: downloadable CSV of **the whole league's box scores** for that round (~190 games × ~18 player-lines ≈ 3,400 rows/round). Public like real NBA stats. **One denormalized file per round** — pivot-table ready with zero joins; cumulative analysis is just stacking files. Note: unsigned free agents generate no box scores (they didn't play); a player's live form exists only for rounds he was rostered.

| # | Column | Notes |
|---|---|---|
| 1 | `round` | 1–5 |
| 2 | `game_id` | e.g. `R2-G087` |
| 3 | `team` | class franchise name |
| 4 | `opponent` | class franchise name |
| 5–7 | `team_score`, `opp_score`, `win` | denormalized per row; `win` ∈ {0,1} |
| 8–10 | `player_id`, `player_name`, `position` | joins back to `players.csv` |
| 11 | `tier` | `starter` / `sixth` / `bench` — tier-vs-output is analyzable |
| 12–22 | `mins`, `pts`, `fgm`, `fga`, `three_pm`, `three_pa`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers` | **raw counts, not percentages** — so aggregation is correct (sum makes/attempts, don't average percentages) |

Enables mid-game discovery: aging fade, trap-star inefficiency bleed, breakout bargains — and opponent scouting for the Scout role.

### 7.3 Schema governance (the anti-Bakery-Bash-mess rules)

- **One schema, one generator, everything derives.** Hidden attributes live in one place; every student-facing artifact (both pre-release CSVs, round box scores, in-app market/roster tables) is an emission from the same pipeline. Adding a column = one emission function + one harness assertion; nothing is hand-maintained in parallel.
- **Additive-only, append-right.** Existing columns are never renamed, retyped, or reordered. New columns append at the end.
- **The freeze applies to shipped files, not the schema.** The two pre-release CSVs are immutable once students have downloaded them — there is no patching those. But the schema can still grow mid-run through the live layers, additive-only: new columns on the round box-score feed, new in-app table columns, or a supplemental professor-released drop between rounds (e.g., a "mid-season scouting update" CSV). Rule of thumb: never change what's in students' hands; ship additions as new columns or new files.
- Schema version noted in the scouting memo (not inside the CSVs).

## 8. Simulation Engine

Hidden per-player attributes (never shipped to any client): `usage`, `efficiency`, `playmaking`, `ball_security`, `defense` (incl. rebounding), plus `age_drift`.

1. **Player value:**
   `scoring_value = shots_taken × (points_per_shot − 1.00)` — volume on below-average efficiency is *negative* (trap stars formalized).
   `TrueImpact = base + a·scoring_value + b·playmaking + c·defense − d·turnovers`, all `× age_drift`. Weights tuned so defense + ball security carry roughly the value hype ignores.
2. **Team strength:** tier weights — Starter ×1.0, Sixth Man ×0.6, Bench ×0.35 each — weighted sum of TrueImpact, plus exactly two synergy adjustments:
   - **Spacing:** <2 starters with real 3-point skill → −4 strength; 3+ → +2
   - **Rim protection:** no shot-blocking presence in starters+6th → −3; elite presence → +2
3. **Games:** logistic win probability on strength gap. Tuned high-variance per game (any team can win any night) because the ~95-game season smooths records to skill: *chaos per game, justice per season.* Scores generated around league norm (~102) with margin from the gap.
4. **Box scores:** team output allocated by usage × tier minutes; shooting lines shaped by true efficiency; counting stats emitted from attributes + noise. **Age drift applies progressively (1/5 of season drift per round)** so decline/improvement is visible in the feed by round 3.
5. **Schedule:** full round-robin each round (no scheduler logic, no strength-of-schedule luck). Odd team count → AI house team ("the Expansion Franchise") absorbs the bye. If class exceeds ~21 teams, each team plays a random 15 per round to keep the ticker snappy.

All game state transitions and resolution are Cloud Functions-only (server-authoritative), same security philosophy as Bakery Bash rules.

## 9. Hidden Patterns (the treasure map)

| Pattern | Where it's discoverable |
|---|---|
| Moneyball mispricing | pre-game: league table regression + salary residuals |
| Trap stars | pre-game: pts÷attempts; in-game: box score bleed; finale reveal |
| Aging curve | pre-game: `prev_` columns vs. age; in-game: progressive fade |
| Lineup synergy | pre-game: league-table residuals of threshold-violating teams |
| Turnover poison | pre-game: league regression; in-game: losses pile up |

### 9.1 Mispricing chain

```
hype   = 0.45·norm(PPG) + 0.20·norm(followers) + 0.15·norm(FGA) + 0.10·norm(AST) + noise
         // no efficiency, defense, TO, age
salary = rate_curve(hype) + noise
```

`scout_grade` is generated from TrueImpact + heavy noise (target r ≈ 0.3) — the "experts beat nothing, models beat experts" column. `personality` is assigned independently of everything (pure flavor; the reveal shows it predicted nothing).

Salary↔TrueImpact correlation target **R² ≈ 0.45**: stars usually cost more (market isn't stupid), but ≥15 players sit in bottom-half salary AND top-quartile TrueImpact (the treasure cluster).

### 9.2 Trap stars (6–8)

24–29 PPG on 20+ attempts at **0.85–0.95 pts/shot**, high TO, soft defense, 4.5–5★ hype, top-decile salary, TrueImpact of a mediocre starter or worse. Placement: 2 seeded across auction waves, 2–3 in FA, and their former teams appear in `league_history.csv` as big-payroll mid-table disappointments.

### 9.3 Aging curve (applied to the upcoming season; hype/salary ignore age)

| Age | Drift |
|---|---|
| 19–23 | +4%/yr (Young Risers outperform sticker) |
| 24–29 | flat (stats honest) |
| 30–32 | −4%/yr |
| 33+ | −8%/yr (the cliff; the Aging Legend trap) |

`prev_` columns are generated by inverse-applying the prior year's drift + noise, so YoY-delta-vs-age plots draw the curve.

### 9.4 Synergy discoverability

~10 of the 90 league-history teams violate spacing/rim thresholds and sit **6–10 wins below** talent expectation — consistent negative residuals in a student regression. Every 50+ win team clears both bars. Nothing stated; everything inferable.

### 9.5 Turnover poison & noise budget

One extra team TO/game ≈ **−2.5 wins/season** (~2× intuition). League-table regression lands at **R² ≈ 0.80**: models are trustworthy, eyeballing is insufficient.

### 9.6 Archetypes (generation texture)

Efficient Star (rare, fairly priced), Volume Scorer **trap**, Two-Way Wing, Elite Defender (bargain cluster), Floor General, Sharpshooter + Rim Protector (synergy enablers, underpriced), Aging Legend **trap**, Young Riser (hidden gem), Journeyman filler.

## 10. Validation Harness (generator ships only if all pass)

1. **Regression check:** rerun the student exercise on generated data → coefficient signs/magnitudes as designed (payroll ≈ 0, TO large-negative, efficiency large-positive).
2. **Bargain check:** the ≥15-player treasure cluster exists.
3. **Trap check:** every trap's hype rank exceeds its TrueImpact rank by ≥40 percentile points.
4. **Fairness sim:** 1,000 simulated seasons, model-following teams vs. sort-by-PPG teams → good-model team finishes top-3 in **~75%** of seasons, wins the championship in **~40–45%**. Logistic steepness and noise are tuned until both hold.
5. **Scout-grade check:** a scout-grade-only strategy finishes mid-table in the fairness sim — better than the PPG-sorters, worse than the modelers.
6. **Personality null check:** personality labels have no statistically detectable relationship with TrueImpact or wins in generated data.
7. **Market-coverage check:** every round's free-agency draw contains enough position and price-tier coverage to build (round 1, 20 teams × 8 players) or repair (rounds 2–5) a legal roster.

## 11. Screens

**UI principles (apply to every screen):**

- **Facts, never conclusions.** Screens show raw stats and plain arithmetic (this-season vs. listed numbers) but never value judgments ("a steal", "declining", "underperforming"), trend adjectives, or derived efficiency metrics. Anything that smells like analysis is the students' job — the UI must not do their modeling for them. (Same rule as the lineup screen's no-synergy-meter policy. The scouting-news hint line is the one sanctioned exception, professor-controlled.)
- **Visual style: "Arena Broadcast."** Dark courtside palette (navy `#0d1b2e`–`#132a4a`, gold `#ffc94d` accents), LED-style monospace timers, bold italic uppercase branding, gold ticker bars with boxed tags (e.g., `SCOUT WIRE`). **No emojis anywhere in the product UI.** Hype is rendered as ★ glyphs (it's a real data column, not decoration).
- **First-timer readability:** each decision screen leads with what to do (numbered sections / status lines), one headline number per player card, full stat tables one tap deeper.

1. **Landing/Join (`/`)** — join code, display name, franchise pick/create, role claim (shows open roles per team).
2. **Lobby (`/lobby`)** — teams assembling, rules carousel (*wins crown the champion · $100M hard cap · cut players still get paid*), professor starts season.
3. **Front Office (`/game/office`)** — §4.1. New UI build. Approved layout (mocked 2026-07-14): single scroll, sticky payroll bar (cash + dead-money segments) pinned top, three numbered collapsible sections — 1 Expiring deals · 2 Your roster · 3 Tonight's market (read-only) — all expanded by default; a section auto-collapses to a one-line "n of n decided" summary header when its decisions are complete; headers always show status so collapsed ≠ hidden obligations. Player cards: avatar initials, position badge, age, contract (rate × rounds), and a monospace stat line "this ssn X ppg / listed Y ppg" — no judgment labels. Wizard structure was considered and rejected.
4. **Free Agency (`/game/market`)** — §4.2. New UI build. Sign panel: years slider with live rate/total/cap check.
5. **Star Auction (`/game/auction`)** — §4.3. Ancestor: Bakery Bash sealed-bid screens.
6. **Set Lineup (`/game/lineup`)** — §4.4. Drag-to-slot; deliberately dumb (no derived meters).
7. **Simulate (`/game/simulate`)** — cascade ticker.
8. **Results (`/game/results`)** — record, highlights, awards carousel, CSV download, standings snapshot (reuses shuffle component at half-size).
9. **Standings (`/standings`)** — always accessible: W-L, point diff, wins-per-payroll-dollar.
10. **Finale (`/game/conclusion`)** — champion podium; season awards (League MVP, Best Bargain, 💀 Worst Contract — dead-money hall of shame); **the Reveal**: hype vs. TrueImpact scatter with traps/bargains labeled, the sim's true weights vs. what a `league_history.csv` regression finds ("the answer was in your inbox a week ago"), each team's best/worst signing, wins-per-dollar ranking.
11. **Professor Control Panel (`/professor`)** — phase advance/pause, timers, per-team submission lights, force-advance, config knobs (cap, inflation, timers, round count, hint strength), full-game CSV export for debrief.
12. **Projector View (`/bigscreen`)** — spectator screen, mode follows phase:
    - Decision phases: phase name + countdown + 20-logo submission grid (grey→green)
    - Simulate: league-wide scoreboard flood
    - Post-simulate: **the Standings Shuffle** — rows re-rank bottom-up one at a time, ▲/▼ movement arrows, green/red flashes, first place reveals last; callout badges (🔥 Biggest Climber, 📉 Hardest Fall, W-streak flames); holds until professor advances. Round 5: shuffle slows for the top three = the championship reveal, then hands off to Finale.
    - Implementation: `previousRank → newRank` computed server-side at simulate close; projector is pure playback.
13. **Cheat sheet** (printable page).

Two-screen principle: private detail (your box scores) on team laptops; shared drama (the Shuffle) on the wall.

## 12. Tech Stack

- **React + Firebase (Firestore, Cloud Functions, anonymous auth, join codes)** — same architecture as Bakery Bash, **fresh codebase** (no code copied; patterns ported: phase machine, sealed-bid resolution, lobby/join flow, professor panel, security rules philosophy).
- Proven at 60–70 concurrent students for under ~$1/session on Spark plan.
- Server-authoritative: hidden attributes, TrueImpact, and resolution logic never leave Cloud Functions. Players read/write only their own submission fields; game state read-only; decisions immutable once submitted.
- Repo location: `games/salary-showdown/`.

## 13. Edge Cases & Timeout Rules

- FA/Front Office timeout: whatever was committed stands (signings are instant); uncommitted intentions are lost.
- Round-1 illegal roster at timeout: autofill cheapest legal players.
- Lineup timeout: last valid lineup carries; round 1 auto-arrangement.
- Auction: no bid = no participation; cap-invalid bids blocked at input time; resolution-order cap re-check per §5.
- Late joiners: can join through Lobby; after round 1 starts, join as observers of an existing team.
- Disconnects: state lives in Firestore; refresh resumes.
- Years slider max = rounds remaining (round 4 → 1–2; round 5 → 1).

## 14. V2 Parking Lot

- Playoff bracket finale (pitch to boss)
- Player trades between class teams (offer inbox in Front Office)
- Performance-driven market repricing (hot players' rates spike)
- Hot/cold form streaks; fatigue system; injuries
- Durability pattern (games_played predicts availability — currently a red herring)
- **Personality with teeth:** traits gain real effects — e.g., locker-room chemistry (two Divas clash, a Leader lifts young players), turning the V1 red herring into a discoverable V2 pattern for returning students

## 15. Open Tuning Dials (playtest targets)

- Cap ($100M), base-rate curve, contract discount schedule, inflation rate (8%)
- Logistic steepness + noise (fairness targets §10.4)
- Synergy thresholds and penalty/bonus magnitudes
- Trap-star count (6–8), treasure-cluster size (≥15), salary R² (0.45), league-table R² (0.80)
- Scout-grade correlation (r ≈ 0.3); follower-count weight in hype (0.20)
- Market rotation: round-1 pool share (~75%), per-round draw share (~40–50%), reappearance-guarantee window (2 rounds)
- Phase timer durations; auction wave sizes (4–6)
