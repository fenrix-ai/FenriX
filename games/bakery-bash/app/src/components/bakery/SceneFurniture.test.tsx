import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneFurniture } from './SceneFurniture'
import { bakeryLayout } from './scene-data'

describe('SceneFurniture', () => {
  it('renders one tile per non-null furniture cell and nothing for null cells', () => {
    const { container } = render(<SceneFurniture tilePx={24} />)
    const cells = container.querySelectorAll('[data-tile]')
    const expectedCount = bakeryLayout.furniture.reduce(
      (acc, row) => acc + row.filter((c) => c !== null).length,
      0,
    )
    expect(cells.length).toBe(expectedCount)
  })

  it('places a door-top somewhere on the front wall', () => {
    const { container } = render(<SceneFurniture tilePx={32} />)
    const doors = container.querySelectorAll('[data-tile="door-top"]')
    expect(doors.length).toBeGreaterThan(0)
  })

  it('each furniture tile is absolutely positioned at (col*tilePx, row*tilePx)', () => {
    const { container } = render(<SceneFurniture tilePx={32} />)
    const tile = container.querySelector('[data-tile]') as HTMLElement
    expect(tile).toBeTruthy()
    const col = Number(tile.getAttribute('data-tile-col'))
    const row = Number(tile.getAttribute('data-tile-row'))
    expect(tile.style.left).toBe(`${col * 32}px`)
    expect(tile.style.top).toBe(`${row * 32}px`)
    expect(tile.style.position).toBe('absolute')
  })
})
