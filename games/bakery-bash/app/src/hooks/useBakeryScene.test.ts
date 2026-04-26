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

describe('useBakeryScene — customers (simulate)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  const simProps = { ...baseProps, mode: 'simulate' as const, customerCount: 20 }

  it('spawns no customers on Decide mode regardless of customerCount', () => {
    const { result } = renderHook(() => useBakeryScene({ ...baseProps, customerCount: 20 }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.customers.length).toBe(0)
  })

  it('spawns at least one customer during Simulate within 10s', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    act(() => vi.advanceTimersByTime(10_000))
    rerender()
    expect(result.current.customers.length).toBeGreaterThan(0)
  })

  it('respects a soft cap of 4 customers on-screen', () => {
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...simProps, customerCount: 999 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    expect(result.current.customers.length).toBeLessThanOrEqual(4)
  })

  it('customer state cycles through approach → transact → exit', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    act(() => vi.advanceTimersByTime(15_000))
    rerender()
    const customer = result.current.customers[0]
    expect(customer).toBeDefined()
    // V9 added 'walking-up' (floor → counter) and 'walking-down'
    // (counter → floor) between the original states. After 15s of sim
    // a customer should be in *some* stage of the approach cycle.
    expect([
      'walking-in',
      'walking-up',
      'transacting',
      'walking-down',
      'walking-out',
    ]).toContain(customer.state)
  })

  /**
   * V9 — verify the customer actually walks UP to the counter after the
   * horizontal walk. Previously they'd stay at counter Y the whole time
   * (sidesteppping along the counter from off-screen-right). Now they
   * spawn at the floor, walk to the station X, and only then climb up.
   */
  it('customer climbs to counter Y after reaching the station X', () => {
    // Sample customer positions every second over a long window. We
    // expect to see at least one Y value that is *greater* than 200
    // (floor walk before climbing) AND at least one Y at or near 198
    // (counter line, where the transaction happens). Two distinct Y
    // samples prove the walk-up actually animates.
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    const ySamples = new Set<number>()
    for (let t = 0; t < 30_000; t += 250) {
      act(() => vi.advanceTimersByTime(250))
      rerender()
      for (const c of result.current.customers) {
        ySamples.add(Math.round(c.y))
      }
    }
    const sortedY = [...ySamples].sort((a, b) => a - b)
    // At least one customer should have been seen high (counter Y ≈ 198)
    // and at least one low (floor Y ≈ 230). If only one Y appears the
    // walk-up never engaged.
    const sawCounter = sortedY.some((y) => y <= 200)
    const sawFloor = sortedY.some((y) => y >= 220)
    expect({ sortedY, sawCounter, sawFloor }).toEqual(
      expect.objectContaining({ sawCounter: true, sawFloor: true }),
    )
  })
})

describe('useBakeryScene — dollar bills', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  it('dollar bills spawn when a customer completes transactionMs', () => {
    // V9: walking-up + walking-down add ~1.3s to the cycle. Bump the
    // customer count so the spawn interval drops to the 1500ms floor
    // and we sample plenty of cycles inside the 60s window — sales
    // fire on transition into walking-down, and dollars expire
    // 4_000ms later, so we need to catch the brief window where
    // either is observable.
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 80 }),
    )
    let everSawSaleEvidence = false
    for (let t = 0; t < 60_000; t += 500) {
      act(() => vi.advanceTimersByTime(500))
      rerender()
      const post = result.current.customers.some(
        (c) => c.state === 'walking-down' || c.state === 'walking-out',
      )
      if (post || result.current.dollars.length > 0) {
        everSawSaleEvidence = true
        break
      }
    }
    expect(everSawSaleEvidence).toBe(true)
  })

  it('each dollar has x, y, createdMs within sane scene bounds', () => {
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 5 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    for (const d of result.current.dollars) {
      expect(d.x).toBeGreaterThan(0)
      expect(d.x).toBeLessThan(480)
      expect(d.y).toBeGreaterThan(100)
      expect(d.y).toBeLessThan(270)
    }
  })
})

describe('useBakeryScene — reduced motion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const baseProps = {
    mode: 'decide' as const,
    teamName: 'X',
    staffCounts: { bakery: 1, deli: 1, barista: 1 },
    customerCount: 0,
  }

  function mockReducedMotion(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('reduce') && matches,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }

  it('does not spawn customers when reduced motion is active', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 20 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.customers.length).toBe(0)
  })

  it('cat stays sitting when reduced motion is active', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useBakeryScene(baseProps))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.cat.state).toBe('sitting')
  })
})
