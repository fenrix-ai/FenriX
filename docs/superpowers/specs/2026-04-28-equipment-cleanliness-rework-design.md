# Equipment & Cleanliness Rework — Bakery Bash

**Status:** Design — pending implementation plan
**Date:** 2026-04-28
**Scope:** `games/bakery-bash` revenue formula, satisfaction systems, and supporting state.

---

## 1. Problem

The current game has three under-leveraged systems:

1. **Maintenance** is a dead end. Players submit `maintenanceTasks` in the decision payload, but `runSimulation` never reads them. The four bars (cleanliness, oven, slicer, espresso) stay at 100 forever. The only consequence in the entire codebase is that cleanliness < 40 triggers a burglary roll.
2. **Customer satisfaction** has a real feedback loop (fill rate → foot traffic → returning customers) but it's attenuated by ad wins and chef quality, and isn't tied to the things players see in the world (cleanliness, equipment).
3. **Chef satisfaction** works as a kitchen-cohesion penalty (sous chef count → output multiplier) but is a synthetic concept that students don't have visibility into via the dataset.

Meanwhile, the student dataset (already published) contains a different set of variables that don't match the current game model:

```
bakery_id, location_type, bakery_size, storefront_color, traffic_zone, parking_spots,
head_chef_tradition, chef_count_total, chef_skill_level, sous_chef_count,
maintenance_staff_count, owner_years_experience, equipment_grade, cleanliness_grade,
price_*, qty_*, ad_spend_*, primary_ad_channel,
customer_satisfaction, yelp_review_count, total_units_sold
```

The rework brings the game's revenue formula into alignment with this dataset, makes Maintenance a real strategic lever, and removes chef satisfaction as a player-visible concept.

---

## 2. Goals

- **Maintenance becomes meaningful**: `maintenance_staff_count` and `equipment_grade` drive customer satisfaction and (for equipment) production capacity.
- **Equipment is a strategic investment ladder**: F → A grades, with one tier upgrade purchasable per round.
- **Cleanliness is a per-round operational lever**: drifts based on staffing vs. customer volume.
- **Chef satisfaction is removed** as a player-visible system. Output is driven directly by chef stats.
- **Yelp is a deliberate red herring**: present in the output dataset but not consumed by the formula.
- **Schema-stable**: no new columns added to the student dataset; values inside existing columns can change.

## 3. Non-Goals

- No changes to ad channels (the in-game `TV/Billboard/Radio/Newspaper` vs. dataset `instagram/tiktok` mismatch is a separate concern).
- No changes to product catalog (8 products in the dataset vs. 6 currently in code is out of scope here — addressed in a future rework).
- No changes to revenue scale or starting cash ($10,000) — the post-Apr-2026 rescale is the baseline.
- No backwards-compatibility shim for old `MaintenanceBars` state. Existing in-flight games may need to be reset.
- No premium/basic product split (considered and dropped — narrow multipliers do the balancing work).
- **No new bakery-attribute variables added to the game.** The formula in this spec only references state that's already in the game today (or added explicitly by this rework). Dataset columns that have no in-game source are filled with noise — see §4.2.

---

## 4. Variable Mapping

### 4.1 In scope — variables this rework uses

These are either already in the game or added explicitly by this rework.

| Dataset variable | In game? | Role |
|---|---|---|
| `sous_chef_count` | existing | capacity (linear bonus, +10% per chef) |
| `maintenance_staff_count` | **NEW (this rework)** | drives `cleanliness_grade` drift; $20/round per staff |
| `equipment_grade` | **NEW (this rework)** | capacity AND satisfaction multipliers; A–F ladder |
| `cleanliness_grade` | **NEW (this rework)** | satisfaction multiplier; A–F, drifts per round |
| `price_*` | existing | demand share + revenue |
| `qty_*` | existing | supply ceiling |
| `ad_spend_*` | existing (channel rename out of scope) | foot traffic, diminishing returns per channel |
| `customer_satisfaction` | existing | output; feeds next round's foot traffic via reputation |
| `total_units_sold` | derivable from existing | output |

### 4.2 Out of scope — dataset columns with no in-game source

These columns appear in the published student dataset but have **no corresponding state in the current game** and are **not added by this rework**. They must be populated when the CSV is generated; choices below.

| Dataset variable | Disposition |
|---|---|
| `bakery_id` | already exists as Firestore document ID; no change |
| `location_type`, `bakery_size`, `traffic_zone`, `parking_spots` | **noise** — filled with random per-bakery values at game creation, persisted on the bakery record, not consumed by any formula |
| `storefront_color` | **noise** — random per-bakery, never read by formula |
| `head_chef_tradition` | **noise** — random per-bakery, never read by formula |
| `chef_count_total` | **noise** — random per-row, never read |
| `chef_skill_level` | **noise** — random per-row, never read |
| `owner_years_experience` | **noise** — random per-bakery, never read |
| `primary_ad_channel` | **noise** — random per-bakery, never read |
| `yelp_review_count` | **noise** — random per-row, never read by formula (see §10) |

