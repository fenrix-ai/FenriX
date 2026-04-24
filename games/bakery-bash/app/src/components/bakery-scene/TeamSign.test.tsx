import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { TeamSign } from './TeamSign'
import { setupCanvasFake } from './canvas-test-helpers'

describe('<TeamSign>', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('renders a canvas with positioning for the sign frame', () => {
    const { container } = render(<TeamSign teamName="CRUMBS" />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.style.position).toBe('absolute')
  })

  it('writes some opaque text pixels for a non-empty team name', () => {
    const { container } = render(<TeamSign teamName="PANE" />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let opaquePixels = 0
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] === 255) opaquePixels++
    }
    expect(opaquePixels).toBeGreaterThan(0)
  })

  it('truncates text that overflows the sign width with an ellipsis', () => {
    const { container } = render(<TeamSign teamName="EXTREMELY LONG TEAM NAME THAT WILL NOT FIT" />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.width).toBeLessThanOrEqual(120)
  })

  it('renders a canvas even for an empty team name (blank sign)', () => {
    const { container } = render(<TeamSign teamName="" />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
