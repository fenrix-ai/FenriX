import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneBackdrop } from './SceneBackdrop'
import {
  SCENE_WIDTH_TILES,
  SCENE_HEIGHT_TILES,
  bakeryLayout,
  TILE_REGISTRY,
} from './scene-data'

describe('SceneBackdrop', () => {
  it('renders one tile element per floor cell', () => {
    const { container } = render(<SceneBackdrop tilePx={24} />)
    const cells = container.querySelectorAll('[data-tile]')
    expect(cells.length).toBe(SCENE_WIDTH_TILES * SCENE_HEIGHT_TILES)
  })

  it('positions tiles absolutely by (col, row) scaled to tilePx', () => {
    const { container } = render(<SceneBackdrop tilePx={24} />)
    // Pick a tile in the middle and check its computed left/top.
    const target = container.querySelector(
      '[data-tile-col="3"][data-tile-row="2"]',
    ) as HTMLElement
    expect(target).toBeTruthy()
    expect(target.style.left).toBe(`${3 * 24}px`)
    expect(target.style.top).toBe(`${2 * 24}px`)
  })

  it('uses the floor layer from bakeryLayout for tile keys', () => {
    const { container } = render(<SceneBackdrop tilePx={24} />)
    const first = container.querySelector(
      '[data-tile-col="0"][data-tile-row="0"]',
    ) as HTMLElement
    const expectedKey = bakeryLayout.floor[0][0]
    expect(first.getAttribute('data-tile')).toBe(expectedKey)
    const expected = TILE_REGISTRY[expectedKey]
    expect(first.style.backgroundImage).toContain(`${expected.sheet}.png`)
  })
})
