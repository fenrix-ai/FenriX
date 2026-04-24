# Pixel Bakery Scene — art-polish session handoff

**Date:** 2026-04-24
**Branch:** `feat/bakery-scene-v2`
**Predecessor plan:** [2026-04-23-pixel-bakery-scene-undertale.md](./2026-04-23-pixel-bakery-scene-undertale.md) — the original 26-task plan (all complete).

This document captures the state at the end of the prior session and the follow-up visual-polish work agreed with the user. It is meant to be read by a fresh Claude session picking up the work.

---

## State at handoff

- Worktree: `/Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2`
- Branch: `feat/bakery-scene-v2`, clean tree at HEAD `518b85f`.
- 30 commits span Phase 2.2 through Phase 10.3 of the predecessor plan.
- **84/84 tests pass** across 18 files (`CI=1 npm test -- --run` from `games/bakery-bash/app`).
- `tsc --build` has 2 pre-existing errors unrelated to this branch:
  - `PixelSprite.tsx:28` — `Uint8ClampedArray<ArrayBufferLike>` vs. `ImageData` constructor overload (SharedArrayBuffer vs. ArrayBuffer mismatch).
  - `vite.config.ts:8` — `test` property not in `UserConfigExport`.
- ESLint is clean on all touched files.
- Scene renders on `http://localhost:5175/preview/bakery-scene` via `preview_start` with name `bakery-scene-v2`. SimulatePhase and GamePage Decide both mount the scene in-app. Error boundary, reduced-motion support, and sold-out shelf swap all landed.

---

## Why this polish session

User reviewed the rendered preview and flagged three visual problems:
1. **Chefs render in front of the counter** instead of behind it. They want Undertale/Stardew-style "chef standing behind counter" where only the upper torso + head is visible above the counter top edge.
2. **Oven is unrecognizable** — currently a flat dark rectangle with chrome trim + amber glow window. Looks geometric, not like an actual bakery oven.
3. **Espresso machine is unrecognizable** — currently chrome body + dark inner panel + two small circles (group heads) + a steam wand line. Doesn't read as an espresso machine at all.

User asked about sourcing real art online and supplied two Freepik zips.

---

## Assets the user provided

Source files are committed to the repo at `docs/superpowers/plans/assets/2026-04-24-bakery-scene-art/` (see the README in that folder). The key files:

1. **`docs/superpowers/plans/assets/2026-04-24-bakery-scene-art/bread-pixel-art.jpg`**
   (original zip: `bread-pixel-art.zip` alongside it)
   - Actual pixel-art, good stylistic fit.
   - 16 bread/pastry items in a 4×4 grid (loaves, cheese, sliced bread, buns, muffin, pretzel, croissant, biscuits, donut/wreath, etc.).
   - Solid purple background (roughly `#503a5c`).
   - Image is ~1000×1000; each cell ~250×250.
   - **USE THIS** for the bread shelf + display case art.

2. **`docs/superpowers/plans/assets/2026-04-24-bakery-scene-art/appliances-reference.jpg`**
   (original zip: `appliances-reference.zip` alongside it)
   - Flat vector / cartoon icon set.
   - Style clashes with the pixel-art chefs + cat.
   - **DO NOT USE** in the scene. Keep as visual reference only when hand-redrawing the oven + espresso machine in pixel-art style.
   - License texts: `appliances-license-free.txt` and `appliances-license-premium.txt` alongside.

### License — attribution is required

Freepik free tier requires a visible "Designed by Freepik" credit. Specifically:
- Food art: attribute to `Freepik` (author not specified in `License free.txt`, use the generic form).
- Appliances: attribute to `katemangostar / Freepik` (per their `License free.txt`).

Even though we're skipping the appliances for styling, we only need the food-art credit if we only ship the food art. Add a small "Art credits: Designed by Freepik" line in a visible spot — the `BakeryScenePreviewPage` footer is the obvious place, and a less obtrusive line in `SimulatePhase` is nice-to-have.

### License — what we can't do

- Can't sub-license, resell, or rent the assets.
- Can't include them in an online/offline archive or database.
- Can modify them (cropping out the purple background is modification, which is allowed).

---

## Agreed scope for this session

### 1. Move chefs behind the counter

Currently `<ChefLayer>` renders as a sibling layer on top of the already-painted backdrop. Fix:

- Split `paintBackdrop` in `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx` so the counter band + counter furniture (bread display case + espresso machine) render on a new canvas layer.
- Create a new component `<CounterFrontLayer>` that paints counter band + counter furniture onto its own absolutely-positioned canvas.
- In `<PixelBakeryScene>`, reorder children: backdrop (without counter) → sign → chefs → **counter-front-layer** → customers → cat → dollars → fx.
- Shift `SCENE.chefTopY` from `140` to roughly `108` so the chef sprite spans `y=108..148`, with the counter at `y=140..180` overlapping the lower 10 rows of the chef sprite. Only torso + head + hat show above the counter line.
- Existing pixel tests sample the counter band at specific coordinates — keep those tests green by preserving the visual output at the sampled points.