A future rework can promote any of these from noise to signal by adding the corresponding game state and wiring it into the formula. That work is explicitly out of scope here.

---

## 5. Revenue Formula Pipeline

```
Step 1 — Customer footfall
  base = existing baseline customer pool (unchanged from current game)
  ads  = 1 + Σ ad_lift(channel, spend)
         // ad_lift: per-channel diminishing-returns curve; e.g.,
         //   lift(spend) = α_channel × log(1 + spend / scale_channel)
         // Channels are the existing in-game set (TV, Billboard, Radio,
         // Newspaper). Channel rename to match the dataset (Instagram /
         // TikTok) is out of scope.
  rep  = 1 + β × (prior_customer_satisfaction − 50) / 50
         // β around 0.40 — a 50-point swing in prior sat moves traffic ±20%.
         // Replaces the old getReturningCustomerBonus discrete-tier mechanism.
  customers = base × ads × rep

Step 2 — Per-product demand share
  for each product p:
    price_factor_p = price_elasticity(price_p, anchor_price_p)
                     // existing fair-price anchors per product
    popularity_p   = base_share_p × price_factor_p
    demand_p       = customers × normalize(popularity_p across menu)

Step 3 — Production capacity
  kitchen_strength = (1 + 0.10 × sous_chef_count)
                   × specialty_chef_multiplier         // existing tier-based
                   × equipment_factor_capacity(equipment_grade)

  capacity_p = base_throughput_p × kitchen_strength

Step 4 — Units sold
  qty_sold_p       = min(qty_stocked_p, min(demand_p, capacity_p))
  total_units_sold = Σ qty_sold_p

Step 5 — Customer satisfaction (output)
  fill_rate_p   = qty_sold_p / demand_p          // existing tier table
  fill_sat      = weighted_avg(fill_rate_p → satisfactionPct)

  customer_satisfaction = fill_sat
                        × cleanliness_factor(cleanliness_grade)
                        × equipment_factor_satisfaction(equipment_grade)
  // Note: prices already affect satisfaction indirectly via Step 2's
  // price_factor (which shapes demand → fill rate → fill_sat).

Step 6 — Yelp (PURE NOISE — not derived from any game variable)
  yelp_review_count = random_uniform_int(YELP_MIN, YELP_MAX)
  // Sampled fresh per row at CSV-export time. No relationship to satisfaction,
  // customers, revenue, or any other variable. Yelp is NOT a game variable —
  // it's only present as a column in the student dataset to teach
  // correlation-vs-causation: students should find that yelp does not
  // predict revenue in regression.

Step 7 — Cleanliness drift
  Δ = (maintenance_staff_count × 20) − (customers × 0.20)
  cleanliness_score_next = clamp(0, 100, cleanliness_score + Δ)
  cleanliness_grade_next = grade_from_score(cleanliness_score_next)

Step 8 — Equipment upgrade (optional, one tier per round)
  if upgrade_purchased:
    cash -= tier_cost(current_grade → next_grade)
    equipment_grade = next_grade

Step 9 — Revenue
  revenue = Σ (price_p × qty_sold_p)
```

### 5.1 Multiplier tables

**Equipment factor — capacity** (35% spread):

| Grade | Factor |
|---|---|
| F | 0.85 |
| E | 0.91 |
| D | 0.97 |
| C | 1.03 |
| B | 1.09 |
| A | 1.15 |

**Equipment factor — satisfaction** (17% spread):

| Grade | Factor |
|---|---|
| F | 0.92 |
| E | 0.95 |
| D | 0.98 |
| C | 1.02 |
| B | 1.05 |
| A | 1.08 |

**Cleanliness factor — satisfaction** (25% spread):

| Grade | Factor |
|---|---|
| F | 0.85 |
| E | 0.90 |
| D | 0.95 |
| C | 1.00 |
| B | 1.05 |
| A | 1.10 |

Combined max revenue swing across grades (F-only-everything vs. A-only-everything, equipment + cleanliness): roughly **1.45×**. Comparable in magnitude to a fully-staffed sous-chef roster or a winning ad slate — major lever, not runaway dominant.

---

## 6. Equipment Upgrade Mechanic

### 6.1 Tier costs

| Upgrade | Cost | Rationale |
|---|---|---|
| F → E | $400 | <1 round of revenue; quick early bump |
| E → D | $600 | 1 round of saving; commits the player |
| D → C | $800 | 1–2 rounds; competitive threshold |
| C → B | $1,000 | Matches product-unlock cost; real trade-off |
| B → A | $1,200 | Endgame luxury; only reachable by leaders |
| **Total path F→A** | **$5,000** | ~50% of starting cash, full game arc |

