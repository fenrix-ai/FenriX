import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DollarLayer } from './DollarLayer'
import type { Dollar } from '../../hooks/useBakeryScene'

const bills: Dollar[] = [
  { id: 'd1', x: 100, y: 150, createdMs: performance.now() },
  { id: 'd2', x: 220, y: 150, createdMs: performance.now() },
]

describe('<DollarLayer>', () => {
  it('renders one DOM element per bill', () => {
    const { container } = render(<DollarLayer dollars={bills} />)
    expect(container.querySelectorAll('.dollar-bill').length).toBe(2)
  })

  it('each bill has a unique inline CSS random seed (X drift)', () => {
    const { container } = render(<DollarLayer dollars={bills} />)
    const els = container.querySelectorAll('.dollar-bill') as NodeListOf<HTMLElement>
    expect(els[0].style.left).toBe('100px')
    expect(els[1].style.left).toBe('220px')
  })

  it('renders nothing for empty dollars array', () => {
    const { container } = render(<DollarLayer dollars={[]} />)
    expect(container.querySelectorAll('.dollar-bill').length).toBe(0)
  })
})
