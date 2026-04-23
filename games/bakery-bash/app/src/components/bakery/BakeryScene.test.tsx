import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BakeryScene } from './BakeryScene'

describe('BakeryScene', () => {
  it('renders floor and furniture layers by default', () => {
    const { container } = render(<BakeryScene mode="decide" />)
    expect(container.querySelector('.bakery-scene__layer--floor')).toBeTruthy()
    expect(
      container.querySelector('.bakery-scene__layer--furniture'),
    ).toBeTruthy()
  })

  it('applies a mode-specific class on the scene root', () => {
    const { container, rerender } = render(<BakeryScene mode="decide" />)
    const root = container.querySelector('.bakery-scene') as HTMLElement
    expect(root.classList.contains('bakery-scene--decide')).toBe(true)

    rerender(<BakeryScene mode="simulate" />)
    expect(root.classList.contains('bakery-scene--simulate')).toBe(true)

    rerender(<BakeryScene mode="static" />)
    expect(root.classList.contains('bakery-scene--static')).toBe(true)
  })

  it('supports an optional tilePx prop for rendering scale', () => {
    const { container } = render(<BakeryScene mode="decide" tilePx={48} />)
    const firstFloorTile = container.querySelector(
      '.bakery-scene__layer--floor [data-tile]',
    ) as HTMLElement
    expect(firstFloorTile.style.width).toBe('48px')
    expect(firstFloorTile.style.height).toBe('48px')
  })
})
