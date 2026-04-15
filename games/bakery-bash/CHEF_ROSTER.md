# Chef Roster — Random Generation Framework

**Game:** Bakery Bash
**Date:** April 15, 2026
**Purpose:** Reference table for the chef random generator — names, asset design descriptions, and skill multipliers by nationality and gender.

> Specialty products per nationality are **hidden from players** and should never be surfaced in the UI. Only nationality and skill level are shown.

---

## Nationality & Specialty Map

| Nationality | Specialty Products (Hidden) |
|---|---|
| French | Croissant, Latte |
| Japanese | Matcha Latte, Cookie |
| Italian | Sandwich, Latte |
| American | Bagel, Cookie |

---

## Chef Name & Asset Reference

### 🇫🇷 French

| Gender | Names | Asset Design Description |
|---|---|---|
| Male | Jean-Pierre, Marcel | Tall, slim build. Classic white double-breasted chef coat, blue neckerchief, tall toque blanche. Thin mustache, clean-shaven face. |
| Female | Colette, Amélie | Slim build. Fitted white chef coat with blue trim, low toque blanche. Dark hair in a neat bun, simple silver earrings. |

---

### 🇯🇵 Japanese

| Gender | Names | Asset Design Description |
|---|---|---|
| Male | Hiroshi, Kenji | Medium build. Minimalist white chef coat, dark gray apron, traditional white hachimaki headband. Short dark hair, calm expression. |
| Female | Yuki, Aiko | Petite build. Clean white chef coat, black apron with subtle pattern. Hair tied back with a decorative clip. Neat, precise appearance. |

---

### 🇮🇹 Italian

| Gender | Names | Asset Design Description |
|---|---|---|
| Male | Marco, Luca | Stocky, broad build. White chef coat with red neckerchief, short apron. Dark curly hair, animated expression, slight stubble. |
| Female | Sofia, Giulia | Medium build. White chef coat with red trim detail, short apron. Dark wavy hair pulled into a loose bun, expressive eyes. |

---

### 🇺🇸 American

| Gender | Names | Asset Design Description |
|---|---|---|
| Male | Jake, Tyler | Broad, casual build. White chef coat worn open over a t-shirt, backwards baseball cap, denim apron. Relaxed, confident stance. |
| Female | Madison, Ashley | Athletic build. White chef coat with rolled-up sleeves, high ponytail, casual denim apron. Friendly, approachable expression. |

---

## Skill Level Multipliers

Applied per chef to their own output only — **no cross-chef stacking**.

| Skill Level | Non-Specialty Output | Specialty Output | Bid Floor (relative to baseline) |
|---|---|---|---|
| **Low** | 1.0× | 1.4× | ~2× baseline |
| **Medium** | 1.25× | 1.75× | ~3–4× baseline |
| **High** | 1.6× | 2.2× | ~5–6× baseline |

> **How to read this:** A Medium French chef assigned to Croissants outputs 1.75× units. The same chef assigned to Bagels outputs 1.25×. Players never see these numbers — they observe throughput and satisfaction signals over time and infer from their data.

---

## Random Generation Logic (Implementation Reference)

```
1. Pick nationality at random (French / Japanese / Italian / American)
2. Pick gender at random (Male / Female)
3. Pick name at random from the 2 options for that gender × nationality
4. Pick skill level at random or weighted (Low / Medium / High)
5. Assign specialty products from the nationality's hidden specialty map
6. Apply multipliers from the skill level table above
7. Surface to UI: nationality + skill level only
```

**Suggested skill level weighting (to tune scarcity):**

| Skill Level | Suggested Spawn Weight |
|---|---|
| Low | 50% |
| Medium | 35% |
| High | 15% |

> Tune weights to match the bid economy and desired competitive pressure. High chefs should feel rare enough to trigger real bidding wars.

---

## Roster State Per Player (Runtime)

| Slot | Contents |
|---|---|
| Base Chef (permanent) | 1.0× on all 6 products, no nationality, no specialty |
| Specialty Slot 1 | Bidded chef or empty |
| Specialty Slot 2 | Bidded chef or empty |
| Specialty Slot 3 | Bidded chef or empty |

Maximum 3 specialty chefs. A 4th acquisition requires laying off one existing specialty chef, who returns to the auction pool.
