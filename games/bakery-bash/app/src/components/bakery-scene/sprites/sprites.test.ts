import { describe, it, expect } from 'vitest'
import { validateSpriteData } from '../sprite-data'
import { chefBakery } from './chef-bakery'
import { chefDeli } from './chef-deli'
import { chefBarista } from './chef-barista'

describe('chef sprite data', () => {
  it('all three chef sprites are valid SpriteData', () => {
    expect(() => validateSpriteData(chefBakery)).not.toThrow()
    expect(() => validateSpriteData(chefDeli)).not.toThrow()
    expect(() => validateSpriteData(chefBarista)).not.toThrow()
  })

  it('chef sprites are 24x40 with exactly 2 frames', () => {
    for (const chef of [chefBakery, chefDeli, chefBarista]) {
      expect(chef.width).toBe(24)
      expect(chef.height).toBe(40)
      expect(chef.frames.length).toBe(2)
    }
  })

  it('chef sprites share the canonical uniform palette (K-06)', () => {
    // K-06 (2026-04-29): the three sous-chef sprites are intentionally
    // identical — white hat (index 4), white shirt (index 5), navy
    // apron (index 6), navy apron shadow (index 7) — so they all read
    // as "chef" from the across-the-room tile size. Per-station
    // identity now lives in the scene context, not the apron.
    const HAT_WHITE = '#ffffff'
    const SHIRT_WHITE = '#ffffff'
    const APRON_NAVY = '#1e3a8a'
    const APRON_NAVY_SHADOW = '#172554'
    for (const chef of [chefBakery, chefDeli, chefBarista]) {
      expect(chef.palette[4]).toBe(HAT_WHITE)
      expect(chef.palette[5]).toBe(SHIRT_WHITE)
      expect(chef.palette[6]).toBe(APRON_NAVY)
      expect(chef.palette[7]).toBe(APRON_NAVY_SHADOW)
    }
    // Each sprite still owns its own palette array (no shared ref).
    expect(chefBakery.palette).not.toBe(chefDeli.palette)
    expect(chefDeli.palette).not.toBe(chefBarista.palette)
  })
})
