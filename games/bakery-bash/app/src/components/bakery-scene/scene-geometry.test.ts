import { describe, it, expect } from 'vitest'
import { SCENE } from './scene-geometry'

describe('SCENE geometry', () => {
  it('declares 480x270 native dimensions', () => {
    expect(SCENE.width).toBe(480)
    expect(SCENE.height).toBe(270)
  })

  it('zone Y-coordinates sum to full scene height', () => {
    const total = SCENE.zones.wallMounts.height
      + SCENE.zones.midBand.height
      + SCENE.zones.wainscoting.height
      + SCENE.zones.counter.height
      + SCENE.zones.floor.height
    expect(total).toBe(SCENE.height)
  })

  it('exposes door X and floor Y for character positioning', () => {
    expect(SCENE.door.x).toBeGreaterThanOrEqual(SCENE.width - 30)
    expect(SCENE.door.x).toBeLessThan(SCENE.width)
    expect(SCENE.floorBaselineY).toBe(
      SCENE.zones.wallMounts.height
        + SCENE.zones.midBand.height
        + SCENE.zones.wainscoting.height
        + SCENE.zones.counter.height,
    )
  })

  it('defines chef station X centers inside the counter zone', () => {
    const { bakery, deli, barista } = SCENE.stations
    for (const x of [bakery, deli, barista]) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(SCENE.door.x)
    }
    expect(bakery).toBeLessThan(deli)
    expect(deli).toBeLessThan(barista)
  })
})
