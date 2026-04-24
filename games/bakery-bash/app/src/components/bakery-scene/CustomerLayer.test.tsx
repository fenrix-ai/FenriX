import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CustomerLayer } from './CustomerLayer'
import type { Customer } from '../../hooks/useBakeryScene'
import { CUSTOMER_FRAME } from './sprites/customer-templates'

const fakeCustomers: Customer[] = [
  {
    id: 'c1',
    variantIndex: 0,
    x: 300,
    y: 246,
    direction: 'left',
    state: 'walking-in',
    frame: CUSTOMER_FRAME.walkLeft1,
    targetStation: 'bakery',
  },
  {
    id: 'c2',
    variantIndex: 3,
    x: 220,
    y: 246,
    direction: 'left',
    state: 'transacting',
    frame: CUSTOMER_FRAME.idle,
    targetStation: 'deli',
  },
]

describe('<CustomerLayer>', () => {
  it('renders one wrapper per customer', () => {
    const { container } = render(<CustomerLayer customers={fakeCustomers} />)
    expect(container.querySelectorAll('[data-testid^="customer-"]').length).toBe(2)
  })

  it('renders nothing when customers array is empty', () => {
    const { container } = render(<CustomerLayer customers={[]} />)
    expect(container.querySelectorAll('[data-testid^="customer-"]').length).toBe(0)
  })

  it('positions each customer wrapper at (x - halfW, y)', () => {
    const { container } = render(<CustomerLayer customers={fakeCustomers} />)
    const first = container.querySelector('[data-testid="customer-c1"]') as HTMLElement
    expect(first.style.left).toBe('290px') // 300 - halfW(10)
    expect(first.style.top).toBe('246px')
  })
})
