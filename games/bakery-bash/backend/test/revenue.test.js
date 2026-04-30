/**
 * Pins the gaussianNoise seed contract that the multi-day simulation
 * (P2) relies on: same seed → same noise; different day in seed → different
 * noise; clamps respected.
 */

const assert = require('node:assert/strict');
const { gaussianNoise } = require('../functions/modules/revenue');
const { runSimulation } = require('../functions/modules/simulation');
const configMod = require('../functions/modules/config');
// runSimulation expects a *merged* game config (the DEFAULT_GAME_CONFIG
// shape that index.js loads from Firestore — not the bare module object).
// Fold module-level pure constants in so PRICE_ZONES / AD_TYPES / etc.
// are reachable from the merged config.
const config = {
  ...configMod,
  ...configMod.DEFAULT_GAME_CONFIG,
};

describe('gaussianNoise', () => {
  it('produces identical noise for the same seed', () => {
    const a = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const b = gaussianNoise(-2, 2, 'game:1:0:player_a');
    assert.equal(a, b, 'same seed must produce same noise');
  });

  it('produces different noise when only day differs', () => {
    const day0 = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const day1 = gaussianNoise(-2, 2, 'game:1:1:player_a');
    assert.notEqual(day0, day1, 'changing day must change noise');
  });

  it('produces different noise when only player differs', () => {
    const a = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const b = gaussianNoise(-2, 2, 'game:1:0:player_b');
    assert.notEqual(a, b, 'changing player must change noise');
  });

  it('respects min/max clamps across many seeds', () => {
    for (let d = 0; d < 200; d += 1) {
      const v = gaussianNoise(-2, 2, `game:1:${d}:player_a`);
      assert.ok(v >= -2 && v <= 2, `value ${v} out of range`);
    }
  });
});

describe('runSimulation skipCostAccounting flag', () => {
  // Intentionally low budget + meaningful stock to trigger loan-shark
  // when skipCostAccounting=false, and to highlight the difference.
  const player = {
    playerId: 'p_a',
    displayName: 'p_a',
    bakeryName: 'p_a',
    decision: {
      menu: { croissant: true, cookie: true, bagel: true },
      quantities: { croissant: 200, cookie: 200, bagel: 200 },
      sousChefCount: 1,
      sousChefAssignments: { croissant: 1 },
      productPrices: { croissant: 4.75, cookie: 4.0, bagel: 4.5 },
    },
    specialtyChefs: [],
    budgetCurrent: 100, // intentionally low to trigger loan-shark
    returningCustomersPending: 0,
    auctionResults: { adWins: [], adBidPaid: 0, chefsWon: [], chefBidPaid: 0 },
    priorSubmittedPrices: [],
  };
  const prefs = { modifiers: { croissant: 1, cookie: 1, bagel: 1 } };

  it('skipCostAccounting=true zeros cost / loan-shark / budget update', () => {
    const r = runSimulation([player], prefs, config, { gameId: 'g', round: 1, skipCostAccounting: true })[0];
    assert.equal(r.totalSpent, 0, 'no cost charged');
    assert.equal(r.amountBorrowed, 0, 'no borrow');
    assert.equal(r.interestCharged, 0, 'no interest');
    assert.equal(r.budgetAfter, player.budgetCurrent, 'budget unchanged');
  });

  it('skipCostAccounting=false (default) preserves prior behavior', () => {
    const r = runSimulation([player], prefs, config)[0];
    assert.ok(r.totalSpent > 0, 'cost should be charged');
    assert.ok(r.amountBorrowed > 0, 'loan-shark should fire on overspend');
  });

  it('revenueGross is identical between skip and non-skip modes', () => {
    const skipped = runSimulation([player], prefs, config, { gameId: 'g', round: 1, skipCostAccounting: true })[0];
    const normal = runSimulation([player], prefs, config, { gameId: 'g', round: 1, skipCostAccounting: false })[0];
    assert.equal(skipped.revenueGross, normal.revenueGross, 'gross revenue independent of cost accounting');
  });
});

