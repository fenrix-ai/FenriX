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
