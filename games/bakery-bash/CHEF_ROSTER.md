# Chef Roster — Random Generation Framework

**Game:** Bakery Bash
**Date:** April 15, 2026
**Purpose:** Reference table for the chef random generator — names, asset design descriptions, specialties, and skill multipliers by nationality and gender.

> Specialty products per nationality are **hidden from players** and should never be surfaced in the UI. Only nationality and skill level are shown.

---

## Chef Roster Reference Grid

| Nationality & Gender | Possible Names | Asset Design Description | Specialties (Hidden) | Low Skill | Medium Skill | High Skill |
|---|---|---|---|---|---|---|
| 🇫🇷 French — Male | Jean-Pierre, Marcel | Tall, slim build. Classic white double-breasted chef coat, blue neckerchief, tall toque blanche. Thin mustache, clean-shaven face. | Croissant, Latte | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇫🇷 French — Female | Colette, Amélie | Slim build. Fitted white chef coat with blue trim, low toque blanche. Dark hair in a neat bun, simple silver earrings. | Croissant, Latte | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇯🇵 Japanese — Male | Hiroshi, Kenji | Medium build. Minimalist white chef coat, dark gray apron, traditional white hachimaki headband. Short dark hair, calm expression. | Matcha Latte, Cookie | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇯🇵 Japanese — Female | Yuki, Aiko | Petite build. Clean white chef coat, black apron with subtle pattern. Hair tied back with a decorative clip. Neat, precise appearance. | Matcha Latte, Cookie | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇮🇹 Italian — Male | Marco, Luca | Stocky, broad build. White chef coat with red neckerchief, short apron. Dark curly hair, animated expression, slight stubble. | Sandwich, Latte | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇮🇹 Italian — Female | Sofia, Giulia | Medium build. White chef coat with red trim detail, short apron. Dark wavy hair pulled into a loose bun, expressive eyes. | Sandwich, Latte | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇺🇸 American — Male | Jake, Tyler | Broad, casual build. White chef coat worn open over a t-shirt, backwards baseball cap, denim apron. Relaxed, confident stance. | Bagel, Cookie | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |
| 🇺🇸 American — Female | Madison, Ashley | Athletic build. White chef coat with rolled-up sleeves, high ponytail, casual denim apron. Friendly, approachable expression. | Bagel, Cookie | Base 1.0× / Spec 1.4× | Base 1.25× / Spec 1.75× | Base 1.6× / Spec 2.2× |

> **How to read the multipliers:** Base = output on non-specialty products. Spec = output on specialty products. A Medium French chef on Croissants outputs 1.75×; the same chef on Bagels outputs 1.25×. Players never see these numbers — they infer from throughput and satisfaction signals over time.

---

## Random Generation Logic (Implementation Reference)

```
1. Pick nationality at random (French / Japanese / Italian / American)
2. Pick gender at random (Male / Female)
3. Pick name at random from the 2 options for that gender × nationality
4. Pick skill level at random or weighted (Low / Medium / High)
5. Assign specialty products from the nationality's hidden specialty map
6. Apply multipliers from the skill level columns above
7. Surface to UI: nationality + skill level only
```

**Suggested skill level weighting (to tune scarcity):**

| Skill Level | Suggested Spawn Weight | Bid Floor |
|---|---|---|
| Low | 50% | ~2× baseline |
| Medium | 35% | ~3–4× baseline |
| High | 15% | ~5–6× baseline |

> Tune weights to match the bid economy. High chefs should feel rare enough to trigger real bidding wars.

---

## Roster State Per Player (Runtime)

| Slot | Contents |
|---|---|
| Base Chef (permanent) | 1.0× on all 6 products, no nationality, no specialty |
| Specialty Slot 1 | Bidded chef or empty |
| Specialty Slot 2 | Bidded chef or empty |
| Specialty Slot 3 | Bidded chef or empty |

Maximum 3 specialty chefs. A 4th acquisition requires laying off one existing specialty chef, who returns to the auction pool.
