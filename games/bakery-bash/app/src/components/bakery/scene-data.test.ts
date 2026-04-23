import { describe, it, expect } from 'vitest'
import {
  TILE_REGISTRY,
  getTileBackgroundStyle,
  SCENE_WIDTH_TILES,
  SCENE_HEIGHT_TILES,
  bakeryLayout,
  type TileKey,
} from './scene-data'

describe('scene-data — tile registry', () => {
  it('defines floor-wood on rpg-urban with 16x16 grid coordinates', () => {
    const tile = TILE_REGISTRY['floor-wood']
    expect(tile).toBeDefined()
    expect(tile.sheet).toBe('rpg-urban')
    expect(typeof tile.col).toBe('number')
    expect(typeof tile.row).toBe('number')
    expect(tile.col).toBeGreaterThanOrEqual(0)
    expect(tile.row).toBeGreaterThanOrEqual(0)
  })

  it('registers core bakery furniture keys on a recognized sheet', () => {
    const validSheets = new Set([
      'modern-houses',
      'rpg-urban',
      'tiny-town',
      'tiny-dungeon',
    ])
    for (const key of ['oven-left', 'door-top', 'window-top', 'chair-wood'] as TileKey[]) {
      const tile = TILE_REGISTRY[key]
      expect(tile, `tile ${key} should exist`).toBeDefined()
      expect(validSheets.has(tile.sheet)).toBe(true)
    }
  })
})

describe('scene-data — getTileBackgroundStyle', () => {
  it('returns CSS properties referencing the tilesheet at the correct pixel offset', () => {
    const style = getTileBackgroundStyle('floor-wood', 32)
    const tile = TILE_REGISTRY['floor-wood']
    expect(style.backgroundImage).toContain(`${tile.sheet}.png`)
    // Offset scales with display tile size: col*tilePx and row*tilePx, negated for CSS.
    expect(style.backgroundPosition).toBe(
      `-${tile.col * 32}px -${tile.row * 32}px`,
    )
    // backgroundSize scales entire sheet by (tilePx / 16).
    expect(style.backgroundSize).toMatch(/px auto$|auto \d+px|^\d+px \d+px$/)
    expect(style.imageRendering).toBe('pixelated')
  })

  it('scales background-position linearly with tile display size', () => {
    const style16 = getTileBackgroundStyle('door-top', 16)
    const style48 = getTileBackgroundStyle('door-top', 48)
    const tile = TILE_REGISTRY['door-top']
    expect(style16.backgroundPosition).toBe(
      `-${tile.col * 16}px -${tile.row * 16}px`,
    )
    expect(style48.backgroundPosition).toBe(
      `-${tile.col * 48}px -${tile.row * 48}px`,
    )
  })
})

describe('scene-data — bakery layout', () => {
  it('exports scene dimensions at least 20 wide and 12 tall (enough to read as a shop)', () => {
    expect(SCENE_WIDTH_TILES).toBeGreaterThanOrEqual(20)
    expect(SCENE_HEIGHT_TILES).toBeGreaterThanOrEqual(12)
  })

  it('floor layer is a 2D grid matching scene dimensions', () => {
    expect(bakeryLayout.floor.length).toBe(SCENE_HEIGHT_TILES)
    for (const row of bakeryLayout.floor) {
      expect(row.length).toBe(SCENE_WIDTH_TILES)
    }
  })

  it('furniture layer has matching dimensions and permits null (empty) cells', () => {
    expect(bakeryLayout.furniture.length).toBe(SCENE_HEIGHT_TILES)
    for (const row of bakeryLayout.furniture) {
      expect(row.length).toBe(SCENE_WIDTH_TILES)
    }
    // Must contain at least one null cell (open floor somewhere).
    const hasNull = bakeryLayout.furniture.some((r) => r.some((c) => c === null))
    expect(hasNull).toBe(true)
  })

  it('every non-null tile key in floor/furniture layers is registered', () => {
    const registered = new Set(Object.keys(TILE_REGISTRY))
    for (const layer of [bakeryLayout.floor, bakeryLayout.furniture]) {
      for (const row of layer) {
        for (const cell of row) {
          if (cell === null) continue
          expect(registered.has(cell), `unregistered tile: ${cell}`).toBe(true)
        }
      }
    }
  })
})
