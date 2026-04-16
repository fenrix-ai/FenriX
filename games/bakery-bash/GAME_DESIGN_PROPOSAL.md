# Game Design Proposal — Bakery Bash

**Date:** April 1, 2026 · Updated April 8, 2026 (all-hands decisions) · Updated April 15, 2026 (Chef System)
**Team:** Game Design (Dylan M. + Mia) · Frontend (AB + Kavin) · Backend (Daniel + Scott + Dylan B.)
**Target Launch:** April 27 or May 1, 2026
**Course:** MGSC 310 · Prof. Frenzel · Chapman University

> This document proposes an MVP-scoped version of Bakery Bash. It is intentionally simplified from the full design deck to maximize the chance of shipping a working game by launch day. Features can be layered on after the core loop works.

---

## Concept

Players run competing grab-and-go cafés in a shared plaza food court. Each round, they set prices for their products, decide how many staff to hire, and bid in auctions for scarce resources (advertisements, highly-rated chefs, etc.) on a fixed budget given at the start of the game. A regression model running on the individual player's computer can be used to help them win. The player with the highest cumulative net revenue across all rounds wins.

Players receive "company emails" between rounds containing sales proceeds, market updates, and news. They export their data as CSV, build predictive models externally (Excel for MGSC 220, Python for MGSC 310), and input decisions back through the UI. There is no in-game model building. The game teaches regression modeling, price elasticity, resource optimization, and competitive strategy through direct experience.

> **Design principle:** Players do NOT see their remaining budget in the UI. They receive revenue reports and sales data each round but must track their own finances externally (Excel, paper, etc.). This is intentional — financial self-management is part of the challenge.

---

## Target Variable

**Revenue** (continuous, in dollars). This is the output of the regression model and the metric students will try to predict. It is computed server-side — players never see the target model coefficients directly.

Revenue must be continuous (not bucketed or categorical) so students can run linear regression on it. Integer is also acceptable — you could round to whole dollars.

---

## Round Structure

5 rounds, approximately 42.5 minutes total including setup and explanation time.

| Phase | Duration | What Happens |
|---|---|---|
| 1. Decide | ~5 min | Players set prices, adjust staffing, and add new menu items based on regression model (+ new data from each round). Timer counts down. |
| 2. Bidding | ~2 min | Players do an advertisements bidding round (1 min) and head chefs bidding round (1 min). |
| 3. Simulate | ~30 sec | Backend runs a regression model, computes revenue, allocates customers. Run a minigame for players to interact with here. |
| 4. Review | ~1 min | Players see results: revenue, customer count, leaderboard update. |
| 4.5. Company Email | — | Players receive an in-game "company email" with sales proceeds, market updates, and news. Data is exportable as CSV for external modeling. |
| 5. Repeat | — | Next round begins. New data row appended to player's dataset. |

---

## Player Decisions (MVP)

Three base decision inputs per round.

| Decision | Input Type | What Player Does | Why It Matters |
|---|---|---|---|
| Quantity | Stock quantity per product | Set quantity for each product | Players must balance the costs of stock input and the expected revenue |
| Average Price | Average price of products | Set average price of store's products | Teaches price elasticity — too high loses customers, too low kills margin |
| Staffing | Integer | Choose how many employees to hire (costs $/round) | Marginal returns — more staff = more throughput but higher costs. **Staffing costs are dynamic** — prices increase each round as demand rises. If all specialists are taken by competitors, they become unavailable. Players who anticipate demand and hire early get rewarded with lower costs. |
| Ad/Chef Bids | $ amount | Choose how much to spend on bidding | Competitive — shared customer pool means ad ROI depends on others' spend |

### Bidding Process

Players have 1 minute to bid each round, sealed auction, highest bidder wins. Players strategize to maximize their expected value.

**Advertisements:** Players bid across 4 different advertisements (TV, radio, newspaper, billboard), each with different optimal prices and varying levels of revenue yield. **Ad auction winners get visual representation in the game** — e.g., if your bakery wins the billboard bid, other players see your bakery's ad on screen next round.

