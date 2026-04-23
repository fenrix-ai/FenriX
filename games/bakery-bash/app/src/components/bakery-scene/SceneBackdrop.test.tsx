import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SceneBackdrop } from './SceneBackdrop'
import { SCENE } from './scene-geometry'

// ---------------------------------------------------------------------------
// Pixel-buffer-backed fake 2D context (Approach A)
//
// Maintains a flat RGBA Uint8ClampedArray of size width*height*4.
// fillRect writes the parsed fillStyle color into every covered pixel.
// getImageData returns a slice of that buffer as a FakeImageData.
// ---------------------------------------------------------------------------

/** Parse '#rgb' or '#rrggbb' hex strings to [r, g, b]. */
function parseHex(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return [r, g, b]
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return [r, g, b]
  }
  return [0, 0, 0]
}

class FakeImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

/**
 * Canvas-stub setup shared across describe blocks. Each describe needs
 * its own beforeEach/afterEach pair because vitest hooks don't span siblings —
 * this keeps the boilerplate to one line per hook.
 */
function setupCanvasFake() {
  const contextStub = stubCanvasContext()
  const originalImageData = globalThis.ImageData
  ;(globalThis as { ImageData: typeof ImageData }).ImageData =
    FakeImageData as unknown as typeof ImageData

  const cleanup = () => {
    contextStub.spy.mockRestore()
    if (originalImageData) {
      ;(globalThis as { ImageData: typeof ImageData }).ImageData = originalImageData
    } else {
      delete (globalThis as Partial<{ ImageData: typeof ImageData }>).ImageData
    }
  }

  return { contextStub, cleanup }
}

function makePixelBufferCtx(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  // Pre-fill alpha to 255
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255

  let currentFillStyle = '#000000'

  const ctx = {
    get fillStyle() {
      return currentFillStyle
    },
    set fillStyle(val: string) {
      currentFillStyle = val
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const [r, g, b] = parseHex(currentFillStyle)
      const x0 = Math.max(0, Math.floor(x))
      const y0 = Math.max(0, Math.floor(y))
      const x1 = Math.min(width, Math.floor(x + w))
      const y1 = Math.min(height, Math.floor(y + h))
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const idx = (py * width + px) * 4
          pixels[idx] = r
          pixels[idx + 1] = g
          pixels[idx + 2] = b
          pixels[idx + 3] = 255
        }
      }
    },
    getImageData(x: number, y: number, w: number, h: number): FakeImageData {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const srcIdx = ((y + py) * width + (x + px)) * 4
          const dstIdx = (py * w + px) * 4
          data[dstIdx] = pixels[srcIdx]
          data[dstIdx + 1] = pixels[srcIdx + 1]
          data[dstIdx + 2] = pixels[srcIdx + 2]
          data[dstIdx + 3] = pixels[srcIdx + 3]
        }
      }
      return new FakeImageData(data, w, h)
    },
  } as unknown as CanvasRenderingContext2D

  return ctx
}

function stubCanvasContext() {
  const ctx = makePixelBufferCtx(SCENE.width, SCENE.height)
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((contextId: string) =>
      contextId === '2d' ? ctx : null) as HTMLCanvasElement['getContext'])
  return { ctx, spy }
}

// ---------------------------------------------------------------------------
// Tests (verbatim from plan)
// ---------------------------------------------------------------------------

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

describe('<SceneBackdrop> counter', () => {
  let setup: ReturnType<typeof setupCanvasFake>

  beforeEach(() => {
    setup = setupCanvasFake()
  })

  afterEach(() => {
    setup.cleanup()
  })

  it('paints the counter band in wood tones below the wainscoting', () => {
    const { container } = render(<SceneBackdrop />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Top of counter zone (y=140 per SCENE.zones.counter.y) should be the counter top stripe
    const top = ctx.getImageData(10, SCENE.zones.counter.y, 1, 1).data
    const mid = ctx.getImageData(10, SCENE.zones.counter.y + 10, 1, 1).data
    // Both warm brown (R>G>B), mid darker than top or vice versa — just assert warm brown.
    expect(top[0]).toBeGreaterThan(top[2])
    expect(mid[0]).toBeGreaterThan(mid[2])
  })
})
