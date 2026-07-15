import { describe, it, expect } from 'vitest';
import { askPrice, contractRate, minBid, hypeCurve, payrollAt, capOkWith,
         cutPlayer, expiringPids, coveredRounds } from '../src/payroll.js';

describe('pricing', () => {
  it('inflates the ask 8% per round from a round-1 base', () => {
    expect(askPrice(10.0, 1)).toBe(10.0);
    expect(askPrice(10.0, 2)).toBe(10.8);
    expect(askPrice(10.0, 3)).toBe(11.7);   // 11.664 -> 11.7
  });
  it('applies length discounts (spec worked example: $3.0M base, 3 rounds)', () => {
    expect(contractRate(3.0, 3)).toBe(2.6);   // 3.0*0.85 = 2.55 -> 2.6 ($0.1M rounding)
    expect(contractRate(10.0, 1)).toBe(10.0);
    expect(contractRate(10.0, 5)).toBe(7.5);
  });
  it('min bid is the inflated league minimum', () => {
    expect(minBid(1)).toBe(2.0);
    expect(minBid(3)).toBe(2.3);              // 2*1.1664 -> 2.3
  });
  it('hype curve prices unsold stars', () => {
    expect(hypeCurve(5.0)).toBeCloseTo(26.0, 5);
    expect(hypeCurve(1.0)).toBeCloseTo(2.0, 5);
  });
});

describe('payroll timeline', () => {
  const team = { roster: [
      { pid: 1, rate: 10.0, startRound: 1, years: 3 },   // covers 1-3
      { pid: 2, rate: 5.0, startRound: 2, years: 2 },    // covers 2-3
    ], deadMoney: [] };
  it('covers the right rounds', () => {
    expect(coveredRounds(team.roster[0])).toEqual([1, 2, 3]);
    expect(payrollAt(team, 1)).toBe(10.0);
    expect(payrollAt(team, 2)).toBe(15.0);
    expect(payrollAt(team, 4)).toBe(0.0);
  });
  it('cut moves the contract to dead money for cut round..end', () => {
    const after = cutPlayer(team, 1, 2);
    expect(after.roster.map((c) => c.pid)).toEqual([2]);
    expect(after.deadMoney).toEqual([{ rate: 10.0, startRound: 2, endRound: 3 }]);
    expect(payrollAt(after, 2)).toBe(15.0);   // unchanged: dead money still owed
    expect(payrollAt(after, 3)).toBe(15.0);
  });
  it('cap check inspects every covered round', () => {
    const rich = { roster: [{ pid: 9, rate: 95.0, startRound: 3, years: 2 }], deadMoney: [] };
    const res = capOkWith(rich, { rate: 6.0, startRound: 2, years: 3 }, 100.0, 5);
    expect(res.ok).toBe(false);
    expect(res.worstRound).toBe(3);           // 95 + 6 = 101 in rounds 3-4
  });
  it('lists expiring contracts', () => {
    expect(expiringPids(team, 4)).toEqual([1, 2]);  // both ended in round 3
    expect(expiringPids(team, 3)).toEqual([]);
  });
});
