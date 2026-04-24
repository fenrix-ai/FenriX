import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SceneBackdrop } from './SceneBackdrop'
import { SCENE } from './scene-geometry'
import { setupCanvasFake } from './canvas-test-helpers'

describe('<SceneBackdrop>', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('renders a canvas sized to scene native dimensions', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(SCENE.width)
    expect(canvas.height).toBe(SCENE.height)
  })

  it('paints the back-wall zone cream and the floor zone brown', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Sample a pixel in the back-wall region (above wainscoting)
    const wall = ctx.getImageData(10, 60, 1, 1).data
    // Cream = light color: expect R, G, B all > 200
    expect(wall[0]).toBeGreaterThan(200)
    expect(wall[1]).toBeGreaterThan(180)
    expect(wall[2]).toBeGreaterThan(140)
    // Sample a pixel in the floor region (y >= 180)
    const floor = ctx.getImageData(10, 230, 1, 1).data
    // Warm brown: R > G > B, R < 200
    expect(floor[0]).toBeGreaterThan(floor[2])
    expect(floor[0]).toBeLessThan(200)
  })

  it('sets image-rendering: pixelated', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.style.imageRendering).toBe('pixelated')
  })
})

describe('<SceneBackdrop> back-wall elements', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('paints bread shelves on the left of the mid band', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Shelf is a dark wood rectangle around x=40 y=55 per our layout
    const p = ctx.getImageData(40, 60, 1, 1).data
    // Expect dark wood (R<150, and brownish R>G>B)
    expect(p[0]).toBeLessThan(180)
    expect(p[0]).toBeGreaterThan(p[2])
  })

  it('paints the oven silhouette in the mid-band middle', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Oven body around x=220 y=70 — should be chrome/dark gray, not cream wall
    const p = ctx.getImageData(220, 70, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the coffee wall (cup rack + machine body) on the right of mid-band', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Coffee area around x=360 y=70 — should be darker than cream wall
    const p = ctx.getImageData(360, 70, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the door slot on the right edge', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Door is at x=456..480, y=80..280; sample the middle
    const p = ctx.getImageData(465, 150, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})

describe('<SceneBackdrop> wall mounts', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('paints a clock in the top-left wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    const p = ctx.getImageData(22, 12, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the sign frame silhouette in the center wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    const p = ctx.getImageData(200, 8, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })

  it('paints the menu-board silhouette in the top-right wall-mount area', () => {
    const { container } = render(<SceneBackdrop />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    const p = ctx.getImageData(400, 10, 1, 1).data
    const isCream = p[0] > 200 && p[1] > 180 && p[2] > 140
    expect(isCream).toBe(false)
  })
})

describe('<SceneBackdrop> sold-out', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('renders gray empty trays instead of amber loaves for sold-out products', () => {
    const menu = ['bread', 'croissant', 'baguette', 'danish', 'pretzel', 'scone']
    const soldOut = new Set(['bread', 'croissant', 'baguette'])
    const { container } = render(<SceneBackdrop menu={menu} soldOut={soldOut} />)
    const ctx = (container.querySelector('canvas')! as HTMLCanvasElement).getContext('2d')!
    // Shelf 1 loaf 1 (product index 0, sold-out) — sample the tray area (shelfY=54, loaf tray at y=49..54)
    const p = ctx.getImageData(45, 48, 1, 1).data
    // gray = R ~ G ~ B, all between 120 and 200
    const isGray = Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 30
    expect(isGray).toBe(true)
  })
})
