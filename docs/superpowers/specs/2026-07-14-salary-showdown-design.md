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
- Tiebreakers, in order: wins → point differential → total points scored → coin flip (seeded server-side, logged).
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
| 60–70 | Round 5 | full loop; years slider capped at 1 |
| 70–75 | Finale | champion, awards, the Reveal |

## 4. The Round Loop (rounds 2–5)

1. **Front Office** (~3 min) — GM submits. Card-based roster per the approved §11.3 layout (player cards: avatar initials, position badge, contract = rate × rounds left, monospace "this ssn X ppg / listed Y ppg" line — raw numbers, no green/red delta coloring, no judgment labels), numbered collapsible sections, sticky payroll bar vs. cap with dead-money segment, expiring-contracts panel (re-sign at the current ask or let walk — §13 Contract timeline), cut flow with dead-money confirmation modal, tonight's market preview (incoming FAs + auction stars: name/position/hype only), scouting news banner (flavor + one soft hint; hint strength is a professor knob). Market inflation ticks at phase open (round-r ask = base × 1.08^(r−1); §13).
2. **Free Agency** (~2.5 min) — GM submits. **Free agency is non-exclusive:** the FA pool is a shared catalog — any number of franchises may sign their own independent copy of the same player, and signing never removes a player from the market (the market table is static within a phase; **auction stars are the only exclusive players**). **Rotating market:** round 1 opens with a large pool (~75% of all free agents); each later round the signable list is a fresh server-seeded random subset (~40–50%) — identical for every team. Unavailable players are hidden by default (no clutter); an "All players" filter chip reveals them greyed for reference. Displayed prices are always **tonight's ask** (base list × 1.08^(round−1); round 1 = the CSV base exactly) — noticing the drift is the students' arithmetic, not a UI callout. Anti-frustration guard: a player absent two consecutive rounds is guaranteed into the next draw. When a team cuts a player or lets him walk, that team's **own copy** becomes re-signable by that team again — the player was never removed from anyone else's rotation draws; expiring re-signs are exempt (incumbent right lives in Front Office). Rotation × inflation is the urgency engine: waiting risks both reappearance and +8% pricing. The market table shows sticker stats (players.csv numbers); a player's live season form, where it exists (only for rounds he was rostered — §7.2), appears in the sign drawer as a "this ssn" line, rendered "—" for players with no live rounds. Sign flow = years slider (see §5). Signings commit instantly; signing is blocked once the roster holds 10 players. Round 1 variant: extended timer, build min-8 roster, roster checklist widget enforces position coverage.
3. **Star Auction** (~2 min) — Scout submits. 5 exclusive star cards (stats, age, hype, grade, followers — no price). Sealed bid = a **contract offer**: per-round salary (minimum = the league minimum, $2.0M × inflation index; $0.1M steps) + years slider (1 to rounds remaining), same mental model as the FA sign drawer. One bid per team per star. **Winner = highest total guaranteed money** (salary × years); you pay your own offered structure; ties — including equal totals across different stars in the global sort — broken randomly. Live cap validation per covered round; an exposure meter shows worst-case payroll if all your bids win; submitting a bid set whose worst case exceeds the cap is explicitly legal ("bid on everything, keep what resolves" — the resolution skip rule handles it, §5). Teams may bid on multiple stars and may win multiple if cap **and roster slots** fit — a win that would exceed 10 roster spots is skipped at resolution exactly like a failed cap check. Public reveal shows the winning structure ("$8.0M/rd × 3 = $24.0M") — price and term discovery. Round 5 degenerates gracefully to a pure per-round bid. Unsold stars enter the FA rotation next round, priced by the standard hype curve (§13).
4. **Set Lineup** (~1.5 min) — Coach submits. 5 starter slots (2 Guards / 2 Wings / 1 Big, enforced), 1 Sixth Man, rest Bench — plus a **playstyle pick** (one of five, Balanced pre-selected; see §8a). Student-facing playstyle descriptions are one plain sentence of behavior, never advice: Balanced "Play your normal game." · Run & Gun "Play fast. More shots." · 3PT Barrage "Shoot more threes." · Inside Attack "Feed your Big." · Lockdown "Slow it down. Defend." No derived synergy meters shown (would leak the hidden model). Timeout → the carried lineup is re-validated against the current roster and auto-repaired if roster churn broke it (§13); playstyle always carries (round 1: auto-arrangement, Balanced).
5. **Simulate** (~1 min) — no inputs. Team screens: your ~19 games resolve as a rapid cascade of mini-cards. Projector: league-wide scoreboard flood.
6. **Results** (~1.5 min) — round record ("13–6"), Best Win / Worst Loss highlight cards, own box lines, awards carousel (**Round MVP · Top Scorer · Bargain of the Round** — best stats per salary dollar), **league-wide box score CSV download**, standings snapshot. Awards are recognition only, no gameplay effect.

Round 1 skips Front Office (no roster exists yet).

## 5. Economy

- **Hard salary cap per round: $100M** (tunable). Payroll = sum of active contract rates + dead money. The game blocks any signing/bid that would exceed the cap in any remaining round. No debt mechanic. Sole exception: hardship auto-signs (§13) may be cap-exempt, flagged on the team's screen.
- **Contracts — the years slider.** Signing sets contract length (1 to rounds-remaining). Longer = cheaper per-round rate:

| Length | Rate multiplier |
|---|---|
| 1 round | 100% |
| 2 rounds | 92% |
| 3 rounds | 85% |
| 4 rounds | 80% |
| 5 rounds | 75% |

