import { vi } from 'vitest'
import { SCENE } from './scene-geometry'

/**
 * Parse '#rgb' or '#rrggbb' hex strings to [r, g, b].
 */
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

/**
 * Stub for the ImageData constructor used in jsdom.
 * Stores width, height, and pixel data for image operations.
 */
export class FakeImageData {
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
 * Creates a pixel-buffer-backed fake 2D context.
 *
 * Maintains a flat RGBA Uint8ClampedArray of size width*height*4.
 * Supports:
 * - fillStyle setter + fillRect: writes parsed color into covered pixels
 * - getImageData: returns a slice of the buffer as a FakeImageData
 * - clearRect: zeros all 4 bytes (RGBA) in the specified rectangle
 * - putImageData: copies pixels from an ImageData-like object into the buffer
 */
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
    clearRect(x: number, y: number, w: number, h: number) {
      const x0 = Math.max(0, Math.floor(x))
      const y0 = Math.max(0, Math.floor(y))
      const x1 = Math.min(width, Math.floor(x + w))
      const y1 = Math.min(height, Math.floor(y + h))
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const idx = (py * width + px) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
          pixels[idx + 3] = 0
        }
      }
    },
    putImageData(imgData: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) {
      const srcWidth = imgData.width
      const srcHeight = imgData.height
      const srcData = imgData.data

      for (let sy = 0; sy < srcHeight; sy++) {
        for (let sx = 0; sx < srcWidth; sx++) {
          const dx = x + sx
          const dy = y + sy
          // Skip out-of-bounds pixels
          if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue

          const srcIdx = (sy * srcWidth + sx) * 4
          const dstIdx = (dy * width + dx) * 4

          pixels[dstIdx] = srcData[srcIdx]
          pixels[dstIdx + 1] = srcData[srcIdx + 1]
          pixels[dstIdx + 2] = srcData[srcIdx + 2]
          pixels[dstIdx + 3] = srcData[srcIdx + 3]
        }
      }
    },
  } as unknown as CanvasRenderingContext2D

  return ctx
}

/**
 * Stubs HTMLCanvasElement.prototype.getContext to return our fake 2D context.
 * Returns { ctx, spy } where spy can be restored via .mockRestore().
 */
export function stubCanvasContext() {
  const ctx = makePixelBufferCtx(SCENE.width, SCENE.height)
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((contextId: string) =>
      contextId === '2d' ? ctx : null) as HTMLCanvasElement['getContext'])
  return { ctx, spy }
}

/**
 * Canvas-stub setup shared across describe blocks.
 * Installs the fake context stub and swaps the global ImageData constructor.
 * Returns { contextStub, cleanup } where cleanup restores both.
 */
export function setupCanvasFake() {
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
