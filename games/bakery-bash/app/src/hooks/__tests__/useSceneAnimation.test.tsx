import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneAnimation } from '../useSceneAnimation'

describe('useSceneAnimation — reduced motion', () => {
  it('returns empty arrays and starts no loop when reducedMotion is true', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: true,
      })
    )

    expect(result.current.customers).toEqual([])
    expect(result.current.dollars).toEqual([])
  })
})

describe('useSceneAnimation — spawn interval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns first customer after roughly (simDurationMs / customerCount) ms', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    expect(result.current.customers).toHaveLength(0)

    // base interval = 1500ms. Advance past the upper jitter bound (1.25x = 1875ms)
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.customers.length).toBeGreaterThanOrEqual(1)
  })

  it('spawns at ghost-town pace when customerCount is small', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 10,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    // base interval = 12_000ms. After 5s, no spawn yet.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.customers).toHaveLength(0)
  })
})

describe('useSceneAnimation — actor lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves a customer during WALK_IN (x decreases over time)', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.customers.length).toBeGreaterThanOrEqual(1)
    const spawned = result.current.customers[0]
    // Actor may have ticked slightly between spawn and test observation.
    const initialX = spawned.x
    expect(initialX).toBeGreaterThan(400)

    // Tick for another second — actor should continue moving left.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    const customerNow = result.current.customers.find((c) => c.id === spawned.id)
    expect(customerNow).toBeDefined()
    expect(customerNow!.x).toBeLessThan(initialX)
  })

  it('transitions a customer out of WALK_IN once they reach targetX', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const spawned = result.current.customers[0]

    // Worst-case walk = 5s, plus safety margin for spawn-time offset.
    act(() => {
      vi.advanceTimersByTime(6000)
    })

    const customerNow = result.current.customers.find((c) => c.id === spawned.id)
    // Either still in scene with phase past WALK_IN, or already despawned.
    if (customerNow) {
      expect(customerNow.phase).not.toBe('WALK_IN')
    }
  })

  it('removes the customer from state after WALK_OUT completes', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const spawnedId = result.current.customers[0].id

    // Full lifecycle: walk-in (~5s worst case) + pause (~0.9s) + walk-out (~5s) ≈ 11s worst.
    // Pad generously.
    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(result.current.customers.find((c) => c.id === spawnedId)).toBeUndefined()
  })
})