describe('runSimulation equipment upgrade affordability (PR #128)', () => {
  // Stock cost: 200*3 = $600. Sous chef: $10. Round cost ≈ $610.
  // Upgrade C→B = $1000. Maintenance @ 10 staff @ $20 = $200.
  // Budget set so the upgrade fits ONLY if maintenance is ignored.
  const baseDecision = {
    menu: { croissant: true, cookie: true, bagel: true },
    quantities: { croissant: 200, cookie: 200, bagel: 200 },
    sousChefCount: 1,
    sousChefAssignments: { croissant: 1 },
    productPrices: { croissant: 4.75, cookie: 4.0, bagel: 4.5 },
    equipmentUpgradePurchased: true,
    staffCounts: { maintenanceGuys: 10 }, // $200 in maintenance
  };
  const player = {
    playerId: 'p_a',
    displayName: 'p_a',
    bakeryName: 'p_a',
    decision: baseDecision,
    specialtyChefs: [],
    // $1660: covers round ($610) + upgrade ($1000) + $50 surplus, but
    // does NOT cover round + maintenance ($810) + upgrade ($1000) = $1810.
    budgetCurrent: 1660,
    equipmentGrade: 'C',
    cleanlinessScore: 75,
    returningCustomersPending: 0,
    auctionResults: { adWins: [], adBidPaid: 0, chefsWon: [], chefBidPaid: 0 },
    priorSubmittedPrices: [],
  };
  const prefs = { modifiers: { croissant: 1, cookie: 1, bagel: 1 } };

  it('rejects upgrade when remaining budget cannot cover BOTH maintenance and upgrade', () => {
    const r = runSimulation([player], prefs, config, { gameId: 'g', round: 1 })[0];
    assert.equal(r.equipmentGrade, 'C',
      `upgrade should NOT be approved: budget $1660 covers round + upgrade ($1610) ` +
      `but not round + maintenance + upgrade ($1810). Got equipmentGrade=${r.equipmentGrade}.`);
    assert.equal(r.equipmentUpgradeApplied, false,
      'equipmentUpgradeApplied should be false when maintenance + upgrade exceed budget');
  });
});

describe('calculateRoundCosts — per-station sous-chef escalation', () => {
  const { calculateRoundCosts } = require('../functions/modules/revenue');

  // Per-station escalation curve at base=$10:
  //   1 chef = $10 (1.0×)
  //   2 chefs = $10 + $15 = $25 (1.0× + 1.5×)
  // Three stations × 2 chefs each: 3 × $25 = $75 (per-station, frontend-matched)
  // Aggregate-curve cost (the OLD broken behavior):
  //   6 chefs = $10 + $15 + $22.50 + $30 + $37.50 + $45 = $160
  it('charges $75 for 2 chefs at each of 3 stations (NOT $160 aggregate)', () => {
    const decision = {
      perProductQtyStocked: {},
      sousChefCount: 6, // intentionally set; should be IGNORED
      staffCounts: {
        bakerySousChefs: 2,
        deliSousChefs: 2,
        baristaSousChefs: 2,
      },
    };
    const result = calculateRoundCosts(decision, {}, { sousChefBaseCost: 10 });
    assert.equal(result.sousChefHireCost, 75,
      `per-station: 3 × ($10 + $15) = $75. Got ${result.sousChefHireCost}. ` +
      `If you got 160, the aggregate curve is back.`);
  });

  it('charges $0 when all stations are empty', () => {
    const decision = {
      perProductQtyStocked: {},
      sousChefCount: 0,
      staffCounts: { bakerySousChefs: 0, deliSousChefs: 0, baristaSousChefs: 0 },
    };
    const result = calculateRoundCosts(decision, {}, { sousChefBaseCost: 10 });
    assert.equal(result.sousChefHireCost, 0);
  });

  it('charges $10 for a single chef on one station', () => {
    const decision = {
      perProductQtyStocked: {},
      sousChefCount: 1,
      staffCounts: { bakerySousChefs: 1, deliSousChefs: 0, baristaSousChefs: 0 },
    };
    const result = calculateRoundCosts(decision, {}, { sousChefBaseCost: 10 });
    assert.equal(result.sousChefHireCost, 10);
  });

  it('charges $142.50 for 3 chefs at each of 3 stations (NOT $340 aggregate)', () => {
    // Per-station 3 chefs = $10 + $15 + $22.50 = $47.50, × 3 = $142.50
    // Aggregate 9 chefs = $10 + $15 + $22.50 + $30 + $37.50 + $45 + $52.50 + $60 + $67.50 = $340
    // Hidden overcharge: $340 − $142.50 = $197.50
    const decision = {
      perProductQtyStocked: {},
      sousChefCount: 9,
      staffCounts: { bakerySousChefs: 3, deliSousChefs: 3, baristaSousChefs: 3 },
    };
    const result = calculateRoundCosts(decision, {}, { sousChefBaseCost: 10 });
    assert.equal(result.sousChefHireCost, 142.5,
      `per-station: 3 × ($10 + $15 + $22.50) = $142.50. Got ${result.sousChefHireCost}.`);
  });

  it('handles asymmetric station counts correctly', () => {
    // 1 + 2 + 4 = 7 chefs total
    // Per-station: $10 + ($10 + $15) + ($10 + $15 + $22.50 + $30) = $10 + $25 + $77.50 = $112.50
    const decision = {
      perProductQtyStocked: {},
      sousChefCount: 7,
      staffCounts: { bakerySousChefs: 1, deliSousChefs: 2, baristaSousChefs: 4 },
    };
    const result = calculateRoundCosts(decision, {}, { sousChefBaseCost: 10 });
    assert.equal(result.sousChefHireCost, 112.5);
  });
});
