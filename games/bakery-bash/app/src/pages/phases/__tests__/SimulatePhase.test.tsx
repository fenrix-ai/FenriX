import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

type RoundResultStub = {
  round: number
  revenue: number
  customerCount: number
  customerSatisfaction: number
  auctionResults: { adWon: string | null; chefWon: string | null }
  burglary?: boolean
  burglaryAmount?: number
}

type GameStateStub = {
  teamName: string | null
  player: { bakeryName?: string } | null
  role: string | null
  currentRound: number
  totalRounds: number
  pendingDecision: {
    menu: Record<string, boolean>
    quantities: Record<string, number>
    productPrices: Record<string, number>
    staffCounts: {
      bakerySousChefs: number
      deliSousChefs: number
      baristaSousChefs: number
    }
    sousChefAssignments: Record<string, number>
    pendingBids: Record<string, number>
    pendingAdBids: Record<string, number>
  }
  roundResults: RoundResultStub[]
  maintenanceBars: { cleanliness: number; ovenHealth: number }
}

const baseGameState: GameStateStub = {
  teamName: 'Bun Appétit',
  player: null,
  role: null,
  currentRound: 1,
  totalRounds: 5,
  pendingDecision: {
    menu: {
      croissant: true,
      cookie: true,
      bagel: true,
      sandwich: true,
      coffee: true,
      matcha: true,
    },
    quantities: {},
    productPrices: {},
    staffCounts: {
      bakerySousChefs: 1,
      deliSousChefs: 1,
      baristaSousChefs: 1,
    },
    sousChefAssignments: {},
    pendingBids: {},
    pendingAdBids: {},
  },
  roundResults: [
    {
      round: 1,
      revenue: 1200,
      customerCount: 40,
      customerSatisfaction: 75,
      auctionResults: { adWon: null, chefWon: null },
    },
  ],
  maintenanceBars: { cleanliness: 100, ovenHealth: 100 },
}

let mockGameState: GameStateStub = baseGameState

vi.mock('../../../contexts/GameContext', () => ({
  useGame: () => mockGameState,
  useGameDispatch: () => vi.fn(),
}))

import { SimulatePhase } from '../SimulatePhase'

describe('SimulatePhase with PixelBakeryScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGameState = baseGameState
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the team name on the pixel scene sign', () => {
    render(<SimulatePhase />)
    // There may be multiple elements with this text (sign + title); pick the
    // one inside the pixel scene sign.
    const signText = document.querySelector('.pixel-scene__sign-text')
    expect(signText?.textContent).toBe('Bun Appétit')
  })

  it('spawns at least one customer in the pixel scene after 4s', () => {
    render(<SimulatePhase />)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    const customers = document.querySelectorAll('.pixel-customer')
    expect(customers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders no customers when customerCount is 0', () => {
    mockGameState = {
      ...baseGameState,
      roundResults: [
        {
          round: 1,
          revenue: 0,
          customerCount: 0,
          customerSatisfaction: 0,
          auctionResults: { adWon: null, chefWon: null },
        },
      ],
    }

    render(<SimulatePhase />)

    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(document.querySelectorAll('.pixel-customer').length).toBe(0)
  })

  it('renders chef sprites based on staffCounts', () => {
    render(<SimulatePhase />)
    const chefs = document.querySelectorAll('.pixel-chef')
    // baseGameState has 1 chef at each of 3 stations.
    expect(chefs.length).toBe(3)
  })

  it('shows no chef for a station with zero sous chefs', () => {
    mockGameState = {
      ...baseGameState,
      pendingDecision: {
        ...baseGameState.pendingDecision,
        staffCounts: {
          bakerySousChefs: 0,
          deliSousChefs: 2,
          baristaSousChefs: 0,
        },
      },
    }

    render(<SimulatePhase />)
    const chefs = document.querySelectorAll('.pixel-chef')
    expect(chefs.length).toBe(1)
  })

  it('applies the simulate-phase--pixel reskin class', () => {
    const { container } = render(<SimulatePhase />)
    expect(container.querySelector('.simulate-phase--pixel')).not.toBeNull()
  })

  it('renders the AdDisplay poster when an ad was won', () => {
    mockGameState = {
      ...baseGameState,
      roundResults: [
        {
          round: 1,
          revenue: 1500,
          customerCount: 60,
          customerSatisfaction: 80,
          auctionResults: { adWon: 'TV', chefWon: null },
        },
      ],
    }
    render(<SimulatePhase />)
    const ad = document.querySelector('.pixel-scene__ad')
    expect(ad).not.toBeNull()
  })
})
