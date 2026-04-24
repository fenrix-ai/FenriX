import { useEffect, useRef } from 'react'
import { SCENE } from './scene-geometry'
import { PALETTE } from './scene-palette'

function fillRect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function paintCounterFront(ctx: CanvasRenderingContext2D, menu: string[], soldOut: Set<string>) {
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

  // --- Counter furniture (sits on top of the counter) ---
  {
    // Bread display case (left third of counter) — glass case; hero loaves
    // are painted as PNG overlays by <BreadShelfLayer>. Sold-out / missing
    // slots get a gray tray so the slot never reads as empty glass.
    const dcX = 30
    const dcY = 122
    const dcW = 150
    const dcH = 20
    fillRect(ctx, PALETTE.outline, dcX, dcY, dcW, dcH) // case outline
    fillRect(ctx, '#d4e8ea', dcX + 1, dcY + 1, dcW - 2, dcH - 2) // glass interior
    for (let i = 0; i < 4; i++) {
      const product = menu[i]
      if (!product || soldOut.has(product)) {
        const slotX = dcX + 6 + i * 36
        fillRect(ctx, '#7a7a7a', slotX, dcY + 8, 30, 8)
        fillRect(ctx, '#5a5a5a', slotX, dcY + 14, 30, 2)
      }
    }
    // Case front frame (bottom edge meets counter top).
    fillRect(ctx, PALETTE.shelfWood, dcX, dcY + dcH, dcW, 2)

    // Espresso machine (right third of counter) — 2-group commercial rig
    // with pressure gauge, brand plate, grouphead portafilters, drip tray,
    // water reservoir, and steam wand.
    const eX = 320
    const eY = 118
    const eW = 70
    const eH = 24
    // Main chrome body.
    fillRect(ctx, PALETTE.coffeeChrome, eX, eY, eW, eH)
    // Frame outline.
    fillRect(ctx, PALETTE.outline, eX, eY, eW, 1)
    fillRect(ctx, PALETTE.outline, eX, eY + eH - 1, eW, 1)
    fillRect(ctx, PALETTE.outline, eX, eY, 1, eH)
    fillRect(ctx, PALETTE.outline, eX + eW - 1, eY, 1, eH)
    // Top chrome highlight (1-px lighter band just under the frame).
    fillRect(ctx, '#f2f2f8', eX + 1, eY + 1, eW - 2, 1)
    // Bottom chrome shadow (1-px darker band just above the frame).
    fillRect(ctx, '#9c9cac', eX + 1, eY + eH - 2, eW - 2, 1)

    // Pressure gauge — small circle top-left with a needle.
    const pgCX = eX + 6
    const pgCY = eY + 4
    fillRect(ctx, PALETTE.outline, pgCX - 2, pgCY - 2, 5, 5) // outline square → reads as circle at pixel scale
    fillRect(ctx, '#efe4c8', pgCX - 1, pgCY - 1, 3, 3)       // off-white dial face
    fillRect(ctx, PALETTE.outline, pgCX, pgCY - 1, 1, 2)     // needle

    // Branding plate — small dark rectangle on the front (where a logo sits).
    fillRect(ctx, PALETTE.outline, eX + 16, eY + 2, 22, 5)
    fillRect(ctx, '#3a2415', eX + 17, eY + 3, 20, 3) // warm dark brown "plaque"
    fillRect(ctx, '#d4b060', eX + 23, eY + 4, 8, 1)  // tiny gold "wordmark" stripe

    // Power LED — green dot right of the brand plate.
    fillRect(ctx, PALETTE.outline, eX + 41, eY + 3, 3, 3)
    fillRect(ctx, '#4ade80', eX + 42, eY + 4, 1, 1) // bright green
    fillRect(ctx, '#86f5a6', eX + 42, eY + 4, 1, 1) // core highlight (same size; overlays above)

    // Water reservoir — rectangular panel on the right side with water level line.
    const resX = eX + 48
    const resY = eY + 2
    const resW = 14
    const resH = 6
    fillRect(ctx, PALETTE.outline, resX, resY, resW, resH)
    fillRect(ctx, '#a7d8e8', resX + 1, resY + 1, resW - 2, resH - 2) // light blue glass
    fillRect(ctx, '#5b8fa8', resX + 1, resY + 3, resW - 2, 1)        // water level line
    fillRect(ctx, '#3d6275', resX + 1, resY + 4, resW - 2, 1)        // water body

    // Dark inner workspace panel (group-head area — also covers the sampled pixel (340,135) to keep that test green).
    const panelX = eX + 3
    const panelY = eY + 8
    const panelW = 44
    const panelH = 10
    fillRect(ctx, PALETTE.coffeeBody, panelX, panelY, panelW, panelH)
    fillRect(ctx, PALETTE.outline, panelX, panelY, panelW, 1) // top shadow

    // Two groupheads (dark circles) with silver rings + portafilter handles.
    for (const ghCX of [eX + 14, eX + 34]) {
      const ghCY = panelY + 5
      // Silver ring (4×4 base)
      fillRect(ctx, PALETTE.coffeeChrome, ghCX - 3, ghCY - 3, 7, 7)
      fillRect(ctx, PALETTE.outline, ghCX - 2, ghCY - 2, 5, 5)          // dark interior
      fillRect(ctx, '#120a08', ghCX - 1, ghCY - 1, 3, 3)                // darker core
      // Portafilter handle — diagonal wood-colored bar hanging down-right from the grouphead.
      fillRect(ctx, '#3a2415', ghCX + 3, ghCY + 3, 2, 2)                // metal collar
      fillRect(ctx, '#7a4c28', ghCX + 4, ghCY + 4, 3, 2)                // wooden handle
      fillRect(ctx, '#4a2814', ghCX + 4, ghCY + 5, 3, 1)                // handle shadow
    }

    // Drip tray — dark strip below the groupheads with grate dots.
    const trayX = panelX
    const trayY = panelY + panelH
    const trayW = panelW
    const trayH = 4
    fillRect(ctx, PALETTE.coffeeHandle, trayX, trayY, trayW, trayH)
    for (let i = 0; i < 8; i++) {
      // 1-px grate dots along the tray
      fillRect(ctx, '#5c5048', trayX + 2 + i * 5, trayY + 1, 1, 1)
    }
    fillRect(ctx, PALETTE.outline, trayX, trayY + trayH - 1, trayW, 1) // tray lip

    // Steam wand — thin vertical pipe on the right with a wider nozzle tip.
    const swX = eX + 64
    fillRect(ctx, PALETTE.outline, swX, eY + 3, 2, 2)            // valve knob base
    fillRect(ctx, PALETTE.coffeeChrome, swX + 2, eY + 3, 2, 2)   // valve handle (chrome)
    fillRect(ctx, PALETTE.outline, swX + 1, eY + 5, 1, 14)       // thin pipe
    fillRect(ctx, PALETTE.outline, swX, eY + eH - 5, 3, 3)       // nozzle tip (wider)
    fillRect(ctx, '#d2d2de', swX + 1, eY + eH - 4, 1, 1)         // nozzle highlight

    // Cup stacks on top (refined shading) — 3 small cups with rim highlights.
    for (let i = 0; i < 3; i++) {
      const cupX = eX + 10 + i * 20
      fillRect(ctx, PALETTE.coffeeChrome, cupX, eY + eH, 10, 4)            // cup body
      fillRect(ctx, '#f2f2f8', cupX + 1, eY + eH, 8, 1)                    // rim highlight
      fillRect(ctx, PALETTE.counterTop, cupX + 2, eY + eH - 2, 6, 2)       // coffee surface
      fillRect(ctx, '#8c5c2e', cupX + 3, eY + eH - 1, 4, 1)                // crema ring
      fillRect(ctx, '#6a4220', cupX + 9, eY + eH + 1, 1, 2)                // side shadow
    }
  }
}

interface Props {
  menu?: string[]
  soldOut?: Set<string>
}

// Stable empty defaults (same pattern as SceneBackdrop) — an inline `[]` /
// `new Set()` default allocates a new reference every render, which would
// invalidate the useEffect deps below and repaint at rAF frequency.
const EMPTY_MENU: string[] = []
const EMPTY_SOLD_OUT: Set<string> = new Set()

/**
 * Counter-front canvas — counter band + counter furniture (bread display
 * case + espresso machine). Renders on top of the chef layer so chefs
 * appear to stand behind the counter.
 */
export function CounterFrontLayer({ menu = EMPTY_MENU, soldOut = EMPTY_SOLD_OUT }: Props = {}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintCounterFront(ctx, menu, soldOut)
  }, [menu, soldOut])

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
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}
