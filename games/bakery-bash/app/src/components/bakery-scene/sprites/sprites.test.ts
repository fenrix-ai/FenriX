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

  it('chef sprites have distinct palettes (apron colors differ)', () => {
    // The 3rd palette entry is traditionally the body/apron fill in our grids;
    // at minimum, each sprite must have its own palette array (no shared ref).
    expect(chefBakery.palette).not.toBe(chefDeli.palette)
    expect(chefDeli.palette).not.toBe(chefBarista.palette)
    // And at least one color must differ between any two chefs.
    const chefsDiffer = (a: readonly string[], b: readonly string[]) =>
      a.length !== b.length || a.some((c, i) => c !== b[i])
    expect(chefsDiffer(chefBakery.palette, chefDeli.palette)).toBe(true)
    expect(chefsDiffer(chefDeli.palette, chefBarista.palette)).toBe(true)
  })
})
