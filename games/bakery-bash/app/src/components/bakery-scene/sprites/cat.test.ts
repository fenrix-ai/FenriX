import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { cat, CAT_FRAME } from './cat'

describe('cat sprite', () => {
  it('is valid SpriteData 20x14', () => {
    expect(() => validateSpriteData(cat)).not.toThrow()
    expect(cat.width).toBe(20)
    expect(cat.height).toBe(14)
  })

  it('exposes named frame indices for walk/sit/groom', () => {
    expect(CAT_FRAME.walkLeft1).toBeDefined()
    expect(CAT_FRAME.walkLeft2).toBeDefined()
    expect(CAT_FRAME.walkRight1).toBeDefined()
    expect(CAT_FRAME.walkRight2).toBeDefined()
    expect(CAT_FRAME.sit).toBeDefined()
    expect(CAT_FRAME.groom).toBeDefined()
    expect(cat.frames.length).toBeGreaterThanOrEqual(6)
  })
})
