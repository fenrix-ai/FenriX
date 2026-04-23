# Pixel Bakery Scene (Undertale-style) — Design

**Date:** 2026-04-23
**Game:** Bakery Bash
**Surface:** Per-player `DecidePhase` and `SimulatePhase`
**Status:** Design approved; ready for implementation plan

## Supersedes

This design replaces [`2026-04-23-pixel-bakery-simulation-design.md`](./2026-04-23-pixel-bakery-simulation-design.md). That prior spec targeted Simulate only and assumed SVG illustration; an intermediate pivot to CC0 top-down tile art (committed at `3c4af2d` on `feat/bakery-scene-v2`) shipped a preview but did not read as a polished bakery. This design supersedes both.

## Goal

Replace the current emoji-based bakery visual with a polished **Undertale-style side-view pixel-art scene** that renders on both the per-player `DecidePhase` and `SimulatePhase`. Chefs idle behind the counter. A cat wanders the floor. During Simulate, customers walk in from the right, buy a product, and leave — dollar-bill flurries bursting from the counter on every sale. The team name sits on a carved sign on the back wall. The visual must feel *intentional* and *hand-crafted*, not assembled from stock tilesheets.

## Scope

**In scope (MVP):**
- Side-view pixel-art bakery interior scene (back wall, counter, floor, door on right edge)
- Carved team-name sign on back wall
- Bread shelves (left), oven (mid), coffee wall (right) on back wall
- Bread display case + espresso machine on counter
- Up to 4 chefs at Bakery / Deli / Barista stations — idle bob, no walking
- Customer spawn during Simulate, walk-in from right → counter → walk-out right
- Dollar-bill flurry (4–6 bills) on every sale
- Cat wandering the floor strip on **both** DecidePhase and SimulatePhase
- Oven steam FX (ambient)
- Sold-out shelf swap (product tile → empty-tray sprite)
- Ad display surfaced as wall-mounted menu board (replaces current floating ad icon)
- Side-panel reskin (Menu + Status) to match the pixel/wood aesthetic
- Reduced-motion fallback (static scene + "Simulating round…" label)
- Error boundary around the scene (falls back to a minimal static placeholder)

**Out of scope (deferred):**
- Day/night overlay (dropped from earlier spec)
- Burglar cameo, chef-stat click-to-inspect, bill denominations, combo meter, tumbleweed, door chime puff, weather/seasonal skins
- Per-chef unique avatars by `nationality × gender × variant` — generic-per-station chef sprites are acceptable for MVP
- Customer queue visualization beyond the 4-on-screen soft cap
- Tilemap plaza / exterior view / multi-shop scene
- Team-logo upload, emblem picker, generated emblems (team name text-only on the sign is sufficient)

## Locked design decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Perspective | **Variant X** — flat back-wall view (Undertale Tem Shop / Grillby's style). Everything on one plane; floor is a thin strip in the foreground |
| 2 | Aesthetic reference | **Undertale** — chunky readable pixels, 1-px dark outlines on characters, flat fills, limited warm palette |
| 3 | Approach | **Hand-pixeled** — we author each sprite; no CC0 tilesheet reuse from the prior pivot |
| 4 | Native resolution | **480×270 px**, displayed scaled 2–3× |
| 5 | Authoring format | TS **data-grid modules** (palette + 2D color-index grid) rendered to `<canvas>` at mount; no PNG asset pipeline |
| 6 | Scene phases | Scene renders on **both** DecidePhase and SimulatePhase (same backdrop, same chefs, same cat; customers + dollars are Simulate-only) |
| 7 | Chef mobility | Chefs are **stationary** at their stations (idle bob only) |
| 8 | Customer count | 3–4 customer body templates × 2–3 palette swaps ≈ 8–10 visually distinct cycling sprites |
| 9 | Cat | One cat, wanders both phases, ambient-only (no interaction with customers/chefs) |
| 10 | Day/night | **Dropped** |
| 11 | Ad display | Wall-mounted menu board on back wall (replaces floating-icon ad) |

## Visual direction

**Perspective.** Flat Undertale-style back-wall view. The viewer faces the back of the shop; every significant element (shelves, oven, coffee wall, counter, door) sits on a single back-wall plane. Floor is a narrow horizontal strip along the bottom where customers (and the cat) walk. No 3D perspective; no receding floor tiles.