**Chefs:** Players bid across chefs with different nationalities and skill levels. Each chef has a visible nationality and skill tier, but **hidden specialty products**. Their multiplier only affects their own individual output — no stacking across chefs. See [Chef System](#chef-system) below for full details.

### Menu Items

**Base:** Croissant, Cookie, Bagel

**Option to add new menu item + quantity of stock each round.**

**New item selection:** Sandwich, Latte, Matcha Latte — six products, six price inputs total.

---

## Chef System

*Updated April 15, 2026*

### Overview

Chefs are biddable assets with a visible nationality and skill level, but **hidden specialty products**. Their multiplier only affects their own individual output — no stacking across chefs. Players must infer specialty alignment through observation and predictive modeling.

---

### Base Chef & Specialty Chef Cap

**Base Chef (Starting State)**

All players begin with a **base chef** at **1.0x output speed across all products** — no specialties, no bonuses. This is the baseline every player starts from, making the chef bidding system purely additive upside.

```
Base Chef: 1.0x speed on all 6 products (Croissant, Matcha, Coffee, Sandwich, Cookie, Bagel)
```

**Specialty Chef Cap: Maximum 3**

Players can hold a maximum of **3 specialty chefs** at any time. Specialty chefs are acquired through the auction. If a player wins a bid that would give them a 4th specialty chef, a **Chef Roster Management screen** is triggered immediately after the auction — the player must lay off one of their existing specialty chefs before proceeding. Laid-off chefs return to the auction pool for future rounds.

**Full Chef Roster State at Any Time:**

| Slot | Chef | How Acquired |
|---|---|---|
| Always present | Base Chef (1.0× on all products, no specialty) | Automatic — cannot be removed |
| Specialty Slot 1 | Bidded specialty chef (or empty) | Won at auction |
| Specialty Slot 2 | Bidded specialty chef (or empty) | Won at auction |
| Specialty Slot 3 | Bidded specialty chef (or empty) | Won at auction |
| Sous Chef slots (unlimited) | Generic output helpers | Hired directly — no auction |

**Strategic implications of the cap:**
- Players must actively manage their chef roster — not just acquire, but also cut
- A laid-off high-skill chef re-entering the auction can shift the competitive dynamic significantly
- Players may strategically lay off chefs to disrupt opponents (e.g. releasing a chef a competitor wants back)
- Knowing opponents' roster compositions (based on who bid on what) becomes part of the predictive modeling

---

### Sous Chefs

Sous chefs are **non-specialty helpers** that players can hire directly — no auction required. They are unlimited in number, but each additional sous chef costs progressively more, reflecting the management overhead of a larger kitchen team.

**Sous chef output:**

Sous chefs produce at **0.5× the base parameter of the highest-level specialty chef currently on the team**. They apply this output to all products equally — no specialty bonus.

```
Sous Chef Daily Output = 0.5 × (30 × Base Multiplier of Highest Specialty Chef)
```

| Highest Specialty Chef on Team | Their Base Multiplier | Sous Chef Output |
|---|---|---|
| None (base chef only) | 1.0× | 0.5 × 30 × 1.0 = **15 units/day** |
| Novel | 1.0× | 0.5 × 30 × 1.0 = **15 units/day** |
| Intermediate | 1.25× | 0.5 × 30 × 1.25 = **18.75 units/day** |
| Advanced | 1.6× | 0.5 × 30 × 1.6 = **24 units/day** |

> Sous chef output scales with the team's best specialty chef — incentivizing players to win higher-skill chefs at auction before hiring sous chefs, since better leadership lifts the whole team's baseline.

**Escalating hire cost:**

| Sous Chef # | Cost Multiplier (relative to base hire cost) |
|---|---|
| 1st | 1.0× (base cost) |
| 2nd | 1.5× |
| 3rd | 2.25× |
| 4th | 3.0× |
| 5th+ | +0.75× per additional chef |

> Exact base cost should be tuned to the existing budget economy. The principle: a few sous chefs are affordable throughput insurance; stacking many becomes expensive and creates diminishing returns relative to winning better specialty chefs at auction.

---

### Bidding

Chefs enter the bidding pool with a **higher minimum bid floor** than standard items — reflecting their strategic value.

| Skill Level | Proposed Minimum Bid |
|---|---|
| **Novel** | ~2× baseline item floor |
| **Intermediate** | ~3–4× baseline |
| **Advanced** | ~5–6× baseline |

> Exact values should be tuned to the existing bid economy. The principle: chefs should feel like meaningful investments that players compete over.

---

### What Players Can See vs. What's Hidden

| Attribute | Visible to Players? |
|---|---|
| Chef Nationality (French, Japanese, Italian, American) | ✅ Yes |
| Skill Level (Novel, Intermediate, Advanced) | ✅ Yes |
| Specialty Products | ❌ Hidden |
| Output Multiplier Values | ❌ Hidden |

This is the core tension: players know a French chef is *probably* good at Croissants and Coffee, but the game never confirms it. They must build that inference through their predictive model.

---

### Individual Chef Output Multipliers

Each chef independently produces a quantity of product per day based on a **base rate × their skill multiplier**. The total product output for any given item is the **sum of every chef's individual contribution** — including the base chef who is always present.

**Base rate:** 30 units/day (applies to every chef, including base chef)

| Skill Level | Non-Specialty Multiplier | Specialty Multiplier |
|---|---|---|
| **Novel** | 1.0× | 1.4× |
| **Intermediate** | 1.25× | 1.75× |
| **Advanced** | 1.6× | 2.2× |

**Output formula per chef:**
```
Chef Daily Output = Base Rate (30) × Skill Multiplier
```

**Total product output formula:**
```
Total Daily Output (e.g. Croissants) =
    Base Chef             (30 × 1.0)
  + Specialty Chef A      (30 × their multiplier)
  + Specialty Chef B      (30 × their multiplier)
  + Specialty Chef C      (30 × their multiplier)
```

**Concrete example — Croissant output with 2 specialty chefs:**

| Chef | Type | Multiplier | Daily Output |
|---|---|---|---|
| Base Chef | — | 1.0× | 30 units |
| Intermediate French Chef | Specialty (Croissant) | 1.75× | 52.5 units |
| Advanced Japanese Chef | Specialty (Croissant) | 2.2× | 66 units |
| **Total** | | | **148.5 units/day** |

> **Supply cap:** Total output is bounded by the quantity of supplies the player purchased that round. If a player only stocked 100 units of Croissant supplies, output is capped at 100 regardless of chef capacity.

**Non-specialty example:** An Intermediate French chef assigned to Bagels (not their specialty) outputs 30 × 1.25 = 37.5 units/day.

Players never see multiplier values — they observe resulting throughput and satisfaction signals over time and must infer chef alignment through their predictive model.

---

### Chef Nationalities & Specialties

Each nationality has two hidden specialty products. Multipliers below show output per chef per round based on skill level.

| Nationality | Specialties | Novel (Base / Specialty) | Intermediate (Base / Specialty) | Advanced (Base / Specialty) |
|---|---|---|---|---|
| **French** | Croissant, Coffee | 1.0× / 1.4× | 1.25× / 1.75× | 1.6× / 2.2× |
| **Japanese** | Matcha, Croissant | 1.0× / 1.4× | 1.25× / 1.75× | 1.6× / 2.2× |
| **Italian** | Sandwich, Coffee | 1.0× / 1.4× | 1.25× / 1.75× | 1.6× / 2.2× |
| **American** | Bagel, Cookie | 1.0× / 1.4× | 1.25× / 1.75× | 1.6× / 2.2× |

> Specialties are never shown to players. Nationality is visible — players must infer specialty alignment through observed throughput over time.
>
> **Overlap note:** French and Japanese both specialize in Croissant; French and Italian both specialize in Coffee. This is intentional — a player who holds one of each can double their Croissant or Coffee throughput, making cross-nationality stacking a high-reward strategy. The risk is that it requires two high-cost bids to execute and leaves other products underserved.

---

### Chef Spawn Rates by Round

Spawn rate = probability a chef of that skill level appears in the auction pool for a given round. Male and female chefs of the same nationality share identical spawn rates. As the game progresses, high-skill chefs become more available to sustain competitive spending pressure.

| Skill Level | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 |
|---|---|---|---|---|---|
| **Novel** | 65% | 55% | 40% | 20% | 5% |
| **Intermediate** | 30% | 35% | 40% | 45% | 45% |
| **Advanced** | 5% | 10% | 20% | 35% | 50% |

> Rates apply equally across all nationalities and both genders. Early rounds favor low-skill chefs to keep the auction economy accessible; late rounds surface high-skill chefs to reward players who have built strong cash positions.

---

### Revenue Flow

```
Each Chef:
    Base Rate (30 units/day) × Skill Multiplier = Chef's Daily Output

Sum of all chefs' daily outputs = Total Product Throughput
        ↓
    (capped by player's purchased supply quantity)
        ↓
Product Throughput → Customer Satisfaction
        ↓
Satisfaction → Foot Traffic
        ↓
Foot Traffic × Price × Conversion Rate = Revenue
```

---

### Strategic Loop

The hidden specialty system creates a **deduction game on top of the bidding game**:

1. Player sees an Advanced Japanese chef up for bid — bids aggressively expecting Matcha upside
2. Player stocks up on Matcha inventory to align with that chef
3. Over rounds, they observe higher throughput on Matcha → satisfaction rises → more traffic
4. That data point reinforces (or corrects) their predictive model for future rounds

Players who **misalign** chef purchases with inventory get penalized silently through weaker throughput — no explicit error, just worse outcomes that sharp players will notice.

---

### Chef Roster — Nationality, Specialties & Multipliers

Each chef is randomly generated using the framework below. Specialty products are **hidden from players** and must never be surfaced in the UI.

> **Asset Design Note:** Each entry includes a primary archetype and diverse variant suggestions. For culturally heterogeneous nationalities (French, American), multiple skin tone and hair type representations are listed — the generator can spawn any variant. All descriptions are direct input for front-end character design.
>
> **Scope:** Design each chef as a **head and neckline only** — portrait-style avatar icon. The crop should extend just past the collar so that neck attire (neckerchief, coat collar) is visible. No full body required.

---

#### 🇫🇷 French
**Specialties (Hidden):** Croissant, Coffee
**Possible Names — Male:** Jean-Pierre, Marcel | **Female:** Colette, Amélie

| Gender | Variant | Skin Tone | Hair | Facial Hair / Features | Accessories (randomizable) | Hat | Neckline |
|---|---|---|---|---|---|---|---|
| Male | **A — Classic Parisian** | Light/fair, slight olive undertone | Short brown hair, neatly combed back | Thin classic French handlebar mustache, waxed tips | None / simple gold signet ring visible at collar cuff | Tall toque blanche, straight and starched | Double-breasted white chef coat, blue neckerchief |
| Male | **B — Afro-French** | Deep warm brown (West/Central African-French heritage) | Short tight coils or low fade | Thin pencil mustache | Small gold stud earring / thin gold chain above neckerchief / small hoop | Toque blanche, slightly tilted | Same coat, blue neckerchief, relaxed |
| Male | **C — Maghrebi-French** | Medium tan/warm beige (North African-French heritage) | Short dark straight hair, side-parted | Clean-shaven with faint stubble | Thin silver chain above collar / small silver stud / none | Toque blanche | Classic coat, blue neckerchief |
| Female | **A — Classic Parisienne** | Fair, light pink undertone | Long brown hair in two braids draped forward | — | Pearl studs / small diamond studs / delicate gold drops | Low toque blanche, slightly tilted | Fitted white coat with blue trim at collar |
| Female | **B — Afro-French** | Deep brown (West African-French heritage) | Long box braids or thick natural twists, pulled loosely to one side | — | Gold hoops / large statement hoops / beaded drop earrings | Low toque blanche or chef's beret | Same fitted coat with blue trim |
| Female | **C — Maghrebi-French** | Warm medium tan | Dark wavy hair in two loose braids | — | Silver crescent earrings / turquoise studs / small silver hoop with charm | Low toque blanche | Fitted coat, blue trim |

**Multipliers by Skill Level:**

| Skill Level | Non-Specialty Products | Specialty Products (Croissant, Coffee) |
|---|---|---|
| **Novel** | 1.0× | 1.4× |
| **Intermediate** | 1.25× | 1.75× |
| **Advanced** | 1.6× | 2.2× |

---

#### 🇯🇵 Japanese
**Specialties (Hidden):** Matcha, Croissant
**Possible Names — Male:** Hiroshi, Kenji | **Female:** Yuki, Aiko

| Gender | Variant | Skin Tone | Hair | Facial Hair / Features | Accessories (randomizable) | Headwear | Neckline |
|---|---|---|---|---|---|---|---|
| Male | **A — Traditional** | Light/medium warm beige | Short straight black hair, neatly cut | Clean-shaven | None | White hachimaki tied at back, knot on side | Minimalist white chef coat, dark charcoal-gray apron |
| Male | **B — Modern Tokyo** | Light/medium warm beige | Slightly longer black hair, subtle textured fringe | Clean-shaven | Small silver stud (one ear) / thin black cord necklace / tiny geometric ear cuff | White hachimaki worn lower on forehead | Slim-fit white coat, black apron, rolled sleeves |
| Female | **A — Traditional** | Light/medium warm beige | Black hair with blunt straight-cut bangs, high ponytail | — | Cherry blossom hair clip / red kanzashi pin / white floral clip at ponytail base | White hachimaki tied at ponytail base | Clean white coat, black apron with subtle embroidered edge |
| Female | **B — Modern Tokyo** | Light/medium warm beige | Black hair, wispy side-swept bangs, high ponytail | — | Tiny silver studs / small pearl studs / minimalist geometric ear cuff | White hachimaki as thin headband across forehead | Slim-fit coat, dark apron, sleeves slightly rolled |

**Multipliers by Skill Level:**

| Skill Level | Non-Specialty Products | Specialty Products (Matcha, Croissant) |
|---|---|---|
| **Novel** | 1.0× | 1.4× |
| **Intermediate** | 1.25× | 1.75× |
| **Advanced** | 1.6× | 2.2× |

---

#### 🇮🇹 Italian
**Specialties (Hidden):** Sandwich, Coffee
**Possible Names — Male:** Marco, Luca | **Female:** Sofia, Giulia

> **Hat note for designers:** The cappello da cuoco is NOT the tall stiff toque blanche. It is a rounded, soft, pleated fabric hat — more like a gathered pillowcase shape sitting loosely on the head. Reference: traditional Italian trattoria chef imagery.

| Gender | Variant | Skin Tone | Hair | Facial Hair / Features | Accessories (randomizable) | Hat | Neckline |
|---|---|---|---|---|---|---|---|
| Male | **A — Classic Southern Italian** | Warm olive/medium tan | Short dark brown curly hair | Full thick Italian mustache, slightly curled ends | Thin gold chain above neckerchief / small gold cornicello pendant / none | Cappello da cuoco (floppy, pleated, worn slightly slouched) | White double-breasted coat, red neckerchief tied loosely |
| Male | **B — Northern Italian** | Fair/light olive | Short straight dark hair, neat | Thinner groomed mustache with slight stubble | Simple silver chain above collar / small silver medallion / none | Cappello da cuoco, more upright | Same coat, red neckerchief |
| Female | **A — Classic Southern Italian** | Warm olive/medium tan | Dark wavy hair pulled up under hat, loose strands framing face | — | Small gold hoops / coral drop earrings / gold knot studs | Cappello da cuoco (floppy, pleated, worn softly) | White coat with red trim at collar, red neckerchief |
| Female | **B — Northern Italian** | Fair with warm undertone | Dark straight hair in low bun under hat | — | Simple silver studs / small pearl drops / thin silver hoops | Cappello da cuoco, slightly neater fit | Same coat and neckerchief, polished stance |

**Multipliers by Skill Level:**

| Skill Level | Non-Specialty Products | Specialty Products (Sandwich, Coffee) |
|---|---|---|
| **Novel** | 1.0× | 1.4× |
| **Intermediate** | 1.25× | 1.75× |
| **Advanced** | 1.6× | 2.2× |

---

#### 🇺🇸 American
**Specialties (Hidden):** Bagel, Cookie
**Possible Names — Male:** Jake, Tyler | **Female:** Madison, Ashley

| Gender | Variant | Skin Tone | Hair | Facial Hair / Features | Accessories (randomizable) | Hat | Neckline |
|---|---|---|---|---|---|---|---|
| Male | **A — Classic All-American** | Fair/light, slight freckles | Short brown hair | Goatee, neat and trimmed close | None / small stud earring (one ear) / simple dog tag chain at neckline | Backwards baseball cap (white or khaki, no logo) | White chef coat worn open over plain white/grey t-shirt |
| Male | **B — African American** | Medium-deep brown | Short natural hair or low fade | Goatee or full short beard | Small gold hoop (one or both ears) / gold chain at neckline / diamond stud | Backwards baseball cap (dark color) | Same casual coat, denim apron visible at neckline |
| Male | **C — Latino-American** | Warm medium tan | Short dark hair, slightly wavy | Goatee | Small gold stud / thin gold chain at collar / none | Backwards cap | Same outfit, broad relaxed build |
| Female | **A — Classic** | Fair/light | Brown or blonde hair in neat bun, a few face-framing pieces loose | — | Small studs / tiny turquoise drops / minimalist bar earrings | No hat — bun is the signature | White coat with rolled sleeves, casual denim apron |
| Female | **B — African American** | Medium-deep brown | Natural hair in high puff bun or twisted updo | — | Gold hoops / large beaded hoops / cowrie shell drops | No hat | Same rolled-sleeve coat, denim apron |
| Female | **C — Latina** | Warm medium tan | Dark hair in sleek bun | — | Small gold huggies / turquoise studs / red enamel drops | No hat | Same outfit, athletic build |

**Multipliers by Skill Level:**

| Skill Level | Non-Specialty Products | Specialty Products (Bagel, Cookie) |
|---|---|---|
| **Novel** | 1.0× | 1.4× |
| **Intermediate** | 1.25× | 1.75× |
| **Advanced** | 1.6× | 2.2× |

---

### Chef Spawn Rates by Round

Spawn rates increase for higher-skill chefs as rounds progress, encouraging continued bidding investment. Male and female chefs share the same spawn rate within each nationality.

| Skill Level | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 |
|---|---|---|---|---|---|
| **Novel** | 65% | 55% | 40% | 20% | 5% |
| **Intermediate** | 30% | 35% | 40% | 45% | 45% |
| **Advanced** | 5% | 10% | 20% | 35% | 50% |

---

### Open Questions Resolved ✅

| Question | Answer |
|---|---|
| Chef cost/bidding? | Bid-based, higher minimum floor by skill tier |
| Specialty visibility? | Hidden — nationality + skill level shown only |
| Leveling up? | No — purchased at fixed skill level |
| How do multiple chefs interact? | Additive — each chef independently contributes their own daily output; total = sum of all chefs. Multipliers are not compounded on top of each other. |

---

## Customer Satisfaction & Foot Traffic System

### How the System Works

**Customer Satisfaction Rate** and **Foot Traffic** are the two core output metrics. They are driven by the following factors:

```
Customer Satisfaction Rate (displayed as % to players, included in CSV) is determined by:
    1. Speed of production — higher chef throughput/multipliers → more units produced
       → higher fill rate → higher satisfaction
    2. Product availability — if a product sells out mid-round, satisfaction drops
       and product-loyal customers leave for a competitor

Foot Traffic is determined by:
    1. Customer satisfaction rate — higher satisfaction attracts more customers
    2. Product availability — sold-out products trigger immediate customer defection
    3. Speed of production — indirectly, through its effect on satisfaction
```

> **Satisfaction % is visible to players on the results screen and exported in the CSV.** It is the primary signal players use to evaluate their chef and supply decisions. A player who sees their Coffee satisfaction at 43% knows immediately they need a stronger chef or more supply — without the game ever explaining why.

The strategic loop forces players to align three things: **chef specialty → supply quantity → price point**. Misalignment in any one dimension silently penalizes revenue.

---

### Base Expected Daily Demand (Per Player)

| Product | Base Demand | Notes |
|---|---|---|
| **Coffee** | 70 units | High-volume daily staple — hardest to satisfy with base chef alone |
| **Croissant** | 60 units | Medium-volume, quality-sensitive |
| **Bagel** | 55 units | Medium-volume, price-sensitive |
| **Cookie** | 50 units | Impulse purchase |
| **Sandwich** | 45 units | Lower volume, highest margin ceiling |
| **Matcha** | 25 units | Niche/premium — few customers want it, but they pay significantly more |

**Base chef alone (30 units/day) fill rates:**

| Product | Fill Rate | Satisfaction | Strategic Signal |
|---|---|---|---|
| Coffee | 43% | Critical | Forces chef investment |
| Croissant | 50% | Poor | Forces chef investment |
| Bagel | 55% | Poor | Forces chef investment |
| Cookie | 60% | Poor | Forces chef investment |
| Sandwich | 67% | Adequate | Accessible without chef, but capped |
| Matcha | 120% | Excellent | Base chef meets demand — but a Japanese chef unlocks premium pricing |

> **The Matcha trap:** Players who skip a Japanese chef think they're fine because satisfaction reads Excellent at base. But a Japanese chef on Matcha with premium pricing is the highest revenue-per-unit play in the game — the gap between "fine" and "winning" on Matcha is invisible until a sharp player discovers it.

---

### Throughput → Satisfaction Tiers

Satisfaction is driven by **fill rate** = actual throughput (capped by supply purchased) ÷ base expected demand. The result is expressed as a **satisfaction percentage (0–100%)** shown to players on the results screen and in the CSV export. Each product has its own satisfaction %; the aggregate satisfaction % shown on the UI is the weighted average across all products offered.

**Per-product satisfaction:**

| Fill Rate | Satisfaction Tier | Satisfaction % |
|---|---|---|
| < 50% | Critical | 0–20% |
| 50–69% | Poor | 21–45% |
| 70–84% | Adequate | 46–65% |
| 85–99% | Good | 66–85% |
| 100%+ | Excellent | 86–100% |

**Sell-out mid-round:** If a product sells out before the round ends, its satisfaction % drops to the Poor tier (≤45%) for the remainder of the round — regardless of how much had already been served.

> **Supply cap:** A player with an Advanced Italian chef capable of 66 Coffee units/day who only bought 40 units of supply hits 40/70 = 57% → Poor. The chef investment is wasted. Players must purchase supply quantity that matches their chef's throughput potential.

**Recommended supply targets by chef tier:**

| Chef Tier | Daily Throughput (specialty product) | Recommended Supply |
|---|---|---|
| Base only | 30 | 30 (accept Poor/Critical on most products) |
| Base + Novel specialty | 72 | 70–75 |
| Base + Intermediate specialty | 82.5 | 80–85 |
| Base + Advanced specialty | 96 | 90–100 |
| Base + Advanced + Intermediate (same product) | 148.5 | ~100 (demand cap — surplus is waste) |

---

### Satisfaction → Foot Traffic

Foot traffic is driven by **aggregate satisfaction** — a weighted average across all products offered. Products not offered are excluded from the calculation.

**Product weights:**

| Product | Satisfaction Weight | Reason |
|---|---|---|
| Coffee | 1.5 | Expected at every café — low satisfaction here hurts overall perception most |
| Matcha | 1.3 | Premium differentiator — Excellent Matcha signals "destination café" |
| Croissant | 1.2 | Quality signal — customers notice when it's done well |
| Sandwich | 1.0 | Standard |
| Cookie | 1.0 | Standard |
| Bagel | 1.0 | Standard |

**Foot traffic modifier by aggregate satisfaction:**

| Avg Satisfaction Score | Tier | Foot Traffic Modifier |
|---|---|---|
| 0–20 | Critical | −40% |
| 21–45 | Poor | −20% |
| 46–65 | Adequate | ±0% (baseline) |
| 66–80 | Good | +20% |
| 81–100 | Excellent | +40% |

**Premium product bonus:** If Croissant or Matcha individually reaches Excellent, add +10% foot traffic each (stackable). Maximum possible modifier = **+60%**.

---

### Price Points Per Product

Three pricing zones per product. Pricing above your satisfaction tier's ceiling costs foot traffic.

| Product | Floor | Competitive Range | Premium Range | Ceiling | Elasticity |
|---|---|---|---|---|---|
| **Coffee** | $2.00 | $3.00–$4.50 | $5.00–$6.00 | $6.50 | High |
| **Croissant** | $2.50 | $4.00–$5.50 | $6.00–$7.00 | $8.00 | Medium |
| **Bagel** | $1.50 | $2.50–$3.50 | $4.00–$5.00 | $5.50 | High |
| **Cookie** | $1.00 | $2.00–$3.00 | $3.50–$4.50 | $5.00 | High |
| **Sandwich** | $5.00 | $7.50–$10.00 | $10.50–$12.50 | $14.00 | Medium |
| **Matcha** | $3.50 | $5.50–$7.00 | $7.50–$9.00 | $10.00 | Low |

**Pricing rules:**
- **Competitive range** — available at any satisfaction tier, no penalty
- **Premium range** — requires Good or Excellent satisfaction; below that, demand drops 30%
- **Floor pricing** — boosts demand by 15% regardless of satisfaction tier (the volume play)

**Elasticity in plain terms:**
- **High (Coffee, Bagel, Cookie):** Every $0.50 above competitive range = ~8% demand drop. Underprice competitors to capture foot traffic volume.
- **Medium (Croissant, Sandwich):** More forgiving. Excellent satisfaction can sustain premium pricing without traffic loss.
- **Low (Matcha):** Premium-locked. Customers who want Matcha will pay. The entire value proposition is: satisfaction → premium price → highest margin per unit in the game.

---

### Strategic Archetypes

| Strategy | Chef Investment | Supply Focus | Pricing | Risk |
|---|---|---|---|---|
| **Volume play** | Novel across multiple products | Moderate, spread across all products | Floor–Competitive | Low margin; traffic-dependent |
| **Coffee monopoly** | Advanced Italian or French | Max Coffee supply | Premium Coffee | Misses premium product foot traffic bonuses |
| **Matcha specialist** | Advanced Japanese | Max Matcha supply | Premium Matcha | Low volume; vulnerable if competitors dominate Coffee satisfaction |
| **Croissant double-down** | French + Japanese (both specialize Croissant) | Heavy Croissant supply | Premium Croissant | Expensive — two high bids required; leaves other products underfunded |
| **Balanced coverage** | 1 Intermediate + 1 Novel across different specialties | Even spread | Competitive across board | No ceiling, but consistent — hard to beat a focused specialist at their peak |

---

## Customer Behavior & Demand Variation System

---

### Customer Archetypes

Every customer who enters the shared foot traffic pool belongs to one of six archetypes. Each archetype has a **primary product preference**, a **secondary fallback product**, a **product loyalty disposition**, and a **price sensitivity**. These traits determine how they behave when a product is unavailable, poorly made, or sold out.

| Archetype | Primary Product | Secondary Fallback | Product Loyalty | Price Sensitivity | Notes |
|---|---|---|---|---|---|
| **The Morning Regular** | Coffee | Bagel | Medium | High | Creature of habit. Comes daily. Will tolerate average Coffee but switches bakeries if it's consistently bad. |
| **The Brunch Seeker** | Croissant | Coffee | High | Medium | Came specifically for a quality pastry. Will leave and find a better Croissant rather than settle. |
| **The Wellness Shopper** | Matcha | — (leaves if unavailable) | Very High | Low | Niche, premium buyer. No substitute. If Matcha is sold out or Poor, they walk — full defection. |
| **The Lunch Crowd** | Sandwich | Cookie | Medium | Medium | Time-pressured. Willing to pay for quality. Will grab a Cookie if Sandwich is sold out rather than leave empty-handed. |
| **The Sweet Tooth** | Cookie | Croissant | Low | Medium | Impulse buyer. Easily swayed by variety. Most likely to convert to brand-loyal after repeated good experiences. |
| **The Deal Hunter** | Bagel | Coffee | Low | Very High | Pure value-seeker. Will always go to whoever prices Bagels and Coffee lowest. Almost never brand-loyal. |

> **Archetype distribution shifts by round.** The round preference profile (see below) determines which archetypes are more abundant that round — a Matcha-Trending round means more Wellness Shoppers enter the pool; a Coffee-Cold round reduces Morning Regulars.

---

### Round Preference Profiles

Each round, the total demand for each product shifts based on a hidden **preference profile**. The profile is randomly generated per game session but is identical for all players — everyone faces the same market, but only players who read the signals correctly will align their supply and chefs.

**Demand shift tiers:**

| Tier | Demand Modifier | Archetype Effect |
|---|---|---|
| **Trending** | +40% | More of the archetypes that prefer this product enter the pool |
| **Warm** | +15% | Slight increase in related archetype volume |
| **Neutral** | ±0% | Baseline |
| **Cold** | −25% | Fewer related archetypes enter the pool; supply purchased for this product risks being wasted |

Each round: **2 products Trending, 2 Warm, 1 Neutral, 1 Cold.** No product stays Trending two consecutive rounds — forcing strategic rotation.

**Example 5-round demand profile (randomized at game start, same for all players):**

| Round | Trending (+40%) | Warm (+15%) | Neutral | Cold (−25%) |
|---|---|---|---|---|
| 1 | Coffee, Bagel | Croissant, Cookie | Sandwich | Matcha |
| 2 | Croissant, Matcha | Coffee, Sandwich | Cookie | Bagel |
| 3 | Sandwich, Cookie | Bagel, Matcha | Coffee | Croissant |
| 4 | Matcha, Coffee | Croissant, Cookie | Bagel | Sandwich |
| 5 | Croissant, Cookie | Matcha, Bagel | Coffee | Sandwich |

**Signal reveal:** At the start of each round, players receive a **market insight email** with a vague hint (e.g., *"Food critics have been spotlighting artisan breakfast staples this week"* → hints at Croissant/Bagel trending). Exact modifiers are never shown — players must infer from the hint and prior round outcomes.

---

### Competitive Foot Traffic Allocation (All Products)

The customer pool for **every product** is shared across all players. Each player's share of product-seeking customers is proportional to their **relative satisfaction score** for that product. This applies equally to Coffee, Croissant, Matcha, Sandwich, Cookie, and Bagel.

```
Player's share of product X customers =
    Player's Satisfaction Score (product X)
    ──────────────────────────────────────────────────────
    Sum of all players' Satisfaction Scores (product X)
```

Players not offering a product receive zero share of that product's customers and are excluded from the denominator.

**Competitive splitting examples across all products:**

| Product | Player A | Player B | Player C | A's Share |
|---|---|---|---|---|
| Coffee | Excellent (95) | Good (75) | Poor (30) | 95/200 = **48%** |
| Croissant | Excellent (95) | Excellent (95) | Not offered | 95/190 = **50%** |
| Matcha | Excellent (95) | Not offered | Not offered | 95/95 = **100%** |
| Bagel | Good (75) | Good (75) | Good (75) | 75/225 = **33%** |
| Sandwich | Poor (30) | Excellent (95) | Not offered | 30/125 = **24%** |
| Cookie | Adequate (55) | Good (75) | Poor (30) | 55/160 = **34%** |

> **Key insight:** Offering a product no one else offers (like Matcha) captures 100% of that archetype's customers. Entering a saturated product (e.g., three players all offering Good Bagels) means a 33% share cap regardless of effort. Dominant satisfaction scores shift share significantly — a 20-point lead in a two-player product contest yields ~55/45 split.

---

### Customer Profile Behavior (Product-Loyal vs. Brand-Loyal)

Each customer archetype has a baseline loyalty disposition, but **brand loyalty is individually earned** by each player over rounds.

**Starting loyalty split (Round 1):**

| Archetype | Starting Product-Loyal % | Starting Brand-Loyal % |
|---|---|---|
| The Morning Regular | 70% | 30% |
| The Brunch Seeker | 85% | 15% |
| The Wellness Shopper | 95% | 5% |
| The Lunch Crowd | 75% | 25% |
| The Sweet Tooth | 50% | 50% |
| The Deal Hunter | 90% | 10% |

**What each type does in each scenario:**

| Scenario | Product-Loyal Customer | Brand-Loyal Customer |
|---|---|---|
| Product available, Good/Excellent satisfaction | Buys ✓ | Buys ✓ |
| Product available, Poor/Critical satisfaction | 60% defect to best competitor offering that product | Buys anyway (habit) |
| Product sold out | Defects immediately to competitor with best satisfaction for that product | Orders secondary fallback product instead |
| No fallback available either | Leaves | Leaves |

**Brand loyalty grows per player over rounds:**

| Condition | Brand Loyalty Change (next round) |
|---|---|
| Avg satisfaction Excellent | +5% brand-loyal for all archetypes at your bakery |
| Avg satisfaction Good | +2% |
| Avg satisfaction Adequate | ±0% |
| Avg satisfaction Poor | −5% |
| Any product hits Critical | −10% |
| Maximum brand loyalty cap | 50% of any archetype |

> A player who consistently delivers Excellent satisfaction turns their repeat customers majority brand-loyal by Rounds 4–5. Brand-loyal customers are a compounding asset — they buffer revenue when demand shifts cold on your product or when you misread a round's trend.

---

### Sell-Out Mechanic

When a player's supply for a product is exhausted mid-round:

```
Sell-out triggers when:
    Cumulative demand served for product X = Units of product X purchased
```

**Consequences:**
- **Product-loyal customers** arriving after sell-out → defect immediately to the highest-satisfaction competitor still offering that product. That competitor's foot traffic and revenue increases mid-round.
- **Brand-loyal customers** arriving after sell-out → redirect to their secondary fallback on your menu. Revenue is lower, but they stay.
- **Satisfaction score** for that product drops to Poor (30) for the remainder of the round.
- **Brand loyalty penalty:** −5% for that product's archetype next round.
- **Sell-out flag** visible on the round results screen — a clear signal to both the player and competitors.

**Sell-out is most dangerous for Wellness Shoppers (Matcha)** — they have no fallback and will fully defect, sending customers directly to any competitor offering Matcha, even at lower satisfaction.

---

### Full Customer Flow Per Round

```
Round Start
    ↓
Demand profile generated (hidden — partial hint via market email)
Effective demand = Base Demand × Round Preference Multiplier (per product)
Archetype pool composition shifts accordingly
    ↓
Foot traffic allocated to each player
(proportional to weighted satisfaction score, per product, across all 6 products)
    ↓
At each bakery, customers arrive by archetype:
    ├── Product-Loyal
    │       ├── Product available + Good/Excellent → Buys ✓
    │       ├── Product Poor/Critical → 60% defect to best competitor
    │       └── Product sold out → Defects immediately
    │
    └── Brand-Loyal
            ├── Product available → Buys ✓
            ├── Product Poor/Critical → Buys anyway
            └── Product sold out → Orders secondary fallback; leaves only if nothing available
    ↓
Sell-out events trigger mid-round defection flows
    ↓
Revenue = Customers Served × Price per product
Unsold supply = wasted (no carryover)
    ↓
Per-product satisfaction % calculated and stored
Aggregate satisfaction % (weighted average) calculated and stored
Both displayed on results screen and written to CSV export
Brand loyalty adjusted per archetype per player
    ↓
Next round
```

---

## Scoring System

**Primary metric:** Cumulative net revenue across all rounds. One number, one leaderboard. Clear winner.

**Secondary metric (tiebreaker):** Average customer satisfaction %. Displayed as a percentage on the results screen and leaderboard. Not the primary ranking criterion, but visible to all players as a signal of operational performance.

**CSV export includes per round:**
- Revenue (this round + cumulative)
- Customer count served
- Per-product satisfaction % (one column per product)
- Aggregate satisfaction % (weighted average)
- Foot traffic count
- Sell-out flags per product

**Two separate UIs:**
1. **Student-facing UI** — simplified: login, decision inputs, leaderboard, company emails. No budget tracker, no model building tools.
2. **Professor / Live Ops UI** — full visibility: market share, all player data, AI bot controls, dynamic pricing levers. Scott and Dylan B. will run the control room on game day.

---

## Competitive Dynamics

### How Players Compete

The shared customer pool is the core competitive mechanism. Each round, a finite number of customers are distributed across all cafés based on an attractiveness score. The score is a function of:

- **Pricing** — competitive prices attract more budget-conscious shoppers
- **Product variety** — more menu items = broader appeal
- **Staff count** — more staff = faster service = less churn
- **Ad spend** — directly increases foot traffic share

This is zero-sum at the margin — players have to adopt different strategies to stand out.

### Preventing Dominant Strategy

Three mechanisms:

1. **Model noise** — a random component in revenue computation means the "optimal" inputs shift slightly each round
2. **Competitive allocation** — your revenue depends on what others do, not just your own decisions. There's no fixed optimal strategy.
3. **Information asymmetry** — players only see their own data. They can observe the leaderboard but not competitors' decisions. This prevents pure copycat strategies.

---

## Data Requirements

After each round, players receive a downloadable CSV of new rows. Players accumulate data over rounds and can download it as CSV/XLSX to build models in their own environment.

| Column | Type | Description |
|---|---|---|
| day | int | Round number (1, 2, 3…) |
| revenue | float | TARGET VARIABLE — total revenue for the round ($) |
| num_products | int | Number of products on your menu that round |
| avg_price | float | Mean sell price across all menu items ($) |
| staff_count | int | Total employees hired |
| ad_spend | float | Dollars allocated to advertising |
| customer_count | int | Customers who visited your café |
| customer_satisfaction | float | Customer satisfaction score (0–100) |
| headchef_skill | int | Chef skill level (0–100) |
| croissant | char | Quantity sold |
| cookie | char | Quantity sold |
| bagel | char | Quantity sold |
| sandwich | char | Quantity sold |
| latte | char | Quantity sold |
| matcha_latte | char | Quantity sold |
| ad_type | char | Type of ad (TV, mall, etc.) |

### Dataset Structure

Time series × multiple bakeries. Example:

```
Day 1  Bakery A  [feature inputs…]
Day 1  Bakery B  [feature inputs…]
Day 2  Bakery A  [feature inputs…]
Day 2  Bakery B  [feature inputs…]
```

Students can run a regression in Excel or Python using the set variables. Players are intended to receive the CSV file 1 week in advance to prep their models for gameplay.

**Backend deliverable:** a CSV containing the player's new data after each round iteration.

---

## MVP Scope — What Must Work for Launch

Minimum set of features needed to play one complete game session. Everything below must work. Everything above the cut line is a bonus.

- [ ] 1 — Player joins a game session (simple auth + lobby screen)
- [ ] 2 — Player builds their bakery: set budget, current staff, menu, prices
- [ ] 3 — For each new round: player sets prices, staff count, and ad spend
- [ ] 4 — Player submits decisions before timer expires
- [ ] 5 — Backend runs regression model → computes revenue + customer allocation
- [ ] 6 — Player sees round results + leaderboard ranking
- [ ] 7 — Player downloads their new data as CSV
- [ ] 8 — Repeat for 5 rounds
- [ ] 9 — Professor can start, advance, pause, and end the game

---

## Deferred from Design Deck

The following features from the original design deck are cut from v1. They can be added incrementally after the core loop works and is stable. This is not a rejection of these ideas — it's a sequencing decision.

| Feature | Why Cut from v1 | Add Back If Time? |
|---|---|---|
| 3 sealed-bid auctions | 2–3 days of BE + FE work; simplify to flat ad spend | Yes — high impact |
| Employee poaching | Complex real-time flow; requires notifications, counter-offers | Maybe — Phase 2 |
| Employee tiers & satisfaction | Replace with simple headcount; keeps model simpler | Maybe |
| 6 curveball types | Each needs custom logic; start with 0, add 1–2 if time | Yes — 1 or 2 |
| AI competitors (3 tiers) | Each tier needs heuristic logic; skip for v1 | Maybe — Passive only |
| In-game chat + achievements | Non-essential; use Discord/Slack | No |
| Supplier product drops | Adds complexity to menu system; use fixed products | No |
| Equipment upgrade tiers | Simplify to binary or remove; reduces decisions | Maybe |
| 12 products | Reduce to 5–6; fewer price inputs, simpler UI | Cosmetic — easy to add back |

---

## Regression Model — Starter Coefficients

Backend needs concrete coefficients to build the revenue engine. Placeholder model to start coding against. Game Design should refine these based on the professor's dataset and balance testing.

```
revenue = 500
        + (30 × staff_count)
        − (15 × avg_price)
        + (0.8 × ad_spend)
        + (50 × num_products)
        + noise
```

- Base revenue of $500/round just for being open
- Each employee adds ~$30 of revenue (diminishing returns not modeled yet)
- Higher avg prices reduce customer volume (price elasticity)
- Ad spend has positive but sub-linear return
- More menu items attract more customers
- Noise term: random uniform ±$100 to prevent deterministic optimization

> ⚠️ These are PLACEHOLDER coefficients. Backend will code against this structure and swap in final values.

---

## Starting Conditions (Confirmed — All-Hands April 8)

Same starting point for everyone. Same base-level staff, same menu, same budget. No advantages at the start. Differentiation comes purely from decisions made during the game.

## Budget Rules (Confirmed — All-Hands April 8)

- Budget is set at a fixed amount (TBD — exact number to be finalized).
- Players spend across products, marketing, and staffing.
- **Overbidding is allowed** — players can exceed their budget but take on credit at a cost.
- No in-game budget tracker. Players must manage their own finances externally.
- No hand-holding on financial tracking.

## Open Questions

1. **Customer allocation formula:** How exactly are customers split? Proportional to attractiveness score? Winner-take-most?
   → *Should be determined by customer satisfaction*

2. ~~**Starting conditions:** Does everyone start identical (same budget, same menu, same staff)? Or is there variation?~~
   → ✅ **Resolved:** Everyone starts the same. Same base-level staff, same menu, same budget. (All-hands April 8)

3. ~~**Budget replenishment:** Do players get new budget each round, or is it cumulative from revenue? If cumulative, early mistakes compound — is that intended?~~
   → ✅ **Resolved:** Cumulative. Overbidding allowed with credit at a cost. (All-hands April 8)

4. **Which ONE feature from the cut list is highest priority if we have extra time?**
   → Recommend: 1 simple curveball event OR passive AI competitor, not both.

5. **Exact starting budget amount?** — Needs to be finalized.

6. **Credit cost rate?** — What interest/penalty applies when players overbid beyond their budget?

7. **Staffing price escalation curve?** — How much do staffing costs increase per round? Linear, exponential?

---

## Next Steps

| Date | Task | Owner |
|---|---|---|
| April 3 | Game Design delivers final game config doc (all numbers, coefficients, starting conditions, budget rules) | Game Design |
| April 3 | Game Design + Backend agree on Firestore schema | Game Design + Backend |
| April 4 | Backend starts building auth + round state machine | Backend |
| April 4 | Frontend starts building lobby + decision dashboard | Frontend |
| April 10 | First end-to-end playable demo — one round, ugly, but functional | All |
