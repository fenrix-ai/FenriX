import { useEffect, useRef } from 'react'
import { SCENE } from './scene-geometry'
import { PALETTE } from './scene-palette'

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