**Pixel density.** Scene is authored and rendered at **480×270** native pixels. Displayed at 2× (960×540) or 3× (1440×810) depending on container — both respect `image-rendering: pixelated`. Chunky pixels read as Undertale; avoids drifting into Stardew-level detail.

**Palette.** Warm, limited, ~12–16 colors per scene:
- Deep-brown + mid-brown wood (floor, counter front, door frame, wall mounts)
- Cream / off-white (back wall)
- Amber + gold (breads, oven glow, sign trim)
- Burgundy or muted pink (accent — awning, sign border, optional wallpaper pattern)
- Chrome / pale-blue (espresso machine body, windows, glass display case)
- Dark-neutral (outlines, shadows)

**Linework.** Every character and every prop on the counter/wall gets a 1-px dark outline. Flat fills with at most one shade darker per color for simple shading. No gradients, no anti-aliasing.

**Animation rhythm.** Slow and deliberate. Idle bob: 1–2 px Y-offset on a ~400ms cycle. Walk: 2-frame alternation at ~250ms per frame. Dollar-bill animation: ~800ms total. Steam: ~1.2s fade. Transitions should feel like pixel animation, not easing-curve Flash animation.

**Text/signage.** Pixel font rendered by a small pixel-font module that maps characters → small grid glyphs, drawn into the `<TeamSign>` canvas using the same grid→ImageData path as sprites. 6×6 or 8×8 glyph size. Team-name length-aware: shrink glyph size or truncate gracefully if too long. No SVG `<rect>`s — canvas-only, to stay consistent with sprite rendering and avoid subpixel alignment issues between SVG and canvas layers.

**Fidelity anchor:** Undertale's simpler interior scenes (Tem Shop, Grillby's bar, Snowdin inn). *Not* Stardew Valley (which has far more detail per element than this scope can afford).

## Scene composition

Scene is 480×270 native with approximate zoning (final px heights tune during implementation):

```
┌────────────────────────────────────────────────┬──┐
│                                                │  │
│   🕐        WELCOME TO TEAM-NAME      📋 menu  │  │   ← wall mounts (on back
│                                                │  │     wall, ~20–30 px tall)
│ ┌──┬──┬──┐    ╔══════╗     ┌───────────────┐   │  │
│ │🥖│🥐│🥖│    ║ oven ║     │ ☕☕☕ cups     │   │  │   ← back-wall mid band:
│ │🥖│🥐│🥖│    ║ ▓▓▓  ║     │ 🫘 beans 🥛    │   │  │     shelves / oven /
│ └──┴──┴──┘    ╚══════╝     └───────────────┘   │  │     coffee wall
│                                                │  │
│  [🧑‍🍳]           [🧑‍🍳]                 [🧑‍🍳] │  │   ← chefs overlap counter
│ ═══════════════════════════════════════════════│  │
│    [bread display]           [espresso ☕]     │  │   ← counter (full-width)
│ ═══════════════════════════════════════════════│  │     + display case (L)
│                                                │  │     + espresso machine (R)
│                                                │🚪│   ← door (right edge,
│   [customer → walk-in]   [cat wandering]       │  │     vertical slit)
│ ──────── wood floor ─────────────────────────  │  │   ← floor strip
└────────────────────────────────────────────────┴──┘  (~40–50 px tall)
```

**Back-wall zones:**
- **Wall-mounts (top strip, ~25 px):** clock (top-left), team sign (center, largest — hero element), menu board (top-right, shows ad content)
- **Mid band (~100 px):** 2 bread shelves with stacked loaves on the left; wall oven in the middle (glowing window, occasional steam wisps); coffee wall on the right (cup rack, bean bags, milk/syrup carafes)
- **Wainscoting (~10 px):** darker wood trim along the bottom of the back wall, meets the counter top

**Counter (~40 px, horizontal band):**
- Wooden-front counter stretching full width
- **Bread display case** (left third) — glass-fronted, bulges upward slightly, shows hero breads behind glass
- **Espresso machine** (right third) — chrome body, steam wand, filled cup row. Sits *on* the counter as a separate silhouette; **not** inside the display case
- Chef sprites drawn *overlapping* the counter so they read as "behind it"

**Door (right edge, full vertical):** wooden door with a single glass pane. Frame-swap animation when a customer enters/exits.

**Floor strip (~40–50 px, bottom):** horizontal wood planks with 2 shade variation. Customers and the cat walk here. No other occupants.

## Characters, sprites, and animations

**Sprite dimensions** (all hand-pixeled with 1-px dark outline):

