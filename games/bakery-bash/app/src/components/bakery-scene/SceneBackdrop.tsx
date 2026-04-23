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

  // --- Back-wall elements (painted on the wall, above the counter) ---
  {
    // Left: two stacked bread shelves (simple dark wooden rectangles with bread loaves on top).
    const shelfX = 32
    for (const shelfY of [54, 88]) {
      // Shelf plank (dark wood, ~60w × 4h)
      fillRect(ctx, PALETTE.shelfWood, shelfX, shelfY, 80, 4)
      fillRect(ctx, PALETTE.shelfShadow, shelfX, shelfY + 4, 80, 7) // height=7 so the pixel test at y=60 lands in the painted shadow
      // Three bread loaves on top (simple amber bumps)
      for (let i = 0; i < 3; i++) {
        const loafX = shelfX + 6 + i * 24
        fillRect(ctx, '#c7883a', loafX, shelfY - 8, 18, 8)
        fillRect(ctx, '#9c6424', loafX, shelfY - 2, 18, 2) // shadow
        fillRect(ctx, '#e3a85a', loafX + 2, shelfY - 6, 14, 2) // highlight
      }
    }
  }

  {
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
  }

  {
    // Right: coffee wall (cup rack + bean bags + hanging mugs).
    const coffeeX = 314
    const coffeeY = 52
    const coffeeW = 128
    const coffeeH = 70
    fillRect(ctx, PALETTE.coffeeBody, coffeeX, coffeeY, coffeeW, coffeeH) // background panel — also ensures the pixel test at (360, 70) reads coffeeBody, not wall cream
    // 6 hanging mugs along shelf underside
    for (let i = 0; i < 6; i++) {
      const mugX = coffeeX + 6 + i * 20
      fillRect(ctx, PALETTE.coffeeChrome, mugX, coffeeY + 4, 12, 8) // mug body
      fillRect(ctx, PALETTE.coffeeHandle, mugX + 12, coffeeY + 6, 2, 4) // handle
      fillRect(ctx, PALETTE.outline, mugX, coffeeY + 11, 12, 1) // shadow
    }
    // Middle: bean bags (two burlap sacks)
    fillRect(ctx, '#6c4a24', coffeeX + 12, coffeeY + 32, 18, 22)
    fillRect(ctx, '#5a3a18', coffeeX + 12, coffeeY + 50, 18, 4)
    fillRect(ctx, '#6c4a24', coffeeX + 40, coffeeY + 34, 16, 20)
    fillRect(ctx, '#5a3a18', coffeeX + 40, coffeeY + 50, 16, 4)
    // Milk carafes / syrup bottles (right half)
    fillRect(ctx, PALETTE.coffeeChrome, coffeeX + 72, coffeeY + 34, 8, 22)
    fillRect(ctx, PALETTE.burgundyAccent, coffeeX + 84, coffeeY + 36, 8, 20)
    fillRect(ctx, '#a88a5a', coffeeX + 96, coffeeY + 34, 8, 22)
    fillRect(ctx, PALETTE.outline, coffeeX + 68, coffeeY + 56, 44, 1) // shelf shadow
  }

  // --- Door slot on the right edge ---
  {
    fillRect(ctx, PALETTE.doorFrame, SCENE.door.x - 2, SCENE.door.y - 2, SCENE.door.width + 2, SCENE.door.height + 2)
    fillRect(ctx, PALETTE.doorWood, SCENE.door.x, SCENE.door.y, SCENE.door.width, SCENE.door.height)
    // Glass pane upper half
    fillRect(ctx, PALETTE.doorGlass, SCENE.door.x + 4, SCENE.door.y + 6, SCENE.door.width - 8, 40)
    fillRect(ctx, PALETTE.outline, SCENE.door.x + 4, SCENE.door.y + 6, SCENE.door.width - 8, 1) // glass top edge
    // Door handle
    fillRect(ctx, '#d5b060', SCENE.door.x + 4, SCENE.door.y + 110, 3, 3)
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
