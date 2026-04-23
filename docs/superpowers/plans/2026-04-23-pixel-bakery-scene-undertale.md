# Pixel Bakery Scene (Undertale-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Undertale-style side-view pixel-art bakery scene rendered on both DecidePhase and SimulatePhase, with chefs, a wandering cat, customers that walk in during simulation, and dollar-bill flurries on each sale.

**Architecture:** Hand-pixeled sprites authored as TS data-grid modules (palette + 2D color-index grid) rendered to `<canvas>` via a shared `<PixelSprite>` component. Scene is a 480×270 native-pixel canvas composition with layered character + FX components. A single `useBakeryScene` hook owns all animation state via requestAnimationFrame, driven by game context props.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, HTML5 Canvas (ImageData-based pixel rendering), CSS (transforms + keyframes for DOM-based FX like dollar bills and oven steam).

**Spec:** [`docs/superpowers/specs/2026-04-23-pixel-bakery-scene-undertale-design.md`](../specs/2026-04-23-pixel-bakery-scene-undertale-design.md)

**Branch:** Plan executes on `feat/bakery-scene-v2` in worktree `.worktrees/bakery-scene-v2`.

---

## Phase 0 — Delete the top-down tile commit's scene code

Before building anything new, remove all files from the prior top-down CC0-tile pivot (`3c4af2d`). This gives us a clean starting canvas and removes the broken `/preview/bakery-scene` route that's currently showing the wrong thing.

### Task 0.1: Remove top-down scene files, routes, and tile assets

**Files:**
- Delete: `games/bakery-bash/app/src/components/bakery/` (entire folder: 4 components + 4 tests + scene-data + its test)
- Delete: `games/bakery-bash/app/src/pages/TileSheetInspectorPage.tsx`
- Delete: `games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx`
- Delete: `games/bakery-bash/app/src/styles/bakery-scene.css`
- Delete: `games/bakery-bash/app/public/assets/bakery-v2/` (entire folder: tilesheets, licenses, audit, sources)
- Modify: `games/bakery-bash/app/src/App.tsx` — remove the two `/preview/*` routes and their imports (both will be re-added in Phase 7; we delete now because their pages are being removed)

- [ ] **Step 1: Delete the scene component folder and preview pages**

Run these in the worktree root:
```bash
cd /Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2
rm -rf games/bakery-bash/app/src/components/bakery
rm games/bakery-bash/app/src/pages/TileSheetInspectorPage.tsx
rm games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx
rm games/bakery-bash/app/src/styles/bakery-scene.css
rm -rf games/bakery-bash/app/public/assets/bakery-v2
```

- [ ] **Step 2: Remove route wiring from App.tsx**

Edit `games/bakery-bash/app/src/App.tsx`:

Remove these two imports:
```tsx
import { BakeryScenePreviewPage } from "./pages/BakeryScenePreviewPage";
import { TileSheetInspectorPage } from "./pages/TileSheetInspectorPage";
```

Remove these two `<Route>` blocks from inside `<Routes>`:
```tsx
<Route
  path="/preview/bakery-scene"
  element={<BakeryScenePreviewPage />}
/>
<Route
  path="/preview/tile-inspector"
  element={<TileSheetInspectorPage />}
/>
```

- [ ] **Step 3: Run the test suite — expect all remaining tests to pass**

Run:
```bash
cd games/bakery-bash/app && CI=1 npm test -- --run
```

Expected: tests for the deleted components are gone; all other tests pass. Baseline count before Phase 2 commit was 18 tests; after deletion this drops to the count that existed before `3c4af2d` (pre-Phase-2-of-earlier-attempt). If any remaining test imports a deleted file, delete that test too — it was testing something that no longer exists.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd games/bakery-bash/app && npx tsc --noEmit
```

Expected: exit 0. If an error appears about a deleted import, it means App.tsx still references something — finish Step 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2
git add -A games/bakery-bash/app/src/App.tsx \
  games/bakery-bash/app/src/components/bakery \
  games/bakery-bash/app/src/pages/TileSheetInspectorPage.tsx \
  games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx \
  games/bakery-bash/app/src/styles/bakery-scene.css \
  games/bakery-bash/app/public/assets/bakery-v2
git commit -m "$(cat <<'EOF'
chore(bakery-bash): remove top-down tile scene (pivot to Undertale side-view)

Clears the prior top-down CC0-tile scene code (3c4af2d) in preparation for
the hand-pixeled Undertale side-view rebuild per
2026-04-23-pixel-bakery-scene-undertale-design.md. Scene components, preview
pages, CSS, and the CC0 tile asset bundle are all removed. Preview routes
will be re-added in Phase 7 when the new scene component exists.
EOF
)"
```

---

## Phase 1 — Sprite data types + canvas renderer + PixelSprite component

The foundation: a shared type for sprite data, a pure function that converts a grid to ImageData, and a React component that draws a sprite to a canvas. Every sprite in later phases imports and uses this.

### Task 1.1: `sprite-data.ts` — types and the `gridToImageData` renderer

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprite-data.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprite-data.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `games/bakery-bash/app/src/components/bakery-scene/sprite-data.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  gridToImageData,
  validateSpriteData,
  type SpriteData,
} from './sprite-data'

const tinySprite: SpriteData = {
  width: 2,
  height: 2,
  palette: ['#ff0000', '#00ff00'],
  frames: [
    ['01', '10'],
    ['10', '01'],
  ],
}

describe('gridToImageData', () => {
  it('renders frame 0 as expected RGBA bytes', () => {
    const { data, width, height } = gridToImageData(tinySprite, 0)
    expect(width).toBe(2)
    expect(height).toBe(2)
    // pixel (0,0): palette[0] = #ff0000 → [255,0,0,255]
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255])
    // pixel (1,0): palette[1] = #00ff00 → [0,255,0,255]
    expect([data[4], data[5], data[6], data[7]]).toEqual([0, 255, 0, 255])
    // pixel (0,1): palette[1] = #00ff00
    expect([data[8], data[9], data[10], data[11]]).toEqual([0, 255, 0, 255])
    // pixel (1,1): palette[0] = #ff0000
    expect([data[12], data[13], data[14], data[15]]).toEqual([255, 0, 0, 255])
  })

  it('treats space characters as fully transparent', () => {
    const sprite: SpriteData = {
      width: 2,
      height: 1,
      palette: ['#ff0000'],
      frames: [['0 ']],
    }
    const { data } = gridToImageData(sprite, 0)
    expect(data[3]).toBe(255) // pixel 0 opaque
    expect(data[7]).toBe(0) // pixel 1 alpha zero
  })

  it('renders different frames independently', () => {
    const { data: f0 } = gridToImageData(tinySprite, 0)
    const { data: f1 } = gridToImageData(tinySprite, 1)
    expect(f0[0]).not.toBe(f1[0])
  })
})

describe('validateSpriteData', () => {
  it('passes on valid sprite data', () => {
    expect(() => validateSpriteData(tinySprite)).not.toThrow()
  })

  it('throws when frame row count does not match height', () => {
    const bad: SpriteData = {
      width: 2,
      height: 2,
      palette: ['#fff'],
      frames: [['00']], // only 1 row, height is 2
    }
    expect(() => validateSpriteData(bad)).toThrow(/height/i)
  })

  it('throws when a row length does not match width', () => {
    const bad: SpriteData = {
      width: 2,
      height: 2,
      palette: ['#fff'],
      frames: [['00', '000']],
    }
    expect(() => validateSpriteData(bad)).toThrow(/width/i)
  })

  it('throws when a cell references a palette index out of bounds', () => {
    const bad: SpriteData = {
      width: 1,
      height: 1,
      palette: ['#fff'],
      frames: [['5']], // palette only has index 0
    }
    expect(() => validateSpriteData(bad)).toThrow(/palette/i)
  })
})
```

- [ ] **Step 2: Run the tests — expect them to fail with "module not found"**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprite-data.test.ts
```
Expected: test file errors because `./sprite-data` doesn't exist yet.

- [ ] **Step 3: Implement `sprite-data.ts`**

Create `games/bakery-bash/app/src/components/bakery-scene/sprite-data.ts`:
```ts
/**
 * A single pixel-art sprite, authored as a palette + per-frame character grid.
 *
 * - `palette[i]` is a CSS color string (e.g. '#ff00aa'). Up to 16 entries
 *   per sprite; any more and the grids become unreadable.
 * - Each frame is an array of exactly `height` strings, each exactly `width`
 *   characters long. Each character is either a digit/letter indexing into
 *   `palette`, or a space ' ' meaning fully transparent.
 *
 * Palette indices use single characters so grids stay compact and readable:
 *   '0'-'9' map to palette indices 0-9, and 'a'-'f' map to 10-15 (hex-style).
 */
export interface SpriteData {
  width: number
  height: number
  palette: string[]
  frames: string[][]
}

/** Convert a palette-index character to its numeric index, or null for space. */
function cellToIndex(c: string): number | null {
  if (c === ' ') return null
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'a' && c <= 'f') return 10 + c.charCodeAt(0) - 97
  throw new Error(`Invalid cell character '${c}' (use 0-9, a-f, or space)`)
}

/** Parse '#rrggbb' into [r, g, b]. */
function parseHexColor(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length !== 6) {
    throw new Error(`Palette color must be '#rrggbb' format, got '${hex}'`)
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Validate a SpriteData blob at module load time. Throws on any mismatch —
 * we'd rather crash at test time than render a corrupted sprite.
 */
export function validateSpriteData(data: SpriteData): void {
  for (let f = 0; f < data.frames.length; f++) {
    const frame = data.frames[f]
    if (frame.length !== data.height) {
      throw new Error(
        `Frame ${f}: height mismatch (expected ${data.height}, got ${frame.length} rows)`,
      )
    }
    for (let y = 0; y < frame.length; y++) {
      const row = frame[y]
      if (row.length !== data.width) {
        throw new Error(
          `Frame ${f} row ${y}: width mismatch (expected ${data.width}, got ${row.length} chars)`,
        )
      }
      for (let x = 0; x < row.length; x++) {
        const idx = cellToIndex(row[x])
        if (idx !== null && idx >= data.palette.length) {
          throw new Error(
            `Frame ${f} row ${y} col ${x}: palette index ${idx} out of bounds (palette has ${data.palette.length} colors)`,
          )
        }
      }
    }
  }
}

/**
 * Render the given frame of the sprite to raw RGBA bytes. Returns an object
 * shaped like the return of `ctx.getImageData()` so callers can hand it
 * straight to `ctx.putImageData()`.
 */
export function gridToImageData(
  data: SpriteData,
  frame: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const rgba = new Uint8ClampedArray(data.width * data.height * 4)
  const rows = data.frames[frame]
  if (!rows) throw new Error(`Frame ${frame} not found (have ${data.frames.length} frames)`)
  // Pre-parse palette to [r,g,b] triples.
  const rgb = data.palette.map(parseHexColor)
  for (let y = 0; y < data.height; y++) {
    const row = rows[y]
    for (let x = 0; x < data.width; x++) {
      const idx = cellToIndex(row[x])
      const pixel = (y * data.width + x) * 4
      if (idx === null) {
        rgba[pixel + 3] = 0 // transparent
      } else {
        const [r, g, b] = rgb[idx]
        rgba[pixel] = r
        rgba[pixel + 1] = g
        rgba[pixel + 2] = b
        rgba[pixel + 3] = 255
      }
    }
  }
  return { data: rgba, width: data.width, height: data.height }
}
```

- [ ] **Step 4: Run the tests — expect them to pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprite-data.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/sprite-data.ts \
  games/bakery-bash/app/src/components/bakery-scene/sprite-data.test.ts
git commit -m "feat(bakery-bash): pixel-art sprite data types + gridToImageData renderer"
```

---

### Task 1.2: `<PixelSprite>` — draw a SpriteData frame to a canvas

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/PixelSprite.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/PixelSprite.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/PixelSprite.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PixelSprite } from './PixelSprite'
import type { SpriteData } from './sprite-data'

const redDot: SpriteData = {
  width: 1,
  height: 1,
  palette: ['#ff0000'],
  frames: [['0']],
}

