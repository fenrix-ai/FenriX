import type { CSSProperties } from 'react'

export type TileSheet = 'modern-houses' | 'rpg-urban' | 'tiny-town' | 'tiny-dungeon'

export interface TileSpec {
  sheet: TileSheet
  col: number
  row: number
}

/**
 * Coordinates here are tile-grid positions on the packed Kenney / OGA
 * spritesheets under public/assets/bakery-v2/tiles. Each source tile is
 * 16×16 native pixels; consumers scale via `tilePx` at render time.
 *
 * Coordinates were discovered by pixel-sampling each sheet in the browser
 * and visually auditing candidate tiles via `/preview/tile-inspector`.
 * See TILE_AUDIT.md for the full inventory.
 */
export const TILE_REGISTRY = {
  // All floor + furniture sourced from Kenney RPG Urban Pack (27×18 tiles).
  // Wall band is drawn in CSS — rpg-urban doesn't have clean standalone
  // wall tiles (walls are baked into pre-composed room fragments).
  'floor-wood': { sheet: 'rpg-urban', col: 20, row: 6 },
  'floor-wood-alt': { sheet: 'rpg-urban', col: 18, row: 6 },
  // Kitchen row — orange 4-burner stoves live at (0-3, 14).
  'oven-left': { sheet: 'rpg-urban', col: 0, row: 14 },
  'oven-right': { sheet: 'rpg-urban', col: 1, row: 14 },
  'stove-left': { sheet: 'rpg-urban', col: 2, row: 14 },
  'stove-right': { sheet: 'rpg-urban', col: 3, row: 14 },
  // Wooden display counter (café table with items).
  'counter-top': { sheet: 'rpg-urban', col: 3, row: 10 },
  'counter-bot': { sheet: 'rpg-urban', col: 3, row: 11 },
  // Wooden front door — 2-tile tall composition.
  'door-top': { sheet: 'rpg-urban', col: 13, row: 10 },
  'door-bot': { sheet: 'rpg-urban', col: 13, row: 11 },
  // Framed window — 2-tile tall composition.
  'window-top': { sheet: 'rpg-urban', col: 11, row: 12 },
  'window-bot': { sheet: 'rpg-urban', col: 11, row: 13 },
  // Trees visible through the bakery window — 3-tile tall.
  'tree-green-top': { sheet: 'rpg-urban', col: 16, row: 8 },
  'tree-green-mid': { sheet: 'rpg-urban', col: 16, row: 9 },
  'tree-green-bot': { sheet: 'rpg-urban', col: 16, row: 10 },
  'tree-orange-top': { sheet: 'rpg-urban', col: 16, row: 11 },
  'tree-orange-mid': { sheet: 'rpg-urban', col: 16, row: 12 },
  'tree-orange-bot': { sheet: 'rpg-urban', col: 16, row: 13 },
  // Red awning sign — use for the shop sign over the door.
  'sign-red': { sheet: 'rpg-urban', col: 8, row: 10 },
  // Cozy orange café chair (confirmed orange-brown via pixel sampling).
  'chair-wood': { sheet: 'rpg-urban', col: 15, row: 15 },
} as const satisfies Record<string, TileSpec>

export type TileKey = keyof typeof TILE_REGISTRY

/**
 * URL on disk for each tilesheet (served from Vite `public/`).
 */
const SHEET_URL: Record<TileSheet, string> = {
  'modern-houses': '/assets/bakery-v2/tiles/modern-houses.png',
  'rpg-urban': '/assets/bakery-v2/tiles/rpg-urban.png',
  'tiny-town': '/assets/bakery-v2/tiles/tiny-town.png',
  'tiny-dungeon': '/assets/bakery-v2/tiles/tiny-dungeon.png',
}

/**
 * Native pixel dimensions of each spritesheet, in tiles. Used to compute the
 * scaled `background-size` so the CSS background math works.
 */
const SHEET_TILE_DIMS: Record<TileSheet, { cols: number; rows: number }> = {
  'modern-houses': { cols: 48, rows: 32 },
  'rpg-urban': { cols: 27, rows: 18 },
  'tiny-town': { cols: 12, rows: 11 },
  'tiny-dungeon': { cols: 12, rows: 11 },
}

