import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { CounterFrontLayer } from './CounterFrontLayer'
import { SCENE } from './scene-geometry'
import { setupCanvasFake } from './canvas-test-helpers'

describe('<CounterFrontLayer>', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('renders a canvas sized to scene native dimensions', () => {
    const { container } = render(<CounterFrontLayer />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(SCENE.width)
    expect(canvas.height).toBe(SCENE.height)
  })

  it('sets image-rendering: pixelated', () => {
    const { container } = render(<CounterFrontLayer />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.style.imageRendering).toBe('pixelated')
  })

  it('paints the counter band in wood tones', () => {
    const { container } = render(<CounterFrontLayer />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Top of counter zone (y=140 per SCENE.zones.counter.y) should be the counter top stripe
    const top = ctx.getImageData(10, SCENE.zones.counter.y, 1, 1).data
    const mid = ctx.getImageData(10, SCENE.zones.counter.y + 10, 1, 1).data
    // Both warm brown (R>G>B).
    expect(top[0]).toBeGreaterThan(top[2])
    expect(mid[0]).toBeGreaterThan(mid[2])
  })

  it('paints the bread display case above the counter on the left', () => {
    const { container } = render(<CounterFrontLayer />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    const p = ctx.getImageData(60, 130, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the espresso machine on the counter right', () => {
    const { container } = render(<CounterFrontLayer />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    const p = ctx.getImageData(340, 135, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})
