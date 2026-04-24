import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { measureText, textToImageData, GLYPH_WIDTH, GLYPH_HEIGHT } from './pixel-font'

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

describe('pixel-font', () => {
  let originalImageData: typeof ImageData | undefined

  beforeEach(() => {
    originalImageData = globalThis.ImageData
    ;(globalThis as { ImageData: typeof ImageData }).ImageData =
      FakeImageData as unknown as typeof ImageData
  })

  afterEach(() => {
    if (originalImageData) {
      ;(globalThis as { ImageData: typeof ImageData }).ImageData = originalImageData
    } else {
      delete (globalThis as Partial<{ ImageData: typeof ImageData }>).ImageData
    }
  })

  it('exposes 6x8 glyph dimensions', () => {
    expect(GLYPH_WIDTH).toBe(6)
    expect(GLYPH_HEIGHT).toBe(8)
  })

  it('measureText returns total width in pixels including 1-px kerning', () => {
    // 3 chars × 6 + 2 kerning = 20 px (6 + 1 + 6 + 1 + 6)
    expect(measureText('ABC')).toBe(20)
  })

  it('measureText returns 0 for empty string', () => {
    expect(measureText('')).toBe(0)
  })

  it('textToImageData returns an ImageData-sized block with declared color', () => {
    const img = textToImageData('A', '#ff0000')
    expect(img.width).toBe(6)
    expect(img.height).toBe(8)
    // There should be at least one opaque red pixel.
    let foundRed = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] === 255 && img.data[i + 3] === 255) {
        foundRed = true
        break
      }
    }
    expect(foundRed).toBe(true)
  })

  it('renders unknown characters as blank glyphs (no throw)', () => {
    expect(() => textToImageData('~', '#ffffff')).not.toThrow()
  })

  it('supports uppercase + lowercase + digits + space', () => {
    expect(() => textToImageData('AbC 0 1', '#000000')).not.toThrow()
  })
})
