import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { FxLayer } from './FxLayer'

describe('<FxLayer>', () => {
  const originalRandom = Math.random

  beforeEach(() => {
    vi.useFakeTimers()
    // Seed Math.random for deterministic spawn timing
    Math.random = () => 0.9
  })
  afterEach(() => {
    vi.useRealTimers()
    Math.random = originalRandom
  })

  it('starts with no steam wisps', () => {
    const { container } = render(<FxLayer />)
    expect(container.querySelectorAll('.oven-steam').length).toBe(0)
  })

  it('eventually spawns at least one steam wisp within a few seconds', () => {
    const { container } = render(<FxLayer />)
    act(() => vi.advanceTimersByTime(6000))
    expect(container.querySelectorAll('.oven-steam').length).toBeGreaterThan(0)
  })
})
