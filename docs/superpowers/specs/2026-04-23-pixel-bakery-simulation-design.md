# Pixel Bakery Simulation Screen — Design

**Date:** 2026-04-23
**Game:** Bakery Bash
**Surface:** Per-player `SimulatePhase` screen (between-round simulation, ~2 min)
**Status:** Design approved; ready for implementation plan

---

## Goal

Replace the current emoji-based between-round simulation with a charming Stardew-Valley-style pixel-art interior scene that visibly rewards players for a good round. Customers walk into the team's bakery, buy products, and exit; dollar-bill flurries burst out of the counter on every sale so it feels like the team is raking in money. The team name sits on a carved wooden sign on the back wall. Scope is explicitly **lo-fi / one weekend** — aim for "charming and readable," not "indie-game-shippable."

## Scope

**In scope (MVP):**
- Pixel-art **interior** scene (back wall with shelves, counter, floor, door on right edge) replacing the center "bakery visual" slot of `SimulatePhase`
- Carved wooden "Welcome to [Team Name]" sign on back wall
- Customers spawn from the door, walk to counter, pause to buy, walk back out
- 4–6 dollar-bill flurry ($ pop-ups) per sale, floating up with rotate + fade
- Up to 4 chefs behind the counter at the Bakery / Deli / Barista stations (generic per-station nationality fallback acceptable for MVP)
- Day/night color wash overlay synced to existing `isNight` state in `SimulatePhase`
- Sold-out shelves: product tiles swap to empty-tray sprites when product enters the existing `soldOut` set
- Ad display reskinned as an in-scene poster/TV on the back wall (replaces the current floating icon)
- Side panels (Menu, Status) reskinned with a pixel/wood aesthetic for visual cohesion (structure unchanged)
- Reduced-motion fallback: static backdrop + team sign + chefs + "Simulating round…" text
- Error boundary that falls back to the previous emoji scene on sprite load failure or hook crash

**Out of scope (deferred polish):**
- Burglar cameo *(cut by user request)*
- Per-chef unique avatars by specific `nationality × gender × variant` (fallback to generic per-station sprites is acceptable for MVP)
- Bill denominations ($5 / $10 / $20 tints scaled to sale price)
- Combo meter / streak counter
- Customer queue visualization beyond the soft-cap behavior
- Tumbleweed for empty rounds
- Door chime puff animation
- Weather / seasonal skins
- Click-to-inspect chef stats
- Tilemap plaza with multiple shops or exterior view
- Team logo upload, emblem picker, or auto-generated emblem (team name alone on the sign is sufficient)

## Locked Design Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Surface | Upgrade per-player `SimulatePhase` (not professor view, not finale) |
| 2 | Fidelity | Lo-fi "charming but simple" — 1 weekend / 1–2 Claude sessions |
| 3 | Layout | Hybrid — pixel scene in center, side panels reskinned in pixel/wood aesthetic |
| 4 | Team branding | Team name only on carved wooden sign (no new data model) |
| 5a | Customer-to-data link | Spawn pacing driven by `RoundResult.customerCount` |
| 5b | Dollar popup style | Flurry / cascade (4–6 bills per sale) |
| 6 | Rendering tech | DOM + CSS sprites with `image-rendering: pixelated`; no new deps |
| 7 | View | Interior of bakery (not storefront exterior) |
| 8 | Currency | Dollar bills (rectangular green with `$`), not coins |
| 9 | Burglar cameo | Dropped from MVP |

## Architecture

### Component tree

```
SimulatePhase.tsx (existing — center slot changes)
└── PixelBakeryScene.tsx (new orchestrator)
    ├── InteriorBackdrop.tsx    — back wall, floor, counter, door, window, clock
    ├── TeamSign.tsx            — wooden sign + team name in pixel font
    ├── ShelfStock.tsx          — per-product shelf tiles, empty when sold out
    ├── ChefRoster.tsx          — up to 4 chefs at 3 stations with idle animation
    ├── CustomerLayer.tsx       — renders customer actor pool
    ├── DollarLayer.tsx         — renders short-lived dollar-bill popups
    ├── AdDisplay.tsx           — reskinned as back-wall poster/TV
    └── DayNightOverlay.tsx     — CSS color-wash overlay tied to isNight
```

### New hook

`useSceneAnimation({ customerCount, isNight, soldOut, menu })` — owns the only mutable scene state (active actors, active dollar popups). Runs a single `requestAnimationFrame` loop plus a `setTimeout` spawn scheduler. Returns `{ customers, dollars }` and a `triggerSale()` imperative used internally when actors reach the counter.

### File layout

