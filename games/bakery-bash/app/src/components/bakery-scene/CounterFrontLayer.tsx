import { useEffect, useRef } from 'react'
import { SCENE } from './scene-geometry'
import { PALETTE } from './scene-palette'

function fillRect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function paintCounterFront(ctx: CanvasRenderingContext2D) {
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
    // Dark inner workspace panel (under group heads — covers test sample at (340, 135))
    fillRect(ctx, PALETTE.coffeeBody, eX + 8, eY + 10, eW - 16, eH - 14)
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
      fillRect(ctx, PALETTE.counterTop, cupX + 2, eY + eH - 2, 6, 2) // coffee surface (same wood tone as counter top)
    }
  }
}

/**
 * Counter-front canvas — paints the counter band + counter furniture
 * (bread display case + espresso machine) on its own layer so it can
 * render on top of the chefs, giving the Undertale-style "standing
 * behind the counter" look.
 */
export function CounterFrontLayer() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintCounterFront(ctx)
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
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}