| Sprite | Size (w × h) | Frames | Notes |
|---|---|---|---|
| Chef (per station) | 24 × 40 | 2 (idle bob, 1-px Y-shift) | Apron color varies by station |
| Customer body template | ~20 × 36 | 5 (2 walk-L, 2 walk-R, 1 idle) | Mirror for L→R; 3–4 body templates |
| Customer palette swaps | (same grid, alternate palette) | — | 2–3 palette swaps per template ≈ 8–10 visual variants |
| Cat | 20 × 14 | 5 (2 walk-L, 2 walk-R, 1 sit, 1 groom) | Single cat, single palette |
| Dollar bill | 10 × 6 | 1 | Animated via CSS transform, not frame |
| Bread / croissant / etc. (shelf item) | ~14 × 10 | 1 | One sprite per product tile |
| Empty tray (sold-out) | ~14 × 10 | 1 | Drop-in for any shelf slot |

**Chef behavior:**
- Stationary. Assigned to stations by `pendingDecision.staffCounts`:
  - Bakery station — left third (in front of bread shelves)
  - Deli station — mid (in front of oven)
  - Barista station — right third (behind espresso machine)
  - 4th chef slots to whichever station has the highest staff count
- Idle 2-frame bob, ~400 ms cycle, 1 px Y-offset
- Apron colors: Bakery = white/cream; Deli = blue; Barista = brown/apron

**Customer behavior (Simulate mode only):**
- Spawn pacing derived from `RoundResult.customerCount` over the simulation duration, with ±1s jitter
- **Spawn sequence:** appear just off-screen right → door-open frame → walk left to target chef X → pause ~800 ms (transaction) → dollar-bill flurry triggers at target's X → sprite flips (turn around) → walk right → door-open frame → sprite destroyed
- **Target station** picked by weighted roulette across non-sold-out stations, weighted by `staffCounts` for that round
- **Soft cap: 4 customers on-screen.** Spawner waits if full

**Cat behavior (both phases):**
- Single cat, always present while the scene is mounted
- Wanders the floor strip between 2 random X-anchors: walks to anchor, pauses 2–4 s (sits or grooms randomly), picks new anchor
- No interaction with customers or chefs
- Purely ambient

**Dollar-bill flurry (fires on every sale):**
- 4–6 bills spawn at the target chef's X with small origin jitter
- Each bill animates via CSS transform: Y: -20 to -40 px, X: ±8 px random drift, rotate ±20°, opacity fades to 0 in the final 200 ms of an ~800 ms lifetime
- Destroyed on `animationend`

**Oven steam FX:**
- Every 3–5 s (jittered), 1–2 small wisp divs fade up from the oven top, drift with slight X-sway, dissipate in ~1.2 s
- Pure CSS; very cheap

## Asset pipeline

All sprites are authored as **TS data-grid modules**:

```ts
// src/components/bakery-scene/sprites/chef-bakery.ts
export const chefBakery: SpriteData = {
  width: 24,
  height: 40,
  palette: ['#3e2818', '#f5d8a4', '#ffffff', '#c66' /* up to 16 */],
  // Frames as arrays of height strings; each char is a palette index.
  // ' ' (space) = transparent.
  frames: [
    [
      '   00000000   ',
      '  0011111100  ',
      // … exactly `height` rows of exactly `width` chars
    ],
    [ /* frame 2 (idle bob) — 1-px Y shift */ ],
  ],
}
```

**Rendering** is done by a shared `<PixelSprite>` component:
```ts
<PixelSprite data={chefBakery} frame={frameIdx} />
```
Internally: allocate `ImageData`, iterate grid → set RGBA from palette (space chars → alpha 0), draw to `<canvas>`. Each sprite canvas is sized at **native pixels** (`width × height`); the entire `<PixelBakeryScene>` container is CSS-scaled (`transform: scale(2)` or 3) so every sprite, the backdrop, and character layers share one coordinate system and pixels align perfectly.

**Canvas vs DOM split:**
- **Canvas (one per component):** SceneBackdrop, TeamSign, chefs, customers, cat — anything with grid pixel data
- **DOM divs with CSS transforms:** dollar-bill flurry, oven-steam wisps — short-lived, transform/opacity-driven, cheaper and more natural as CSS animations than as canvas frame work

Both share the scene's CSS scale so visual fidelity is consistent.

