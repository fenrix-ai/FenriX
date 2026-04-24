import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { customerTemplates, CUSTOMER_FRAME } from './customer-templates'

describe('customer templates', () => {
  it('provides at least 3 templates × 2 palette variants = 6 variants', () => {
    expect(customerTemplates.length).toBeGreaterThanOrEqual(6)
  })

  it('each variant is valid 20x36 SpriteData with 5 frames', () => {
    for (const v of customerTemplates) {
      expect(() => validateSpriteData(v)).not.toThrow()
      expect(v.width).toBe(20)
      expect(v.height).toBe(36)
      expect(v.frames.length).toBe(5)
    }
  })

  it('exposes named frame indices walkL1/walkL2/walkR1/walkR2/idle', () => {
    expect(CUSTOMER_FRAME.walkLeft1).toBeDefined()
    expect(CUSTOMER_FRAME.walkLeft2).toBeDefined()
    expect(CUSTOMER_FRAME.walkRight1).toBeDefined()
    expect(CUSTOMER_FRAME.walkRight2).toBeDefined()
    expect(CUSTOMER_FRAME.idle).toBeDefined()
  })
})
