/**
 * Maps menu product slugs to the filename of the bread PNG in
 * /public/assets/pixel-scene/bread/. Drawn from the 14 extracted
 * Freepik items (see docs/superpowers/plans/assets/2026-04-24-bakery-scene-art).
 *
 * Non-bakery drink products (coffee, matcha) fall back to a visually
 * plausible bakery item so the shelf slot is never empty for an active
 * menu entry — the shelf is themed as a bakery display, not a drinks menu.
 */
const MAP: Readonly<Record<string, string>> = {
  // Canonical PRODUCTS from SimulatePhase
  croissant: 'croissant.png',
  cookie: 'biscuits.png',
  bagel: 'bagel.png',
  sandwich: 'sliced-bread.png',
  coffee: 'muffin.png',
  matcha: 'loaf-white.png',
  // Generic bakery aliases used by tests + future menus
  bread: 'loaf-white.png',
  baguette: 'loaf-golden.png',
  danish: 'muffin.png',
  pretzel: 'pretzel.png',
  scone: 'biscuits.png',
  muffin: 'muffin.png',
  cheese: 'cheese-wedge.png',
}

const FALLBACK = 'loaf-white.png'

/** Returns the PNG filename for a product slug, or the generic fallback. */
export function breadPngFor(product: string): string {
  return MAP[product] ?? FALLBACK
}

export const BREAD_PNG_BASE = '/assets/pixel-scene/bread'
