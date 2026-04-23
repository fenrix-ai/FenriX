import { describe, it, expect } from 'vitest'
import {
  gridToImageData,
  validateSpriteData,
  type SpriteData,
} from './sprite-data'

const tinySprite: SpriteData = {
  width: 2,
  height: 2,
  palette: ['#ff0000', '#00ff00'],
  frames: [
    ['01', '10'],
    ['10', '01'],
  ],
}

describe('gridToImageData', () => {
  it('renders frame 0 as expected RGBA bytes', () => {
    const { data, width, height } = gridToImageData(tinySprite, 0)
    expect(width).toBe(2)
    expect(height).toBe(2)
    // pixel (0,0): palette[0] = #ff0000 → [255,0,0,255]
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255])
    // pixel (1,0): palette[1] = #00ff00 → [0,255,0,255]
    expect([data[4], data[5], data[6], data[7]]).toEqual([0, 255, 0, 255])
    // pixel (0,1): palette[1] = #00ff00
    expect([data[8], data[9], data[10], data[11]]).toEqual([0, 255, 0, 255])
    // pixel (1,1): palette[0] = #ff0000
    expect([data[12], data[13], data[14], data[15]]).toEqual([255, 0, 0, 255])
  })

  it('treats space characters as fully transparent', () => {
    const sprite: SpriteData = {
      width: 2,
      height: 1,
      palette: ['#ff0000'],
      frames: [['0 ']],
    }
    const { data } = gridToImageData(sprite, 0)
    expect(data[3]).toBe(255) // pixel 0 opaque
    expect(data[7]).toBe(0) // pixel 1 alpha zero
  })

  it('renders different frames independently', () => {
    const { data: f0 } = gridToImageData(tinySprite, 0)
    const { data: f1 } = gridToImageData(tinySprite, 1)
    expect(f0[0]).not.toBe(f1[0])
  })
})

describe('validateSpriteData', () => {
  it('passes on valid sprite data', () => {
    expect(() => validateSpriteData(tinySprite)).not.toThrow()
  })

  it('throws when frame row count does not match height', () => {
    const bad: SpriteData = {
      width: 2,
      height: 2,
      palette: ['#fff'],
      frames: [['00']], // only 1 row, height is 2
    }
    expect(() => validateSpriteData(bad)).toThrow(/height/i)
  })

  it('throws when a row length does not match width', () => {
    const bad: SpriteData = {
      width: 2,
      height: 2,
      palette: ['#fff'],
      frames: [['00', '000']],
    }
    expect(() => validateSpriteData(bad)).toThrow(/width/i)
  })

  it('throws when a cell references a palette index out of bounds', () => {
    const bad: SpriteData = {
      width: 1,
      height: 1,
      palette: ['#fff'],
      frames: [['5']], // palette only has index 0
    }
    expect(() => validateSpriteData(bad)).toThrow(/palette/i)
  })
})