**Beware the `canvas-test-helpers.ts` purity pattern** — `CounterFrontLayer` needs `useEffect` with props-based deps; if it takes `menu`/`soldOut`, pass the same `EMPTY_MENU`/`EMPTY_SOLD_OUT` stable module-level defaults as `<SceneBackdrop>` does (otherwise the counter repaints at 60fps — see commit `518b85f`).

### 2. Extract the 16 bread PNGs from `8676979.jpg`

`imagemagick` is **not** installed (confirmed `which magick convert` — both not found). Alternatives:

- **Pillow (Python)** — simplest one-shot extraction. `python3 -c "from PIL import Image; ..."`. Python 3 + Pillow should be installed system-wide; verify with `python3 -c "import PIL; print(PIL.__version__)"`.
- **sharp (Node)** — may already be a transitive dep. Check `npm ls sharp` in `games/bakery-bash/app`.
- **jimp (Node)** — pure-JS alternative if sharp isn't available.

Process:
- Detect the exact grid layout (probably 4 rows × 4 cols) and cell size.
- Crop each of the 16 cells to its own image.
- Chromakey the purple background to transparent — use a fuzz tolerance (~5–8%) because the purple might have minor pixel variation from JPG compression.
- Save each as `games/bakery-bash/app/public/assets/pixel-scene/bread/01.png` through `16.png`, with proper alpha.
- Naming: if the item is recognizable, use a descriptive name (`loaf-white.png`, `croissant.png`, `muffin.png`, `pretzel.png`, `sliced-bread.png`, `bagel.png`, etc.). If not, stick with sequential `01..16`.

### 3. Rewire bread shelf + display case to use the PNGs

In `SceneBackdrop.tsx`'s back-wall paint block (shelves) and the counter-furniture paint block (bread display case):

- Stop painting the amber-loaf palette rectangles for the shelf loaves and display-case hero loaves.
- Instead, emit `<img src="/assets/pixel-scene/bread/<name>.png">` tags positioned absolutely at each slot's `(x, y)`.
- Keep the sold-out gating: when a slot's product is in the `soldOut` set OR when `menu[slotIndex]` is undefined, render the existing gray-tray palette rectangle instead of the PNG.
- The shelf plank wood + shadow stay as painted rectangles — only the loaves on top change.

Note this is a mixed-rendering architecture now: backdrop canvas for structural elements, PNG overlays for detailed items. The layering via `position: absolute` inside the scene div should Just Work.

### 4. Hand-redraw the oven

In `paintBackdrop` (the `--- Back-wall elements ---` block, middle section), replace the current oven paint code with much more detail. Target look: a bakery deck oven. Add:
- Two temperature knobs with tick marks + pointer
- A digital temperature display (small dark rectangle with glowing orange or green)
- A door handle (horizontal bar across the middle of the door)
- A rack visible through the window (horizontal line(s) across the amber glow area)
- Bread/pastry silhouettes on the rack (tiny shadows inside the glow)
- A control panel band at the bottom with 2–3 button circles + an LED indicator
- Proper bezel / trim around the door (darker inner border, lighter outer highlight)
- Hinges on the left side of the door (small vertical rectangles)

Palette additions likely needed in `scene-palette.ts`: `ovenPanel` (slightly darker than `ovenDark`), `ovenLED` (green or red accent), `ovenKnob` (light gray).

### 5. Hand-redraw the espresso machine

In the new `CounterFrontLayer` (or wherever the espresso machine paint lives after refactoring), add:
- A proper grouphead silhouette with portafilter handle protruding downward (the dark circle + a diagonal wood-colored handle)
- Two grouphead circles with silver rings
- A steam wand on the right side with a visible nozzle tip at the bottom
- A drip tray beneath the groupheads (dark horizontal strip with a grate pattern)
- A pressure gauge (small circle with needle) on the top
- A water reservoir outline on the right side (rectangular panel with water-level indicator)
- Power LED (small dot, green or red)
- Cups stacked on top (already there — refine the shading)
- Branding space: a small dark rectangle on the front where a logo would go
- Proper chrome highlights (1-px lighter lines along the top edge, darker along the bottom)

Target look: La Marzocco Linea Mini or similar 2-group commercial espresso machine.

### 6. Add the Freepik attribution

Two spots:
- `BakeryScenePreviewPage.tsx` — bottom of the page, in the same monospace style as the rest of the dev controls: `<p style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>Bread art: Designed by Freepik</p>`.
- `SimulatePhase.tsx` — small unobtrusive line in a panel footer, e.g., under the Status panel: `<p className="simulate-phase__credits">Art: Designed by Freepik</p>` with light-gray styling.

---

## Architectural gotchas to remember

### `useBakeryScene` hook purity