- Salary is **paid every round** of the contract (recurring payroll, not lump sum).
- **Dead money:** cutting a player frees his roster spot but his per-round rate stays on your payroll as dead money for the round of the cut and every later covered round. Committed money is never recovered. (Full timeline rules in §13.)
- **Expiration:** when a contract's last covered round has been played, the player returns to the market; round r's Front Office expiring panel lists contracts whose last covered round was r−1. A renewal is an **ordinary signing at the current ask** (base rate × inflation index) — years slider available, standard length discounts apply. A cap-blocked or declined renewal means the player walks and joins the rotation.
- **Market inflation:** all unsigned list rates and renewal quotes rise **~8% per round** (professor knob). Rewards teams that analyzed early and act with conviction.
- **Auction contracts:** a bid is a full contract offer — per-round salary × chosen years (1 to rounds remaining). The star signs with the **highest total guaranteed money**; the winner pays their own offered structure. No length discount applies in auctions (length is the competitive lever instead). Dead-money rule applies if cut.
- **Auction resolution:** at phase close, sort all bids **globally** by guaranteed total descending; award each star to its highest bidder whose cap still fits across every covered round **and** who still has an open roster spot, counting stars already awarded this resolution (bids that no longer fit — cap or roster slot — are skipped); ties, within and across stars, broken randomly. Teams may win multiple stars. Minimum bid = the league minimum ($2.0M × inflation index) per round. Losers pay nothing. Unsold stars (zero bids, or every bid skipped) enter the FA rotation next round at the standard hype-curve price. Winning structures are public (price and term discovery).
- **Roster limits:** min 8 (must cover 2G/2W/1B lineup), max 10 — the max is enforced at FA signing, at bid input where knowable, and at auction resolution. Round-1 timeout with an illegal roster → the hardship autofill (§13) signs the cheapest legal players on 1-round deals, cap-exempt if necessary (deliberately mediocre). The same hardship rule guarantees a legal roster in rounds 2–5.
- Base rates (indicative, tuned in playtesting): journeymen $2–6M (league minimum $2.0M), starters $8–15M, stars $18–28M per round.

## 6. Players & Positions

- **~175 fictional players** (~150 free agents + ~25 auction-class stars across 5 waves). Fictional = full control of the data-generating process; no advantage for NBA fans.
- **Positions:** Guard / Wing / Big. Lineup template 2G/2W/1B.
- **Hype (1–5★):** public reputation rating. Drives salary; deliberately ignores efficiency, turnovers, and age (defense earns only half-credit through visible skill — §9.1: defenders are underpriced, not unseen).

## 7. Datasets

### 7.1 Pre-release package (T−7 days, via LMS/email)

Framing: *"Your ownership group hired you as a front office. Draft night is Thursday. Come with a plan."* No graded pre-work — preparation is its own reward (inflation and draft-night time pressure punish cold starts organically).

**`players.csv`** — one row per player (~175). Full contract — column order is frozen; additions append at the end (§7.3):

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
| 10 | `scout_grade` | `A+` … `D` | Noisy-honest — weakly correlated with TrueImpact (latent mixing dial 0.22; realized r ≈ 0.39): beats guessing, loses to models. The non-fan's starting prior |
| 11 | `social_media_followers` | int, 10k–20M | Trap fuel — feeds hype, zero sim weight ("10M followers ≠ good at basketball") |
| 12 | `games_played` | int 40–82 | Red herring (V2 durability hook) |
| 13 | `mins_per_game` | 8–38 | Context — last season's role + sample-size warning; tier assignment sets minutes in-game, not this |
| 14 | `pts_per_game` | 2–30 | Emission of usage × efficiency; main hype driver. Trap fuel alone, honest when paired with attempts |
| 15 | `fg_attempts_per_game` | 2–24 | The decoder — emission of usage; `pts ÷ fga` against the **0.94 break-even** (§8.1) unlocks scoring value's sign |
| 16 | `fg_pct` | .38–.62 | Honest, underpriced — emission of efficiency (heavy TrueImpact weight) |
| 17 | `three_pt_pct` | .20–.45 | Honest, double-duty — efficiency + spacing-synergy eligibility |
| 18 | `ft_pct` | .55–.95 | Red herring — zero sim weight, but carries a mild efficiency echo (a naive kitchen-sink regression may flag it — a narrative-resistance foil for the debrief) |
| 19 | `rebounds_per_game` | 1–13 | Honest, underpriced — defense/rebounding emission |
| 20 | `assists_per_game` | 0.5–10 | Honest — playmaking emission (hype sees it directly and through visible skill, alongside half-credit defense — §9.1) |
| 21 | `steals_per_game` | 0.2–2.5 | Honest, underpriced — defense emission |
| 22 | `blocks_per_game` | 0–2.8 | Honest, double-duty — defense + rim-protection synergy |
| 23 | `turnovers_per_game` | 0.5–4.5 | The poison column — heaviest negative TrueImpact weight, invisible to hype |
| 24 | `prev_pts_per_game` | number | Honest — time machine |
| 25 | `prev_fg_pct` | number | Honest — time machine |
| 26 | `prev_mins_per_game` | number | Honest — YoY deltas vs. `age` draw the aging curve pre-game |

Information architecture: **4 mechanical** (`position`, `age`, `salary_per_round`, `auction_round`) · **~10 honest evidence** · **4 trap fuel** (`pts`, `hype`, `salary`, `followers`) · **4 red herrings** (`years_pro`, `games_played`, `ft_pct`, `personality`) · rest utility/context.

**`league_history.csv`** — 90 rows (30 fictional teams × 3 seasons; `season` column). Columns (exactly the shipped header): `team_name`, `season`, `wins`, `losses`, `pts_per_game`, `fg_pct`, `three_pt_pct`, `ft_pct`, `rebounds_per_game`, `assists_per_game`, `steals_per_game`, `blocks_per_game`, `turnovers_per_game`, `total_payroll`, `avg_hype`, `playstyle` (appended; the team's predominant playstyle that season — fuels the interaction-term discovery in §9.7).

This is the **outcome table**: regressing `wins` on the rest reveals the sim's true weights. Integrity guarantee: **wins are generated by running the actual game engine** over a synthetic league — never hand-written — so every discoverable relationship is true in the game students play. Aggregation-method note (binding on the runtime port): the team stat columns are **analytic slot-weighted aggregates** of the rosters' expected per-game output (×1.25 team scaling × pace × noise), not summed box-score emissions; the live box-score allocator (§8.4) must produce team-level aggregates consistent with this scaling so live stats match the historical fingerprints (§9.7).

**Scouting memo** (1 page): column definitions, season rules, zero strategy hints.
**Player cheat sheet** (printable): round loop, role ownership, cap/dead-money rules, base-rate tables. No spoilers.

### 7.2 In-game data feed — round box scores

After every Simulate phase: downloadable CSV of **the whole league's box scores** for that round (~190 games × ~18 player-lines ≈ 3,400 rows/round). Public like real NBA stats. **One denormalized file per round** — pivot-table ready with zero joins; cumulative analysis is just stacking files. Note: unsigned free agents generate no box scores (they didn't play); a player's live form exists only for rounds he was rostered. Because free agency is non-exclusive (§4.2), the same `player_id` may legitimately appear on multiple teams in the same round — each rostered copy generates its own independent stat line, and round awards are computed over rostered copies (one player can win an award on two teams).

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
| 23 | `playstyle` | the team's chosen playstyle that round (appended col) — coach tendencies are public, like film |