**Why data-grid over alternatives:**
- Plain text, diff-friendly, reviewable in PRs
- Palette swaps = share the grid, swap the palette (customer variants, apron-color variants)
- No binary asset pipeline to maintain
- I (Claude) can author and edit sprites inline without external tools

**Trade-off acknowledged:** hand-grid authoring a 24×40 sprite is tedious — but that's the cost of Approach A and can't be avoided without an external pixel editor.

## Architecture

**Component tree:**

```
<PixelBakeryScene mode="decide" | "simulate" | "static" />  ← orchestrator
├── <SceneBackdrop menu={...} soldOut={...} />              ← one <canvas>, static layer
│                                                             (redraws on menu/soldOut diff)
├── <TeamSign teamName={...} />                              ← pixel-font glyphs drawn into canvas
├── <ChefLayer staffCounts={...} />                          ← 0–4 <PixelSprite>s
├── <CustomerLayer customers={...} />                        ← N <PixelSprite>s (from hook)
├── <CatLayer cat={...} />                                   ← 1 <PixelSprite>
├── <DollarLayer bills={...} />                              ← pool of short-lived divs
└── <FxLayer />                                              ← oven-steam CSS divs
```

**Animation hook:**

`useBakeryScene({ mode, customerCount, menu, soldOut, staffCounts, seed })`:
- Owns mutable scene state: `chefs`, `customers`, `cat`, `dollars`
- Single `requestAnimationFrame` loop advances positions and frame indices
- Separate `setInterval` spawn scheduler — active only when `mode === 'simulate'`; paces customer spawns across the round
- Exposes `{ chefs, customers, cat, dollars }` to the layer components
- Honors `prefers-reduced-motion: reduce` — when reduced, hook enters paused state: static chefs at stations, cat sits, no customers, no dollars, no steam

**Data flow (one-way, from context):**
- `useGame()` → `SimulatePhase` / `DecidePhase` → `<PixelBakeryScene>` props → hook/children
- Scene owns zero game state; purely presentational

## Integration

**SimulatePhase.** Inner markup of `.simulate-phase__bakery-visual` is replaced with `<PixelBakeryScene mode="simulate" {...props} />`. Surrounding layout (side panels) unchanged.

**DecidePhase.** No direct equivalent slot exists today. Implementation-time decision: insert a scene panel in a natural location above or behind the decision controls, sized to its native aspect ratio (480×270, scaled). We will not restructure DecidePhase's decision UI — the scene is additive, not a replacement for controls.

**Preview route.** `/preview/bakery-scene` stays and is repurposed to render `<PixelBakeryScene>` with a mode toggle (decide / simulate / static) and a scale slider. Replaces the current top-down tile preview. `/preview/tile-inspector` is removed (tile-browser no longer applies).

**Prop flow from `useGame()`:**

| Prop | Source | Drives |
|---|---|---|
| `teamName` | `useGame()` | `<TeamSign>` |
| `pendingDecision.menu` | `useGame()` | Which bread sprites on shelves and in display case |
| `pendingDecision.staffCounts` | `useGame()` | Chef positions and count |
| `soldOut` | `SimulatePhase` (existing) | Shelf-slot sold-out swap |
| `roundResults[-1].customerCount` | `roundResults` | Customer spawn pacing (Simulate only) |
| `roundResults[-1].auctionResults.adWon` | `roundResults` | Menu-board content |
| `mode` | Parent phase component | Decide / simulate / static |

## Side-panel reskin

The SimulatePhase's existing **Menu** and **Status** side panels receive a pixel/wood aesthetic:

- Wooden frame backgrounds (matching scene palette)
- Chunky 2-px dark borders
- Pixel font for headings
- Warm amber highlights for selected/active state
- **No structural changes** — same layouts, same data bindings, same interactions
- All styles contained in `pixel-scene.css` alongside the scene's styles

## Fallbacks

**Error boundary.** `<PixelBakeryScene>` is wrapped in an error boundary. On a crash (sprite data import fails, canvas context unavailable, hook throws), fall back to a minimal **static SVG placeholder**: a plain wood-sign silhouette with the team name and "Simulating…" text (or the round summary on Decide). We do not resurrect any prior emoji scene.

**Reduced motion.** When `prefers-reduced-motion: reduce`:
- Animation hook enters paused mode
- Scene renders: static backdrop + stationary chefs (no bob) + cat (sitting pose) + current sold-out state
- On Simulate only: small "Simulating round…" overlay label so the user knows time is passing
- No customers, no dollar bills, no oven steam, no cat walking

