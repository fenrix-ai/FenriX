/**
 * P2.4 — runMonthlySimulation wrapper.
 *
 * Pins the contract:
 *   - 30 daily sub-simulations per round (configurable via MULTI_DAY.daysPerRound)
 *   - cost / loan-shark / burglary / budget update happen ONCE per month, not per day
 *   - per-day customer counts vary because of the demand multiplier
 *   - same gameId/round = same monthly outcome (reproducibility)
 */

const assert = require('node:assert/strict');
const configMod = require('../functions/modules/config');
const { runMonthlySimulation } = require('../functions/modules/multi-day-simulation');

// Same merge pattern as revenue.test.js — runSimulation reads top-level
// fields like cfg.unitCostPerProduct that live under DEFAULT_GAME_CONFIG.
const config = {
  ...configMod,
  ...configMod.DEFAULT_GAME_CONFIG,
};

const fakePlayer = (id, overrides = {}) => ({
  playerId: id,
  displayName: id,
  bakeryName: id,
  decision: {
    menu: { croissant: true, cookie: true, bagel: true },
    quantities: { croissant: 200, cookie: 200, bagel: 200 },
    sousChefCount: 1,
    sousChefAssignments: { croissant: 1 },
    productPrices: { croissant: 4.75, cookie: 4.0, bagel: 4.5 },
  },
  specialtyChefs: [],
  budgetCurrent: 10000,
  returningCustomersPending: 0,
  auctionResults: { adWins: [], adBidPaid: 0, chefsWon: [], chefBidPaid: 0 },
  priorSubmittedPrices: [],
  ...overrides,
});

describe('runMonthlySimulation', () => {
  const prefs = { modifiers: { croissant: 1.0, cookie: 1.0, bagel: 1.0 } };

  it('returns one monthly aggregate per player + an array of daily rows', () => {
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    assert.equal(out.length, 1, 'one aggregate per player');
    const agg = out[0];
    assert.ok(Array.isArray(agg.dailyResults), 'has dailyResults array');
    assert.equal(agg.dailyResults.length, config.MULTI_DAY.daysPerRound, '30 daily rows');
  });

  it('monthly revenueGross equals sum of daily revenueGross', () => {
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    const sum = agg.dailyResults.reduce((s, d) => s + d.revenueGross, 0);
    assert.ok(Math.abs(agg.revenueGross - sum) < 0.01,
      `monthly gross (${agg.revenueGross}) should equal sum of daily gross (${sum})`);
  });

  it('charges cost ONCE per month, not 30x', () => {
    // Stock 600 units * $1 = $600. Plus 1 sous chef = $10. Total ~$610.
    // If cost were charged 30x, totalSpent would be ~$18,300 — way out of bounds.
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    assert.ok(agg.totalSpent < 2000, `expected monthly cost < $2k, got $${agg.totalSpent}`);
    assert.ok(agg.totalSpent > 500, `expected monthly cost > $500, got $${agg.totalSpent}`);
  });

  it('does NOT charge loan-shark interest 30x for an overspending team', () => {
    // Force overspend: tiny budget, expensive decisions.
    const broke = fakePlayer('p_a', { budgetCurrent: 100 });
    const out = runMonthlySimulation([broke], prefs, config, { gameId: 'g1', round: 1 });
    const agg = out[0];
    // Real one-time loan: borrow ~$510 at 10% = ~$51 interest. 30x would be ~$1,500.
    assert.ok(agg.interestCharged > 0, 'loan-shark should fire on overspend');
    assert.ok(agg.interestCharged < 200,
      `expected one-time interest < $200, got $${agg.interestCharged}`);
  });

  it('produces different daily customer counts (variability fires)', () => {
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const counts = out[0].dailyResults.map((d) => d.customerCount);
    const uniq = new Set(counts);
    assert.ok(uniq.size > 1, `expected variety in daily customer counts, got ${counts.join(',')}`);
  });

  it('is deterministic for the same gameId/round (reproducible)', () => {
    const a = runMonthlySimulation([fakePlayer('p_a')], prefs, config, { gameId: 'g1', round: 1 });
    const b = runMonthlySimulation([fakePlayer('p_a')], prefs, config, { gameId: 'g1', round: 1 });
    assert.equal(a[0].revenueGross, b[0].revenueGross, 'same inputs = same outputs');
  });

  it('produces different outcomes across rounds (round folded into seed)', () => {
    const r1 = runMonthlySimulation([fakePlayer('p_a')], prefs, config, { gameId: 'g1', round: 1 });
    const r2 = runMonthlySimulation([fakePlayer('p_a')], prefs, config, { gameId: 'g1', round: 2 });
    assert.notEqual(r1[0].revenueGross, r2[0].revenueGross,
      'different rounds should produce different revenueGross via day*round noise seeds');
  });

  it('rolls burglary at most once per month, not once per day', () => {
    const dirtyPlayer = fakePlayer('p_a', { cleanliness_pct: 10 });
    const out = runMonthlySimulation([dirtyPlayer], prefs, config, { gameId: 'g1', round: 1 });
    const burgledDays = out[0].dailyResults.filter((d) => d.burglary).length;
    assert.ok(burgledDays <= 1, `expected ≤1 burgled day, got ${burgledDays}`);
  });
});
