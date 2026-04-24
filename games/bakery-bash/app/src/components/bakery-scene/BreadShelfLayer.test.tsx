import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BreadShelfLayer } from './BreadShelfLayer'

describe('<BreadShelfLayer>', () => {
  it('renders no images when the menu is empty', () => {
    const { container } = render(<BreadShelfLayer menu={[]} soldOut={new Set()} />)
    expect(container.querySelectorAll('img').length).toBe(0)
  })

  it('renders one image per active slot (shelf + display case)', () => {
    // Menu has 6 products; display case reuses the first 4. Expect 6 + 4 = 10.
    const menu = ['croissant', 'cookie', 'bagel', 'sandwich', 'coffee', 'matcha']
    const { container } = render(<BreadShelfLayer menu={menu} soldOut={new Set()} />)
    expect(container.querySelectorAll('img').length).toBe(10)
  })

  it('skips sold-out and missing slots', () => {
    // 3 sold-out + 1 missing (matcha omitted) → shelf drops 4, case drops 3 (croissant, cookie, bagel all sold-out).
    const menu = ['croissant', 'cookie', 'bagel', 'sandwich', 'coffee']
    const soldOut = new Set(['croissant', 'cookie', 'bagel'])
    const { container } = render(<BreadShelfLayer menu={menu} soldOut={soldOut} />)
    // Shelf: slots 0-2 sold-out, slot 3 active, slot 4 active, slot 5 missing → 2 images
    // Display case: slots 0-2 sold-out, slot 3 active → 1 image
    expect(container.querySelectorAll('img').length).toBe(3)
  })

  it('uses the mapped PNG filename for each product', () => {
    const menu = ['croissant', 'bagel', 'sandwich', 'cookie']
    const { container } = render(<BreadShelfLayer menu={menu} soldOut={new Set()} />)
    const srcs = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    expect(srcs.some((s) => s?.endsWith('croissant.png'))).toBe(true)
    expect(srcs.some((s) => s?.endsWith('bagel.png'))).toBe(true)
    expect(srcs.some((s) => s?.endsWith('sliced-bread.png'))).toBe(true) // sandwich
    expect(srcs.some((s) => s?.endsWith('biscuits.png'))).toBe(true) // cookie
  })

  it('positions each slot with scene-native pixel left/top', () => {
    const menu = ['croissant']
    const { container } = render(<BreadShelfLayer menu={menu} soldOut={new Set()} />)
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
    // Shelf slot 0 is at (shelfX + 6 - 2, shelfY - 18) = (36, 36)
    // Display case slot 0 is at (dcX + 6, dcY + 2) = (36, 124)
    const tops = imgs.map((img) => img.style.top)
    const lefts = imgs.map((img) => img.style.left)
    expect(lefts).toEqual(expect.arrayContaining(['36px']))
    expect(tops).toEqual(expect.arrayContaining(['36px', '124px']))
  })

  it('marks images aria-hidden via the wrapper and pointer-events-none', () => {
    const { container } = render(<BreadShelfLayer menu={['croissant']} soldOut={new Set()} />)
    const wrapper = container.querySelector('div')! as HTMLDivElement
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
    expect(wrapper.style.pointerEvents).toBe('none')
  })
})