**New files:**
- `games/bakery-bash/app/src/components/simulate/PixelBakeryScene.tsx`
- `games/bakery-bash/app/src/components/simulate/InteriorBackdrop.tsx`
- `games/bakery-bash/app/src/components/simulate/TeamSign.tsx`
- `games/bakery-bash/app/src/components/simulate/ShelfStock.tsx`
- `games/bakery-bash/app/src/components/simulate/ChefRoster.tsx`
- `games/bakery-bash/app/src/components/simulate/CustomerLayer.tsx`
- `games/bakery-bash/app/src/components/simulate/DollarLayer.tsx`
- `games/bakery-bash/app/src/components/simulate/AdDisplay.tsx`
- `games/bakery-bash/app/src/components/simulate/DayNightOverlay.tsx`
- `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- `games/bakery-bash/app/src/styles/pixel-scene.css`

**Modified files:**
- `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` — swap the `.simulate-phase__bakery-visual` inner markup for `<PixelBakeryScene />`, pass existing `isNight`, `day`, and `soldOut` as props; reskin side panels via new CSS class variants
- Possibly `games/bakery-bash/app/src/styles/global.css` — only if shared wooden-panel tokens are factored out; otherwise keep rules inside `pixel-scene.css`

**New assets (under `games/bakery-bash/assets/svg/scene/`):**
- `interior-backwall.svg` — back wall with shelf outlines, window frame, chalkboard mount
- `counter.svg` — counter + display-case cross-section
- `floor.svg` — wooden-plank or tiled floor strip
- `door.svg` — right-edge entrance
- `wooden-sign.svg` — frame for the team-name welcome sign
- `dollar-bill.svg` — rectangular green bill with `$`
- `shelf-product-empty.svg` — empty tray sprite for sold-out slots
- *(Reuse existing `assets/svg/products/*.svg` for stocked shelf tiles)*
- *(Reuse existing `assets/svg/characters/customer-walk-spritesheet.svg` and `chef-walk-spritesheet.svg`)*

## Data Flow

All data flows **one-way** from `useGame()` context → `<PixelBakeryScene>` → children via props. Only `useSceneAnimation` holds scene-local mutable state.

| Data point | Source | Drives |
|---|---|---|
| `teamName` | `useGame()` | `<TeamSign>` |
| `latest.customerCount` | `roundResults[last]` | spawn interval (see below) |
| `latest.auctionResults.adWon` | `roundResults[last]` | `<AdDisplay>` poster on back wall |
| `pendingDecision.menu` | `useGame()` | which product tiles render on shelves |
| `pendingDecision.staffCounts` | `useGame()` | chef count per station |
| `day`, `isNight`, `soldOut` | owned by `SimulatePhase` (existing) | day/night overlay, empty shelf state |

**Note on chef identities:** `RoundResult` exposes `staffCounts` (numeric), but per-player individual chef metadata (specific nationality / gender / skill) is stored separately and the exact read path was not confirmed during design (grep found `chefPool` at `games/{gameId}/rounds/{round}.chefPool`). Implementation step: locate the per-player roster read path; if it cannot be resolved cheaply, **fall back to generic per-station sprites** — one French-ish at Bakery, one Italian-ish at Deli, one Japanese-ish at Barista — keyed off station nationalities from `CHEF_ROSTER.md`. This preserves the "my chefs are here" feel without a data-layer rabbit hole.

**No backend / schema changes required.** Every field this feature consumes already exists.

## Animation Engine

### Coordinate system

Scene is authored at a fixed **480 × 270** logical pixel grid (16:9 at a 16-px base). All actor positions and target slots are in logical coords; CSS `transform: scale(...)` + `image-rendering: pixelated` handle the upscale to actual screen size.

### Spawn scheduler

Inputs: `totalCustomers = latest.customerCount`, `simDurationMs ≈ 120_000` (30 days × 4s each; reads from existing `SimulatePhase` constants).

Base interval = `simDurationMs / totalCustomers`, with ±25% jitter per spawn.

| `customerCount` | Interval | Feel |
|---|---|---|
| 10 | ~12s | ghost town |
| 40 | ~3s | steady |
| 80 | ~1.5s | busy |
| 160 | ~0.75s | packed |
| 300+ | ~0.4s (cap hit) | queue forms |

**Soft cap:** 12 concurrent customers on-screen. If the pool is full when a spawn fires, defer ~400ms and retry. Packed rounds visibly form a line at the counter rather than jamming.

**Empty round** (`customerCount === 0`): no spawns, empty shelves, centered "Today was quiet…" label. No tumbleweed in MVP.

### Customer actor lifecycle

| Phase | Duration | Behavior |
|---|---|---|
| `WALK_IN` | 1.5–2.0s | spawn at `x=480` (off-right), walk left at ~60 logical px/s to a target counter slot `x ∈ [180, 300]` (jittered), 4-frame walk cycle at 6 fps via CSS `steps(4)` |
| `AT_COUNTER` | 600–900ms | stop, flip sprite to face counter; at ~400ms into this phase, `triggerSale()` emits a dollar flurry at the customer's `x` |
| `WALK_OUT` | 1.5–2.0s | flip sprite back, walk right to `x=500`, despawn on exit |

Walk cycle animates `background-position` against the existing `customer-walk-spritesheet.svg` via a CSS keyframe with `animation-timing-function: steps(4)`. No JS-per-frame swapping.

### Dollar popup lifecycle

- Flurry size: 4–6 bills per sale, staggered 60–120ms
- Lifetime: ~800ms; `setTimeout` removes the node at 900ms
- CSS animation: `translate3d(0, -48px, 0)` + `rotate(-10deg)` + `opacity: 1 → 0`
- Born at `(customerX, counterY − 8)`

### Chef animation

Each chef is a fixed-position sprite behind the counter at their station's `x`. Idle animation = 2-frame gentle bob at 1 fps + occasional 150ms "knead" pose every 3–5s (randomized per-chef offset to avoid sync). Sprite sourced from `chef-walk-spritesheet.svg` pinned to the idle column.

### Sold-out shelves

`<ShelfStock>` reads the `soldOut: Set<Product>` that `SimulatePhase` already computes. Each shelf slot shows a small product tile (reusing `assets/svg/products/*.svg`). When a product is in `soldOut`, its slot swaps to `shelf-product-empty.svg`. Instant swap — no animation.

### Day/night overlay

When `isNight` flips true: scheduler pauses spawns + skips sale triggers. In-flight actors finish their current phase and drain. `<DayNightOverlay>` fades a translucent indigo gradient over the scene (600ms CSS transition). Chefs keep their idle animation.

### Visibility pause

RAF loop checks `document.visibilityState`. When the tab is hidden, it skips ticks and the scheduler pauses. On `visibilitychange` back to visible, loop resumes cleanly — prevents spawn-queue buildup while the tab was backgrounded.

### Reduced motion

When `prefers-reduced-motion: reduce` is set: the hook short-circuits — returns `customers: []`, `dollars: []`, never starts the RAF loop. `<PixelBakeryScene>` renders the static backdrop + team sign + stationary chefs + a centered "Simulating round…" text. Consistent with how `SimulatePhase` already handles reduced motion for its top bar.

## Testing

Vitest (repo already uses it):

**Unit — `useSceneAnimation`:**
- Given `customerCount=80`, `simDurationMs=120_000` → base interval ≈ 1500ms ± jitter tolerance
- Actor held at `AT_COUNTER` past 900ms advances to `WALK_OUT`
- `triggerSale()` pushes 4–6 dollar popups; all removed from state after 900ms
- Pool at cap (12) → next spawn returns `null` and reschedules ~400ms later
- `isNight=true` → no spawns emitted; in-flight actors finish
- `prefers-reduced-motion: reduce` → hook returns empty arrays, no RAF started

**Integration smoke:**
- Render `<SimulatePhase>` with a mocked `useGame()`, fake timers, `customerCount=40` → after 4s of advanced time, at least one customer actor exists and team name appears in the sign
- With `customerCount=0`, no actors spawn after 8s of advanced time
- Component unmounts cleanly — no timer or RAF leaks (verify post-unmount)

**Manual visual QA:**
- One full round in the Firebase emulator across low/mid/high `customerCount`
- Verify `image-rendering: pixelated` in Chrome/Safari/Firefox (Safari auto-falls back to `crisp-edges`)
- 2017-era Chromebook / iPad mini 4 → no jank, frame time <16ms

## Failure modes

| Failure | Fallback |
|---|---|
| `latest` undefined (round data still loading) | Backdrop + chefs + centered "Preparing simulation…" text |
| `latest.customerCount` missing or 0 | Empty scene, no actors, no flurries |
| Customer or chef spritesheet fails to load | `<ErrorBoundary>` renders the previous emoji scene; log to console |
| Individual chef roster data unreachable | Generic per-station sprites keyed off station nationality |
| `useSceneAnimation` throws | Error boundary → emoji scene fallback |
| Tab hidden (`document.visibilityState !== 'visible'`) | RAF skips ticks, scheduler pauses; resume on `visibilitychange` |

## Accessibility

- Scene wrapper: `role="img"` + `aria-label={`${teamName} bakery interior with customers making purchases`}`
- All sprites: `alt=""` `aria-hidden="true"` (decorative)
- Dollar popups: `aria-hidden="true"` — screen readers ignore the flurry
- Reduced-motion path described above

## Performance budget

Peak on-screen DOM: ~12 customers + ~8 active dollars + 4 chefs + static backdrop ≈ 30 positioned elements. Target: <2% main thread on a 2018 MacBook Air (Chrome profiler). If we exceed this, we migrate to canvas — but the math says we won't.

## Timeline

- **Session 1 (~3–5 hr):** Asset drafting, `PixelBakeryScene` scaffolding, `useSceneAnimation` with spawn + actor lifecycle + dollar flurries, team sign, chef sprites (generic fallback), day/night overlay, integration into `SimulatePhase`, reduced-motion path
- **Session 2 (~2–3 hr):** Side-panel pixel reskin, sold-out shelf swaps, `<AdDisplay>` back-wall poster, error boundary + fallback, unit + integration tests, manual QA in emulator, tuning spawn jitter and animation timings

Total: ~1 weekend of focused work, roughly 1–2 Claude sessions.