The hook went through two refactors because `eslint-plugin-react-hooks` rejects `performance.now()` at render time. Current shape:
- `useState` lazy-initializer for public snapshots (`cat`, `customers`, `dollars`, `bobFrame`).
- `useRef<... | null>(null)` for internal mutable state (`catRef`, `customersRef`, `dollarsRef`, `lastRef`, `startRef`, `lastSpawnRef`) — populated on the first rAF tick using the `DOMHighResTimeStamp` passed to the rAF callback.
- **No `performance.now()` calls outside the rAF loop.**

If you add more timing-sensitive state (e.g., for the oven glow flicker or a new animation), follow the same pattern.

### Stable module-level defaults for canvas props

Inline `= new Set()` / `= []` default parameters create a new reference on every render. When a canvas component's `useEffect` depends on those props, it re-runs at rAF frequency. The fix is a module-level constant:

```ts
const EMPTY_MENU: string[] = []
const EMPTY_SOLD_OUT: Set<string> = new Set()

export function SceneBackdrop({ menu = EMPTY_MENU, soldOut = EMPTY_SOLD_OUT }: Props = {}) { ... }
```

Both `SceneBackdrop.tsx` and `PixelBakeryScene.tsx` already use this pattern (commit `518b85f`). If `CounterFrontLayer` takes `menu`/`soldOut`, apply the same pattern.

### Canvas testing pattern

- Shared helper: `games/bakery-bash/app/src/components/bakery-scene/canvas-test-helpers.ts`.
- In any component test that reads pixel colors via `getImageData`, use `setupCanvasFake()` in a `beforeEach` (and `.cleanup()` in `afterEach`).
- **Do not install the `canvas` npm package.** Do not modify `src/test-setup.ts`.
- For tests that only check for element presence (count, styles, aria labels), no canvas fake is needed — the PixelSprite / SceneBackdrop / other canvas components have `if (!ctx) return` guards that handle jsdom's null `getContext`.

### Test-mode considerations for the Freepik PNGs

In jsdom, `<img>` elements exist but don't actually fetch anything. Tests that count child elements or check `src` attributes work fine. Tests that sample pixels via `getImageData` need the canvas fake (not applicable for `<img>` since those aren't canvas-based). No change needed to the existing canvas-test-helpers.

### Known deferred items (do NOT address in this session)

- `&` missing from pixel font glyph set (`pixel-font.ts`). `"CRUMBS & CO"` currently renders as `"CRUMBS   CO"`.
- `'static'` mode JSDoc contradicts actual behavior — hook animates identically to `decide`. Either freeze animation when `mode === 'static'` or update the docstring.
- `<FxLayer>` doesn't honor reduced-motion. Steam still spawns.
- Module-level ID counters (`customerIdCounter`, `dollarIdCounter`, `wispIdCounter`) not reset between tests.
- `PixelSprite.tsx:28` pre-existing TS overload error.
- Orphaned CSS in `global.css` (`.simulate-phase__customer*`, `customerWalk` keyframes, old ad-display classes).

---

## Recommended workflow

Use the `superpowers:subagent-driven-development` skill for task dispatch:
- Chef layering + `CounterFrontLayer` extraction is **sonnet** (multi-file integration, layering concerns, tests to preserve).
- Bread PNG extraction is **haiku** (mechanical, once the tool is picked).
- Bread shelf + display case rewiring is **sonnet** (touches the backdrop structure + tests).
- Oven redraw is **sonnet** (lots of precise pixel math, palette additions).
- Espresso-machine redraw is **sonnet** (same reasoning).
- Attribution lines are **haiku** (trivial text additions).

Start by reading the current state of `SceneBackdrop.tsx`, `PixelBakeryScene.tsx`, and `useBakeryScene.ts` to orient yourself. User has exited auto mode — propose each task's approach before writing code and wait for the user to confirm direction.

---

## Verify before claiming done

```bash
cd /Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2/games/bakery-bash/app

# All tests pass
CI=1 npm test -- --run

# ESLint clean on any touched file
npx eslint src/components/bakery-scene/ src/pages/

# TypeScript (use --build, not --noEmit — the latter silently skips project refs)
npx tsc --build
# Expect only the two pre-existing errors in PixelSprite.tsx and vite.config.ts.
```

Visual check:
```bash
# From the worktree root:
# Use preview_start with name 'bakery-scene-v2' (port 5175).
# Open http://localhost:5175/preview/bakery-scene
# Toggle between decide/simulate/static modes, try different team names, verify:
# - Chef torso + head visible above counter; legs hidden behind
# - Recognizable oven in the mid-band (knobs, door handle, rack visible)
# - Recognizable espresso machine on counter right (groupheads, steam wand, drip tray)
# - Bread shelves show pixel-art bread items instead of generic amber bumps
# - Sold-out shelves show gray trays
# - "Designed by Freepik" credit line visible
```
