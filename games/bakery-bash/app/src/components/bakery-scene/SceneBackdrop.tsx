import { useEffect, useRef } from 'react'
import { SCENE } from './scene-geometry'
import { PALETTE } from './scene-palette'

function fillRect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function paintBackdrop(ctx: CanvasRenderingContext2D, menu: string[], soldOut: Set<string>) {
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
    // Left: two stacked bread shelves. The wooden plank + shadow are painted
    // here; the per-slot bread PNGs land on top via <BreadShelfLayer>. When
    // a slot is sold-out or missing from the menu, we paint the gray empty
    // tray so the fallback shows through the absence of an overlay PNG.
    const shelfX = 32
    let slotIndex = 0
    for (const shelfY of [54, 88]) {
      fillRect(ctx, PALETTE.shelfWood, shelfX, shelfY, 80, 4)
      fillRect(ctx, PALETTE.shelfShadow, shelfX, shelfY + 4, 80, 7) // height=7 so the pixel test at y=60 lands in the painted shadow
      for (let i = 0; i < 3; i++) {
        const product = menu[slotIndex]
        const loafX = shelfX + 6 + i * 24
        if (!product || soldOut.has(product)) {
          fillRect(ctx, '#7a7a7a', loafX, shelfY - 8, 18, 8)
          fillRect(ctx, '#5a5a5a', loafX, shelfY - 2, 18, 2)
        }
        slotIndex++
      }
    }
  }

  {
    // Middle: deck oven sitting inside a built-in wooden cabinet that
    // extends from the back wall all the way down to the counter top,
    // grounding the oven visibly.
    const ovenX = 198
    const ovenY = 50
    const ovenW = 60
    const ovenH = 70

    // --- Wooden cabinet housing (warm wood, extends from top trim to counter) ---
    const cabX = ovenX - 5
    const cabY = ovenY - 5
    const cabW = ovenW + 10
    const cabH = SCENE.zones.counter.y - cabY // reach counter top
    fillRect(ctx, PALETTE.counterTop, cabX, cabY, cabW, cabH) // main cabinet wood
    // Inner shadow on the top + sides (sockets the oven into the cabinet).
    fillRect(ctx, PALETTE.wainscotDark, cabX + 1, cabY + 1, cabW - 2, 1)
    fillRect(ctx, PALETTE.wainscotDark, cabX + 1, cabY + 1, 1, cabH - 2)
    fillRect(ctx, PALETTE.wainscotDark, cabX + cabW - 2, cabY + 1, 1, cabH - 2)
    // Sharp outline around the whole cabinet.
    fillRect(ctx, PALETTE.outline, cabX - 1, cabY - 1, cabW + 2, 1)
    fillRect(ctx, PALETTE.outline, cabX - 1, cabY + cabH, cabW + 2, 1)
    fillRect(ctx, PALETTE.outline, cabX - 1, cabY - 1, 1, cabH + 2)
    fillRect(ctx, PALETTE.outline, cabX + cabW, cabY - 1, 1, cabH + 2)

    // --- Cabinet top-trim mantle (slight overhang above the cabinet) ---
    const trimX = cabX - 3
    const trimY = cabY - 2
    const trimW = cabW + 6
    fillRect(ctx, PALETTE.shelfWood, trimX, trimY, trimW, 2)
    fillRect(ctx, '#a87048', trimX, trimY, trimW, 1) // top highlight
    fillRect(ctx, PALETTE.outline, trimX - 1, trimY - 1, trimW + 2, 1) // outline
    fillRect(ctx, PALETTE.outline, trimX - 1, trimY - 1, 1, 3) // left end
    fillRect(ctx, PALETTE.outline, trimX + trimW, trimY - 1, 1, 3) // right end

    // --- Cabinet drawer face (below the oven, reading as storage) ---
    const drawerY = ovenY + ovenH + 3
    const drawerH = SCENE.zones.counter.y - drawerY - 3
    fillRect(ctx, PALETTE.shelfWood, cabX + 3, drawerY, cabW - 6, drawerH)
    fillRect(ctx, PALETTE.outline, cabX + 3, drawerY, cabW - 6, 1) // top edge
    fillRect(ctx, PALETTE.outline, cabX + 3, drawerY + drawerH - 1, cabW - 6, 1) // bottom edge
    fillRect(ctx, PALETTE.shelfShadow, cabX + 3, drawerY + drawerH - 2, cabW - 6, 1) // subtle under-shade
    // Chrome drawer pull centered on the drawer.
    const pullW = 14
    const pullCX = ovenX + ovenW / 2
    const pullY = drawerY + Math.floor(drawerH / 2) - 1
    fillRect(ctx, PALETTE.ovenChrome, pullCX - pullW / 2, pullY, pullW, 2)
    fillRect(ctx, '#1a1a22', pullCX - pullW / 2, pullY + 2, pullW, 1)

    // Oven body (slight 1px chrome outer highlight on top edge + darker shadow on bottom edge).
    fillRect(ctx, PALETTE.ovenDark, ovenX, ovenY, ovenW, ovenH)
    fillRect(ctx, PALETTE.ovenChrome, ovenX, ovenY, ovenW, 1)
    fillRect(ctx, '#1a1a22', ovenX, ovenY + ovenH - 1, ovenW, 1)

    // Top control panel (y=50..64, 14 high).
    const panelTopY = ovenY + 1
    const panelTopH = 13
    fillRect(ctx, PALETTE.ovenPanel, ovenX + 1, panelTopY, ovenW - 2, panelTopH)
    // Digital temperature display — small dark rectangle with glowing orange digits.
    const dispX = ovenX + 22
    const dispY = panelTopY + 3
    const dispW = 16
    const dispH = 7
    fillRect(ctx, '#0a0a0a', dispX, dispY, dispW, dispH)
    fillRect(ctx, PALETTE.ovenGlow, dispX + 2, dispY + 2, 3, 3) // digit 1 glow
    fillRect(ctx, PALETTE.ovenGlow, dispX + 7, dispY + 2, 3, 3) // digit 2 glow
    fillRect(ctx, PALETTE.ovenGlow, dispX + 12, dispY + 2, 2, 3) // digit 3 glow
    // Two temperature knobs — circle with pointer + tick marks.
    for (const knobCX of [ovenX + 9, ovenX + ovenW - 9]) {
      const knobCY = panelTopY + 6
      // Tick marks: 3 dots around knob
      fillRect(ctx, PALETTE.ovenChrome, knobCX - 4, knobCY - 4, 1, 1)
      fillRect(ctx, PALETTE.ovenChrome, knobCX + 3, knobCY - 4, 1, 1)
      fillRect(ctx, PALETTE.ovenChrome, knobCX - 4, knobCY + 3, 1, 1)
      fillRect(ctx, PALETTE.ovenChrome, knobCX + 3, knobCY + 3, 1, 1)
      // Knob body (5×5 rounded via corner chips)
      fillRect(ctx, PALETTE.ovenKnob, knobCX - 2, knobCY - 2, 5, 5)
      fillRect(ctx, PALETTE.ovenPanel, knobCX - 2, knobCY - 2, 1, 1) // TL corner
      fillRect(ctx, PALETTE.ovenPanel, knobCX + 2, knobCY - 2, 1, 1) // TR
      fillRect(ctx, PALETTE.ovenPanel, knobCX - 2, knobCY + 2, 1, 1) // BL
      fillRect(ctx, PALETTE.ovenPanel, knobCX + 2, knobCY + 2, 1, 1) // BR
      // Pointer (dark line from center up to top edge)
      fillRect(ctx, PALETTE.outline, knobCX, knobCY - 2, 1, 3)
    }

    // Door area (y=64..106, 42 high).
    const doorY = panelTopY + panelTopH + 1
    const doorH = 42
    const doorX = ovenX + 3
    const doorW = ovenW - 6
    // Outer bezel (lighter highlight on top/left, darker on bottom/right)
    fillRect(ctx, PALETTE.ovenChrome, doorX, doorY, doorW, 1)
    fillRect(ctx, PALETTE.ovenChrome, doorX, doorY, 1, doorH)
    fillRect(ctx, '#1a1a22', doorX, doorY + doorH - 1, doorW, 1)
    fillRect(ctx, '#1a1a22', doorX + doorW - 1, doorY, 1, doorH)
    // Inner bezel (darker border just inside the outer bezel)
    fillRect(ctx, PALETTE.ovenPanel, doorX + 1, doorY + 1, doorW - 2, 1)
    fillRect(ctx, PALETTE.ovenPanel, doorX + 1, doorY + 1, 1, doorH - 2)
    fillRect(ctx, PALETTE.ovenPanel, doorX + 1, doorY + doorH - 2, doorW - 2, 1)
    fillRect(ctx, PALETTE.ovenPanel, doorX + doorW - 2, doorY + 1, 1, doorH - 2)
    // Hinges on left side (two small vertical rectangles)
    fillRect(ctx, PALETTE.ovenChrome, doorX - 1, doorY + 4, 2, 4)
    fillRect(ctx, PALETTE.ovenChrome, doorX - 1, doorY + doorH - 8, 2, 4)
    // Glowing window inside the door — outline + three glow gradients.
    const winX = doorX + 4
    const winY = doorY + 4
    const winW = doorW - 8
    const winH = doorH - 10
    fillRect(ctx, PALETTE.outline, winX, winY, winW, winH) // window frame
    fillRect(ctx, '#662222', winX + 1, winY + 1, winW - 2, winH - 2) // deep red-brown
    fillRect(ctx, PALETTE.ovenGlow, winX + 2, winY + 2, winW - 4, winH - 4)
    fillRect(ctx, '#ffcf70', winX + 3, winY + 3, winW - 6, winH - 6) // hot center
    // Oven rack — thin horizontal line across the glow, with two bread silhouettes.
    const rackY = winY + Math.floor(winH / 2)
    fillRect(ctx, PALETTE.outline, winX + 2, rackY, winW - 4, 1)
    // Bread silhouettes on the rack (dark amber lumps).
    fillRect(ctx, '#b86d20', winX + 5, rackY - 4, 7, 4)
    fillRect(ctx, '#7c4614', winX + 5, rackY - 1, 7, 1)
    fillRect(ctx, '#b86d20', winX + winW - 12, rackY - 4, 7, 4)
    fillRect(ctx, '#7c4614', winX + winW - 12, rackY - 1, 7, 1)
    // Door handle — horizontal chrome bar across the bottom of the door.
    const handleY = doorY + doorH - 5
    fillRect(ctx, PALETTE.ovenChrome, doorX + 6, handleY, doorW - 12, 2)
    fillRect(ctx, '#1a1a22', doorX + 6, handleY + 2, doorW - 12, 1) // shadow under handle

    // Bottom control band (y=doorY+doorH+1..ovenY+ovenH-1).
    const panelBotY = doorY + doorH + 1
    const panelBotH = ovenY + ovenH - panelBotY - 1
    fillRect(ctx, PALETTE.ovenPanel, ovenX + 1, panelBotY, ovenW - 2, panelBotH)
    // 3 button circles + 1 LED
    for (let i = 0; i < 3; i++) {
      const btnX = ovenX + 10 + i * 10
      fillRect(ctx, PALETTE.ovenChrome, btnX, panelBotY + 2, 3, 3)
      fillRect(ctx, '#1a1a22', btnX, panelBotY + 5, 3, 1) // shadow
    }
    // Green "ready" LED at the right.
    fillRect(ctx, PALETTE.ovenLED, ovenX + ovenW - 6, panelBotY + 2, 2, 2)
    fillRect(ctx, '#86f5a6', ovenX + ovenW - 6, panelBotY + 2, 1, 1) // bright pixel
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

  // --- Wall mounts (top strip) ---
  {
    // Clock top-left — dark circle with hands.
    const clockX = 22
    const clockY = 15
    fillRect(ctx, PALETTE.outline, clockX - 8, clockY - 8, 16, 16) // outer ring
    fillRect(ctx, '#eee4c8', clockX - 6, clockY - 6, 12, 12) // face
    fillRect(ctx, PALETTE.outline, clockX, clockY, 2, 1) // min hand
    fillRect(ctx, PALETTE.outline, clockX, clockY - 4, 1, 4) // hour hand

    // Sign silhouette — wooden frame with burgundy trim. (Text fills in Phase 3 via <TeamSign>.)
    const { x: sX, y: sY, width: sW, height: sH } = SCENE.signFrame
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
    fillRect(ctx, PALETTE.counterTop, mX - 2, mY - 2, mW + 4, mH + 4) // frame (same wood tone as counter top / door panel)
    fillRect(ctx, '#1f3e36', mX, mY, mW, mH) // chalkboard green-black
    // A couple chalk lines to suggest handwriting (horizontal dashes)
    fillRect(ctx, '#d7d2b2', mX + 4, mY + 5, 18, 1)
    fillRect(ctx, '#d7d2b2', mX + 4, mY + 10, 30, 1)
    fillRect(ctx, '#d7d2b2', mX + 4, mY + 15, 22, 1)
  }
}

interface Props {
  menu?: string[]
  soldOut?: Set<string>
}

// Stable empty defaults — inline `[]`/`new Set()` defaults would allocate a
// fresh reference on every render, invalidating the useEffect deps below
// and triggering a full canvas repaint at rAF frequency.
const EMPTY_MENU: string[] = []
const EMPTY_SOLD_OUT: Set<string> = new Set()

/**
 * The static back-wall + floor canvas. Heavy-weight draw happens once on
 * mount; props in later tasks (menu, soldOut) will cause re-paints only
 * when those values change.
 */
export function SceneBackdrop({ menu = EMPTY_MENU, soldOut = EMPTY_SOLD_OUT }: Props = {}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintBackdrop(ctx, menu, soldOut)
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
      }}
      aria-hidden
    />
  )
}