Anchored to existing economy: starting cash $10k, engaged revenue ~$4.4k/round, product unlock $500. C→B at $1,000 deliberately costs more than skipping a single ad slate ($300) + one sous chef ($30) + stock ($280) = $610 — buying it forces a real trade.

### 6.2 Constraints

- **One tier per round.** No skipping. Stops cash-rich late-game players from buying A in a single shot.
- **No degradation.** Once at a grade, stays at that grade unless explicitly downgraded by a future event (out of scope here).
- **Default starting grade: C.** The dataset can introduce variance across bakeries (some start at B or D), but the canonical starting grade is C.
- **Decision lives in the Decide phase**, alongside other player decisions (ads, chefs, stock).

---

## 7. Cleanliness Drift Mechanic

### 7.1 Scoring

Internal score 0–100, mapped to letter grades:

| Score range | Grade |
|---|---|
| [0, 16) | F |
| [16, 33) | E |
| [33, 50) | D |
| [50, 67) | C |
| [67, 83) | B |
| [83, 100] | A |

Default starting score: **75** (mid-B). High enough to give players a few rounds of grace before drift bites.

### 7.2 Per-round delta

```
Δcleanliness = (maintenance_staff_count × 20) − (customers × 0.20)
cleanliness_score_next = clamp(0, 100, cleanliness_score + Δ)
```

At typical engaged-play traffic (~200 customers/round):

| Maintenance staff | Net Δ | Behavior |
|---|---|---|
| 0 | –40/round | Slips ~2 grades per round |
| 1 | –20/round | Slips 1 grade per round |
| 2 | 0 | Steady-state |
| 3 | +20/round | Improves 1 grade per round |
| 4 | +40/round | Improves 2 grades per round |

**2 maintenance staff is the comfort line at typical traffic.** Below that you're losing ground; above it you're banking grade for high-traffic rounds ahead.

### 7.3 Cost

**Maintenance staff cost: $20/round each.**

Sits between the 1st sous chef ($10) and 4th sous chef ($30). 2 staff = $40/round = ~0.9% of typical revenue — fair price for keeping cleanliness from slipping.

---

## 8. What Gets Removed

### 8.1 Chef satisfaction (entirely)

- Delete `chefSatisfactionScores` from `GameState`.
- Delete `chefSatisfactionScore` from `RoundResult`.
- Delete `chefDepartures` from `RoundResult`.
- Delete `calculateChefSatisfactionScore` and `calculateEffectiveOutput` from `chef-system.js`.
- Delete `chefSatisfactionThreshold`, `chefSatisfactionDecay`, `chefSatisfactionFloor` from config.
- Output is now `kitchen_strength × base_throughput` directly — no morale multiplier.
- Remove the StaffTab "Sous Chef Efficiency" label and the ResultsPhase chef-satisfaction display.

### 8.2 MaintenanceBars (entirely)

- Delete `MaintenanceBars` interface from `types/game.ts`.
- Delete `maintenanceBars` from `GameState`.
- Delete `MaintenanceTask` enum and `maintenanceTasks` from `PendingDecisionDraft`.
- Delete StatusTab and any UI that displays the four bars.
- **Delete the burglary curveball entirely.** Cleanliness's only consequence is now the satisfaction multiplier in Step 5. Remove `burglaryThreshold`, `burglaryChance`, and `burglaryAmount` from config; remove the burglary code path from `runSimulation`.

### 8.3 Existing satisfaction code

- `calculatePerProductSatisfaction` and `calculateAggregateSatisfaction` stay as the foundation (Step 5 of the new pipeline).
- `getFootTrafficModifier` is **deleted**. Its responsibilities are split:
  - sat → traffic linkage moves into Step 1's `rep` term (uses prior round's satisfaction directly).
  - ad bonus moves into Step 1's `ads` term (with the new diminishing-returns curve).
  - the **premium product bonus, variety bonus, and sous chef foot-traffic bonus are dropped entirely.** These were stacking nudges that double-counted with capacity (sous chefs already drive output via Step 3) or kludged a rich-get-richer effect onto satisfaction (premium product). The new pipeline gets its variety from Step 2's normalized demand share and its quality reward from the `rep` loop.
- `getReturningCustomerBonus` is deleted — superseded by the `rep` term, which makes prior-round satisfaction continuously affect traffic rather than gating a discrete returning-customer pool.

---

## 9. New State and Decisions

### 9.1 Added to player state (per round)

| Field | Type | Notes |
|---|---|---|
| `equipmentGrade` | `'A' \| 'B' \| 'C' \| 'D' \| 'E' \| 'F'` | starts C |
| `cleanlinessScore` | number 0–100 | starts 75; grade derived |
| `maintenanceStaffCount` | number | new decision in Decide phase |
| `equipmentUpgradePurchased` | boolean | new decision in Decide phase |