Enables mid-game discovery: aging fade, trap-star inefficiency bleed, breakout bargains — and opponent scouting for the Scout role.

### 7.3 Schema governance (the anti-Bakery-Bash-mess rules)

- **One schema, one generator, everything derives.** Hidden attributes live in one place; every student-facing artifact (both pre-release CSVs, round box scores, in-app market/roster tables) is an emission from the same pipeline. Adding a column = one emission function + one harness assertion; nothing is hand-maintained in parallel.
- **Additive-only, append-right.** Existing columns are never renamed, retyped, or reordered. New columns append at the end.
- **The freeze applies to shipped files, not the schema.** The two pre-release CSVs are immutable once students have downloaded them — there is no patching those. But the schema can still grow mid-run through the live layers, additive-only: new columns on the round box-score feed, new in-app table columns, or a supplemental professor-released drop between rounds (e.g., a "mid-season scouting update" CSV). Rule of thumb: never change what's in students' hands; ship additions as new columns or new files.
- Schema version noted in the scouting memo (not inside the CSVs).

## 8. Simulation Engine

Hidden per-player attributes (never shipped to any client): `usage`, `efficiency`, `playmaking`, `ball_security`, `defense` (incl. rebounding), plus `age_drift`.

1. **Player value:**
   `scoring_value = shots_taken × (points_per_shot − 1.00) + W_CREATION × shots_taken` — the small per-attempt creation term (`W_CREATION = 0.06`) prices shot creation/gravity, so the true **break-even is 0.94 points per shot**: `pts ÷ fga` below 0.94 makes volume *negative*; between 0.94 and the 1.00 league average it is weakly positive but overpriced. Volume scoring isn't worthless — it's overpriced; efficiency still dominates (trap stars formalized).
   `TrueImpact = base + a·scoring_value + b·playmaking + c·defense − d·turnovers`, all `× age_drift`. Weights tuned so defense + ball security carry roughly the value hype ignores. Constants live in `datagen/config.py` and ship in `engine_params.json`.
2. **Team strength:** tier weights — Starter ×1.0, Sixth Man ×0.6, and **exactly two Bench slots at ×0.35 each** — weighted sum of TrueImpact. Roster spots 9–10 are **inactive depth**: they add no strength. A 10-man roster is not stronger than an identical 8-man one; extra bodies are contract insurance, not power. Plus exactly two synergy adjustments (magnitudes are `config.py` dials; tuned values quoted):
   - **Spacing:** <2 starters with real 3-point skill → −3 strength; 3+ → +1.5
   - **Rim protection:** no shot-blocking presence in starters+6th → −3; elite presence → +2
2a. **Playstyle deltas (applied to team strength before games):** playstyles are **additive, variance-normalized, zero-mean deltas — not stat multipliers**. Each style's delta is a linear function of the team's slot-weighted component sums, rescaled to a common SD and centered on the history population so the league-average roster is indifferent between all five styles (per-style calibrated scale/constant ship in `engine_params.json`). `datagen/engine.py` plus `engine_params.json` are the **binding reference** the Cloud Functions port must match; per-channel loadings live in `config.py STYLE_DELTA`. The channels:
   - **Balanced** — empty delta (baseline)
   - **Run & Gun** — loads negatively on the slot-weighted **turnover burden**: fast pays iff you handle it clean. Possessions +15%, which also *lowers* game-outcome variance (steeper logistic — see item 3)
   - **3PT Barrage** — loads positively on **pure 3-point skill**, negatively on interior scoring; the <3-genuine-shooters **misfire penalty lives inside the delta** so calibration keeps the style zero-mean. Pace +3% (slightly *lower* game variance)
   - **Inside Attack** — loads on **Big scoring and, dominantly, total rebounding**: paint pays iff you own the glass
   - **Lockdown** — loads on **steals + blocks (stocks)**, mildly negative on scoring; possessions −15% → *higher* game variance (fewer possessions → more upsets — the rational underdog play)
   The student-facing one-sentence style descriptions (§4.4) are unchanged; none of this mechanism is shown in-app.
3. **Games:** logistic win probability on strength gap; game-level steepness scales with the two teams' average pace factor (more possessions → fewer upsets). Tuned high-variance per game (any team can win any night) because the ~95-game season smooths records to skill: *chaos per game, justice per season.* Scores generated around league norm (~102) with margin from the gap.
4. **Box scores:** team output allocated by usage × tier minutes; shooting lines shaped by true efficiency; counting stats emitted from attributes + noise. Team-level aggregates must be consistent with the history-file scaling (§7.1 aggregation-method note). **Age drift applies progressively (1/5 of season drift per round)** so decline/improvement is visible in the feed by round 3.
5. **Schedule:** full round-robin each round (no scheduler logic, no strength-of-schedule luck). Odd team count → the **Expansion Franchise** absorbs the bye: a house team with a fixed median-strength roster drawn from unsigned FAs at game generation, always Balanced, generating box scores like any team, excluded from standings and prizes (§13). If the class exceeds ~21 teams, the schedule switches to a **deterministic rotating balanced partial round-robin** — every team plays the same number of games each round; never random sampling (§13).

All game state transitions and resolution are Cloud Functions-only (server-authoritative), same security philosophy as Bakery Bash rules.

## 9. Hidden Patterns (the treasure map)

| Pattern | Where it's discoverable |
|---|---|
| Moneyball mispricing | pre-game: league table regression (**wins model**) + salary residuals (see §9.1 instructor note) |
| Trap stars | pre-game: pts÷attempts vs. the 0.94 break-even; in-game: box score bleed; finale reveal |
| Aging curve | pre-game: `prev_` columns vs. age; in-game: progressive fade |
| Lineup synergy | in-game: lineup experiments; finale reveal (no roster columns ship in league_history — §9.4) |
| Turnover poison | pre-game: league regression; in-game: losses pile up |
| Playstyle fit | pre-game: interaction terms in league table; in-game: box-score `playstyle` column |