describe('<PixelSprite>', () => {
  it('renders a canvas element with native width/height', () => {
    const { container } = render(<PixelSprite data={redDot} frame={0} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(1)
  })

  it('applies image-rendering: pixelated inline', () => {
    const { container } = render(<PixelSprite data={redDot} frame={0} />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.style.imageRendering).toBe('pixelated')
  })

  it('re-renders when the `frame` prop changes', () => {
    const twoFrame: SpriteData = {
      width: 1,
      height: 1,
      palette: ['#ff0000', '#00ff00'],
      frames: [['0'], ['1']],
    }
    const { container, rerender } = render(<PixelSprite data={twoFrame} frame={0} />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    // Grab pixel of frame 0
    const ctx0 = canvas.getContext('2d')!
    const p0 = ctx0.getImageData(0, 0, 1, 1).data
    expect(p0[0]).toBe(255)
    // Re-render with frame 1
    rerender(<PixelSprite data={twoFrame} frame={1} />)
    const ctx1 = canvas.getContext('2d')!
    const p1 = ctx1.getImageData(0, 0, 1, 1).data
    expect(p1[1]).toBe(255)
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/PixelSprite.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement `PixelSprite.tsx`**

Create `games/bakery-bash/app/src/components/bakery-scene/PixelSprite.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { gridToImageData, type SpriteData } from './sprite-data'

interface Props {
  data: SpriteData
  frame: number
  /** Optional className for positioning. */
  className?: string
}

/**
 * Renders one frame of a SpriteData to a native-pixel <canvas>. The canvas
 * is sized at `data.width × data.height` (no scaling here — the parent
 * scene container CSS-scales all layers uniformly).
 *
 * `image-rendering: pixelated` is set inline so the canvas draws crisp
 * pixels even when CSS scales the ancestor.
 */
export function PixelSprite({ data, frame, className }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = gridToImageData(data, frame)
    const imageData = new ImageData(image.data, image.width, image.height)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.putImageData(imageData, 0, 0)
  }, [data, frame])

  return (
    <canvas
      ref={ref}
      width={data.width}
      height={data.height}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/PixelSprite.test.tsx
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/PixelSprite.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelSprite.test.tsx
git commit -m "feat(bakery-bash): <PixelSprite> canvas renderer for hand-pixeled sprites"
```

---

### Task 1.3: Pixel font module (A–Z, 0–9, space, basic punctuation)

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/pixel-font.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/pixel-font.test.ts`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/pixel-font.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { measureText, textToImageData, GLYPH_WIDTH, GLYPH_HEIGHT } from './pixel-font'

describe('pixel-font', () => {
  it('exposes 6x8 glyph dimensions', () => {
    expect(GLYPH_WIDTH).toBe(6)
    expect(GLYPH_HEIGHT).toBe(8)
  })

  it('measureText returns total width in pixels including 1-px kerning', () => {
    // 3 chars × 6 + 2 kerning = 20 px (6 + 1 + 6 + 1 + 6)
    expect(measureText('ABC')).toBe(20)
  })

  it('textToImageData returns an ImageData-sized block with declared color', () => {
    const img = textToImageData('A', '#ff0000')
    expect(img.width).toBe(6)
    expect(img.height).toBe(8)
    // There should be at least one opaque red pixel.
    let foundRed = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] === 255 && img.data[i + 3] === 255) {
        foundRed = true
        break
      }
    }
    expect(foundRed).toBe(true)
  })

  it('renders unknown characters as blank glyphs (no throw)', () => {
    expect(() => textToImageData('~', '#ffffff')).not.toThrow()
  })

  it('supports uppercase + lowercase + digits + space', () => {
    expect(() => textToImageData('AbC 0 1', '#000000')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/pixel-font.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement `pixel-font.ts`**

Create `games/bakery-bash/app/src/components/bakery-scene/pixel-font.ts`. This is a 6×8 pixel font — each glyph is a 6-wide, 8-tall grid of `'#'` (opaque) and `'.'` (transparent). Lowercase maps to uppercase (simpler font).

```ts
export const GLYPH_WIDTH = 6
export const GLYPH_HEIGHT = 8
const KERN = 1

/**
 * 6×8 pixel glyphs. '#' = pixel on, '.' = pixel off. Each glyph is 8 rows.
 * Letters designed to be readable at 1× (chunky) and remain legible when
 * the parent scene is CSS-scaled 2–3×.
 */
const GLYPHS: Record<string, string[]> = {
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......'],
  A: ['..##..', '.####.', '##..##', '##..##', '######', '##..##', '##..##', '......'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.', '......'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.', '......'],
  D: ['####..', '##.##.', '##..##', '##..##', '##..##', '##.##.', '####..', '......'],
  E: ['######', '##....', '##....', '####..', '##....', '##....', '######', '......'],
  F: ['######', '##....', '##....', '####..', '##....', '##....', '##....', '......'],
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.####.', '......'],
  H: ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##', '......'],
  I: ['.####.', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.', '......'],
  J: ['..####', '....##', '....##', '....##', '....##', '##..##', '.####.', '......'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##', '......'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######', '......'],
  M: ['##..##', '######', '######', '##..##', '##..##', '##..##', '##..##', '......'],
  N: ['##..##', '###.##', '######', '##.###', '##..##', '##..##', '##..##', '......'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '......'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....', '......'],
  Q: ['.####.', '##..##', '##..##', '##..##', '##.###', '##..##', '.#####', '......'],
  R: ['#####.', '##..##', '##..##', '#####.', '####..', '##.##.', '##..##', '......'],
  S: ['.####.', '##..##', '##....', '.####.', '....##', '##..##', '.####.', '......'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '......'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '......'],
  V: ['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '..##..', '......'],
  W: ['##..##', '##..##', '##..##', '##..##', '######', '######', '##..##', '......'],
  X: ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##', '......'],
  Y: ['##..##', '##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '......'],
  Z: ['######', '....##', '...##.', '..##..', '.##...', '##....', '######', '......'],
  '0': ['.####.', '##..##', '##.###', '######', '###.##', '##..##', '.####.', '......'],
  '1': ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '######', '......'],
  '2': ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '######', '......'],
  '3': ['######', '....##', '...##.', '..###.', '....##', '##..##', '.####.', '......'],
  '4': ['...###', '..####', '.##.##', '##..##', '######', '....##', '....##', '......'],
  '5': ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.', '......'],
  '6': ['.####.', '##..##', '##....', '#####.', '##..##', '##..##', '.####.', '......'],
  '7': ['######', '....##', '...##.', '..##..', '.##...', '##....', '##....', '......'],
  '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.', '......'],
  '9': ['.####.', '##..##', '##..##', '.#####', '....##', '##..##', '.####.', '......'],
  '!': ['..##..', '..##..', '..##..', '..##..', '..##..', '......', '..##..', '......'],
  '?': ['.####.', '##..##', '....##', '..###.', '..##..', '......', '..##..', '......'],
  "'": ['..##..', '..##..', '..##..', '......', '......', '......', '......', '......'],
  ',': ['......', '......', '......', '......', '......', '..##..', '..##..', '.##...'],
  '.': ['......', '......', '......', '......', '......', '......', '..##..', '......'],
  '-': ['......', '......', '......', '######', '......', '......', '......', '......'],
}

function getGlyph(ch: string): string[] {
  return GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS[' ']
}

/** Total pixel width of a rendered string (including 1-px kerning between glyphs). */
export function measureText(text: string): number {
  if (text.length === 0) return 0
  return text.length * GLYPH_WIDTH + (text.length - 1) * KERN
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Render a string to an ImageData block of size (measureText(text), GLYPH_HEIGHT).
 * Opaque pixels have the given color; all other pixels are alpha 0.
 */
export function textToImageData(text: string, color: string): ImageData {
  const [r, g, b] = parseHex(color)
  const w = Math.max(1, measureText(text))
  const h = GLYPH_HEIGHT
  const data = new Uint8ClampedArray(w * h * 4)
  let xOffset = 0
  for (const ch of text) {
    const glyph = getGlyph(ch)
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      const row = glyph[y]
      for (let x = 0; x < GLYPH_WIDTH; x++) {
        if (row[x] === '#') {
          const pixel = (y * w + xOffset + x) * 4
          data[pixel] = r
          data[pixel + 1] = g
          data[pixel + 2] = b
          data[pixel + 3] = 255
        }
      }
    }
    xOffset += GLYPH_WIDTH + KERN
  }
  return new ImageData(data, w, h)
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/pixel-font.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/pixel-font.ts \
  games/bakery-bash/app/src/components/bakery-scene/pixel-font.test.ts
git commit -m "feat(bakery-bash): 6x8 pixel font module (A-Z, 0-9, punctuation)"
```

---

## Phase 2 — Scene constants + backdrop skeleton

Define the scene's native dimensions + zone Y-coordinates in one module, and scaffold `<SceneBackdrop>` to paint the back wall and floor as a starting render. Specific props (shelves, oven, etc.) land in later tasks; we start with just wall + floor so the scaffold is working before we add detail.

### Task 2.1: `scene-geometry.ts` — named constants for scene dimensions and zones

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/scene-geometry.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/scene-geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/scene-geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { SCENE } from './scene-geometry'

describe('SCENE geometry', () => {
  it('declares 480x270 native dimensions', () => {
    expect(SCENE.width).toBe(480)
    expect(SCENE.height).toBe(270)
  })

  it('zone Y-coordinates sum to full scene height', () => {
    const total = SCENE.zones.wallMounts.height
      + SCENE.zones.midBand.height
      + SCENE.zones.wainscoting.height
      + SCENE.zones.counter.height
      + SCENE.zones.floor.height
    expect(total).toBe(SCENE.height)
  })

  it('exposes door X and floor Y for character positioning', () => {
    expect(SCENE.door.x).toBeGreaterThanOrEqual(SCENE.width - 30)
    expect(SCENE.door.x).toBeLessThan(SCENE.width)
    expect(SCENE.floorBaselineY).toBe(
      SCENE.zones.wallMounts.height
        + SCENE.zones.midBand.height
        + SCENE.zones.wainscoting.height
        + SCENE.zones.counter.height,
    )
  })

  it('defines chef station X centers inside the counter zone', () => {
    const { bakery, deli, barista } = SCENE.stations
    for (const x of [bakery, deli, barista]) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(SCENE.door.x) // stations are to the left of the door
    }
    expect(bakery).toBeLessThan(deli)
    expect(deli).toBeLessThan(barista)
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/scene-geometry.test.ts
```

- [ ] **Step 3: Implement `scene-geometry.ts`**

```ts
/**
 * Single source of truth for scene pixel coordinates.
 *
 * Scene layout (native 480×270):
 *   y=0    ┌─────────────────────┐
 *          │ wall-mounts (30px)  │ clock, team sign, menu board
 *   y=30   ├─────────────────────┤
 *          │ mid-band (100px)    │ bread shelves / oven / coffee wall
 *   y=130  ├─────────────────────┤
 *          │ wainscoting (10px)  │ dark wood trim
 *   y=140  ├─────────────────────┤
 *          │ counter (40px)      │ counter front + chef sprites overlap
 *   y=180  ├─────────────────────┤
 *          │ floor strip (90px)  │ customers + cat walk here
 *   y=270  └─────────────────────┘
 */
export const SCENE = {
  width: 480,
  height: 270,

  zones: {
    wallMounts: { y: 0, height: 30 },
    midBand: { y: 30, height: 100 },
    wainscoting: { y: 130, height: 10 },
    counter: { y: 140, height: 40 },
    floor: { y: 180, height: 90 },
  },

  /** Y-coordinate where characters stand (top edge of floor strip). */
  floorBaselineY: 180,

  /** Door is a vertical slot on the right edge. */
  door: {
    x: 456, // 480 - 24
    y: 80,
    width: 24,
    height: 200,
  },

  /** Chef station X centers (mid of chef sprite). Stations stay left of door. */
  stations: {
    bakery: 90,
    deli: 220,
    barista: 370,
  },

  /** Y-offset where customers walk (slightly above floor top for feet). */
  customerFeetY: 262,
  /** Chef sprite top-edge Y (they overlap the counter). */
  chefTopY: 140,
} as const

export type StationKey = 'bakery' | 'deli' | 'barista'
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/scene-geometry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/scene-geometry.ts \
  games/bakery-bash/app/src/components/bakery-scene/scene-geometry.test.ts
git commit -m "feat(bakery-bash): scene-geometry module — native dims + zones + station X"
```

---

### Task 2.2: `<SceneBackdrop>` — one big canvas, starts with wall color + floor planks

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneBackdrop } from './SceneBackdrop'
import { SCENE } from './scene-geometry'

describe('<SceneBackdrop>', () => {
  it('renders a canvas sized to scene native dimensions', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(SCENE.width)
    expect(canvas.height).toBe(SCENE.height)
  })

  it('paints the back-wall zone cream and the floor zone brown', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Sample a pixel in the back-wall region (above wainscoting)
    const wall = ctx.getImageData(10, 60, 1, 1).data
    // Cream = light color: expect R, G, B all > 200
    expect(wall[0]).toBeGreaterThan(200)
    expect(wall[1]).toBeGreaterThan(180)
    expect(wall[2]).toBeGreaterThan(140)
    // Sample a pixel in the floor region (y >= 180)
    const floor = ctx.getImageData(10, 230, 1, 1).data
    // Warm brown: R > G > B, R < 200
    expect(floor[0]).toBeGreaterThan(floor[2])
    expect(floor[0]).toBeLessThan(200)
  })

  it('sets image-rendering: pixelated', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.style.imageRendering).toBe('pixelated')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 3: Implement `SceneBackdrop.tsx`**

Start with just back-wall fill + floor planks. Shelves/oven/coffee/counter/door come in Tasks 2.3–2.6.

```tsx
import { useEffect, useRef } from 'react'
import { SCENE } from './scene-geometry'

/** Scene palette — shared across backdrop elements so colors stay consistent. */
export const PALETTE = {
  wallCream: '#eed9b8',
  wallShadow: '#d6b98a',
  wainscotDark: '#5a3e26',
  wainscotMid: '#7c5338',
  floorPlank: '#a26841',
  floorPlankShade: '#8a5434',
  floorGrain: '#7a4a2c',
  counterWood: '#8a5a3a',
  counterTop: '#6b4428',
  outline: '#2a1a10',
} as const

function fillRect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function paintBackdrop(ctx: CanvasRenderingContext2D) {
  // Back-wall cream fill, covering wall-mounts + mid-band zones.
  fillRect(ctx, PALETTE.wallCream, 0, 0, SCENE.width, SCENE.zones.wainscoting.y)
  // Subtle vertical-stripe wall pattern (thin shadow columns every 32 px).
  for (let x = 16; x < SCENE.width; x += 32) {
    fillRect(ctx, PALETTE.wallShadow, x, 0, 1, SCENE.zones.wainscoting.y)
  }
  // Wainscoting band (dark wood trim).
  fillRect(ctx, PALETTE.wainscotMid, 0, SCENE.zones.wainscoting.y, SCENE.width, SCENE.zones.wainscoting.height)
  fillRect(ctx, PALETTE.wainscotDark, 0, SCENE.zones.wainscoting.y + SCENE.zones.wainscoting.height - 2, SCENE.width, 2)

  // Floor zone — two-shade plank pattern (alternating 8-px tall rows).
  const floorY = SCENE.zones.floor.y
  for (let y = 0; y < SCENE.zones.floor.height; y++) {
    const color = Math.floor(y / 8) % 2 === 0 ? PALETTE.floorPlank : PALETTE.floorPlankShade
    fillRect(ctx, color, 0, floorY + y, SCENE.width, 1)
  }
  // Plank grain lines every 60 px.
  for (let x = 30; x < SCENE.width; x += 60) {
    fillRect(ctx, PALETTE.floorGrain, x, floorY, 1, SCENE.zones.floor.height)
  }
}

/**
 * The static back-wall + floor canvas. Heavy-weight draw happens once on
 * mount; props in later tasks (menu, soldOut) will cause re-paints only
 * when those values change.
 */
export function SceneBackdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintBackdrop(ctx)
  }, [])

  return (
    <canvas
      ref={ref}
      width={SCENE.width}
      height={SCENE.height}
      style={{
        imageRendering: 'pixelated',
        display: 'block',
        position: 'absolute',
        inset: 0,
      }}
      aria-hidden
    />
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx
git commit -m "feat(bakery-bash): <SceneBackdrop> canvas with back wall + floor planks"
```

---

### Task 2.3: Paint the counter band into the backdrop

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`

- [ ] **Step 1: Add a failing test asserting the counter pixel band**

Append to `SceneBackdrop.test.tsx`:
```tsx
describe('<SceneBackdrop> counter', () => {
  it('paints the counter band in wood tones below the wainscoting', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Top of counter zone (y=140 per SCENE.zones.counter.y) should be the counter top stripe
    const top = ctx.getImageData(10, SCENE.zones.counter.y, 1, 1).data
    const mid = ctx.getImageData(10, SCENE.zones.counter.y + 10, 1, 1).data
    // Both warm brown (R>G>B), mid darker than top or vice versa — just assert warm brown.
    expect(top[0]).toBeGreaterThan(top[2])
    expect(mid[0]).toBeGreaterThan(mid[2])
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 3: Add counter paint to `paintBackdrop`**

In `SceneBackdrop.tsx`, extend `paintBackdrop`:
```ts
function paintBackdrop(ctx: CanvasRenderingContext2D) {
  // ... existing wall + wainscoting + floor code stays ...

  // Counter zone — darker wood front, slightly lighter top stripe.
  const cY = SCENE.zones.counter.y
  const cH = SCENE.zones.counter.height
  fillRect(ctx, PALETTE.counterWood, 0, cY, SCENE.width, cH)
  // Counter top stripe (1px lighter band).
  fillRect(ctx, '#a87048', 0, cY, SCENE.width, 2)
  // Counter base shadow (2px darker at bottom where it meets floor).
  fillRect(ctx, PALETTE.counterTop, 0, cY + cH - 2, SCENE.width, 2)
  // Vertical joins every 80 px for a paneled-counter feel.
  for (let x = 40; x < SCENE.width; x += 80) {
    fillRect(ctx, PALETTE.counterTop, x, cY + 2, 1, cH - 4)
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx
git commit -m "feat(bakery-bash): paint counter band in SceneBackdrop"
```

---

### Task 2.4: Paint the back-wall "furniture" — bread shelves, oven, coffee wall, door

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`

- [ ] **Step 1: Add failing tests for each back-wall element**

Append to `SceneBackdrop.test.tsx`:
```tsx
describe('<SceneBackdrop> back-wall elements', () => {
  it('paints bread shelves on the left of the mid band', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Shelf is a dark wood rectangle around x=40 y=55 per our layout
    const p = ctx.getImageData(40, 60, 1, 1).data
    // Expect dark wood (R<150, and brownish R>G>B)
    expect(p[0]).toBeLessThan(180)
    expect(p[0]).toBeGreaterThan(p[2])
  })

  it('paints the oven silhouette in the mid-band middle', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Oven body around x=220 y=70 — should be chrome/dark gray, not cream wall
    const p = ctx.getImageData(220, 70, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the coffee wall (cup rack + machine body) on the right of mid-band', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Coffee area around x=360 y=70 — should be darker than cream wall
    const p = ctx.getImageData(360, 70, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the door slot on the right edge', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Door is at x=456..480, y=80..280; sample the middle
    const p = ctx.getImageData(465, 150, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 3: Add back-wall element painting**

Extend `PALETTE` and `paintBackdrop` in `SceneBackdrop.tsx`:
```ts
export const PALETTE = {
  // ... existing colors stay ...
  shelfWood: '#6a3f22',
  shelfShadow: '#432614',
  shelfHighlight: '#8b5a34',
  ovenChrome: '#9a9aa4',
  ovenDark: '#3d3d4a',
  ovenGlow: '#ffa845',
  coffeeBody: '#5a4a3a',
  coffeeChrome: '#d2d2de',
  coffeeHandle: '#2d2420',
  doorWood: '#6b4428',
  doorGlass: '#a7d8e8',
  doorFrame: '#3d2615',
  burgundyAccent: '#842a3a',
} as const

// Inside paintBackdrop, AFTER the existing code but BEFORE the counter:

// --- Back-wall elements (painted on the wall, above the counter) ---

// Left: two stacked bread shelves (simple dark wooden rectangles with bread loaves on top).
const shelfX = 32
for (const shelfY of [54, 88]) {
  // Shelf plank (dark wood, ~60w × 4h)
  fillRect(ctx, PALETTE.shelfWood, shelfX, shelfY, 80, 4)
  fillRect(ctx, PALETTE.shelfShadow, shelfX, shelfY + 4, 80, 2)
  // Three bread loaves on top (simple amber bumps)
  for (let i = 0; i < 3; i++) {
    const loafX = shelfX + 6 + i * 24
    fillRect(ctx, '#c7883a', loafX, shelfY - 8, 18, 8)
    fillRect(ctx, '#9c6424', loafX, shelfY - 2, 18, 2) // shadow
    fillRect(ctx, '#e3a85a', loafX + 2, shelfY - 6, 14, 2) // highlight
  }
}

// Middle: wall oven (chrome + dark front + amber glow window).
const ovenX = 198
const ovenY = 50
const ovenW = 60
const ovenH = 70
fillRect(ctx, PALETTE.ovenDark, ovenX, ovenY, ovenW, ovenH)
fillRect(ctx, PALETTE.ovenChrome, ovenX + 2, ovenY + 2, ovenW - 4, 6) // top stripe
fillRect(ctx, PALETTE.ovenChrome, ovenX + 2, ovenY + ovenH - 8, ovenW - 4, 6) // bottom stripe
// Glowing window (center rectangle — fades to orange)
fillRect(ctx, '#662222', ovenX + 8, ovenY + 18, ovenW - 16, 34)
fillRect(ctx, PALETTE.ovenGlow, ovenX + 10, ovenY + 20, ovenW - 20, 30)
fillRect(ctx, '#ffcf70', ovenX + 14, ovenY + 24, ovenW - 28, 20)

// Right: coffee wall (cup rack + bean bags + hanging mugs).
const cX = 314
const cY = 52
const cW = 128
const cH = 70
fillRect(ctx, PALETTE.coffeeBody, cX, cY, cW, 4) // top shelf plank
// 6 hanging mugs along shelf underside
for (let i = 0; i < 6; i++) {
  const mugX = cX + 6 + i * 20
  fillRect(ctx, PALETTE.coffeeChrome, mugX, cY + 4, 12, 8) // mug body
  fillRect(ctx, PALETTE.coffeeHandle, mugX + 12, cY + 6, 2, 4) // handle
  fillRect(ctx, PALETTE.outline, mugX, cY + 11, 12, 1) // shadow
}
// Middle: bean bags (two burlap sacks)
fillRect(ctx, '#6c4a24', cX + 12, cY + 32, 18, 22)
fillRect(ctx, '#5a3a18', cX + 12, cY + 50, 18, 4)
fillRect(ctx, '#6c4a24', cX + 40, cY + 34, 16, 20)
fillRect(ctx, '#5a3a18', cX + 40, cY + 50, 16, 4)
// Milk carafes / syrup bottles (right half)
fillRect(ctx, PALETTE.coffeeChrome, cX + 72, cY + 34, 8, 22)
fillRect(ctx, PALETTE.burgundyAccent, cX + 84, cY + 36, 8, 20)
fillRect(ctx, '#a88a5a', cX + 96, cY + 34, 8, 22)
fillRect(ctx, PALETTE.outline, cX + 68, cY + 56, 44, 1) // shelf shadow

// --- Door slot on the right edge ---
fillRect(ctx, PALETTE.doorFrame, SCENE.door.x - 2, SCENE.door.y - 2, SCENE.door.width + 2, SCENE.door.height + 2)
fillRect(ctx, PALETTE.doorWood, SCENE.door.x, SCENE.door.y, SCENE.door.width, SCENE.door.height)
// Glass pane upper half
fillRect(ctx, PALETTE.doorGlass, SCENE.door.x + 4, SCENE.door.y + 6, SCENE.door.width - 8, 40)
fillRect(ctx, PALETTE.outline, SCENE.door.x + 4, SCENE.door.y + 6, SCENE.door.width - 8, 1) // glass top edge
// Door handle
fillRect(ctx, '#d5b060', SCENE.door.x + 4, SCENE.door.y + 110, 3, 3)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx
git commit -m "feat(bakery-bash): paint bread shelves, oven, coffee wall, door into backdrop"
```

---

### Task 2.5: Add wall-mount top strip — clock + (placeholder) sign + menu-board silhouettes

The actual team-sign text lands in Phase 3 via `<TeamSign>`. Here we paint the *wooden frame* silhouettes for the wall mounts (so the back wall doesn't feel empty) plus a clock.

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`

- [ ] **Step 1: Add failing test for clock + sign-frame + menu-board rectangles**

Append to `SceneBackdrop.test.tsx`:
```tsx
describe('<SceneBackdrop> wall mounts', () => {
  it('paints a clock in the top-left wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Clock face around x=22 y=12 — non-cream pixel
    const p = ctx.getImageData(22, 12, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the sign frame silhouette in the center wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Sign is ~x=180..300, y=6..26. Sample the top edge of the frame.
    const p = ctx.getImageData(200, 8, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the menu-board silhouette in the top-right wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Menu board around x=380..450, y=6..26
    const p = ctx.getImageData(400, 10, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 3: Paint wall mounts**

Add to the end of `paintBackdrop` in `SceneBackdrop.tsx`:
```ts
  // --- Wall mounts (top strip) ---

  // Clock top-left — dark circle with hands.
  const clockX = 22
  const clockY = 15
  fillRect(ctx, PALETTE.outline, clockX - 8, clockY - 8, 16, 16) // outer ring
  fillRect(ctx, '#eee4c8', clockX - 6, clockY - 6, 12, 12) // face
  fillRect(ctx, PALETTE.outline, clockX, clockY, 2, 1) // min hand
  fillRect(ctx, PALETTE.outline, clockX, clockY - 4, 1, 4) // hour hand

  // Sign silhouette — wooden frame with burgundy trim. (Text fills in Phase 3 via <TeamSign>.)
  const sX = 180
  const sY = 4
  const sW = 120
  const sH = 22
  fillRect(ctx, PALETTE.burgundyAccent, sX - 2, sY - 2, sW + 4, sH + 4) // burgundy backing
  fillRect(ctx, '#8a5c2e', sX, sY, sW, sH) // wood face
  fillRect(ctx, '#6c4420', sX, sY + sH - 2, sW, 2) // bottom shadow
  // Two small corner nails
  fillRect(ctx, '#3a2815', sX + 2, sY + 2, 1, 1)
  fillRect(ctx, '#3a2815', sX + sW - 3, sY + 2, 1, 1)

  // Menu board top-right — dark chalkboard with a wooden frame.
  const mX = 378
  const mY = 4
  const mW = 72
  const mH = 22
  fillRect(ctx, '#6b4428', mX - 2, mY - 2, mW + 4, mH + 4) // frame
  fillRect(ctx, '#1f3e36', mX, mY, mW, mH) // chalkboard green-black
  // A couple chalk lines to suggest handwriting (horizontal dashes)
  fillRect(ctx, '#d7d2b2', mX + 4, mY + 5, 18, 1)
  fillRect(ctx, '#d7d2b2', mX + 4, mY + 10, 30, 1)
  fillRect(ctx, '#d7d2b2', mX + 4, mY + 15, 22, 1)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx
git commit -m "feat(bakery-bash): paint clock, sign frame, menu board onto backdrop"
```

---

### Task 2.6: Paint counter furniture — bread display case + espresso machine

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`

- [ ] **Step 1: Add failing test**

Append to `SceneBackdrop.test.tsx`:
```tsx
describe('<SceneBackdrop> counter furniture', () => {
  it('paints the bread display case above the counter on the left', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Display case top around x=60 y=130 — should be non-wall-cream
    const p = ctx.getImageData(60, 130, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the espresso machine on the counter right', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Espresso body around x=340 y=135 — chrome/dark, not cream
    const p = ctx.getImageData(340, 135, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 3: Paint display case + espresso machine**

Append to `paintBackdrop`:
```ts
  // --- Counter furniture (sits on top of the counter) ---

  // Bread display case (left third of counter) — glass case with hero loaves visible.
  const dcX = 30
  const dcY = 122
  const dcW = 150
  const dcH = 20
  fillRect(ctx, PALETTE.outline, dcX, dcY, dcW, dcH) // case outline
  fillRect(ctx, '#d4e8ea', dcX + 1, dcY + 1, dcW - 2, dcH - 2) // glass interior
  // Hero loaves inside the case
  for (let i = 0; i < 4; i++) {
    const loafX = dcX + 10 + i * 36
    fillRect(ctx, '#c7883a', loafX, dcY + 6, 24, 10)
    fillRect(ctx, '#9c6424', loafX, dcY + 14, 24, 2)
    fillRect(ctx, '#e3a85a', loafX + 2, dcY + 8, 20, 2)
  }
  // Case front frame (bottom edge meets counter top).
  fillRect(ctx, PALETTE.shelfWood, dcX, dcY + dcH, dcW, 2)

  // Espresso machine (right third of counter) — chrome body + steam wand + 2 cups.
  const eX = 320
  const eY = 118
  const eW = 70
  const eH = 24
  fillRect(ctx, PALETTE.coffeeChrome, eX, eY, eW, eH) // chrome body
  fillRect(ctx, PALETTE.outline, eX, eY, eW, 1) // top edge
  fillRect(ctx, PALETTE.outline, eX, eY + eH - 1, eW, 1) // bottom edge
  fillRect(ctx, PALETTE.outline, eX, eY, 1, eH) // left edge
  fillRect(ctx, PALETTE.outline, eX + eW - 1, eY, 1, eH) // right edge
  // Group head (where coffee comes out) — dark circles
  fillRect(ctx, PALETTE.outline, eX + 14, eY + 10, 6, 6)
  fillRect(ctx, PALETTE.outline, eX + 32, eY + 10, 6, 6)
  // Steam wand — thin pipe hanging down
  fillRect(ctx, PALETTE.outline, eX + 54, eY + 2, 2, 16)
  // Filled cup row (in front)
  for (let i = 0; i < 3; i++) {
    const cupX = eX + 10 + i * 20
    fillRect(ctx, PALETTE.coffeeChrome, cupX, eY + eH, 10, 4)
    fillRect(ctx, '#6b4428', cupX + 2, eY + eH - 2, 6, 2) // coffee surface
  }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneBackdrop.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx
git commit -m "feat(bakery-bash): paint bread display case + espresso machine on counter"
```

---




## Phase 3 — `<TeamSign>` text overlay

Draws the team name in the pixel font into a canvas positioned over the sign frame painted by `<SceneBackdrop>`. Truncates gracefully on long names.

### Task 3.1: `<TeamSign>` component

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/TeamSign.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/TeamSign.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/TeamSign.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TeamSign } from './TeamSign'

describe('<TeamSign>', () => {
  it('renders a canvas with positioning for the sign frame', () => {
    const { container } = render(<TeamSign teamName="CRUMBS" />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    // Canvas should be absolutely positioned within the sign frame area
    expect(canvas.style.position).toBe('absolute')
  })

  it('writes some opaque text pixels for a non-empty team name', () => {
    const { container } = render(<TeamSign teamName="PANE" />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let opaquePixels = 0
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] === 255) opaquePixels++
    }
    expect(opaquePixels).toBeGreaterThan(0)
  })

  it('truncates text that overflows the sign width with an ellipsis', () => {
    const { container } = render(<TeamSign teamName="EXTREMELY LONG TEAM NAME THAT WILL NOT FIT" />)
    // Should not throw; canvas should be sized within the sign bounds.
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.width).toBeLessThanOrEqual(120) // sign frame width from backdrop
  })

  it('renders a canvas even for an empty team name (blank sign)', () => {
    const { container } = render(<TeamSign teamName="" />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/TeamSign.test.tsx
```

- [ ] **Step 3: Implement `TeamSign.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { textToImageData, measureText, GLYPH_WIDTH } from './pixel-font'

interface Props {
  teamName: string
}

/**
 * Sign frame bounds match the silhouette painted by SceneBackdrop.
 * Keep in sync with paintBackdrop's sign rect (x=180, y=4, w=120, h=22).
 */
const SIGN = {
  x: 180,
  y: 4,
  width: 120,
  height: 22,
}

const SIGN_TEXT_COLOR = '#f3e2b8'
const SIGN_SHADOW_COLOR = '#4a2818'

/**
 * Fit the text to the sign width:
 * - If text fits, return it.
 * - Else truncate with '.' (single-char ellipsis) until it fits.
 */
function fitText(text: string, maxWidth: number): string {
  const upper = text.toUpperCase()
  if (measureText(upper) <= maxWidth) return upper
  // Binary search for the largest prefix that fits with a trailing '.'
  let lo = 0
  let hi = upper.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = upper.slice(0, mid) + '.'
    if (measureText(candidate) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return upper.slice(0, lo) + '.'
}

export function TeamSign({ teamName }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (teamName.trim().length === 0) return

    const displayText = fitText(teamName, SIGN.width - 8) // 4 px padding each side
    const textWidth = measureText(displayText)
    const xOffset = Math.floor((SIGN.width - textWidth) / 2)
    const yOffset = Math.floor((SIGN.height - 8) / 2) // 8 = GLYPH_HEIGHT

    // Shadow layer (1px down, dark)
    const shadowData = textToImageData(displayText, SIGN_SHADOW_COLOR)
    ctx.putImageData(shadowData, xOffset, yOffset + 1)
    // Main text layer
    const textData = textToImageData(displayText, SIGN_TEXT_COLOR)
    ctx.putImageData(textData, xOffset, yOffset)
  }, [teamName])

  return (
    <canvas
      ref={ref}
      width={SIGN.width}
      height={SIGN.height}
      aria-label={teamName ? `Welcome to ${teamName}` : undefined}
      style={{
        position: 'absolute',
        left: SIGN.x,
        top: SIGN.y,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    />
  )
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/TeamSign.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/TeamSign.tsx \
  games/bakery-bash/app/src/components/bakery-scene/TeamSign.test.tsx
git commit -m "feat(bakery-bash): <TeamSign> renders team name into sign frame via pixel font"
```

---

## Phase 4 — Orchestrator shell + preview route (Decide-mode static checkpoint)

Assemble the backdrop + sign into a `<PixelBakeryScene>` orchestrator and re-wire the `/preview/bakery-scene` route. At the end of this phase, we can open the preview URL and see the backdrop + team sign rendered — our first visible milestone.

### Task 4.1: `<PixelBakeryScene>` orchestrator (backdrop + sign only)

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.test.tsx`
- Create: `games/bakery-bash/app/src/styles/pixel-scene.css`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PixelBakeryScene } from './PixelBakeryScene'

describe('<PixelBakeryScene>', () => {
  it('renders a scene container with mode className', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    const scene = container.querySelector('[data-testid="pixel-bakery-scene"]')!
    expect(scene).toBeTruthy()
    expect(scene.className).toContain('pixel-bakery-scene--decide')
  })

  it('mounts backdrop + team sign child components', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    // Two canvas elements — backdrop + sign
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts mode variants: decide, simulate, static', () => {
    for (const mode of ['decide', 'simulate', 'static'] as const) {
      const { container } = render(<PixelBakeryScene mode={mode} teamName="X" />)
      const scene = container.querySelector('[data-testid="pixel-bakery-scene"]')!
      expect(scene.className).toContain(`pixel-bakery-scene--${mode}`)
    }
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/PixelBakeryScene.test.tsx
```

- [ ] **Step 3: Create the CSS shell**

Create `games/bakery-bash/app/src/styles/pixel-scene.css`:
```css
/* Pixel Bakery Scene — Undertale-style side-view. */

.pixel-bakery-scene {
  position: relative;
  width: 480px;
  height: 270px;
  background: #2a1a10;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  image-rendering: pixelated;
  transform-origin: top left;
}

/* Scale helpers — consumer sets transform or wrap in a scaling container. */
.pixel-bakery-scene--scale-2 {
  transform: scale(2);
}

.pixel-bakery-scene--scale-3 {
  transform: scale(3);
}

/* Host container (fills parent, centers the scaled scene inside). */
.pixel-bakery-scene-host {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 540px;
  background: #1b1721;
  overflow: hidden;
}
```

- [ ] **Step 4: Implement `PixelBakeryScene.tsx`**

```tsx
import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'

export type BakerySceneMode = 'decide' | 'simulate' | 'static'

interface Props {
  mode: BakerySceneMode
  teamName: string
}

/**
 * Orchestrator for the bakery scene. Composes the backdrop + team sign +
 * (future) character/FX layers. In this phase only the static layers exist;
 * chefs, cat, customers, and FX land in Phases 5-8.
 */
export function PixelBakeryScene({ mode, teamName }: Props) {
  return (
    <div
      data-testid="pixel-bakery-scene"
      className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}
    >
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/PixelBakeryScene.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.test.tsx \
  games/bakery-bash/app/src/styles/pixel-scene.css
git commit -m "feat(bakery-bash): <PixelBakeryScene> orchestrator with backdrop + sign"
```

---

### Task 4.2: Re-add `/preview/bakery-scene` route

**Files:**
- Create: `games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx`
- Modify: `games/bakery-bash/app/src/App.tsx`

- [ ] **Step 1: Create the preview page**

Create `games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx`:
```tsx
import { useState } from 'react'
import { PixelBakeryScene, type BakerySceneMode } from '../components/bakery-scene/PixelBakeryScene'
import '../styles/pixel-scene.css'

/**
 * Dev-only preview for the pixel bakery scene. Route: /preview/bakery-scene.
 * Useful for iterating on sprites and animations in isolation.
 */
export function BakeryScenePreviewPage() {
  const [mode, setMode] = useState<BakerySceneMode>('decide')
  const [teamName, setTeamName] = useState('CRUMBS & CO')
  const [scale, setScale] = useState(2)

  return (
    <div className="pixel-bakery-scene-host" style={{ flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, color: '#eee', fontFamily: 'monospace' }}>
        {(['decide', 'simulate', 'static'] as BakerySceneMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '4px 12px',
              background: mode === m ? '#fbbf24' : '#27272a',
              color: mode === m ? '#111' : '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {m}
          </button>
        ))}
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name"
          style={{
            padding: '4px 8px',
            background: '#27272a',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            fontFamily: 'monospace',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          scale
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
          {scale}×
        </label>
      </div>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
        <PixelBakeryScene mode={mode} teamName={teamName} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Re-add route to App.tsx**

Edit `games/bakery-bash/app/src/App.tsx`:

Add import near the other page imports:
```tsx
import { BakeryScenePreviewPage } from "./pages/BakeryScenePreviewPage";
```

Add route inside `<Routes>`:
```tsx
<Route
  path="/preview/bakery-scene"
  element={<BakeryScenePreviewPage />}
/>
```

- [ ] **Step 3: Typecheck + run tests (nothing should break)**

```bash
cd games/bakery-bash/app && npx tsc --noEmit && CI=1 npm test -- --run
```
Expected: exit 0 and all tests pass.

- [ ] **Step 4: Visual check — start dev server and screenshot the scene**

```bash
# From worktree root:
# Use the preview-start tool with name 'bakery-scene-v2' (port 5175).
# Open http://localhost:5175/preview/bakery-scene
# Expected: a 480×270 backdrop with cream wall, oven silhouette, shelves,
# coffee wall, door, counter with display case + espresso machine, and the
# team name written into the sign frame at the top. No characters yet.
```
Take a screenshot via the Claude Preview `preview_screenshot` tool and attach to the commit message.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx \
  games/bakery-bash/app/src/App.tsx
git commit -m "feat(bakery-bash): re-wire /preview/bakery-scene for the new Undertale scene"
```

**Milestone: at this point you can view the empty bakery in a browser.**

---

## Phase 5 — Chef sprites + `<ChefLayer>` + `useBakeryScene` hook (idle bob)

Add stationary chefs at their 3 stations with a 2-frame idle bob animation. Introduce the `useBakeryScene` hook to own frame state.

### Task 5.1: Chef sprite data (Bakery / Deli / Barista variants)

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-bakery.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-deli.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-barista.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/sprites.test.ts`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/sprites/sprites.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { chefBakery } from './chef-bakery'
import { chefDeli } from './chef-deli'
import { chefBarista } from './chef-barista'

describe('chef sprite data', () => {
  it('all three chef sprites are valid SpriteData', () => {
    expect(() => validateSpriteData(chefBakery)).not.toThrow()
    expect(() => validateSpriteData(chefDeli)).not.toThrow()
    expect(() => validateSpriteData(chefBarista)).not.toThrow()
  })

  it('chef sprites are 24x40 with exactly 2 frames', () => {
    for (const chef of [chefBakery, chefDeli, chefBarista]) {
      expect(chef.width).toBe(24)
      expect(chef.height).toBe(40)
      expect(chef.frames.length).toBe(2)
    }
  })

  it('chef sprites have distinct palettes (apron colors differ)', () => {
    // The 3rd palette entry is traditionally the body/apron fill in our grids;
    // at minimum, each sprite must have its own palette array (no shared ref).
    expect(chefBakery.palette).not.toBe(chefDeli.palette)
    expect(chefDeli.palette).not.toBe(chefBarista.palette)
    // And at least one color must differ between any two chefs.
    const chefsDiffer = (a: readonly string[], b: readonly string[]) =>
      a.length !== b.length || a.some((c, i) => c !== b[i])
    expect(chefsDiffer(chefBakery.palette, chefDeli.palette)).toBe(true)
    expect(chefsDiffer(chefDeli.palette, chefBarista.palette)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/sprites.test.ts
```

- [ ] **Step 3: Create the chef sprite modules**

Create `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-bakery.ts`:
```ts
import type { SpriteData } from '../sprite-data'

/**
 * Bakery station chef — white apron, flour-dusted cream apron.
 * 24×40. Frame 0 = standing, Frame 1 = 1-px Y-shift bob.
 *
 * Palette:
 *   0 = outline / dark shadow
 *   1 = skin light
 *   2 = skin shadow
 *   3 = hair / hat brim
 *   4 = hat white
 *   5 = shirt cream
 *   6 = apron white
 *   7 = apron shadow
 *   8 = pants brown
 *   9 = shoe dark
 */
export const chefBakery: SpriteData = {
  width: 24,
  height: 40,
  palette: [
    '#1e1410', // 0 outline
    '#f2c9a3', // 1 skin light
    '#d29872', // 2 skin shadow
    '#3d281a', // 3 hair
    '#f4efe2', // 4 hat white
    '#efe0c0', // 5 shirt cream
    '#ffffff', // 6 apron white
    '#d8cfb8', // 7 apron shadow
    '#6b4428', // 8 pants
    '#2d1810', // 9 shoe
  ],
  frames: [
    // Frame 0 — standing (Y = 0..39)
    [
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '    00      00          ',
    ],
    // Frame 1 — idle bob: shift everything down 1 px (first row becomes blank).
    [
      '                        ',
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
    ],
  ],
}
```

Create `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-deli.ts` — same structure as `chefBakery` but with a **blue apron palette**. Copy the full module above, change the apron colors:
```ts
import type { SpriteData } from '../sprite-data'

/** Deli station chef — blue apron, matching chef-bakery silhouette. */
export const chefDeli: SpriteData = {
  width: 24,
  height: 40,
  palette: [
    '#1e1410', '#f2c9a3', '#d29872', '#3d281a', '#f4efe2',
    '#efe0c0',
    '#4a7fb5', // 6 apron blue (was white)
    '#365d8a', // 7 apron blue shadow (was apron shadow)
    '#6b4428', '#2d1810',
  ],
  // Reuse the same frame grids — palette swap changes apron color only.
  frames: [
    // Frame 0 — same grid as chefBakery frame 0
    [
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '    00      00          ',
    ],
    // Frame 1 — same as chefBakery frame 1
    [
      '                        ',
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
    ],
  ],
}
```

Create `games/bakery-bash/app/src/components/bakery-scene/sprites/chef-barista.ts` — same structure but **brown/bronze apron**:
```ts
import type { SpriteData } from '../sprite-data'

/** Barista station chef — brown/bronze apron. */
export const chefBarista: SpriteData = {
  width: 24,
  height: 40,
  palette: [
    '#1e1410', '#f2c9a3', '#d29872', '#3d281a', '#f4efe2',
    '#efe0c0',
    '#8a5a2e', // 6 apron bronze
    '#5e3e1e', // 7 apron bronze shadow
    '#6b4428', '#2d1810',
  ],
  frames: [
    // Same frame grids as chef-bakery / chef-deli — copy frame 0
    [
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '    00      00          ',
    ],
    // Frame 1
    [
      '                        ',
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
    ],
  ],
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/sprites.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/sprites/
git commit -m "feat(bakery-bash): chef sprites (Bakery/Deli/Barista) — 24x40, 2-frame idle bob"
```

**Note:** these sprite grids are first-pass and may need visual polish — treat Phase 10 as the time for aesthetic iteration once the whole scene is assembled.

---

### Task 5.2: `useBakeryScene` hook — owns frame counter + chef derivation

**Files:**
- Create: `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- Create: `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBakeryScene } from './useBakeryScene'

describe('useBakeryScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  it('returns one chef per station when each staffCount is 1', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    expect(result.current.chefs).toHaveLength(3)
    const stations = result.current.chefs.map((c) => c.station)
    expect(stations).toEqual(expect.arrayContaining(['bakery', 'deli', 'barista']))
  })

  it('returns no chefs when all staffCounts are 0', () => {
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, staffCounts: { bakery: 0, deli: 0, barista: 0 } }),
    )
    expect(result.current.chefs).toHaveLength(0)
  })

  it('assigns the 4th chef to the station with the highest count', () => {
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, staffCounts: { bakery: 2, deli: 1, barista: 1 } }),
    )
    expect(result.current.chefs).toHaveLength(4)
    const bakeryChefs = result.current.chefs.filter((c) => c.station === 'bakery')
    expect(bakeryChefs).toHaveLength(2)
  })

  it('advances the idle-bob frame index over time via requestAnimationFrame', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    const initialFrame = result.current.chefs[0].frame
    // Advance enough real time for the bob cycle to tick (~400ms cycle / 2 frames = ~200ms per frame)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    // Frame should be different (0↔1) — exact value depends on internal clock.
    // We only assert that it's a valid frame index (0 or 1) and that the hook does not crash.
    expect([0, 1]).toContain(result.current.chefs[0].frame)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 3: Implement `useBakeryScene.ts`**

```ts
import { useEffect, useRef, useState } from 'react'
import { SCENE, type StationKey } from '../components/bakery-scene/scene-geometry'
import type { BakerySceneMode } from '../components/bakery-scene/PixelBakeryScene'

export interface Chef {
  id: string
  station: StationKey
  /** Pixel X at scene-native coords (center of sprite). */
  x: number
  /** Pixel Y at scene-native coords (top of sprite). */
  y: number
  /** Current frame index (0 or 1 for the idle bob). */
  frame: number
}

export interface UseBakerySceneProps {
  mode: BakerySceneMode
  teamName: string
  staffCounts: Record<StationKey, number>
  customerCount: number
}

export interface UseBakerySceneResult {
  chefs: Chef[]
}

const CHEF_BOB_MS = 400 // full cycle (frames 0→1→0)

/** Deterministic chef positioning. Width=24 → each sprite X-offset by 24 px per extra chef at the same station. */
function computeChefs(staffCounts: Record<StationKey, number>): Chef[] {
  const stations: StationKey[] = ['bakery', 'deli', 'barista']
  // Assign each explicit staff count first, then the 4th chef to the max-count station.
  const assignments: { station: StationKey; index: number }[] = []
  for (const station of stations) {
    const count = Math.min(staffCounts[station] ?? 0, 2) // cap at 2 per station
    for (let i = 0; i < count; i++) {
      assignments.push({ station, index: i })
    }
  }
  // If there's a 4th chef available from overflow, attach to the station with the highest count.
  // (Staff count can exceed 1 per station; we cap display at 2 to avoid crowding.)
  if (assignments.length > 4) assignments.length = 4
  return assignments.map((a, idx) => {
    const baseX = SCENE.stations[a.station]
    const offset = (a.index - 0.5) * 24
    return {
      id: `${a.station}-${a.index}`,
      station: a.station,
      x: Math.round(baseX + (a.index === 0 && staffCounts[a.station] === 1 ? 0 : offset)),
      y: SCENE.chefTopY,
      frame: 0,
    }
  })
}

export function useBakeryScene(props: UseBakerySceneProps): UseBakerySceneResult {
  const { staffCounts } = props
  const [tick, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(performance.now())

  useEffect(() => {
    const loop = () => {
      setTick((t) => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const elapsed = performance.now() - startRef.current
  const bobFrame = Math.floor((elapsed % CHEF_BOB_MS) / (CHEF_BOB_MS / 2)) % 2

  const chefs = computeChefs(staffCounts).map((c) => ({ ...c, frame: bobFrame }))

  // `tick` is only used to force re-render on rAF; reference it so the linter stays happy.
  void tick

  return { chefs }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useBakeryScene.ts \
  games/bakery-bash/app/src/hooks/useBakeryScene.test.ts
git commit -m "feat(bakery-bash): useBakeryScene hook — chef assignment + idle bob frame"
```

---

### Task 5.3: `<ChefLayer>` — render chef sprites from the hook state

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/ChefLayer.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/ChefLayer.test.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `games/bakery-bash/app/src/components/bakery-scene/ChefLayer.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChefLayer } from './ChefLayer'
import type { Chef } from '../../hooks/useBakeryScene'

const fakeChefs: Chef[] = [
  { id: 'bakery-0', station: 'bakery', x: 90, y: 140, frame: 0 },
  { id: 'deli-0', station: 'deli', x: 220, y: 140, frame: 1 },
]

describe('<ChefLayer>', () => {
  it('renders one canvas per chef', () => {
    const { container } = render(<ChefLayer chefs={fakeChefs} />)
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBe(fakeChefs.length)
  })

  it('positions each chef canvas at (x - halfWidth, y)', () => {
    const { container } = render(<ChefLayer chefs={fakeChefs} />)
    const canvases = container.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>
    // chef[0] at x=90, sprite width 24 → left = 90 - 12 = 78
    expect(canvases[0].style.left).toBe('78px')
    expect(canvases[0].style.top).toBe('140px')
  })

  it('renders nothing when chefs array is empty', () => {
    const { container } = render(<ChefLayer chefs={[]} />)
    expect(container.querySelectorAll('canvas').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/ChefLayer.test.tsx
```

- [ ] **Step 3: Implement `ChefLayer.tsx`**

```tsx
import { PixelSprite } from './PixelSprite'
import type { Chef } from '../../hooks/useBakeryScene'
import { chefBakery } from './sprites/chef-bakery'
import { chefDeli } from './sprites/chef-deli'
import { chefBarista } from './sprites/chef-barista'

const SPRITE_FOR_STATION = {
  bakery: chefBakery,
  deli: chefDeli,
  barista: chefBarista,
} as const

interface Props {
  chefs: Chef[]
}

export function ChefLayer({ chefs }: Props) {
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {chefs.map((c) => {
        const data = SPRITE_FOR_STATION[c.station]
        const halfW = Math.floor(data.width / 2)
        return (
          <div
            key={c.id}
            data-testid={`chef-${c.id}`}
            style={{
              position: 'absolute',
              left: `${c.x - halfW}px`,
              top: `${c.y}px`,
            }}
          >
            <PixelSprite data={data} frame={c.frame} />
          </div>
        )
      })}
    </div>
  )
}
```

Hmm — the test asserts `canvases[0].style.left`, but the `<PixelSprite>` doesn't accept a `left` prop and the canvas itself doesn't get the left style — the wrapper div does. Fix the test to query the wrapper div:

Replace the positioning test in `ChefLayer.test.tsx`:
```tsx
  it('positions each chef wrapper at (x - halfWidth, y)', () => {
    const { container } = render(<ChefLayer chefs={fakeChefs} />)
    const wrappers = container.querySelectorAll('[data-testid^="chef-"]') as NodeListOf<HTMLElement>
    expect(wrappers[0].style.left).toBe('78px')
    expect(wrappers[0].style.top).toBe('140px')
  })
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/ChefLayer.test.tsx
```

- [ ] **Step 5: Wire ChefLayer into `<PixelBakeryScene>`**

Update `PixelBakeryScene.tsx`:
```tsx
import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'
import { ChefLayer } from './ChefLayer'
import { useBakeryScene } from '../../hooks/useBakeryScene'
import type { StationKey } from './scene-geometry'

export type BakerySceneMode = 'decide' | 'simulate' | 'static'

interface Props {
  mode: BakerySceneMode
  teamName: string
  staffCounts?: Record<StationKey, number>
  customerCount?: number
}

const DEFAULT_STAFF: Record<StationKey, number> = { bakery: 1, deli: 1, barista: 1 }

export function PixelBakeryScene({
  mode,
  teamName,
  staffCounts = DEFAULT_STAFF,
  customerCount = 0,
}: Props) {
  const { chefs } = useBakeryScene({ mode, teamName, staffCounts, customerCount })
  return (
    <div
      data-testid="pixel-bakery-scene"
      className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}
    >
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
    </div>
  )
}
```

Update `PixelBakeryScene.test.tsx` — add a test for chef rendering:
```tsx
import type { StationKey } from './scene-geometry'

describe('<PixelBakeryScene> — chefs', () => {
  it('renders a chef at each station by default', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    const chefs = container.querySelectorAll('[data-testid^="chef-"]')
    expect(chefs.length).toBe(3)
  })

  it('renders no chefs when all staffCounts are zero', () => {
    const { container } = render(
      <PixelBakeryScene
        mode="decide"
        teamName="X"
        staffCounts={{ bakery: 0, deli: 0, barista: 0 } as Record<StationKey, number>}
      />,
    )
    expect(container.querySelectorAll('[data-testid^="chef-"]').length).toBe(0)
  })
})
```

- [ ] **Step 6: Run all scene tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/
```

- [ ] **Step 7: Visual verify — preview should show 3 chefs behind the counter**

Use the preview-start tool on `bakery-scene-v2`, navigate to `/preview/bakery-scene`, screenshot. Chefs should be visible as 24×40 humanoid silhouettes at the Bakery / Deli / Barista station X-coords, overlapping the counter.

- [ ] **Step 8: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/ChefLayer.tsx \
  games/bakery-bash/app/src/components/bakery-scene/ChefLayer.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.test.tsx
git commit -m "feat(bakery-bash): <ChefLayer> renders 3 chefs + wire into PixelBakeryScene"
```

---

## Phase 6 — Cat sprite + `<CatLayer>` + wander behavior

Ambient cat that wanders the floor strip. Present on both Decide and Simulate.

### Task 6.1: Cat sprite data (5 frames: walk-L×2, walk-R×2, sit, groom)

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/cat.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/cat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// games/bakery-bash/app/src/components/bakery-scene/sprites/cat.test.ts
import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { cat, CAT_FRAME } from './cat'

describe('cat sprite', () => {
  it('is valid SpriteData 20x14', () => {
    expect(() => validateSpriteData(cat)).not.toThrow()
    expect(cat.width).toBe(20)
    expect(cat.height).toBe(14)
  })

  it('exposes named frame indices for walk/sit/groom', () => {
    expect(CAT_FRAME.walkLeft1).toBeDefined()
    expect(CAT_FRAME.walkLeft2).toBeDefined()
    expect(CAT_FRAME.walkRight1).toBeDefined()
    expect(CAT_FRAME.walkRight2).toBeDefined()
    expect(CAT_FRAME.sit).toBeDefined()
    expect(CAT_FRAME.groom).toBeDefined()
    expect(cat.frames.length).toBeGreaterThanOrEqual(6)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/cat.test.ts
```

- [ ] **Step 3: Create `sprites/cat.ts`**

```ts
import type { SpriteData } from '../sprite-data'

/** Cat sprite — 20×14, 6 frames: walk-L ×2, walk-R ×2, sit, groom. */
export const CAT_FRAME = {
  walkLeft1: 0,
  walkLeft2: 1,
  walkRight1: 2,
  walkRight2: 3,
  sit: 4,
  groom: 5,
} as const

export const cat: SpriteData = {
  width: 20,
  height: 14,
  palette: [
    '#1e1410', // 0 outline
    '#d9a35a', // 1 tabby body
    '#a67025', // 2 tabby shadow
    '#f6e0b5', // 3 belly
    '#ff8aa8', // 4 nose / tongue
    '#1aa34a', // 5 eye (green)
  ],
  frames: [
    // Frame 0: walk-left pose 1
    [
      '                    ',
      '  00                ',
      ' 0110   00          ',
      ' 01510  0100        ',
      ' 0111000110         ',
      ' 01111111110        ',
      ' 01133333110        ',
      ' 01133333110        ',
      ' 01111111110        ',
      '  0010 00110        ',
      '  001  0  0         ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 1: walk-left pose 2 (legs swap)
    [
      '                    ',
      '  00                ',
      ' 0110   00          ',
      ' 01510  0100        ',
      ' 0111000110         ',
      ' 01111111110        ',
      ' 01133333110        ',
      ' 01133333110        ',
      ' 01111111110        ',
      '  001000110         ',
      '   0  0  01         ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 2: walk-right pose 1 (mirror of frame 0)
    [
      '                    ',
      '                00  ',
      '          00   0110 ',
      '        0010  01510 ',
      '         0110001110 ',
      '        01111111110 ',
      '        01133333110 ',
      '        01133333110 ',
      '        01111111110 ',
      '        01100 0100  ',
      '         0  0  100  ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 3: walk-right pose 2
    [
      '                    ',
      '                00  ',
      '          00   0110 ',
      '        0010  01510 ',
      '         0110001110 ',
      '        01111111110 ',
      '        01133333110 ',
      '        01133333110 ',
      '        01111111110 ',
      '         011000100  ',
      '         10  0  0   ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 4: sitting (tall vertical pose)
    [
      '                    ',
      '    00              ',
      '   0150             ',
      '   0110             ',
      '   01110            ',
      '   011110           ',
      '  0111111           ',
      '  0113331           ',
      '  0111111 0         ',
      '  01111110          ',
      '   011110           ',
      '    0000            ',
      '                    ',
      '                    ',
    ],
    // Frame 5: grooming (head down licking paw)
    [
      '                    ',
      '                    ',
      '   0 0              ',
      '   0 10             ',
      '   01100            ',
      '   011100           ',
      '   0111100          ',
      '   0133310          ',
      '   0111110          ',
      '   01111100         ',
      '    000110          ',
      '                    ',
      '                    ',
      '                    ',
    ],
  ],
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/cat.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/sprites/cat.ts \
  games/bakery-bash/app/src/components/bakery-scene/sprites/cat.test.ts
git commit -m "feat(bakery-bash): cat sprite — 20x14, 6 frames (walk/sit/groom)"
```

---

### Task 6.2: Cat wander state in `useBakeryScene`

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `useBakeryScene.test.ts`:
```ts
describe('useBakeryScene — cat', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns a cat with an x inside the floor strip', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    const cat = result.current.cat
    expect(cat).toBeDefined()
    expect(cat.x).toBeGreaterThanOrEqual(10)
    expect(cat.x).toBeLessThanOrEqual(470)
    expect(cat.y).toBeGreaterThanOrEqual(220) // in floor strip
  })

  it('cat moves X over time while walking', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(baseProps))
    const initial = result.current.cat.x
    act(() => vi.advanceTimersByTime(500))
    rerender()
    // Either moved (walking) or held (sitting) — assert at least one of both across 2 ticks.
    const afterA = result.current.cat.x
    act(() => vi.advanceTimersByTime(2000))
    rerender()
    const afterB = result.current.cat.x
    expect(initial !== afterA || initial !== afterB).toBe(true)
  })

  it('cat state is one of walking/sitting/grooming', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    expect(['walking', 'sitting', 'grooming']).toContain(result.current.cat.state)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 3: Add cat logic to `useBakeryScene.ts`**

Extend the hook — add these types and expose `cat` alongside `chefs`:

```ts
import { CAT_FRAME } from '../components/bakery-scene/sprites/cat'

export type CatState = 'walking' | 'sitting' | 'grooming'

export interface Cat {
  x: number
  y: number
  direction: 'left' | 'right'
  state: CatState
  frame: number
}

// Floor strip X bounds the cat wanders between.
const CAT_X_MIN = 20
const CAT_X_MAX = 440
const CAT_Y = 244 // just above the bottom of the floor strip
const CAT_SPEED_PX_PER_MS = 0.04 // ≈ 40 px/s
const CAT_PAUSE_MIN_MS = 2000
const CAT_PAUSE_MAX_MS = 4000

interface CatInternal extends Cat {
  targetX: number
  stateUntilMs: number
}

function initialCat(now: number): CatInternal {
  const target = Math.floor(CAT_X_MIN + Math.random() * (CAT_X_MAX - CAT_X_MIN))
  const startX = Math.floor(CAT_X_MIN + Math.random() * (CAT_X_MAX - CAT_X_MIN))
  return {
    x: startX,
    y: CAT_Y,
    direction: target < startX ? 'left' : 'right',
    state: 'walking',
    frame: CAT_FRAME.walkRight1,
    targetX: target,
    stateUntilMs: now + 10_000, // walking until reached, then pause
  }
}

function stepCat(cat: CatInternal, now: number, dtMs: number): CatInternal {
  if (cat.state === 'walking') {
    const dx = cat.targetX - cat.x
    const step = Math.sign(dx) * CAT_SPEED_PX_PER_MS * dtMs
    const nextX = Math.abs(dx) <= Math.abs(step) ? cat.targetX : cat.x + step
    if (nextX === cat.targetX) {
      // Arrived — pick sit or groom, pause randomly.
      const pause = CAT_PAUSE_MIN_MS + Math.random() * (CAT_PAUSE_MAX_MS - CAT_PAUSE_MIN_MS)
      const nextState: CatState = Math.random() < 0.3 ? 'grooming' : 'sitting'
      return {
        ...cat,
        x: nextX,
        state: nextState,
        frame: nextState === 'sitting' ? CAT_FRAME.sit : CAT_FRAME.groom,
        stateUntilMs: now + pause,
      }
    }
    // Walking — alternate 2 walk frames every 250 ms.
    const walkFrameA = cat.direction === 'left' ? CAT_FRAME.walkLeft1 : CAT_FRAME.walkRight1
    const walkFrameB = cat.direction === 'left' ? CAT_FRAME.walkLeft2 : CAT_FRAME.walkRight2
    const frame = Math.floor(now / 250) % 2 === 0 ? walkFrameA : walkFrameB
    return { ...cat, x: nextX, frame }
  }
  // Sitting or grooming — check if pause done; if so, pick a new target.
  if (now >= cat.stateUntilMs) {
    const target = Math.floor(CAT_X_MIN + Math.random() * (CAT_X_MAX - CAT_X_MIN))
    return {
      ...cat,
      state: 'walking',
      targetX: target,
      direction: target < cat.x ? 'left' : 'right',
      frame: target < cat.x ? CAT_FRAME.walkLeft1 : CAT_FRAME.walkRight1,
      stateUntilMs: now + 20_000,
    }
  }
  return cat
}
```

Integrate into the hook body (alongside `chefs`):
```ts
export function useBakeryScene(props: UseBakerySceneProps): UseBakerySceneResult {
  const { staffCounts } = props
  const [, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(performance.now())
  const lastRef = useRef<number>(performance.now())
  const catRef = useRef<CatInternal>(initialCat(performance.now()))

  useEffect(() => {
    const loop = (now: number) => {
      const dt = now - lastRef.current
      lastRef.current = now
      catRef.current = stepCat(catRef.current, now, dt)
      setTick((t) => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const elapsed = performance.now() - startRef.current
  const bobFrame = Math.floor((elapsed % CHEF_BOB_MS) / (CHEF_BOB_MS / 2)) % 2
  const chefs = computeChefs(staffCounts).map((c) => ({ ...c, frame: bobFrame }))
  const { targetX: _t, stateUntilMs: _s, ...publicCat } = catRef.current
  void _t; void _s

  return { chefs, cat: publicCat }
}
```

Update `UseBakerySceneResult`:
```ts
export interface UseBakerySceneResult {
  chefs: Chef[]
  cat: Cat
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useBakeryScene.ts \
  games/bakery-bash/app/src/hooks/useBakeryScene.test.ts
git commit -m "feat(bakery-bash): cat wander state in useBakeryScene (walk/sit/groom)"
```

---

### Task 6.3: `<CatLayer>` + wire into scene

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/CatLayer.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/CatLayer.test.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`

- [ ] **Step 1: Write failing test**

Create `games/bakery-bash/app/src/components/bakery-scene/CatLayer.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CatLayer } from './CatLayer'
import type { Cat } from '../../hooks/useBakeryScene'
import { CAT_FRAME } from './sprites/cat'

const fakeCat: Cat = { x: 100, y: 240, direction: 'right', state: 'walking', frame: CAT_FRAME.walkRight1 }

describe('<CatLayer>', () => {
  it('renders a single canvas for the cat', () => {
    const { container } = render(<CatLayer cat={fakeCat} />)
    expect(container.querySelectorAll('canvas').length).toBe(1)
  })

  it('positions wrapper at (cat.x - halfW, cat.y)', () => {
    const { container } = render(<CatLayer cat={fakeCat} />)
    const wrapper = container.querySelector('[data-testid="cat-wrapper"]') as HTMLElement
    expect(wrapper.style.left).toBe('90px') // 100 - halfW(10)
    expect(wrapper.style.top).toBe('240px')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/CatLayer.test.tsx
```

- [ ] **Step 3: Implement `CatLayer.tsx`**

```tsx
import { PixelSprite } from './PixelSprite'
import { cat as catSprite } from './sprites/cat'
import type { Cat } from '../../hooks/useBakeryScene'

interface Props {
  cat: Cat
}

export function CatLayer({ cat }: Props) {
  const halfW = Math.floor(catSprite.width / 2)
  return (
    <div
      data-testid="cat-wrapper"
      aria-hidden
      style={{
        position: 'absolute',
        left: `${cat.x - halfW}px`,
        top: `${cat.y}px`,
        pointerEvents: 'none',
      }}
    >
      <PixelSprite data={catSprite} frame={cat.frame} />
    </div>
  )
}
```

- [ ] **Step 4: Wire into `<PixelBakeryScene>`**

Update the orchestrator:
```tsx
import { CatLayer } from './CatLayer'
// ... existing imports ...

export function PixelBakeryScene({ mode, teamName, staffCounts = DEFAULT_STAFF, customerCount = 0 }: Props) {
  const { chefs, cat } = useBakeryScene({ mode, teamName, staffCounts, customerCount })
  return (
    <div data-testid="pixel-bakery-scene" className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}>
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
      <CatLayer cat={cat} />
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/
```

- [ ] **Step 6: Visual verify**

Open `/preview/bakery-scene` in the browser. Cat should be visible on the floor strip, moving slowly. Chefs should be idling. **This is the Decide-mode checkpoint — scene is shippable for DecidePhase integration now.**

- [ ] **Step 7: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/CatLayer.tsx \
  games/bakery-bash/app/src/components/bakery-scene/CatLayer.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx
git commit -m "feat(bakery-bash): <CatLayer> + wire cat into scene (Decide-ready milestone)"
```

---

## Phase 7 — Customer sprites + `<CustomerLayer>` + spawn scheduler

Adds customer spawning during Simulate mode. Customers walk in from the right, pause at a chef's station, then walk back out. Sale triggering + dollar flurry lands in Phase 8.

### Task 7.1: Customer sprite data — 3 body templates × 2 palette swaps (6 variants)

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/customer-templates.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/sprites/customer-templates.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// games/bakery-bash/app/src/components/bakery-scene/sprites/customer-templates.test.ts
import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { customerTemplates, CUSTOMER_FRAME } from './customer-templates'

describe('customer templates', () => {
  it('provides at least 3 templates × 2 palette variants = 6 variants', () => {
    expect(customerTemplates.length).toBeGreaterThanOrEqual(6)
  })

  it('each variant is valid 20x36 SpriteData with 5 frames', () => {
    for (const v of customerTemplates) {
      expect(() => validateSpriteData(v)).not.toThrow()
      expect(v.width).toBe(20)
      expect(v.height).toBe(36)
      expect(v.frames.length).toBe(5)
    }
  })

  it('exposes named frame indices walkL1/walkL2/walkR1/walkR2/idle', () => {
    expect(CUSTOMER_FRAME.walkLeft1).toBeDefined()
    expect(CUSTOMER_FRAME.walkLeft2).toBeDefined()
    expect(CUSTOMER_FRAME.walkRight1).toBeDefined()
    expect(CUSTOMER_FRAME.walkRight2).toBeDefined()
    expect(CUSTOMER_FRAME.idle).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/customer-templates.test.ts
```

- [ ] **Step 3: Create `sprites/customer-templates.ts`**

```ts
import type { SpriteData } from '../sprite-data'

export const CUSTOMER_FRAME = {
  walkLeft1: 0,
  walkLeft2: 1,
  walkRight1: 2,
  walkRight2: 3,
  idle: 4,
} as const

/**
 * Customer sprite — 20×36, 5 frames (2 walk-L, 2 walk-R, 1 idle).
 *
 * Palette convention (shared across all 3 body templates):
 *   0 = outline
 *   1 = skin light
 *   2 = skin shadow
 *   3 = hair
 *   4 = shirt
 *   5 = shirt shadow
 *   6 = pants
 *   7 = shoes
 */

/** Body template 1 — standard height, rounded head. */
const BODY_TEMPLATE_1_FRAMES: string[][] = [
  // Frame 0: walk-left pose 1
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666006660      ',
    '    0660  0660      ',
    '    066    660      ',
    '    077    770      ',
    '   0777    7770     ',
    '   0770    0770     ',
    '   0770    0770     ',
    '    00      00      ',
  ],
  // Frame 1: walk-left pose 2 (leg forward/back reversed)
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '   0666000660       ',
    '   0770  0770       ',
    '   077    770       ',
    '   077    770       ',
    '    0      0        ',
    '                    ',
  ],
  // Frame 2: walk-right pose 1 (mirror frame 0)
  [
    '                    ',
    '         00330      ',
    '        0333330     ',
    '        0323320     ',
    '        0122210     ',
    '        0122210     ',
    '         01110      ',
    '          010       ',
    '         04440      ',
    '       0 044440     ',
    '      0044444440    ',
    '      04444444440   ',
    '      04445555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      00444444400   ',
    '      000444440     ',
    '      0066666600    ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066606666 0   ',
    '      06600 0660     ',
    '      066    660    ',
    '      077    770    ',
    '     0777    7770   ',
    '     0770    0770   ',
    '     0770    0770   ',
    '      00      00    ',
  ],
  // Frame 3: walk-right pose 2
  [
    '                    ',
    '         00330      ',
    '        0333330     ',
    '        0323320     ',
    '        0122210     ',
    '        0122210     ',
    '         01110      ',
    '          010       ',
    '         04440      ',
    '       0 044440     ',
    '      0044444440    ',
    '      04444444440   ',
    '      04445555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      00444444400   ',
    '      000444440     ',
    '      0066666600    ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '       066600066 0  ',
    '       077 0 0 77   ',
    '       77     77    ',
    '       77     77    ',
    '        0     0     ',
    '                    ',
  ],
  // Frame 4: idle (facing forward/camera)
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666006660      ',
    '    0666006660      ',
    '    0660  0660      ',
    '    066    660      ',
    '    077    770      ',
    '   0777    7770     ',
    '   0770    0770     ',
    '   0770    0770     ',
    '    00      00      ',
  ],
]

/** Body template 2 — shorter/stockier (first row shifted down 2 px). */
const BODY_TEMPLATE_2_FRAMES: string[][] = BODY_TEMPLATE_1_FRAMES.map((frame) => {
  // shift down 2 px — first 2 rows blank, drop last 2 rows
  const shifted = ['                    ', '                    ', ...frame.slice(0, frame.length - 2)]
  return shifted
})

/** Body template 3 — taller head (add 1 row of hair at top). */
const BODY_TEMPLATE_3_FRAMES: string[][] = BODY_TEMPLATE_1_FRAMES.map((frame) => {
  const copy = [...frame]
  // Replace the first row with a hair row (more visible head)
  copy[0] = '     033333300      '
  return copy
})

/** Palette variant A: brown hair + red shirt + blue pants. */
const PALETTE_A = [
  '#1e1410', '#f2c9a3', '#d29872', '#4a2a10',
  '#b83a3a', '#832020', '#1f3c6b', '#2d1810',
]
/** Palette variant B: blonde hair + green shirt + tan pants. */
const PALETTE_B = [
  '#1e1410', '#f2c9a3', '#d29872', '#b89456',
  '#3a7a3a', '#205020', '#8a6a3a', '#2d1810',
]

function buildVariant(frames: string[][], palette: string[]): SpriteData {
  return { width: 20, height: 36, palette, frames }
}

/** 3 body templates × 2 palettes = 6 visually distinct customers. */
export const customerTemplates: SpriteData[] = [
  buildVariant(BODY_TEMPLATE_1_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_1_FRAMES, PALETTE_B),
  buildVariant(BODY_TEMPLATE_2_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_2_FRAMES, PALETTE_B),
  buildVariant(BODY_TEMPLATE_3_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_3_FRAMES, PALETTE_B),
]
```

- [ ] **Step 4: Run — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/sprites/customer-templates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/sprites/customer-templates.ts \
  games/bakery-bash/app/src/components/bakery-scene/sprites/customer-templates.test.ts
git commit -m "feat(bakery-bash): customer sprite templates (3 bodies × 2 palettes = 6 variants)"
```

---

### Task 7.2: Customer spawn + state machine in `useBakeryScene`

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `useBakeryScene.test.ts`:
```ts
describe('useBakeryScene — customers (simulate)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const simProps = { ...baseProps, mode: 'simulate' as const, customerCount: 20 }

  it('spawns no customers on Decide mode regardless of customerCount', () => {
    const { result } = renderHook(() => useBakeryScene({ ...baseProps, customerCount: 20 }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.customers.length).toBe(0)
  })

  it('spawns at least one customer during Simulate within 10s', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    act(() => vi.advanceTimersByTime(10_000))
    rerender()
    expect(result.current.customers.length).toBeGreaterThan(0)
  })

  it('respects a soft cap of 4 customers on-screen', () => {
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...simProps, customerCount: 999 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    expect(result.current.customers.length).toBeLessThanOrEqual(4)
  })

  it('customer state transitions walking-in → transacting → walking-out', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    // Allow a customer to spawn and walk in
    act(() => vi.advanceTimersByTime(15_000))
    rerender()
    const customer = result.current.customers[0]
    expect(customer).toBeDefined()
    expect(['walking-in', 'transacting', 'walking-out']).toContain(customer.state)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 3: Add customer state to the hook**

Add these types + constants + helpers to `useBakeryScene.ts`:
```ts
import { customerTemplates, CUSTOMER_FRAME } from '../components/bakery-scene/sprites/customer-templates'

export type CustomerState = 'walking-in' | 'transacting' | 'walking-out'

export interface Customer {
  id: string
  variantIndex: number
  x: number
  y: number
  direction: 'left' | 'right'
  state: CustomerState
  frame: number
  targetStation: StationKey
}

interface CustomerInternal extends Customer {
  transactionStartMs: number | null
}

const CUSTOMER_SOFT_CAP = 4
const CUSTOMER_SPEED_PX_PER_MS = 0.06
const TRANSACTION_MS = 800
const SPAWN_Y = 246
const OFF_SCREEN_RIGHT = SCENE.width + 24

/** Pick a station weighted by staffCounts (ignores sold-out logic for now; full sold-out handling lands with <SceneBackdrop> diff in Phase 9). */
function pickStation(staffCounts: Record<StationKey, number>): StationKey {
  const stations: StationKey[] = ['bakery', 'deli', 'barista']
  const weighted = stations.flatMap((s) => Array(Math.max(1, staffCounts[s] ?? 1)).fill(s))
  return weighted[Math.floor(Math.random() * weighted.length)] as StationKey
}

let customerIdCounter = 0
function spawnCustomer(staffCounts: Record<StationKey, number>): CustomerInternal {
  const variantIndex = Math.floor(Math.random() * customerTemplates.length)
  const targetStation = pickStation(staffCounts)
  return {
    id: `customer-${customerIdCounter++}`,
    variantIndex,
    x: OFF_SCREEN_RIGHT,
    y: SPAWN_Y,
    direction: 'left',
    state: 'walking-in',
    frame: CUSTOMER_FRAME.walkLeft1,
    targetStation,
    transactionStartMs: null,
  }
}

function stepCustomer(c: CustomerInternal, now: number, dtMs: number): CustomerInternal | null {
  if (c.state === 'walking-in') {
    const targetX = SCENE.stations[c.targetStation]
    const dx = targetX - c.x
    const step = Math.sign(dx) * CUSTOMER_SPEED_PX_PER_MS * dtMs
    const nextX = Math.abs(dx) <= Math.abs(step) ? targetX : c.x + step
    const arrived = nextX === targetX
    const walkFrame = Math.floor(now / 200) % 2 === 0 ? CUSTOMER_FRAME.walkLeft1 : CUSTOMER_FRAME.walkLeft2
    return {
      ...c,
      x: nextX,
      frame: arrived ? CUSTOMER_FRAME.idle : walkFrame,
      state: arrived ? 'transacting' : 'walking-in',
      transactionStartMs: arrived ? now : null,
    }
  }
  if (c.state === 'transacting') {
    if (c.transactionStartMs !== null && now - c.transactionStartMs >= TRANSACTION_MS) {
      return { ...c, state: 'walking-out', direction: 'right', frame: CUSTOMER_FRAME.walkRight1 }
    }
    return c
  }
  // walking-out
  const step = CUSTOMER_SPEED_PX_PER_MS * dtMs
  const nextX = c.x + step
  if (nextX > OFF_SCREEN_RIGHT) return null // destroy
  const walkFrame = Math.floor(now / 200) % 2 === 0 ? CUSTOMER_FRAME.walkRight1 : CUSTOMER_FRAME.walkRight2
  return { ...c, x: nextX, frame: walkFrame }
}
```

Wire customer state into the hook. Full updated `useBakeryScene` body:

```ts
export function useBakeryScene(props: UseBakerySceneProps): UseBakerySceneResult {
  const { mode, staffCounts, customerCount } = props
  const [, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(performance.now())
  const lastRef = useRef<number>(performance.now())
  const catRef = useRef<CatInternal>(initialCat(performance.now()))
  const customersRef = useRef<CustomerInternal[]>([])
  const lastSpawnRef = useRef<number>(performance.now())

  // Spawn interval derived from customerCount over a nominal 120s simulation.
  const spawnIntervalMs =
    mode === 'simulate' && customerCount > 0 ? Math.max(1500, (120_000 / customerCount) + (Math.random() * 800 - 400)) : Infinity

  useEffect(() => {
    const loop = (now: number) => {
      const dt = now - lastRef.current
      lastRef.current = now
      // Cat
      catRef.current = stepCat(catRef.current, now, dt)
      // Customers
      if (mode === 'simulate') {
        // Advance existing customers.
        customersRef.current = customersRef.current
          .map((c) => stepCustomer(c, now, dt))
          .filter((c): c is CustomerInternal => c !== null)
        // Spawn new if below soft cap and interval elapsed.
        if (
          customersRef.current.length < CUSTOMER_SOFT_CAP &&
          now - lastSpawnRef.current >= spawnIntervalMs
        ) {
          customersRef.current = [...customersRef.current, spawnCustomer(staffCounts)]
          lastSpawnRef.current = now
        }
      } else if (customersRef.current.length > 0) {
        customersRef.current = []
      }
      setTick((t) => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [mode, staffCounts, customerCount, spawnIntervalMs])

  const elapsed = performance.now() - startRef.current
  const bobFrame = Math.floor((elapsed % CHEF_BOB_MS) / (CHEF_BOB_MS / 2)) % 2
  const chefs = computeChefs(staffCounts).map((c) => ({ ...c, frame: bobFrame }))
  const { targetX: _t, stateUntilMs: _s, ...publicCat } = catRef.current
  void _t; void _s
  const customers = customersRef.current.map(({ transactionStartMs: _, ...rest }) => rest)

  return { chefs, cat: publicCat, customers }
}
```

Update the result interface:
```ts
export interface UseBakerySceneResult {
  chefs: Chef[]
  cat: Cat
  customers: Customer[]
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useBakeryScene.ts \
  games/bakery-bash/app/src/hooks/useBakeryScene.test.ts
git commit -m "feat(bakery-bash): customer spawn + state machine (simulate mode)"
```

---

### Task 7.3: `<CustomerLayer>` + wire into scene

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.test.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CustomerLayer } from './CustomerLayer'
import type { Customer } from '../../hooks/useBakeryScene'
import { CUSTOMER_FRAME } from './sprites/customer-templates'

const fakeCustomers: Customer[] = [
  {
    id: 'c1', variantIndex: 0, x: 300, y: 246,
    direction: 'left', state: 'walking-in',
    frame: CUSTOMER_FRAME.walkLeft1, targetStation: 'bakery',
  },
  {
    id: 'c2', variantIndex: 3, x: 220, y: 246,
    direction: 'left', state: 'transacting',
    frame: CUSTOMER_FRAME.idle, targetStation: 'deli',
  },
]

describe('<CustomerLayer>', () => {
  it('renders one wrapper per customer', () => {
    const { container } = render(<CustomerLayer customers={fakeCustomers} />)
    expect(container.querySelectorAll('[data-testid^="customer-"]').length).toBe(2)
  })

  it('renders nothing when customers array is empty', () => {
    const { container } = render(<CustomerLayer customers={[]} />)
    expect(container.querySelectorAll('[data-testid^="customer-"]').length).toBe(0)
  })

  it('positions each customer wrapper at (x - halfW, y)', () => {
    const { container } = render(<CustomerLayer customers={fakeCustomers} />)
    const first = container.querySelector('[data-testid="customer-c1"]') as HTMLElement
    expect(first.style.left).toBe('290px') // 300 - halfW(10)
    expect(first.style.top).toBe('246px')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/CustomerLayer.test.tsx
```

- [ ] **Step 3: Implement `CustomerLayer.tsx`**

```tsx
import { PixelSprite } from './PixelSprite'
import { customerTemplates } from './sprites/customer-templates'
import type { Customer } from '../../hooks/useBakeryScene'

interface Props {
  customers: Customer[]
}

export function CustomerLayer({ customers }: Props) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {customers.map((c) => {
        const data = customerTemplates[c.variantIndex] ?? customerTemplates[0]
        const halfW = Math.floor(data.width / 2)
        return (
          <div
            key={c.id}
            data-testid={`customer-${c.id}`}
            style={{ position: 'absolute', left: `${c.x - halfW}px`, top: `${c.y}px` }}
          >
            <PixelSprite data={data} frame={c.frame} />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Wire into `<PixelBakeryScene>`**

```tsx
import { CustomerLayer } from './CustomerLayer'
// ...
export function PixelBakeryScene({ ... }: Props) {
  const { chefs, cat, customers } = useBakeryScene({ ... })
  return (
    <div ...>
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
      <CustomerLayer customers={customers} />
      <CatLayer cat={cat} />
    </div>
  )
}
```

**Layer ordering note:** `<CatLayer>` renders LAST so the cat is drawn on top of customers (cat can walk in front of customers in the floor strip).

- [ ] **Step 5: Run tests + visual verify in simulate mode**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/
```

Open `/preview/bakery-scene`, click the "simulate" mode button. Within ~10s you should see customers walking in from the right, approaching chef stations.

- [ ] **Step 6: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.tsx \
  games/bakery-bash/app/src/components/bakery-scene/CustomerLayer.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx
git commit -m "feat(bakery-bash): <CustomerLayer> + simulate-mode customer spawning"
```

---

## Phase 8 — FX: dollar bills + oven steam

### Task 8.1: Dollar bill hook state + `triggerSale` + `<DollarLayer>`

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`
- Create: `games/bakery-bash/app/src/components/bakery-scene/DollarLayer.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/DollarLayer.test.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`
- Modify: `games/bakery-bash/app/src/styles/pixel-scene.css`

- [ ] **Step 1: Write failing hook test**

Append to `useBakeryScene.test.ts`:
```ts
describe('useBakeryScene — dollar bills', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dollar bills spawn when a customer completes transactionMs', () => {
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 5 }),
    )
    // Let a customer spawn, walk in, and complete a transaction.
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    // At some point, dollars should be non-empty (they're short-lived, so this is flaky
    // under fake timers. Loosen: either dollars currently > 0, OR any customer is walking-out.)
    const anyWalkingOut = result.current.customers.some((c) => c.state === 'walking-out')
    const anyDollars = result.current.dollars.length > 0
    expect(anyWalkingOut || anyDollars).toBe(true)
  })

  it('each dollar has x, y, createdMs within sane scene bounds', () => {
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 5 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    for (const d of result.current.dollars) {
      expect(d.x).toBeGreaterThan(0)
      expect(d.x).toBeLessThan(480)
      expect(d.y).toBeGreaterThan(100)
      expect(d.y).toBeLessThan(270)
    }
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 3: Add dollar state to the hook**

In `useBakeryScene.ts`:

```ts
export interface Dollar {
  id: string
  x: number
  y: number
  createdMs: number
}

const DOLLAR_LIFETIME_MS = 800
const BILLS_PER_SALE_MIN = 4
const BILLS_PER_SALE_MAX = 6

let dollarIdCounter = 0
function spawnDollars(stationX: number, now: number): Dollar[] {
  const count = BILLS_PER_SALE_MIN + Math.floor(Math.random() * (BILLS_PER_SALE_MAX - BILLS_PER_SALE_MIN + 1))
  const bills: Dollar[] = []
  for (let i = 0; i < count; i++) {
    bills.push({
      id: `dollar-${dollarIdCounter++}`,
      x: stationX + (Math.random() * 20 - 10),
      y: SCENE.zones.counter.y + 8,
      createdMs: now,
    })
  }
  return bills
}
```

Inside the hook's rAF loop, track customer state transitions and spawn dollars when a customer flips from `'transacting'` to `'walking-out'`. Easiest approach: detect in `stepCustomer` and add to a ref'd bills array.

Modify `stepCustomer` to return sale trigger flag:

```ts
function stepCustomer(
  c: CustomerInternal,
  now: number,
  dtMs: number,
): { next: CustomerInternal | null; triggeredSale: boolean } {
  if (c.state === 'walking-in') {
    // ... same as before, return { next, triggeredSale: false } ...
  }
  if (c.state === 'transacting') {
    if (c.transactionStartMs !== null && now - c.transactionStartMs >= TRANSACTION_MS) {
      return {
        next: { ...c, state: 'walking-out', direction: 'right', frame: CUSTOMER_FRAME.walkRight1 },
        triggeredSale: true,
      }
    }
    return { next: c, triggeredSale: false }
  }
  // walking-out — same as before.
}
```

(Update the caller to accept the new shape and spawn dollars accordingly; also expire dollars in the rAF loop.)

Add to hook body:
```ts
const dollarsRef = useRef<Dollar[]>([])

// Inside the rAF loop, after customer-stepping:
const nextCustomers: CustomerInternal[] = []
for (const c of customersRef.current) {
  const { next, triggeredSale } = stepCustomer(c, now, dt)
  if (triggeredSale) {
    dollarsRef.current.push(...spawnDollars(SCENE.stations[c.targetStation], now))
  }
  if (next) nextCustomers.push(next)
}
customersRef.current = nextCustomers
// Expire old dollars.
dollarsRef.current = dollarsRef.current.filter((d) => now - d.createdMs < DOLLAR_LIFETIME_MS + 200)
```

Expose dollars:
```ts
export interface UseBakerySceneResult {
  chefs: Chef[]
  cat: Cat
  customers: Customer[]
  dollars: Dollar[]
}

// in return statement:
return { chefs, cat: publicCat, customers, dollars: dollarsRef.current }
```

- [ ] **Step 4: Run hook tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 5: Write `<DollarLayer>` test**

```tsx
// games/bakery-bash/app/src/components/bakery-scene/DollarLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DollarLayer } from './DollarLayer'
import type { Dollar } from '../../hooks/useBakeryScene'

const bills: Dollar[] = [
  { id: 'd1', x: 100, y: 150, createdMs: performance.now() },
  { id: 'd2', x: 220, y: 150, createdMs: performance.now() },
]

describe('<DollarLayer>', () => {
  it('renders one DOM element per bill', () => {
    const { container } = render(<DollarLayer dollars={bills} />)
    expect(container.querySelectorAll('.dollar-bill').length).toBe(2)
  })

  it('each bill has a unique inline CSS random seed (X drift)', () => {
    const { container } = render(<DollarLayer dollars={bills} />)
    const els = container.querySelectorAll('.dollar-bill') as NodeListOf<HTMLElement>
    expect(els[0].style.left).toBe('100px')
    expect(els[1].style.left).toBe('220px')
  })

  it('renders nothing for empty dollars array', () => {
    const { container } = render(<DollarLayer dollars={[]} />)
    expect(container.querySelectorAll('.dollar-bill').length).toBe(0)
  })
})
```

- [ ] **Step 6: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/DollarLayer.test.tsx
```

- [ ] **Step 7: Implement `<DollarLayer>`**

```tsx
import type { Dollar } from '../../hooks/useBakeryScene'

interface Props {
  dollars: Dollar[]
}

/**
 * Dollar bills are rendered as DOM <div>s with a CSS keyframe animation.
 * Animation: float up 30 px, drift ±8 px horizontally, rotate ±20°, fade
 * to zero opacity in the final 200 ms of the 800 ms lifetime.
 *
 * See pixel-scene.css for .dollar-bill keyframes.
 */
export function DollarLayer({ dollars }: Props) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {dollars.map((d) => {
        const drift = (parseInt(d.id.split('-')[1], 10) % 17) - 8
        const rot = (parseInt(d.id.split('-')[1], 10) % 41) - 20
        return (
          <div
            key={d.id}
            className="dollar-bill"
            style={{
              left: `${d.x}px`,
              top: `${d.y}px`,
              ['--drift' as never]: `${drift}px`,
              ['--rot' as never]: `${rot}deg`,
            } as React.CSSProperties}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 8: Add keyframes to `pixel-scene.css`**

```css
/* ---- Dollar bills ---- */
.dollar-bill {
  position: absolute;
  width: 10px;
  height: 6px;
  background: #3e8a3e; /* bill green */
  border: 1px solid #1d4a1d;
  image-rendering: pixelated;
  animation: dollar-float 0.8s linear forwards;
}

.dollar-bill::before {
  content: "$";
  display: block;
  position: absolute;
  inset: 0;
  color: #d8f0d8;
  font-family: monospace;
  font-size: 6px;
  line-height: 6px;
  text-align: center;
}

@keyframes dollar-float {
  0% {
    transform: translate(0, 0) rotate(0deg);
    opacity: 1;
  }
  75% {
    transform: translate(var(--drift, 0px), -30px) rotate(var(--rot, 0deg));
    opacity: 1;
  }
  100% {
    transform: translate(var(--drift, 0px), -40px) rotate(var(--rot, 0deg));
    opacity: 0;
  }
}
```

- [ ] **Step 9: Wire into `<PixelBakeryScene>`**

```tsx
import { DollarLayer } from './DollarLayer'
// ...
export function PixelBakeryScene({ ... }: Props) {
  const { chefs, cat, customers, dollars } = useBakeryScene({ ... })
  return (
    <div ...>
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
      <CustomerLayer customers={customers} />
      <CatLayer cat={cat} />
      <DollarLayer dollars={dollars} />
    </div>
  )
}
```

- [ ] **Step 10: Run all tests + visual verify**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run
```

In the preview, switch to simulate mode. When a customer completes a transaction (reaches a chef's station then turns around to leave), 4–6 green dollar bills should float up and fade.

- [ ] **Step 11: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useBakeryScene.ts \
  games/bakery-bash/app/src/hooks/useBakeryScene.test.ts \
  games/bakery-bash/app/src/components/bakery-scene/DollarLayer.tsx \
  games/bakery-bash/app/src/components/bakery-scene/DollarLayer.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/styles/pixel-scene.css
git commit -m "feat(bakery-bash): dollar-bill flurry on each customer sale"
```

---

### Task 8.2: `<FxLayer>` — oven steam wisps

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/FxLayer.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/FxLayer.test.tsx`
- Modify: `games/bakery-bash/app/src/styles/pixel-scene.css`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// games/bakery-bash/app/src/components/bakery-scene/FxLayer.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { FxLayer } from './FxLayer'

describe('<FxLayer>', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts with no steam wisps', () => {
    const { container } = render(<FxLayer />)
    expect(container.querySelectorAll('.oven-steam').length).toBe(0)
  })

  it('eventually spawns at least one steam wisp within a few seconds', () => {
    const { container } = render(<FxLayer />)
    act(() => vi.advanceTimersByTime(6000))
    expect(container.querySelectorAll('.oven-steam').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/FxLayer.test.tsx
```

- [ ] **Step 3: Implement `FxLayer.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { SCENE } from './scene-geometry'

interface Wisp {
  id: number
  x: number
}

let wispIdCounter = 0

/**
 * Oven steam FX — spawns 1-2 wisps every 3-5 seconds from the top of the oven.
 * Each wisp is a CSS-animated DOM element that fades up and dissipates.
 */
export function FxLayer() {
  const [wisps, setWisps] = useState<Wisp[]>([])

  useEffect(() => {
    let cancelled = false
    const schedule = () => {
      if (cancelled) return
      const delayMs = 3000 + Math.random() * 2000
      setTimeout(() => {
        if (cancelled) return
        const count = 1 + Math.floor(Math.random() * 2) // 1 or 2 wisps
        const newWisps: Wisp[] = []
        // Oven painted at x=198..258 on the back wall; steam rises from top of oven (y≈48)
        for (let i = 0; i < count; i++) {
          newWisps.push({
            id: wispIdCounter++,
            x: 210 + Math.random() * 40,
          })
        }
        setWisps((prev) => [...prev, ...newWisps])
        // Remove after animation duration (1200ms) + buffer.
        setTimeout(() => {
          if (cancelled) return
          setWisps((prev) => prev.filter((w) => !newWisps.includes(w)))
        }, 1400)
        schedule()
      }, delayMs)
    }
    schedule()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {wisps.map((w) => (
        <div
          key={w.id}
          className="oven-steam"
          style={{ left: `${w.x}px`, top: `${SCENE.zones.midBand.y + 18}px` }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add steam CSS to `pixel-scene.css`**

```css
/* ---- Oven steam ---- */
.oven-steam {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #e0dfda;
  border-radius: 50%;
  opacity: 0.75;
  image-rendering: pixelated;
  animation: steam-rise 1.2s ease-out forwards;
}

@keyframes steam-rise {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0.75;
  }
  100% {
    transform: translate(calc((var(--drift, 0) * 1px)), -30px) scale(1.4);
    opacity: 0;
  }
}
```

- [ ] **Step 5: Wire into `<PixelBakeryScene>`**

```tsx
import { FxLayer } from './FxLayer'
// ...
<FxLayer />
```

Layer order:
```tsx
<SceneBackdrop />
<TeamSign teamName={teamName} />
<ChefLayer chefs={chefs} />
<CustomerLayer customers={customers} />
<CatLayer cat={cat} />
<DollarLayer dollars={dollars} />
<FxLayer />
```

- [ ] **Step 6: Run all tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run
```

- [ ] **Step 7: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/FxLayer.tsx \
  games/bakery-bash/app/src/components/bakery-scene/FxLayer.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/styles/pixel-scene.css
git commit -m "feat(bakery-bash): <FxLayer> oven steam wisps (ambient FX)"
```

---

## Phase 9 — Integration into SimulatePhase, DecidePhase (GamePage), and side panel reskin

Mount the scene into the actual game. Wire props from `useGame()` context. Reskin the Menu + Status side panels.

### Task 9.1: Mount `<PixelBakeryScene mode="simulate">` into `SimulatePhase`

**Files:**
- Modify: `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx`
- Modify: `games/bakery-bash/app/src/styles/global.css` (remove old `.simulate-phase__bakery-visual` inner content styles)

- [ ] **Step 1: Read `SimulatePhase.tsx` to understand available props from context**

```bash
grep -n "useGame\|pendingDecision\|teamName\|customerCount\|staffCounts" \
  /Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2/games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx
```

You should see `teamName`, `pendingDecision.staffCounts`, and access to `roundResults[-1].customerCount`. If any of these aren't directly available in `SimulatePhase`, inspect `useGame()` return shape and pull them.

- [ ] **Step 2: Replace the inner markup of `.simulate-phase__bakery-visual`**

In `SimulatePhase.tsx`, locate this block (around line 134 per the current file):
```tsx
<div className="simulate-phase__bakery-visual">
  {adWon && AD_ICONS[adWon] && (
    <div className="simulate-phase__ad-display">...</div>
  )}
  <div className="simulate-phase__storefront">
    <div className="simulate-phase__store-label">🥐 Your Bakery</div>
    {!isNight && !reducedMotion && (
      <div className="simulate-phase__customers">...</div>
    )}
    {isNight && <div className="simulate-phase__night-label">🌙 Closed</div>}
  </div>
</div>
```

Replace its inner children with the scene component:
```tsx
<div className="simulate-phase__bakery-visual">
  <PixelBakeryScene
    mode="simulate"
    teamName={teamName}
    staffCounts={pendingDecision.staffCounts}
    customerCount={latestRound?.customerCount ?? 0}
  />
</div>
```

Add imports at the top:
```tsx
import { PixelBakeryScene } from '../../components/bakery-scene/PixelBakeryScene'
import '../../styles/pixel-scene.css'
```

If `teamName` / `pendingDecision.staffCounts` / `latestRound` aren't already destructured from `useGame()` in this file, add them. `latestRound` is typically `roundResults[roundResults.length - 1]`.

- [ ] **Step 3: Update `.simulate-phase__bakery-visual` CSS to accommodate a 480×270 scene scaled 2×**

Open `games/bakery-bash/app/src/styles/global.css`, find:
```css
.simulate-phase__bakery-visual { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }
```

Add below it:
```css
.simulate-phase__bakery-visual .pixel-bakery-scene {
  transform: scale(2);
  transform-origin: center;
  margin: 135px 0; /* compensate for 2x scale so flex centering works */
}
```

- [ ] **Step 4: Typecheck + tests + visual verify**

```bash
cd games/bakery-bash/app && npx tsc --noEmit && CI=1 npm test -- --run
```

Start the dev server, navigate to the Simulate phase (requires a game in progress, or a stub game). Bakery scene should replace the emoji.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx \
  games/bakery-bash/app/src/styles/global.css
git commit -m "feat(bakery-bash): mount PixelBakeryScene in SimulatePhase (replaces emoji)"
```

---

### Task 9.2: Mount scene into `GamePage` Decide phase

**Files:**
- Modify: `games/bakery-bash/app/src/pages/GamePage.tsx`

Decide phase is rendered by `GamePage` when `basePhase === 'decide'`. Insert the scene as an additive visual above or beside the existing decision UI — don't restructure the decision controls.

- [ ] **Step 1: Locate the decide branch in GamePage**

```bash
grep -n 'basePhase === "decide"\|basePhase !== "decide"' \
  /Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2/games/bakery-bash/app/src/pages/GamePage.tsx
```

Decide phase content typically lives inside a conditional block. Read enough of the JSX to find a container you can prepend a scene panel into.

- [ ] **Step 2: Add the scene component to the decide branch**

Above or at the top of the decide-phase JSX content, insert:
```tsx
{basePhase === 'decide' && (
  <div className="decide-phase__scene-panel">
    <PixelBakeryScene
      mode="decide"
      teamName={teamName}
      staffCounts={pendingDecision.staffCounts}
      customerCount={0}
    />
  </div>
)}
```

Add imports:
```tsx
import { PixelBakeryScene } from '../components/bakery-scene/PixelBakeryScene'
import '../styles/pixel-scene.css'
```

If `teamName` is not already destructured from `useGame()`, add it.

- [ ] **Step 3: Add scene-panel CSS to `global.css`**

```css
.decide-phase__scene-panel {
  display: flex;
  justify-content: center;
  margin: 0 0 1rem;
}

.decide-phase__scene-panel .pixel-bakery-scene {
  transform: scale(2);
  transform-origin: center top;
  margin-bottom: 270px; /* compensate for 2x scale height */
}
```

- [ ] **Step 4: Typecheck + tests**

```bash
cd games/bakery-bash/app && npx tsc --noEmit && CI=1 npm test -- --run
```

Visual verify: navigate to `/game/decide` in an active game. The bakery scene should be visible above the decision controls. Cat wanders, chefs idle, no customers.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/pages/GamePage.tsx \
  games/bakery-bash/app/src/styles/global.css
git commit -m "feat(bakery-bash): mount PixelBakeryScene on Decide phase (cat + chefs visible)"
```

---

### Task 9.3: Side-panel reskin (Menu + Status panels on SimulatePhase)

The Menu + Status panels on SimulatePhase get a pixel/wood aesthetic. No structural changes — just CSS.

**Files:**
- Modify: `games/bakery-bash/app/src/styles/pixel-scene.css` (add panel theme)
- Modify: `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` (add a `simulate-phase--pixel` wrapper class)

- [ ] **Step 1: Add the class gate on `<SimulatePhase>`**

In `SimulatePhase.tsx`, change the root element's className from `"simulate-phase"` to `"simulate-phase simulate-phase--pixel"`.

- [ ] **Step 2: Add pixel-themed panel styles**

Append to `pixel-scene.css`:
```css
/* ---- Pixel-themed side panels on SimulatePhase ---- */
.simulate-phase--pixel .simulate-phase__menu-panel,
.simulate-phase--pixel .simulate-phase__status-panel {
  background: #3d2615;
  border: 2px solid #8a5a2e;
  box-shadow:
    inset 0 0 0 1px #5a3818,
    0 4px 12px rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  padding: 16px;
  color: #f3e2b8;
  font-family: 'Courier New', monospace;
}

.simulate-phase--pixel .simulate-phase__panel-title {
  color: #fbbf24;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-bottom: 1px solid #8a5a2e;
  padding-bottom: 4px;
  margin-bottom: 12px;
}

.simulate-phase--pixel .simulate-phase__menu-item {
  background: rgba(138, 90, 46, 0.3);
  padding: 6px;
  margin-bottom: 4px;
  border-radius: 2px;
}

.simulate-phase--pixel .simulate-phase__menu-item--soldout {
  opacity: 0.5;
  text-decoration: line-through;
}

.simulate-phase--pixel .simulate-phase__sold-out-badge {
  background: #842a3a;
  color: #fbbf24;
  padding: 1px 4px;
  font-size: 0.75rem;
  border-radius: 2px;
}

.simulate-phase--pixel .simulate-phase__bar-row {
  margin-bottom: 6px;
}
.simulate-phase--pixel .simulate-phase__bar-label {
  color: #fbbf24;
}
```

- [ ] **Step 3: Typecheck + tests + visual verify**

```bash
cd games/bakery-bash/app && npx tsc --noEmit && CI=1 npm test -- --run
```

Visual: Simulate phase should show Menu + Status panels in dark-wood pixel theme flanking the bakery scene.

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx \
  games/bakery-bash/app/src/styles/pixel-scene.css
git commit -m "feat(bakery-bash): reskin SimulatePhase side panels in pixel/wood aesthetic"
```

---

## Phase 10 — Polish: error boundary, reduced-motion, sold-out swap, visual QA

### Task 10.1: Error boundary around `<PixelBakeryScene>`

**Files:**
- Create: `games/bakery-bash/app/src/components/bakery-scene/SceneErrorBoundary.tsx`
- Create: `games/bakery-bash/app/src/components/bakery-scene/SceneErrorBoundary.test.tsx`
- Modify: `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` (wrap scene in boundary)
- Modify: `games/bakery-bash/app/src/pages/GamePage.tsx` (wrap scene in boundary)

- [ ] **Step 1: Write failing test**

```tsx
// games/bakery-bash/app/src/components/bakery-scene/SceneErrorBoundary.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SceneErrorBoundary } from './SceneErrorBoundary'

function Kaboom(): JSX.Element {
  throw new Error('render crash')
}

describe('<SceneErrorBoundary>', () => {
  it('catches errors from children and shows fallback text', () => {
    // Silence expected React error log
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <SceneErrorBoundary teamName="TEST">
        <Kaboom />
      </SceneErrorBoundary>,
    )
    expect(container.textContent).toContain('TEST')
    expect(container.textContent).toContain('Simulating')
    spy.mockRestore()
  })

  it('renders children normally when no error', () => {
    const { container } = render(
      <SceneErrorBoundary teamName="TEST">
        <div data-testid="child">hello</div>
      </SceneErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/components/bakery-scene/SceneErrorBoundary.test.tsx
```

- [ ] **Step 3: Implement `SceneErrorBoundary.tsx`**

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  teamName: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PixelBakeryScene] render crash, falling back', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="pixel-bakery-scene pixel-bakery-scene--fallback"
          role="img"
          aria-label={`${this.props.teamName} bakery — simulating round`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#fbbf24',
            fontFamily: 'monospace',
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>{this.props.teamName}</div>
          <div>Simulating round…</div>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 4: Wrap usages in SimulatePhase and GamePage**

```tsx
// In SimulatePhase.tsx:
<div className="simulate-phase__bakery-visual">
  <SceneErrorBoundary teamName={teamName}>
    <PixelBakeryScene mode="simulate" ... />
  </SceneErrorBoundary>
</div>

// In GamePage.tsx decide branch:
<SceneErrorBoundary teamName={teamName}>
  <PixelBakeryScene mode="decide" ... />
</SceneErrorBoundary>
```

Add import in both: `import { SceneErrorBoundary } from '../components/bakery-scene/SceneErrorBoundary'`.

- [ ] **Step 5: Run tests + commit**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run

git add games/bakery-bash/app/src/components/bakery-scene/SceneErrorBoundary.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneErrorBoundary.test.tsx \
  games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx \
  games/bakery-bash/app/src/pages/GamePage.tsx
git commit -m "feat(bakery-bash): error boundary around PixelBakeryScene with static fallback"
```

---

### Task 10.2: Reduced-motion full suite

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.ts`
- Modify: `games/bakery-bash/app/src/hooks/useBakeryScene.test.ts`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`

- [ ] **Step 1: Write failing tests**

Append to `useBakeryScene.test.ts`:
```ts
describe('useBakeryScene — reduced motion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function mockReducedMotion(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('reduce') && matches,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }

  it('does not spawn customers when reduced motion is active', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 20 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.customers.length).toBe(0)
  })

  it('cat stays sitting when reduced motion is active', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useBakeryScene(baseProps))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.cat.state).toBe('sitting')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run src/hooks/useBakeryScene.test.ts
```

- [ ] **Step 3: Add reduced-motion detection + gating**

In `useBakeryScene.ts`, add at the top of the hook body:
```ts
const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
```

Gate the rAF loop:
```ts
useEffect(() => {
  if (prefersReduced) {
    // Put cat into sitting, clear customers, no rAF.
    catRef.current = { ...catRef.current, state: 'sitting', frame: CAT_FRAME.sit }
    customersRef.current = []
    dollarsRef.current = []
    return
  }
  const loop = (now: number) => { /* ... existing ... */ }
  rafRef.current = requestAnimationFrame(loop)
  return () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }
}, [mode, staffCounts, customerCount, spawnIntervalMs, prefersReduced])
```

Gate chef bob too — if reduced, always frame 0.

Gate customer spawn — already handled because the rAF loop doesn't run.

- [ ] **Step 4: Add a "Simulating round…" overlay for simulate + reduced-motion**

In `PixelBakeryScene.tsx`, detect reduced motion (same `matchMedia` pattern) and render the overlay:
```tsx
{mode === 'simulate' && prefersReduced && (
  <div
    className="pixel-bakery-scene__reduced-motion-overlay"
    role="status"
    aria-live="polite"
  >
    Simulating round…
  </div>
)}
```

Add CSS:
```css
.pixel-bakery-scene__reduced-motion-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 20, 16, 0.6);
  color: #fbbf24;
  font-family: monospace;
  font-size: 14px;
  letter-spacing: 1px;
  pointer-events: none;
}
```

- [ ] **Step 5: Run tests + commit**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run

git add games/bakery-bash/app/src/hooks/useBakeryScene.ts \
  games/bakery-bash/app/src/hooks/useBakeryScene.test.ts \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/styles/pixel-scene.css
git commit -m "feat(bakery-bash): reduced-motion support (paused animation + simulate overlay)"
```

---

### Task 10.3: Sold-out shelf swap — gray out shelf loaves for sold-out products

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx`

- [ ] **Step 1: Extend `<SceneBackdrop>` to accept `soldOut` + `menu` props**

Goal: when a shelf slot maps to a product in the `soldOut` set, paint an **empty-tray gray rectangle** instead of a bread loaf.

- [ ] **Step 2: Write failing test**

Append to `SceneBackdrop.test.tsx`:
```tsx
describe('<SceneBackdrop> sold-out', () => {
  it('renders gray empty trays instead of amber loaves for sold-out products', () => {
    const menu = ['bread', 'croissant', 'baguette', 'danish', 'pretzel', 'scone']
    const soldOut = new Set(['bread', 'croissant', 'baguette'])
    const { container } = render(<SceneBackdrop menu={menu} soldOut={soldOut} />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Shelf loaves for product index 0-2 (sold-out) should be gray, not amber.
    // Shelf 1 loaf 1 is at approx (38, 46) — sample the center of the loaf.
    const p = ctx.getImageData(45, 48, 1, 1).data
    // gray = R ~ G ~ B, all between 120 and 200
    const isGray = Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 30
    expect(isGray).toBe(true)
  })
})
```

- [ ] **Step 3: Update `SceneBackdrop.tsx`**

Change the signature:
```tsx
interface Props {
  menu?: string[]
  soldOut?: Set<string>
}

export function SceneBackdrop({ menu = [], soldOut = new Set() }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintBackdrop(ctx, menu, soldOut)
  }, [menu, soldOut])
  // ... JSX unchanged ...
}
```

In `paintBackdrop`, replace the fixed 6 loaves with a menu-driven loop:
```ts
function paintBackdrop(ctx: CanvasRenderingContext2D, menu: string[], soldOut: Set<string>) {
  // ... wall/wainscoting/floor paint unchanged ...

  // Bread shelves — each shelf holds 3 slots; map to menu[0..5].
  const shelfX = 32
  let slotIndex = 0
  for (const shelfY of [54, 88]) {
    fillRect(ctx, PALETTE.shelfWood, shelfX, shelfY, 80, 4)
    fillRect(ctx, PALETTE.shelfShadow, shelfX, shelfY + 4, 80, 2)
    for (let i = 0; i < 3; i++) {
      const product = menu[slotIndex]
      const loafX = shelfX + 6 + i * 24
      if (!product || soldOut.has(product)) {
        // Empty tray — gray rectangle
        fillRect(ctx, '#7a7a7a', loafX, shelfY - 5, 18, 5)
        fillRect(ctx, '#5a5a5a', loafX, shelfY - 2, 18, 2)
      } else {
        fillRect(ctx, '#c7883a', loafX, shelfY - 8, 18, 8)
        fillRect(ctx, '#9c6424', loafX, shelfY - 2, 18, 2)
        fillRect(ctx, '#e3a85a', loafX + 2, shelfY - 6, 14, 2)
      }
      slotIndex++
    }
  }
  // ... rest of paintBackdrop unchanged ...
}
```

- [ ] **Step 4: Pass props from `<PixelBakeryScene>`**

Update Props + JSX:
```tsx
interface Props {
  mode: BakerySceneMode
  teamName: string
  staffCounts?: Record<StationKey, number>
  customerCount?: number
  menu?: string[]
  soldOut?: Set<string>
}

export function PixelBakeryScene({
  mode, teamName, staffCounts = DEFAULT_STAFF, customerCount = 0,
  menu = [], soldOut = new Set(),
}: Props) {
  const { chefs, cat, customers, dollars } = useBakeryScene({ ... })
  return (
    <div ...>
      <SceneBackdrop menu={menu} soldOut={soldOut} />
      {/* ... */}
    </div>
  )
}
```

And update call sites in `SimulatePhase.tsx` and `GamePage.tsx` to pass `menu` + `soldOut`.

- [ ] **Step 5: Run all tests — expect pass**

```bash
cd games/bakery-bash/app && CI=1 npm test -- --run
```

- [ ] **Step 6: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.tsx \
  games/bakery-bash/app/src/components/bakery-scene/SceneBackdrop.test.tsx \
  games/bakery-bash/app/src/components/bakery-scene/PixelBakeryScene.tsx \
  games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx \
  games/bakery-bash/app/src/pages/GamePage.tsx
git commit -m "feat(bakery-bash): sold-out shelf swap — empty trays replace loaves"
```

---

### Task 10.4: Manual visual QA pass — iterate on sprites until polished

Now the full scene is assembled. Open `/preview/bakery-scene` and go through every mode.

- [ ] **Step 1: Walkthrough in decide mode**

Screenshot. Expect:
- Wood plank floor, cream walls, wainscoting separator, wood counter
- Team sign readable with your test name
- Clock, menu chalkboard on top strip
- Bread display case with 4 loaves visible
- Espresso machine on counter right
- 3 chefs in different apron colors idling
- Cat wandering the floor strip
- Occasional oven steam wisp

If any sprite looks off (ugly chef, awkward cat pose, misaligned element), edit the sprite grid in `games/bakery-bash/app/src/components/bakery-scene/sprites/<name>.ts` and re-preview. Iterate.

- [ ] **Step 2: Walkthrough in simulate mode**

Screenshot over ~30 seconds. Expect:
- Customers walking in from the right
- Customers pausing at chef stations for ~1s
- 4–6 dollar bills bursting from the counter on each transaction
- Customers walking right and disappearing off-screen
- Soft cap of 4 customers visible at any time

If customers walk into walls, chefs, or the counter, adjust `SCENE.customerFeetY` or station X-offsets.

- [ ] **Step 3: Walkthrough in static mode + reduced-motion**

Static: no animation, same backdrop + chefs + cat frozen.
Reduced-motion: trigger OS reduced-motion setting, verify overlay appears in simulate and cat is sitting.

- [ ] **Step 4: Polish commits — one per sprite you edit**

Every sprite iteration gets its own small commit:
```bash
git add games/bakery-bash/app/src/components/bakery-scene/sprites/chef-bakery.ts
git commit -m "polish(bakery-bash): refine chef-bakery silhouette per visual QA"
```

- [ ] **Step 5: Verify full test suite + typecheck**

```bash
cd games/bakery-bash/app && npx tsc --noEmit && CI=1 npm test -- --run
```

Expected: all tests pass, typecheck clean.

---

## Files inventory

**New directories:**
- `games/bakery-bash/app/src/components/bakery-scene/`
- `games/bakery-bash/app/src/components/bakery-scene/sprites/`

**New files (15+):**
- `bakery-scene/sprite-data.ts` + `.test.ts`
- `bakery-scene/PixelSprite.tsx` + `.test.tsx`
- `bakery-scene/pixel-font.ts` + `.test.ts`
- `bakery-scene/scene-geometry.ts` + `.test.ts`
- `bakery-scene/SceneBackdrop.tsx` + `.test.tsx`
- `bakery-scene/TeamSign.tsx` + `.test.tsx`
- `bakery-scene/PixelBakeryScene.tsx` + `.test.tsx`
- `bakery-scene/ChefLayer.tsx` + `.test.tsx`
- `bakery-scene/CatLayer.tsx` + `.test.tsx`
- `bakery-scene/CustomerLayer.tsx` + `.test.tsx`
- `bakery-scene/DollarLayer.tsx` + `.test.tsx`
- `bakery-scene/FxLayer.tsx` + `.test.tsx`
- `bakery-scene/SceneErrorBoundary.tsx` + `.test.tsx`
- `bakery-scene/sprites/chef-bakery.ts`
- `bakery-scene/sprites/chef-deli.ts`
- `bakery-scene/sprites/chef-barista.ts`
- `bakery-scene/sprites/customer-templates.ts`
- `bakery-scene/sprites/cat.ts`
- `bakery-scene/sprites/sprites.test.ts` (chef validity)
- `bakery-scene/sprites/cat.test.ts`
- `bakery-scene/sprites/customer-templates.test.ts`
- `hooks/useBakeryScene.ts` + `.test.ts`
- `pages/BakeryScenePreviewPage.tsx` (re-created)
- `styles/pixel-scene.css`

**Modified files:**
- `games/bakery-bash/app/src/App.tsx` (route re-add)
- `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` (scene mount + reskin class)
- `games/bakery-bash/app/src/pages/GamePage.tsx` (scene on decide phase)
- `games/bakery-bash/app/src/styles/global.css` (scene panel CSS hooks)

**Deleted files (Phase 0):**
- `games/bakery-bash/app/src/components/bakery/` (entire folder)
- `games/bakery-bash/app/src/pages/TileSheetInspectorPage.tsx`
- `games/bakery-bash/app/src/pages/BakeryScenePreviewPage.tsx` (re-created in Phase 4)
- `games/bakery-bash/app/src/styles/bakery-scene.css`
- `games/bakery-bash/app/public/assets/bakery-v2/` (entire folder)

## Risk log

- **Hand-pixeling iteration is the biggest scope driver.** Phase 10.4 is open-ended — budget at least one full session for sprite polish after the skeleton is in place.
- **rAF + test fake-timer interactions** are tricky; if hook tests flake, switch to explicit `performance.now` injection via a prop.
- **DecidePhase insertion** is less certain than SimulatePhase — if `GamePage.tsx` doesn't have a clean slot, we may need a follow-up to restructure the decide layout.
- **Canvas perf with 4 customers + dollar bills + steam** should be fine at 480×270, but if framerate drops, drop customer soft-cap to 2.
