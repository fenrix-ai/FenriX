import { describe, it, expect } from 'vitest';
import { parseGamePhase } from '../types/game';

describe('parseGamePhase', () => {
  it('returns lobby for null/undefined/empty', () => {
    expect(parseGamePhase(null).base).toBe('lobby');
    expect(parseGamePhase(undefined).base).toBe('lobby');
    expect(parseGamePhase('').base).toBe('lobby');
  });

  it('parses "lobby"', () => {
    const r = parseGamePhase('lobby');
    expect(r.base).toBe('lobby');
    expect(r.round).toBe(0);
  });

  it('parses "game_over"', () => {
    const r = parseGamePhase('game_over');
    expect(r.base).toBe('game_over');
    expect(r.round).toBe(null);
  });

  it('parses round_N_email', () => {
    const r = parseGamePhase('round_1_email');
    expect(r.base).toBe('email');
    expect(r.round).toBe(1);
  });

  it('parses round_N_decide', () => {
    const r = parseGamePhase('round_3_decide');
    expect(r.base).toBe('decide');
    expect(r.round).toBe(3);
  });

  it('parses round_N_bid_ad', () => {
    const r = parseGamePhase('round_2_bid_ad');
    expect(r.base).toBe('bid_ad');
    expect(r.round).toBe(2);
  });

  it('parses round_N_bid_chef', () => {
    const r = parseGamePhase('round_2_bid_chef');
    expect(r.base).toBe('bid_chef');
    expect(r.round).toBe(2);
  });

  it('parses round_N_roster', () => {
    const r = parseGamePhase('round_4_roster');
    expect(r.base).toBe('roster');
    expect(r.round).toBe(4);
  });

  it('parses bare "simulating" and "results_ready"', () => {
    expect(parseGamePhase('simulating').base).toBe('simulating');
    expect(parseGamePhase('results_ready').base).toBe('results_ready');
  });

  it('resolves legacy alias: closing_hours → decide', () => {
    expect(parseGamePhase('closing_hours').base).toBe('decide');
  });

  it('resolves legacy alias: auction → bid_ad', () => {
    expect(parseGamePhase('auction').base).toBe('bid_ad');
  });

  it('resolves legacy alias: open_for_business → simulating', () => {
    expect(parseGamePhase('open_for_business').base).toBe('simulating');
  });

  it('resolves legacy alias: results → results_ready', () => {
    expect(parseGamePhase('results').base).toBe('results_ready');
  });

  it('falls back to lobby for unknown phase strings', () => {
    expect(parseGamePhase('round_1_unknown_phase').base).toBe('lobby');
    expect(parseGamePhase('totally_unknown').base).toBe('lobby');
  });
});
