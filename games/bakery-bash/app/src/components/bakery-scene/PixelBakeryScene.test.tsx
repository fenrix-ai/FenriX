import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PixelBakeryScene } from './PixelBakeryScene'
import type { StationKey } from './scene-geometry'

describe('<PixelBakeryScene>', () => {
  it('renders a scene container with mode className', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    const scene = container.querySelector('[data-testid="pixel-bakery-scene"]')!
    expect(scene).toBeTruthy()
    expect(scene.className).toContain('pixel-bakery-scene--decide')
  })

  it('mounts backdrop + team sign child components', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts mode variants: decide, simulate, static', () => {
    for (const mode of ['decide', 'simulate', 'static'] as const) {
      const { container } = render(<PixelBakeryScene mode={mode} teamName="X" />)
      const scene = container.querySelector('[data-testid="pixel-bakery-scene"]')!
      expect(scene.className).toContain(`pixel-bakery-scene--${mode}`)
    }
  })
})

describe('<PixelBakeryScene> — chefs', () => {
  it('renders a chef at each station by default', () => {
    const { container } = render(
      <PixelBakeryScene mode="decide" teamName="CRUMBS" />,
    )
    const chefs = container.querySelectorAll('[data-testid^="chef-"]')
    expect(chefs.length).toBe(3)
  })

  it('renders no chefs when all staffCounts are zero', () => {
    const { container } = render(
      <PixelBakeryScene
        mode="decide"
        teamName="X"
        staffCounts={{ bakery: 0, deli: 0, barista: 0 } as Record<StationKey, number>}
      />,
    )
    expect(container.querySelectorAll('[data-testid^="chef-"]').length).toBe(0)
  })
})