### 9.2 Added to round result

| Field | Type | Notes |
|---|---|---|
| `equipmentGrade` | letter | snapshot at end of round |
| `cleanlinessGrade` | letter | snapshot at end of round |
| `cleanlinessScore` | number | for engine debugging; not necessarily exposed to player |

Yelp is **not** added to round result — it is sampled fresh at CSV-export time and never persisted in the simulation.

### 9.3 CSV export columns

The CSV columns must match the published student-dataset schema exactly. Confirm column order with whoever owns the dataset spec before implementation.

---

## 10. Yelp Mechanics (pure noise)

Yelp is **not a game variable.** It is generated as random noise purely for the CSV export so the dataset column is populated. It has zero relationship to any other variable in the game.

```
yelp_review_count = random_uniform_int(YELP_MIN, YELP_MAX)
// Recommended range: YELP_MIN = 0, YELP_MAX = 500.
```

The value is sampled fresh per CSV row. There is no persistence round-over-round, no derivation from satisfaction or traffic, and no read of `yelp_review_count` anywhere in `runSimulation`, `customer-allocation`, satisfaction, revenue, or any other simulation code path.

**Pedagogical purpose:** students who run regressions on this dataset will find that yelp does not predict revenue (because it is noise). This teaches that not every variable in a dataset is signal — a useful lesson in correlation vs. causation and feature selection.

---

## 11. Resolved Decisions

The questions raised during design have been answered:

1. **Bakery starting grade variance:** All bakeries start at **C**. No randomization at game creation. Variance comes only from in-game upgrades.
2. **Burglary curveball:** **Dropped entirely** (see §8.2). Cleanliness's only consequence is the satisfaction multiplier.
3. **Default maintenance staff count:** **2** (the comfort-line value at typical traffic — passive players naturally hold steady).
4. **Default equipment upgrade decision:** "no upgrade" (must be explicitly purchased each round).
5. **Yelp generation:** Pure random noise, no formula derivation (see §10).

## 11.1 Remaining Implementation Notes

These are not blocking but should be kept in mind during implementation:

- **Ad channel reconciliation.** Dataset has Instagram/TikTok; code has TV. Out of scope for this rework but the CSV-export step will need to map game channels to dataset channel names somehow (or the rename happens in a future rework).
- **Existing in-flight games.** No backwards-compat shim. If production games are running, they'll break and need to be reset. Confirm before deploying.
- **Specialty chef bidding.** Out of scope, but Step 3 keeps `specialty_chef_multiplier` as a placeholder for the existing tier-based multiplier.

---

## 12. Files Likely To Change

- `games/bakery-bash/app/src/types/game.ts` — type changes (add equipment/cleanliness, remove maintenance bars and chef sat).
- `games/bakery-bash/backend/functions/modules/config.js` — new tier-cost table, multiplier tables, drift rates.
- `games/bakery-bash/backend/functions/modules/satisfaction.js` — Step 5 rewrite (multipliers).
- `games/bakery-bash/backend/functions/modules/chef-system.js` — strip out chef-sat math, simplify to `kitchen_strength`.
- `games/bakery-bash/backend/functions/modules/revenue.js` — top-level pipeline orchestration.
- `games/bakery-bash/backend/functions/modules/simulation.js` — wire cleanliness drift, equipment upgrade application; remove burglary code path.
- `games/bakery-bash/app/src/components/game/tabs/StatusTab.tsx` — remove maintenance bars; add equipment grade and cleanliness grade.
- `games/bakery-bash/app/src/pages/phases/DecidePhase.tsx` (or equivalent) — add maintenance-staff and equipment-upgrade controls.
- CSV export module (location TBD) — add yelp noise sampler at export time, drop any maintenance-bar columns, add equipment/cleanliness grade columns.
- `games/bakery-bash/backend/test/*` — update affected tests; add equipment/cleanliness coverage; remove burglary tests.
- `games/bakery-bash/backend/scripts/balance/*` — update strategies and harness to exercise the new mechanics.

---

## 13. Acceptance Criteria

- A new game can be played end-to-end with the new mechanics.
- The CSV export matches the published student-dataset schema (column order and types).
- Cleanliness drift produces the predicted per-round behavior (verified by a scripted test at typical traffic levels).
- Equipment upgrades visibly cost cash and bump the grade, one tier per round, with the multipliers applied next round.
- Yelp is randomly sampled at CSV-export time; no read of `yelp_review_count` exists anywhere in `runSimulation`, satisfaction, customer allocation, revenue, or any other simulation code path.
- Burglary curveball is fully removed from config, simulation code, and tests.
- Chef satisfaction does not appear anywhere in the type system, simulation, or UI.
- Multi-round balance harness shows no single strategy with >60% win rate (existing balance bar).
