import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CatLayer } from './CatLayer'
import type { Cat } from '../../hooks/useBakeryScene'
import { CAT_FRAME } from './sprites/cat'

const fakeCat: Cat = { x: 100, y: 240, direction: 'right', state: 'walking', frame: CAT_FRAME.walkRight1 }

describe('<CatLayer>', () => {
  it('renders a single canvas for the cat', () => {
    const { container } = render(<CatLayer cat={fakeCat} />)
    expect(container.querySelectorAll('canvas').length).toBe(1)
  })

  it('positions wrapper at (cat.x - halfW, cat.y)', () => {
    const { container } = render(<CatLayer cat={fakeCat} />)
    const wrapper = container.querySelector('[data-testid="cat-wrapper"]') as HTMLElement
    expect(wrapper.style.left).toBe('90px') // 100 - halfW(10)
    expect(wrapper.style.top).toBe('240px')
  })
})
