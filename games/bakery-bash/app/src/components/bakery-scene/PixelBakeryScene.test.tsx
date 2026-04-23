import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PixelBakeryScene } from './PixelBakeryScene'

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