## Testing

All new files are test-first (TDD). Targets:

- **Sprite-data invariants** (unit): palette bounds (indices ≤ palette length), frame dims match declared `width × height`
- **Canvas renderer** (unit): given palette + grid, emits correct RGBA pixel values; transparent cells have alpha 0
- **Layer components** (component):
  - `<ChefLayer staffCounts={...}>` renders N chefs at correct X coordinates per station
  - `<CustomerLayer>` renders N customers per `customers` prop
  - `<CatLayer>` positions cat within floor-strip bounds
  - `<DollarLayer>` renders bills per `dollars` prop; each bill removed on `animationend`
  - `<SceneBackdrop>` re-renders canvas only on menu/soldOut diff
- **Hook** (unit/integration): `useBakeryScene`
  - Customer spawn interval derived from `customerCount` + simulate duration; soft-cap honored
  - Mode=`decide` → no customer spawning; cat still wanders
  - Mode=`simulate` → spawner active
  - `prefers-reduced-motion` → paused state produces expected static snapshot
- **Integration** (component): full `<PixelBakeryScene>` mounts with mocked `useGame` context; expected child layers present; no console errors
- **Manual visual** via `/preview/bakery-scene`; screenshots captured per implementation phase

## Files

**New files (net-new for this design):**
- `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/TeamSign.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/ChefLayer.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/CatLayer.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/DollarLayer.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/FxLayer.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/PixelSprite.tsx`
- `games/bakery-bash/app/src/components/bakery-scene/sprites/*.ts` (one per sprite — chef-bakery, chef-deli, chef-barista, customer-templates, cat, breads, props)
- `games/bakery-bash/app/src/components/bakery-scene/sprite-data.ts` (shared `SpriteData` types + renderer helpers)
- `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- `games/bakery-bash/app/src/styles/pixel-scene.css`
- Sibling `.test.ts(x)` files for every above file

**Modified files:**
- `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` — swap emoji visual → `<PixelBakeryScene mode="simulate" />`; add side-panel reskin classnames
- `games/bakery-bash/app/src/pages/phases/DecidePhase.tsx` (or equivalent) — insert `<PixelBakeryScene mode="decide" />` in an additive slot
- `games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx` — repurpose for the new scene component
- `games/bakery-bash/app/src/App.tsx` — remove `/preview/tile-inspector` route

**Files to delete (from the prior top-down-tile commit `3c4af2d`):**
- `games/bakery-bash/app/src/components/bakery/scene-data.ts` + `.test.ts`
- `games/bakery-bash/app/src/components/bakery/SceneBackdrop.tsx` + `.test.tsx`
- `games/bakery-bash/app/src/components/bakery/SceneFurniture.tsx` + `.test.tsx`
- `games/bakery-bash/app/src/components/bakery/BakeryScene.tsx` + `.test.tsx`
- `games/bakery-bash/app/src/components/bakery/` (entire folder)
- `games/bakery-bash/app/src/pages/TileSheetInspectorPage.tsx`
- `games/bakery-bash/app/src/styles/bakery-scene.css`
- `games/bakery-bash/app/public/assets/bakery-v2/` (entire folder — CC0 tilesheets no longer used)

## Implementation-time decisions (deferred to the plan)

- Exact pixel dimensions for each sprite (the table lists starting targets; final values may tighten during pixeling)
- Exact slot/placement of the scene in `DecidePhase.tsx` — decided after surveying the current markup at plan-writing time
- Exact mapping from product IDs to shelf-tile sprites (one shelf slot per distinct product; concrete count depends on the game's product catalog)
- Chef apron colors — starting palette above; may tune during visual iteration to match existing game UI
- Pixel-font glyph set — start with A–Z + 0–9 + common punctuation; extend if a team name uses anything outside that

## Risk register

- **Pixeling volume is the biggest scope risk.** ~15 distinct sprites × multiple frames each = a lot of grid authoring. If pixeling-time blows out, we cut to 2 customer templates (instead of 3–4), drop customer palette swaps below 2 per template, and/or drop the espresso-machine detail.
- **Canvas perf** with N customers + dollar bills re-painting every frame should be fine at 480×270 scale but will be measured during integration. Fallback: reduce customer soft-cap to 2.
- **DecidePhase insertion point** is unknown until plan-writing. If no natural slot exists without major restructuring, we ship the scene Simulate-only initially and revisit Decide in a follow-up.
