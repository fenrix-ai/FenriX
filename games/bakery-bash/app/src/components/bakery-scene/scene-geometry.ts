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

  /** Team-sign frame — position + size of the wooden sign on the back wall. */
  signFrame: {
    x: 180,
    y: 4,
    width: 120,
    height: 22,
  },

  /** Chef station X centers (mid of chef sprite). Stations stay left of door.
   * Barista is the front-counter service spot (between the display case and
   * the espresso machine) and is the default visible character when no
   * explicit staffCounts are passed. */
  stations: {
    bakery: 90,
    deli: 220,
    barista: 260,
  },

  /** Y-offset where customers walk (slightly above floor top for feet). */
  customerFeetY: 262,
  /** Chef sprite top-edge Y. Positioned so the counter front (y=140..180)
   * overlaps the chef's lower 16 rows, hiding pants + shoes so only
   * hat + face + apron show above the counter line. */
  chefTopY: 116,
} as const

export type StationKey = 'bakery' | 'deli' | 'barista'
