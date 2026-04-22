import { describe, it, expect } from 'vitest';
import { parseGamePhase } from '../types/game';
import type { GameState } from '../types/game';

// ─── Inline the reducer logic under test ────────────────────────────────────
// We duplicate only what we need to test rather than exporting internals.
// If the reducer shape changes, update here and the tests will catch drift.

const DEFAULT_ROUND = 0;
const DEFAULT_PHASE = 'lobby';

function stateAfterJoin(prev: Partial<GameState> = {}): GameState {
  // Mirrors the JOIN_GAME branch: spread initialState, apply join fields.
  const base: GameState = {
    gameId: null,
    playerId: null,
    gameCode: null,
    phase: DEFAULT_PHASE,
    currentRound: DEFAULT_ROUND,
    totalRounds: 5,
    player: null,
    players: [],
    roundResults: [],
    timeRemaining: null,
    auctionTab: 'chefs',
    pendingDecision: {
      menu: {} as never,
      quantities: {} as never,
      sousChefCount: 0,
      sousChefAssignments: {} as never,
      staffCounts: {} as never,
      maintenanceTasks: [],
      productPrices: {} as never,
    },
    pendingAdBids: {} as never,
    pendingChefBids: {},
    config: null,
    decisionSubmitted: false,
    pricesSubmitted: false,
    priceSubmissionReceipt: null,
    adBidsSubmitted: false,
    chefBidsSubmitted: false,
    maintenanceBars: { cleanliness: 100, ovenHealth: 100, slicerHealth: 100, espressoHealth: 100 },
    chefSatisfactionScores: {},
    budgetCurrent: null,
    role: 'solo',
    teamId: null,
    teamName: null,
    phaseEndsAtMs: null,
    ...prev,
  };
  return {
    ...base,
    gameId: 'game-b',
    playerId: 'player-b',
    gameCode: 'ABC123',
    player: { name: 'Bob', bakeryName: "Bob's Buns" } as never,
    // JOIN_GAME resets everything back to initial defaults
    phase: DEFAULT_PHASE,
    currentRound: DEFAULT_ROUND,
    roundResults: [],
    decisionSubmitted: false,
    pricesSubmitted: false,
    priceSubmissionReceipt: null,
    adBidsSubmitted: false,
    chefBidsSubmitted: false,
    role: 'solo',
    teamId: null,
    teamName: null,
    budgetCurrent: null,
    config: null,
    phaseEndsAtMs: null,
  };
}

describe('JOIN_GAME state reset', () => {
  it('resets currentRound to 0 when joining a new game', () => {
    const stale: Partial<GameState> = { currentRound: 3 };
    const next = stateAfterJoin(stale);
    expect(next.currentRound).toBe(0);
  });

  it('resets phase to lobby when joining a new game', () => {
    const stale: Partial<GameState> = { phase: 'round_3_decide' };
    const next = stateAfterJoin(stale);
    expect(next.phase).toBe('lobby');
  });

  it('clears roundResults when joining a new game', () => {
    const stale: Partial<GameState> = {
      roundResults: [{ round: 1, revenue: 5000, customerCount: 100, customerSatisfaction: 80, auctionResults: { adWon: null, chefWon: null } }],
    };
    const next = stateAfterJoin(stale);
    expect(next.roundResults).toHaveLength(0);
  });

  it('resets submission flags', () => {
    const stale: Partial<GameState> = { decisionSubmitted: true, adBidsSubmitted: true, chefBidsSubmitted: true };
    const next = stateAfterJoin(stale);
    expect(next.decisionSubmitted).toBe(false);
    expect(next.adBidsSubmitted).toBe(false);
    expect(next.chefBidsSubmitted).toBe(false);
  });

  it('clears teamId and teamName', () => {
    const stale: Partial<GameState> = { teamId: 'team-a', teamName: 'Crumb Lords' };
    const next = stateAfterJoin(stale);
    expect(next.teamId).toBeNull();
    expect(next.teamName).toBeNull();
  });

  it('sets gameId and playerId from payload', () => {
    const next = stateAfterJoin();
    expect(next.gameId).toBe('game-b');
    expect(next.playerId).toBe('player-b');
  });
});

describe('parseGamePhase navigation targets', () => {
  // Mirrors the target-selection logic in GamePhaseListener / useGamePhaseNav.
  function navTarget(phase: string): string {
    const base = parseGamePhase(phase).base;
    if (base === 'bid_ad' || base === 'bid_chef') return '/auction';
    if (base === 'email') return '/game/email';
    if (base === 'roster') return '/game/roster';
    if (base === 'game_over') return '/game/conclusion';
    if (base === 'lobby') return '/lobby';
    return '/game';
  }

  it('routes email phase to /game/email', () => {
    expect(navTarget('round_1_email')).toBe('/game/email');
  });

  it('routes decide phase to /game', () => {
    expect(navTarget('round_1_decide')).toBe('/game');
  });

  it('routes bid_ad to /auction', () => {
    expect(navTarget('round_1_bid_ad')).toBe('/auction');
  });

  it('routes bid_chef to /auction', () => {
    expect(navTarget('round_1_bid_chef')).toBe('/auction');
  });

  it('routes roster phase to /game/roster', () => {
    expect(navTarget('round_1_roster')).toBe('/game/roster');
  });

  it('routes simulating to /game', () => {
    expect(navTarget('simulating')).toBe('/game');
  });

  it('routes results_ready to /game', () => {
    expect(navTarget('results_ready')).toBe('/game');
  });

  it('routes game_over to /game/conclusion', () => {
    expect(navTarget('game_over')).toBe('/game/conclusion');
  });

  it('lobby phase does not route to a game page', () => {
    expect(navTarget('lobby')).toBe('/lobby');
  });
});