### 9.1 Mispricing chain

```
hype   = 0.45·norm(PPG) + 0.20·norm(followers) + 0.15·norm(FGA) + 0.10·norm(AST)
         + 0.40·norm(visible_skill) + noise
         // visible_skill = playmaking + half-credit defense
         // still blind to: efficiency, turnovers, age
salary = rate_curve(hype) + noise
```

`scout_grade` is generated from TrueImpact + heavy noise (realized r ≈ 0.39) — the "experts beat nothing, models beat experts" column. `personality` is assigned independently of everything (pure flavor; the reveal shows it predicted nothing).

Market sanity is a **two-regime design** (amended during dataset generation): among *ordinary* players (excluding traps and defensive specialists) salary tracks TrueImpact at **R² ≈ 0.4** (realized 0.39) — the market isn't stupid. Across the *full* pool the correlation collapses toward zero (realized R² = 0.03), because the exceptions ARE the game: traps overpriced, defenders underpriced. ≥15 players sit in bottom-half salary AND top-quartile TrueImpact (the treasure cluster, harness-enforced; realized 18).

Instructor note: salary residuals off a *price-only* model (salary ~ published stats) reproduce the market's own bias — a volume trap can top that model's "most underpaid" list. The sanctioned Moneyball path is the **wins model** first (league-table regression), then residuals; the contrast between the two residual lists is itself a teachable reveal moment.

### 9.2 Trap stars (13 shipped: 7 volume scorers + 6 aging legends)

Both trap archetypes count as "traps" for harness check 3 (hype rank must exceed TrueImpact rank by ≥40 percentile points; realized minimum gap 72).

**Volume scorers (7):** ~18–21 PPG on 20–24 attempts — all seven are top-quartile scorers (league PPG q75 = 13.8) — at **0.84–0.94 published pts/shot** (`pts ÷ fga`; expected values 0.87–0.92, design band ~0.85–0.95 with observation-noise tolerance, all below the 0.94 break-even), high TO, soft defense, 4.5–5★ hype. Salary is typically top-decile among priced players but runs as low as ~p67 for one FA trap (a mid-priced "value"-looking starter — deliberately). TrueImpact of a mediocre starter or worse.

**Aging legends (6):** ages 33–37, 4.5–5★ hype, TrueImpact 4.2–8.0, with declining published trails (e.g. 18.6 → 16.6 PPG) that extrapolate the engine's −11%/yr cliff (§9.3). Several still clear the pts/shot bar — **age is their decoder, not efficiency**.

**Placement:** 6 seeded across the auction waves (4 volume + 2 legends; every wave carries ≥1 trap — harness check 11) and 7 in FA (3 volume + 4 legends). `league_history.csv` carries a distributional echo — big-payroll, high-hype, mid-table teams — not literal former rosters: the history table has no roster columns and its populations are generated independently of the 175 shipped players.

### 9.3 Aging curve (applied to the upcoming season; hype/salary ignore age)

**One honest per-season schedule tells the whole aging story** (no hidden cliff):

| Age | Per-season growth |
|---|---|
| ≤24 | +4.5%/yr (Young Risers outperform sticker; remaining upside capped at +12%) |
| 25–29 | flat (stats honest) |
| 30–32 | −4.5%/yr |
| 33+ | the cliff: −11%/yr, **compounding** season over season; cumulative level floors at 0.45 of peak (Aging Legends are 33–37) |

Three views of the same schedule (all in `config.py`): `yoy_growth` backs out the `prev_` columns (with noise; the fg% and minutes trails are dampened echoes), `age_drift` is the engine's one-season multiplier applied to sticker TrueImpact for the upcoming season, and `age_level` (the compounded cumulative level) scales aging legends' generated attributes so their sticker stats already show the fade. Trail, sticker, and engine tell one story — a student extrapolating the published YoY trail predicts the engine: realized trail YoY at 33+ is −10.9% vs. engine upcoming drift −11.0% (30–32: −4.3% vs. −6.7%).

### 9.4 Synergy bars

25 of the 90 history team-seasons (28%) violate a spacing or rim bar; violators average **23.2 fewer wins** than clean teams (harness check 10 enforces a 15–50% violation share and a ≥2-win gap). Discoverability is **in-game, not pre-game**: `league_history.csv` ships no roster-composition columns, so violators cannot be identified from the pre-release data (and the history residual tail is dominated by playstyle misfit in any case). Students find the bars through their own lineup experiments and the finale reveal. Nothing stated; everything inferable from play.

### 9.5 Turnover poison & noise budget

Two numbers, both true — and the gap between them is a designed teaching point:

- **What students measure:** the league-table regression coefficient on team turnovers is **≈ −3.8 wins per extra TO/game** (realized −3.84, p<0.001). This *bundles* the causal engine penalty with correlated roster sloppiness — high-TO teams also tend to carry worse shot selection and defense, so the coefficient absorbs a composition effect.
- **What the engine charges:** the causal weight is smaller (≈ −2 wins per TO/game — still ~2× what intuition prices).

Frame the difference at the reveal: regression on observational data recovers the *association*, not the isolated causal lever — omitted-variable bias in one slide. The canonical student spec is **rates-based** (omit `pts_per_game`, a mediator of efficiency). The league-table regression lands at **R² ≈ 0.70**: models are trustworthy, eyeballing is insufficient.

### 9.6 Archetypes (generation texture)

Efficient Star (rare, fairly priced), Volume Scorer **trap**, Two-Way Wing, Elite Defender (bargain cluster), Floor General, Sharpshooter + Rim Protector (synergy enablers, underpriced), Aging Legend **trap**, Young Riser (hidden gem), Journeyman filler.

### 9.7 Playstyle fit (main effects zero, interactions everything)

