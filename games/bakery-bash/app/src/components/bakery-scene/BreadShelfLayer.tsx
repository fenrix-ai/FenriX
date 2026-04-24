import { breadPngFor, BREAD_PNG_BASE } from './bread-png-map'

/**
 * Per-slot geometry for the 6 back-wall shelf loaves + 4 front-counter
 * display-case hero loaves. Coordinates are the top-left of the slot's
 * bounding box in scene-native pixels.
 */
const SHELF_SLOTS: { menuIndex: number; x: number; y: number; w: number; h: number }[] = (() => {
  const out: { menuIndex: number; x: number; y: number; w: number; h: number }[] = []
  const shelfX = 32
  let slotIndex = 0
  for (const shelfY of [54, 88]) {
    for (let i = 0; i < 3; i++) {
      const loafX = shelfX + 6 + i * 24
      // Bread sits on top of the plank; slot is above the plank's top edge.
      out.push({ menuIndex: slotIndex, x: loafX - 2, y: shelfY - 18, w: 22, h: 18 })
      slotIndex++
    }
  }
  return out
})()

/** Display case at dcX=30, dcY=122, dcW=150, dcH=20 (see CounterFrontLayer). */
const DISPLAY_CASE_SLOTS: { menuIndex: number; x: number; y: number; w: number; h: number }[] = (() => {
  const out: { menuIndex: number; x: number; y: number; w: number; h: number }[] = []
  const dcX = 30
  const dcY = 122
  for (let i = 0; i < 4; i++) {
    const slotX = dcX + 6 + i * 36
    out.push({ menuIndex: i, x: slotX, y: dcY + 2, w: 30, h: 16 })
  }
  return out
})()

interface Props {
  menu: string[]
  soldOut: Set<string>
}

/**
 * PNG overlay layer for the bread shelves + display-case hero loaves.
 *
 * Renders one `<img>` per active menu slot. Sold-out and undefined slots
 * render nothing — the backdrop / counter-front layer paints a gray tray
 * underneath in those cases.
 */
export function BreadShelfLayer({ menu, soldOut }: Props) {
  const slots = [
    ...SHELF_SLOTS.map((s) => ({ ...s, key: `shelf-${s.menuIndex}` })),
    ...DISPLAY_CASE_SLOTS.map((s) => ({ ...s, key: `case-${s.menuIndex}` })),
  ]
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {slots.map(({ key, menuIndex, x, y, w, h }) => {
        const product = menu[menuIndex]
        if (!product) return null
        if (soldOut.has(product)) return null
        const src = `${BREAD_PNG_BASE}/${breadPngFor(product)}`
        return (
          <img
            key={key}
            data-testid={`bread-slot-${key}`}
            data-product={product}
            src={src}
            alt=""
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: `${y}px`,
              width: `${w}px`,
              height: `${h}px`,
              objectFit: 'contain',
              objectPosition: 'bottom',
              imageRendering: 'pixelated',
            }}
          />
        )
      })}
    </div>
  )
}

