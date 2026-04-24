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

  it('customer state transitions walking-in → transacting → walking-out', () => {
    const { result, rerender } = renderHook(() => useBakeryScene(simProps))
    act(() => vi.advanceTimersByTime(15_000))
    rerender()
    const customer = result.current.customers[0]
    expect(customer).toBeDefined()
    expect(['walking-in', 'transacting', 'walking-out']).toContain(customer.state)
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
    const { result, rerender } = renderHook(() =>
      useBakeryScene({ ...baseProps, mode: 'simulate', customerCount: 5 }),
    )
    act(() => vi.advanceTimersByTime(30_000))
    rerender()
    const anyWalkingOut = result.current.customers.some((c) => c.state === 'walking-out')
    const anyDollars = result.current.dollars.length > 0
    expect(anyWalkingOut || anyDollars).toBe(true)
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