Historical teams in `league_history.csv` ran assorted playstyles. **Mean wins by playstyle is flat (~41 each)** — a student who pivots "average wins per playstyle" finds nothing. The signal lives only in **interaction terms**. This is the moderation/interaction-terms lesson — the answer isn't in the marginal. In-game, every team's playstyle is public in the box-score feed, so copying the leader's style without their roster fit is a visible, teachable failure.

**The interaction data contract** — every interaction must be expressible in *published* columns:

| Playstyle | Moderator (published column) | Fingerprint in shipped history (within-cell median split, mean wins) |
|---|---|---|
| Run & Gun | `turnovers_per_game` | low-TO teams 56, high-TO 25 |
| 3PT Barrage | `three_pt_pct` | elite-3P% teams 53, weak 28 |
| Inside Attack | `rebounds_per_game` (team-level Big-strength proxy; finer read via own roster in players.csv) | strong-glass teams 56, weak 25 |
| Lockdown | `steals_per_game` + `blocks_per_game` | defense-first teams 59, soft 29 |

All four fingerprints are pivot-table visible in the shipped data; the focused per-style regression (§10 check 9) is the guaranteed-detectable path either way.

**Generation requirements:**

- **Style assignment is randomized and exactly balanced** (18 team-seasons per style). This supersedes the earlier 60/40 fit/misfit design: fit-based assignment creates selection bias that makes high-variance styles look dominant, while randomization guarantees flat main effects and full moderator spread within every cell by construction — and misfit teams (the necessary contrast) arise automatically.
- **Style deltas are variance-normalized, zero-mean amplifiers:** each style's strength delta is rescaled to a common SD and centered on the actual history population (calibrated constants ship in `engine_params.json`), so no style dominates by variance and the league-average roster is indifferent between all five.
- **Pace confound is bounded:** Run & Gun inflates per-game counting stats (possessions +15%), Lockdown deflates them (−15%), Barrage nudges them up (+3%). The published `playstyle` column lets a regression with playstyle dummies absorb the pace shift; effects are tuned so the turnover coefficient stays correctly negative **with and without** playstyle dummies (teams that ignore playstyle must still find turnover poison). A `possessions_per_game` column is deliberately not published (keep the table lean); revisit if playtesting shows confusion.
- History is generated by the real engine with playstyle modifiers active, so box-score pace effects during the live game match the historical fingerprints.

## 10. Validation Harness (generator ships only if all pass)

1. **Regression check:** rerun the student exercise (rates-based spec) on generated data → **signs and significance** as designed: turnovers negative (p<0.05), FG% positive, steals + blocks sum positive with at least one individually significant (p<0.10), payroll and hype null (|t|<2). The harness asserts signs/significance, not point magnitudes — realized values are logged in §16.
2. **Bargain check:** the ≥15-player treasure cluster exists.
3. **Trap check:** every trap's hype rank exceeds its TrueImpact rank by ≥40 percentile points.
4. **Fairness sim:** repeated simulated class seasons — one regression-modeler franchise vs. a field of PPG-sorters, efficiency-aware amateurs, scout-grade followers, and random teams → the modeler finishes top-3 in **60–93%** of seasons and wins the championship in **30–62%** (windows widened from the original 75%/40–45% targets: "the analysis team usually wins" is the point of the class). Logistic steepness `k` is auto-tuned into this window and ships in `engine_params.json`.
5. **Scout-grade check:** strategy-tier ordering of median finish — modeler < scout-grade-only < PPG-sorter — with the scout-grade median rank inside [4, 14] of 20 (realized medians: 2 < 5 < 16).
6. **Personality null check:** personality labels have no statistically detectable relationship with TrueImpact or published production in generated data (max dummy |t| < 2). Wins-level nulls hold by construction: personality is assigned independently and never enters the engine.
7. **Market-coverage check:** every round's free-agency draw contains enough position and price-tier coverage for **any single team** to build (round 1) or repair (rounds 2–5) a legal roster. Free agency is non-exclusive (§4.2), so coverage is per-team against the shared catalog — not 20 × 8 distinct players.
8. **No dominant playstyle:** in generated history, playstyle main effects are statistically flat (dummy-model |t| < 2, spread ≤ 5.5 wins of Balanced), and every non-Balanced playstyle is the argmax choice for **at least 2 of the 90 plausible history rosters** (organic test — supersedes hand-built probe rosters).
9. **Interaction detectability (concrete assertions, run on the actual generated 90 rows):**
   - **Focused per-style tests** — exactly how a student would test a hypothesis: `wins ~ all stats + style dummy + dummy × centered moderator`, one style at a time. Every designed interaction (§9.7 table) has the designed sign at p < 0.05. (A single everything-model with all four interactions is collinearity soup no practitioner would run.)
   - Playstyle main effects stay flat in the dummies-only model (all p > 0.05).
   - Moderator spread within every style cell ≥ 50% of population SD (pace shifts whole cells, so tercile counting is the wrong test; within-cell variance is what identification needs).
   - Turnover coefficient is significantly negative both with and without playstyle dummies in the model (pace confound bounded).
10. **Synergy-bar check:** 15–50% of the 90 history team-seasons violate a spacing/rim bar, and violators average ≥2 fewer wins than clean teams (§9.4).
11. **Auction-wave check:** every wave has exactly 5 stars and ≥1 trap; every wave covers all three positions; the 25 stars include ≥4 of each position.

Plus two fail-closed diagnostic gates: **box-score arithmetic** — zero players with impossible scoring lines (`2·FGA·FG% ≤ pts ≤ 3·FGA·FG% + 0.35·FGA` on the rounded CSV) — and **market sanity** (salary~TrueImpact R² reported for the full pool and for ordinary players).

## 11. Screens

**UI principles (apply to every screen):**