/**
 * Returns inline styles that render `tileKey` as a `tilePx`-sized CSS
 * background, using the packed spritesheet. The caller renders the result
 * on a `<div>` sized `tilePx × tilePx`.
 */
export function getTileBackgroundStyle(
  tileKey: TileKey,
  tilePx: number,
): CSSProperties {
  const tile = TILE_REGISTRY[tileKey]
  const { cols, rows } = SHEET_TILE_DIMS[tile.sheet]
  return {
    backgroundImage: `url('${SHEET_URL[tile.sheet]}')`,
    backgroundPosition: `-${tile.col * tilePx}px -${tile.row * tilePx}px`,
    backgroundSize: `${cols * tilePx}px ${rows * tilePx}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    width: `${tilePx}px`,
    height: `${tilePx}px`,
  }
}

export const SCENE_WIDTH_TILES = 24
export const SCENE_HEIGHT_TILES = 14

/**
 * Tile-key sigils used inside the layout source. Keeping them short keeps
 * the 2D literal scannable at a glance. Convention: 2-char keys.
 */
const F = 'floor-wood' satisfies TileKey
const OL = 'oven-left' satisfies TileKey
const OR = 'oven-right' satisfies TileKey
const SL = 'stove-left' satisfies TileKey
const SR = 'stove-right' satisfies TileKey
const CT = 'counter-top' satisfies TileKey
const CB = 'counter-bot' satisfies TileKey
const DT = 'door-top' satisfies TileKey
const DB = 'door-bot' satisfies TileKey
const WT = 'window-top' satisfies TileKey
const WB = 'window-bot' satisfies TileKey
const T1 = 'tree-green-top' satisfies TileKey
const T2 = 'tree-green-mid' satisfies TileKey
const T3 = 'tree-green-bot' satisfies TileKey
const A1 = 'tree-orange-top' satisfies TileKey
const A2 = 'tree-orange-mid' satisfies TileKey
const A3 = 'tree-orange-bot' satisfies TileKey
const SI = 'sign-red' satisfies TileKey
const CH = 'chair-wood' satisfies TileKey

type FurnCell = TileKey | null
const _: FurnCell = null

const floorRow = (): TileKey[] => Array.from({ length: SCENE_WIDTH_TILES }, () => F)

/**
 * Backdrop floor — uniform wood planks across the entire scene.
 */
const floor: TileKey[][] = Array.from(
  { length: SCENE_HEIGHT_TILES },
  floorRow,
)

/**
 * Furniture/decor layer.
 *
 *  Row 0-1: empty (CSS wall band is absolutely-positioned above tiles 0-2).
 *  Row 2:   red "BAKERY" sign row (centered above the door).
 *  Row 3-4: windows flanking the sign (each window is 2 tiles tall, T+B).
 *  Row 5-6: kitchen line — oven+stove cluster on the left, counter on the right.
 *  Row 7-9: breathing room — floor only.
 *  Row 10-12: a couple of trees and chairs scattered in the café area.
 *  Row 13:  door near center; the rest of the row is front wall (CSS).
 */
// prettier-ignore
const furniture: FurnCell[][] = [
  /*  0 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  1 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  2 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, SI, SI,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  3 */ [ _,  _, WT, WT,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, WT, WT,  _,  _,  _],
  /*  4 */ [ _,  _, WB, WB,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, WB, WB,  _,  _,  _],
  /*  5 */ [ _,  _,  _,  _,  _, OL, OR, SL, SR,  _,  _,  _,  _, CT, CT, CT,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  6 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, CB, CB, CB,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  7 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /*  8 */ [ _, T1,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, A1,  _,  _],
  /*  9 */ [ _, T2,  _, CH,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, A2,  _,  _],
  /* 10 */ [ _, T3,  _,  _,  _,  _,  _, CH,  _,  _,  _,  _,  _,  _,  _, CH,  _,  _,  _,  _,  _, A3,  _,  _],
  /* 11 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /* 12 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, DT, DT,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
  /* 13 */ [ _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _, DB, DB,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
]

export const bakeryLayout = { floor, furniture }
