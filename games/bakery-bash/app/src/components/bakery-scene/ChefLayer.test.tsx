import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChefLayer } from './ChefLayer'
import type { Chef } from '../../hooks/useBakeryScene'

const fakeChefs: Chef[] = [
  { id: 'bakery-0', station: 'bakery', x: 90, y: 140, frame: 0 },
  { id: 'deli-0', station: 'deli', x: 220, y: 140, frame: 1 },
]

describe('<ChefLayer>', () => {
  it('renders one canvas per chef', () => {
    const { container } = render(<ChefLayer chefs={fakeChefs} />)
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBe(fakeChefs.length)
  })

  it('positions each chef wrapper at (x - halfWidth, y)', () => {
    const { container } = render(<ChefLayer chefs={fakeChefs} />)
    const wrappers = container.querySelectorAll('[data-testid^="chef-"]') as NodeListOf<HTMLElement>
    // chef[0] at x=90, sprite width 24 → left = 90 - 12 = 78
    expect(wrappers[0].style.left).toBe('78px')
    expect(wrappers[0].style.top).toBe('140px')
  })

  it('renders nothing when chefs array is empty', () => {
    const { container } = render(<ChefLayer chefs={[]} />)
    expect(container.querySelectorAll('canvas').length).toBe(0)
  })
})