- **Facts, never conclusions.** Screens show raw stats and plain arithmetic (this-season vs. listed numbers) but never value judgments ("a steal", "declining", "underperforming"), trend adjectives, or derived efficiency metrics. Anything that smells like analysis is the students' job — the UI must not do their modeling for them. (Same rule as the lineup screen's no-synergy-meter policy.) **Three sanctioned, deliberate exceptions:** the professor-controlled scouting-news hint line; the **wins-per-payroll-dollar** standings column (§2 — it quietly plants the Moneyball metric); and the **Bargain of the Round** award (§4.6 — it plants "stats per salary dollar" as a concept). The two derived metrics are exceptions *because* they seed the lesson; everything else stays raw.
- **Visual style: "Arena Broadcast."** Dark courtside palette (navy `#0d1b2e`–`#132a4a`, gold `#ffc94d` accents), LED-style monospace timers, bold italic uppercase branding, gold ticker bars with boxed tags (e.g., `SCOUT WIRE`). **No emojis anywhere in the product UI.** Hype is rendered as ★ glyphs (it's a real data column, not decoration).
- **First-timer readability:** each decision screen leads with what to do (numbered sections / status lines), one headline number per player card, full stat tables one tap deeper.

1. **Landing/Join (`/`)** — join code, display name, franchise pick/create, role claim (shows open roles per team).
2. **Lobby (`/lobby`)** — teams assembling, rules carousel (*wins crown the champion · $100M hard cap · cut players still get paid*), professor starts season.
3. **Front Office (`/game/office`)** — §4.1. New UI build. Approved layout (mocked 2026-07-14): single scroll, sticky payroll bar (cash + dead-money segments) pinned top, three numbered collapsible sections — 1 Expiring deals · 2 Your roster · 3 Tonight's market (read-only) — all expanded by default; a section auto-collapses to a one-line "n of n decided" summary header when its decisions are complete; headers always show status so collapsed ≠ hidden obligations. Player cards: avatar initials, position badge, age, contract (rate × rounds), and a monospace stat line "this ssn X ppg / listed Y ppg" — no judgment labels. Wizard structure was considered and rejected.
4. **Free Agency (`/game/market`)** — §4.2. New UI build. Approved layout (mocked 2026-07-14): **analyst table** — the full sortable column list is **Player, Pos, Age, Hype, $/rd, PPG, FGA, FG%, 3P%, REB, AST, STL, BLK, TOV** (STL and BLK are deliberate additions over the mock: they are exactly the columns that price the defensive bargain cluster, and omitting them would hide the signal in-app); filter chips (In market tonight [default] · All players [greyed reference] · position · price · search), sticky payroll bar. The table shows sticker (players.csv) numbers and is static within a phase (§4.2). Row click opens the **sign drawer** (right rail): years slider with per-round rate per stop, total commitment line, live cap check, "this ssn" live-form line where it exists ("—" otherwise), confirm button. Card-grid layout rejected for this screen (cards remain the Front Office language).
5. **Star Auction (`/game/auction`)** — §4.3. Ancestor: Bakery Bash sealed-bid screens.
6. **Set Lineup (`/game/lineup`)** — §4.4. Approved layout (mocked 2026-07-14): **half-court diagram** — 2 Guard slots up top, Wing slots on the wings, Big at the rim (arc + paint sketched in gold); drag cards between court, gold-bordered Sixth Man seat, and bench rail; empty slots are dashed outlines naming the needed position. Below the bench: **five playstyle cards** (name + one-sentence behavior), Balanced pre-selected. Status line does pure rules-checking ("Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Lockdown"). Deliberately dumb — no derived meters, validation not evaluation.
7. **Simulate (`/game/simulate`)** — cascade ticker.
8. **Results (`/game/results`)** — record, highlights, awards carousel, CSV download, standings snapshot (reuses shuffle component at half-size).
9. **Standings (`/standings`)** — always accessible: W-L, point diff, wins-per-payroll-dollar.
10. **Finale (`/game/conclusion`)** — champion podium; season awards (League MVP, Best Bargain, Worst Contract — the dead-money hall of shame; a styled skull icon in the Arena Broadcast language is fine, an emoji is not); **the Reveal**: hype vs. TrueImpact scatter with traps/bargains labeled, the sim's true weights vs. what a `league_history.csv` regression finds ("the answer was in your inbox a week ago"), each team's best/worst signing, wins-per-dollar ranking. Reveal payload rules in §11.14.
11. **Professor Control Panel (`/professor`)** — phase advance/pause, timers, per-team submission lights, force-advance, config knobs (cap, inflation, timers, round count, hint strength), full-game CSV export for debrief.
12. **Projector View (`/bigscreen`)** — spectator screen, mode follows phase:
    - Pre-game (Landing/Lobby): **giant join code** + teams-forming grid (reuses the submission-grid component with team names and claimed-role pips)
    - Decision phases: phase name + countdown + 20-logo submission grid (grey→green)
    - Simulate: league-wide scoreboard flood
    - Post-simulate: **the Standings Shuffle** — rows re-rank bottom-up one at a time, ▲/▼ movement arrows, green/red flashes, first place reveals last; callout badges (Biggest Climber, Hardest Fall, Win Streak — text labels with color treatment, no emojis); holds until professor advances. Round 5: shuffle slows for the top three = the championship reveal, then hands off to Finale.
    - Implementation: `previousRank → newRank` computed server-side at simulate close; projector is pure playback.
    - Approved animation (mocked 2026-07-14): rows land bottom-up one per ~0.8s with slide + green/red flash; top three shrouded until last (first place reveals last); round 5 slows the final three reveals to ~3s each and hands off to the Finale podium. Callout badges after settle: Biggest Climber, Hardest Fall, Win Streak.
    - **Viewer-aware highlight:** the standings/shuffle component takes an optional `highlightTeamId`. Team-facing surfaces (Results snapshot, Standings page) pass the viewer's franchise — their row is visually highlighted. The projector passes none: the wall shows no team preference.
13. **Cheat sheet** (printable page).

14. **Unmocked screens — behavioral contracts.** These screens ship from the written contracts below; only Simulate and Results are candidates for real mocks later.
    - **Landing (`/`):** join code + display name + franchise pick/create + role claim. Franchise names come from a curated list plus free text with a length cap and a professor rename tool (names go on the wall). Role claims are first-tap-wins, resolved transactionally server-side; a lost race shows "role taken" and the open-roles list refreshes. Late joiners after round 1 enter as observers of an existing team (§13).
    - **Lobby (`/lobby`):** team rosters assemble live; roles may be released and re-claimed freely until the professor starts the season; rules carousel cycles the cheat-sheet rules. No ready-check — the professor's start button is the gate. The projector shows the pre-game mode (join code + teams-forming grid, §11.12).
    - **Simulate (`/game/simulate`):** the team's ~19 games resolve as a cascade of mini-cards (opponent, final score, W/L color coding), server-paced at roughly 3 s/card into a terminal "Round complete — results ready" state; no inputs exist on this screen. The projector floods league-wide scores in parallel.
    - **Results (`/game/results`):** round record, Best Win / Worst Loss cards, own box lines (all 23 feed columns, §7.2), awards carousel (auto-advance ~5 s with manual arrows; Bargain of the Round names the winner and shows his raw stat line + salary — not a computed stats-per-dollar figure), CSV download (one denormalized file per round, `boxscores_round_N.csv`; cumulative analysis is stacking files), standings snapshot with the viewer's row highlighted.
    - **Finale (`/game/conclusion`):** the Reveal renders from a **server-generated static payload** (hype-vs-TrueImpact scatter data, true engine weights vs. history-regression weights, per-team best/worst signings, wins-per-dollar ranking) that Cloud Functions produces **only after the final Simulate resolves** — TrueImpact never ships to any client before the game ends (§12). Wall = podium + professor-stepped, one-chart-at-a-time Reveal; team laptops = full scrollable debrief of the same payload.
    - **Professor panel (`/professor`):** phase advance/pause/force-advance (force-advance applies the same defaults as a §13 timeout), per-team submission lights (one light per team — exactly one role submits per phase), config knobs editable only between rounds (cap, inflation, timers, hint strength; round count locks when round 1 starts), confirmation guard on force-advance and every knob change, full-game CSV export for the debrief.

**Mockup errata.** The approved mockups convey layout and visual language; **the spec's rules are authoritative, and implementers must recompute all sample numbers** — none of the following are design decisions. Known sample-data errors in the mock set: an auction exposure example that breaches the cap yet is labeled "Fits — bids valid" (with an unreachable "peak $99.3M round 4" figure); an "$18M × 4" contract shown at round 3 (max rounds-left is 3); a "57 of 60 games" projector caption (no schedule quantity equals 60); an FA market count below the contracted draw window; an un-bid star appearing in the same round's lineup; trap-styled star cards whose pts/shot compute as efficient (1.17–1.24); star ages shown in a market preview contracted to name/position/hype; and a missing price filter chip on the FA analyst table.

Two-screen principle: private detail (your box scores) on team laptops; shared drama (the Shuffle) on the wall.

## 12. Tech Stack

- **React + Firebase (Firestore, Cloud Functions, anonymous auth, join codes)** — same architecture as Bakery Bash, **fresh codebase** (no code copied; patterns ported: phase machine, sealed-bid resolution, lobby/join flow, professor panel, security rules philosophy).
- Proven at 60–70 concurrent students. **Blaze plan (pay-as-you-go) required** — Cloud Functions are not available on the free Spark tier; realistic session cost ~$1.
- Server-authoritative: hidden attributes, TrueImpact, and resolution logic never leave Cloud Functions **until the Finale phase unlocks the post-game reveal payload** (generated server-side after the final Simulate — §11.14). Players read/write only their own submission fields; game state read-only; decisions immutable once submitted.
- Repo location: `games/salary-showdown/`.

## 13. Edge Cases, Contract Rules & Timeouts (normative)

**Contract timeline:**

- A contract signed in round r for Y years covers rounds **r through r+Y−1 inclusive**. Auction contracts start the round won — the star plays tonight and counts against round r's payroll. `payroll(team, r)` = Σ rates of contracts covering r + Σ dead-money charges scheduled for r.
- **Dead money:** a cut in round r's Front Office converts the contract's per-round rate to dead money for round r and every later covered round (the player no longer plays for you; the money stays). The dollar total is identical to the active schedule — only the payroll-bar segmentation changes.
- **Expiring panel:** round r's Front Office lists contracts whose **last covered round was r−1**. A re-sign is an ordinary signing at the current ask and takes effect for round r.
- **Inflation index:** the ask in round r = base list rate × **1.08^(r−1)**. Round 1 equals the CSV base exactly; the first tick happens at round-2 Front Office open. Renewal quotes float with the index — no clamp (a $28M star renews above $28M late-game; intentional).
- **Renewals** are ordinary signings at the current ask: years slider available, standard length discounts apply. A cap-blocked or declined renewal = the player walks into the rotation.

**Hardship rule (legal-roster guarantee, all rounds):** evaluated at Free Agency close each round — if a team cannot field a legal 8-man / 2G-2W-1B roster (expirations, cuts, dead money, timeout — any cause), the system auto-signs the cheapest legal position-eligible players on **1-round deals, cap-exempt if necessary**, flagged on the team's screen. The round-1 illegal-roster autofill is this same mechanism.

**Auction details:**

- Minimum bid = the league minimum: **$2.0M × inflation index** per round; salary input in $0.1M steps. One bid per team per star.
- Submitting a bid set whose worst case exceeds the cap is **legal** ("bid on everything, keep what resolves"); the resolution skip rule handles it.
- A bid is invalid — skipped at resolution exactly like a failed cap check — if winning it would push the team past 10 roster spots, counting stars already awarded earlier in the same resolution.
- Resolution = global sort by guaranteed total; ties (within and across stars) broken randomly; teams may win multiple stars.
- **Unsold stars** (zero bids, or every bid skipped) enter the FA rotation next round, priced by the standard hype curve.
- No bid = no participation; obviously-invalid bids (below minimum, over-cap single bid, roster already full with no expiring room) are blocked at input time where knowable.

**Timeouts & fallbacks:**

- FA/Front Office timeout: whatever was committed stands (signings are instant); uncommitted intentions are lost.
- Lineup timeout: the carried lineup is **re-validated against the current roster**. If roster churn has made it illegal (cut/walked player in a slot, coverage broken), the system auto-arranges the best legal lineup by minutes-tier defaults; **playstyle always carries** unchanged. Round 1: auto-arrangement, Balanced.
- Late joiners: can join through Lobby; after round 1 starts, join as observers of an existing team.
- Disconnects: state lives in Firestore; refresh resumes.
- Years slider max = rounds remaining (round 4 → 1–2; round 5 → 1).

**League shape:**

- **Odd team count:** the **Expansion Franchise** absorbs the bye — a house team with a fixed median-strength roster drawn from unsigned FAs at game generation, always Balanced, generating box scores like any team, **excluded from standings and prizes** (its games count normally in real teams' records).
- **More than ~21 teams:** deterministic **rotating balanced partial round-robin** — every team plays the same number of games each round; never random opponent sampling.
- **Tiebreakers:** wins → point differential → total points scored → coin flip (seeded, logged).

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
- Trap-star count (volume traps 6–8; shipped 7, plus 6 aging legends = 13 total traps), treasure-cluster size (≥15; shipped 18), ordinary-player salary R² (~0.4), league-table regression R² (shipped 0.70)
- Scout-grade correlation (latent mixing dial `SCOUT_GRADE_R = 0.22`; realized grade~TI r ≈ 0.39); follower-count weight in hype (0.20)
- All generator dials live in `games/salary-showdown/datagen/config.py` — the single source of truth (one exception: the logistic `k` is auto-tuned per build and ships in `engine_params.json`; config holds only its pre-tune seed); the spec records design intent, config records tuned reality
- Market rotation: round-1 pool share (~75%), per-round draw share (~40–50%), reappearance-guarantee window (2 rounds)
- Playstyle deltas (§8.2a): per-channel loadings (`STYLE_DELTA`), common SD (`TARGET_STYLE_SD`), pace factors (+15% / +3% / −15%), misfire penalty (`BARRAGE_MISFIRE`) — additive zero-mean deltas; there is no multiplicative style-multiplier table
- Phase timer durations; auction wave size (fixed at 5 — changing it requires updating harness check 11)

## 16. Dataset v1.0 — Generation Results (2026-07-14, regenerated post-sweep)

Generated by `games/salary-showdown/datagen/` (seed 310, commit `1d2a4a5`); all 11 harness checks green, plus the box-arithmetic and market-sanity diagnostics. Roughly 1 in 3 fresh seeds passes everything on the first draw (90-row OLS power is finite); the harness fails closed, so a bad draw can never ship.
Student package: `games/salary-showdown/data/` (players.csv, league_history.csv, README).
Answer key + engine constants: `games/salary-showdown/datagen/private/` (never ships).

Realized headline numbers:

- Base student regression on the league table (rates-based spec): turnovers **−3.84 wins each** (p<0.001), FG% **+273** (p=0.014), steals **+2.2** (p=0.014) and blocks **+4.8** (p=0.048) — defense individually visible; payroll t=−0.03, hype t=1.37 (both null, as designed); R² = 0.70
- Fairness: modeler top-3 **86%**, champion **48%** (k = 0.09); strategy medians: modeler 2 < scout-grade 5 < PPG-sorter 16
- Bargain cluster: 18 players; trap gap: min hype-vs-TrueImpact percentile gap **72 points** (13 traps = 7 volume scorers + 6 aging legends, §9.2)
- All four playstyle interactions recoverable at p<0.05 (RG×TOV −2.87, BAR×3P +837, INS×REB +2.47, LOCK×DEF +2.47) with flat main effects (max |t| = 0.19, spread 1.2 wins)
- Best-fit style across 90 history rosters: Balanced 12 / Run & Gun 17 / Barrage 29 / Inside 20 / Lockdown 12 — every style is somebody's answer
- Synergy bars: 25/90 team-seasons (28%) violate a bar; violators average 23.2 fewer wins than clean teams
- Aging honesty (verified on the shipped CSVs): published trail YoY at 33+ = −10.9% vs. engine upcoming drift −11.0%
- Box-score arithmetic: 0/175 impossible scoring lines (points per make 2.43–2.81); market sanity: salary~TI R² = 0.03 all players / 0.39 ordinary players; scout_grade~TI r = 0.39
- Auction: 5 stars per wave, ≥1 trap per wave, class position mix G9/W8/B8

Canon established by the data: **the $100M cap is new this season** — historical payrolls
were uncapped (up to ~$142M), which is both the cover story for history payroll levels and
one more breadcrumb for the payroll≠wins scatter.

Amendments made during generation (all reflected above): randomized balanced style
assignment (§9.7), variance-normalized zero-mean style deltas (§9.7), two-regime market
sanity (§9.1), one-schedule aging story with Legends at 33–37 (§9.3), volume-creation term in
scoring value (break-even 0.94 pts/shot — volume is overpriced, not worthless),
focused per-style interaction tests and organic argmax (§10), widened fairness windows (§10.4).

**Post-sweep reconciliation (2026-07-14).** A verified 69-finding audit and the datagen sweep (commit `1d2a4a5`) were reconciled into this spec today. Normative changes: free agency declared **non-exclusive** with duplicate-copy semantics for box scores and awards (§4.2, §7.2, §10.7); §8 rewritten to the implemented engine — additive variance-normalized zero-mean playstyle deltas with `engine.py` + `engine_params.json` as the binding reference, the old multiplicative style-multiplier table deleted here and in §15; scoring value carries the creation term with a **0.94 break-even** (§7.1, §8.1); bench counting fixed to exactly two ×0.35 slots with spots 9–10 as inactive depth (§8.2); contract timeline, 1.08^(r−1) inflation index, ordinary-signing renewals, cap-exempt hardship autofill, auction minimum bid / roster-slot skip / unsold-star fallback / tie scope, lineup-carryover re-validation, Expansion Franchise, balanced >21-team scheduling, and the full tiebreaker chain written as normative rules (§2, §5, §13); hype's defense half-credit acknowledged (§6, §7.1); trap profile, aging schedule, synergy story, turnover realized-vs-causal framing (omitted-variable teaching point), and every headline number above updated to the regenerated dataset; §10 extended to the 11-check + diagnostics harness with wording matched to what it actually asserts; §11 principles gain the two sanctioned derived-metric exceptions, lose all emojis, and gain STL/BLK in the FA analyst table, unmocked-screen behavioral contracts (§11.14), a pre-game projector mode, and a mockup-errata note; §12 corrected to Blaze plan and a post-game reveal-payload exception. Known plausibility-texture items deferred to a future regeneration (schema-compatible): widen the surname pool, jitter the 20M follower cap, allow 82-game seasons, widen the minutes distribution tails, and seed 2–3 boundary players at 0.97–1.02 pts/shot so the trap ratio alone misclassifies somebody and regression earns its keep.
