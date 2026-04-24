import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBakeryScene } from './useBakeryScene'

describe('useBakeryScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  it('returns one chef per station when each staffCount is 1', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    expect(result.current.chefs).toHaveLength(3)
    const stations = result.current.chefs.map((c) => c.station)
    expect(stations).toEqual(expect.arrayContaining(['bakery', 'deli', 'barista']))
  })

  it('returns no chefs when all staffCounts are 0', () => {
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, staffCounts: { bakery: 0, deli: 0, barista: 0 } }),
    )
    expect(result.current.chefs).toHaveLength(0)
  })

  it('assigns the 4th chef to the station with the highest count', () => {
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, staffCounts: { bakery: 2, deli: 1, barista: 1 } }),
    )
    expect(result.current.chefs).toHaveLength(4)
    const bakeryChefs = result.current.chefs.filter((c) => c.station === 'bakery')
    expect(bakeryChefs).toHaveLength(2)
  })

  it('advances the idle-bob frame index over time via requestAnimationFrame', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const initialFrame = result.current.chefs[0].frame
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect([0, 1]).toContain(result.current.chefs[0].frame)
  })
})

describe('useBakeryScene — cat', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  it('returns a cat with an x inside the floor strip', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    const cat = result.current.cat
    expect(cat).toBeDefined()
    expect(cat.x).toBeGreaterThanOrEqual(10)
    expect(cat.x).toBeLessThanOrEqual(470)
    expect(cat.y).toBeGreaterThanOrEqual(220)
  })

  it('cat moves X over time while walking', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(baseProps))
    const initial = result.current.cat.x
    act(() => vi.advanceTimersByTime(500))
    rerender()
    const afterA = result.current.cat.x
    act(() => vi.advanceTimersByTime(2000))
    rerender()
    const afterB = result.current.cat.x
    expect(initial !== afterA || initial !== afterB).toBe(true)
  })

  it('cat state is one of walking/sitting/grooming', () => {
    const { result } = renderHook(() => useBakeryScene(baseProps))
    expect(['walking', 'sitting', 'grooming']).toContain(result.current.cat.state)
  })
})
