import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { PixelSprite } from './PixelSprite'
import * as spriteDataModule from './sprite-data'
import type { SpriteData } from './sprite-data'

const redDot: SpriteData = {
  width: 1,
  height: 1,
  palette: ['#ff0000'],
  frames: [['0']],
}

function stubCanvasContext() {
  // Minimal 2D-context stub — enough to satisfy PixelSprite's calls.
  const ctx = {
    clearRect: vi.fn(),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  // Spy getContext to return our stub.
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((contextId: string) =>
      contextId === '2d' ? ctx : null) as HTMLCanvasElement['getContext'])
  return { ctx, spy }
}

// Stub the global ImageData so `new ImageData(...)` works in jsdom.
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

describe('<PixelSprite>', () => {
  let contextSpy: ReturnType<typeof stubCanvasContext>
  let originalImageData: typeof ImageData | undefined

  beforeEach(() => {
    contextSpy = stubCanvasContext()
    originalImageData = globalThis.ImageData
    ;(globalThis as { ImageData: typeof ImageData }).ImageData =
      FakeImageData as unknown as typeof ImageData
  })

  afterEach(() => {
    contextSpy.spy.mockRestore()
    if (originalImageData) {
      ;(globalThis as { ImageData: typeof ImageData }).ImageData = originalImageData
    } else {
      delete (globalThis as Partial<{ ImageData: typeof ImageData }>).ImageData
    }
  })

  it('renders a canvas element with native width/height (no scaling)', () => {
    const { container } = render(<PixelSprite data={redDot} frame={0} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(1)
  })

  it('applies image-rendering: pixelated inline', () => {
    const { container } = render(<PixelSprite data={redDot} frame={0} />)
    const canvas = container.querySelector('canvas')! as HTMLCanvasElement
    expect(canvas.style.imageRendering).toBe('pixelated')
  })

  it('calls gridToImageData with the current data + frame on mount', () => {
    const gridSpy = vi.spyOn(spriteDataModule, 'gridToImageData')
    render(<PixelSprite data={redDot} frame={0} />)
    expect(gridSpy).toHaveBeenCalledWith(redDot, 0)
    gridSpy.mockRestore()
  })

  it('puts the ImageData on the canvas context at (0, 0)', () => {
    render(<PixelSprite data={redDot} frame={0} />)
    expect(contextSpy.ctx.clearRect).toHaveBeenCalledWith(0, 0, 1, 1)
    expect(contextSpy.ctx.putImageData).toHaveBeenCalledTimes(1)
    const [imgData, x, y] = (contextSpy.ctx.putImageData as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(x).toBe(0)
    expect(y).toBe(0)
    expect((imgData as FakeImageData).width).toBe(1)
    expect((imgData as FakeImageData).height).toBe(1)
  })

  it('re-renders when the `frame` prop changes', () => {
    const twoFrame: SpriteData = {
      width: 1,
      height: 1,
      palette: ['#ff0000', '#00ff00'],
      frames: [['0'], ['1']],
    }
    const gridSpy = vi.spyOn(spriteDataModule, 'gridToImageData')
    const { rerender } = render(<PixelSprite data={twoFrame} frame={0} />)
    expect(gridSpy).toHaveBeenLastCalledWith(twoFrame, 0)
    rerender(<PixelSprite data={twoFrame} frame={1} />)
    expect(gridSpy).toHaveBeenLastCalledWith(twoFrame, 1)
    expect(contextSpy.ctx.putImageData).toHaveBeenCalledTimes(2)
    gridSpy.mockRestore()
  })
})
