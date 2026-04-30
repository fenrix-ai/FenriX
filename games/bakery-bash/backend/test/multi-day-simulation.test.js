/**
 * P2.4 — runMonthlySimulation wrapper.
 *
 * Pins the contract:
 *   - 30 daily sub-simulations per round (configurable via MULTI_DAY.daysPerRound)
 *   - cost / loan-shark / budget update happen ONCE per month, not per day
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

// Stocking 500 per product = 16.7/day, comfortably above the ~8/day demand
// (baseDemand 240 / 30 days) so satisfaction-dependent tests still hit the
// excellent tier after the per-day stock-cap fix. Pre-fix this could be 200
// because each daily call saw the full monthly stock; post-fix the daily slice
// is what bounds the supply cap, so we need monthly stock × (1/days) ≥ daily
// demand for fillRate ≥ 1 (excellent).
const fakePlayer = (id, overrides = {}) => ({
  playerId: id,
  displayName: id,
  bakeryName: id,
  decision: {
    menu: { croissant: true, cookie: true, bagel: true },
    quantities: { croissant: 500, cookie: 500, bagel: 500 },
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
    // M-02 (2026-04-28): the customer floor in customer-allocation.js
    // (BASE_CHEF_CUSTOMERS = 4 per team per day) clamps solo-player
    // sims to a constant when product demand is low — the floor wins
    // every day and variance disappears. Use a high round modifier so
    // the demand pool sits well above the floor, letting per-day
    // demand-multiplier variance show through.
    const trendingPrefs = { modifiers: { croissant: 4.0, cookie: 4.0, bagel: 4.0 } };
    const out = runMonthlySimulation([fakePlayer('p_a')], trendingPrefs, config, {
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

  // ---- Review-fix tests (PR #110 follow-ups) ----

  it('apportions loan-shark deduction so sum of daily revenueNet = monthly revenueNet', () => {
    // Force a loan: budget $100, real cost ~$610 → borrows ~$510 + interest.
    const broke = fakePlayer('p_a', { budgetCurrent: 100 });
    const out = runMonthlySimulation([broke], prefs, config, { gameId: 'g1', round: 1 });
    const agg = out[0];
    const dailyNetSum = agg.dailyResults.reduce((s, d) => s + d.revenueNet, 0);
    assert.ok(Math.abs(agg.revenueNet - dailyNetSum) < 0.01,
      `monthly revenueNet (${agg.revenueNet}) should equal sum of daily revenueNet (${dailyNetSum})`);
    // And the same for amount_borrowed and interest_charged.
    const dailyBorrowSum = agg.dailyResults.reduce((s, d) => s + d.amountBorrowed, 0);
    const dailyInterestSum = agg.dailyResults.reduce((s, d) => s + d.interestCharged, 0);
    assert.ok(Math.abs(agg.amountBorrowed - dailyBorrowSum) < 0.01,
      `monthly amountBorrowed should equal sum of daily; got ${agg.amountBorrowed} vs ${dailyBorrowSum}`);
    assert.ok(Math.abs(agg.interestCharged - dailyInterestSum) < 0.01,
      `monthly interestCharged should equal sum of daily; got ${agg.interestCharged} vs ${dailyInterestSum}`);
  });

  it('monthly csvRow has correct cost / loan-shark / customer columns (not zeros from skipCostAccounting)', () => {
    // Force loan-shark to fire so we can verify amount_borrowed > 0.
    const broke = fakePlayer('p_a', { budgetCurrent: 100 });
    const out = runMonthlySimulation([broke], prefs, config, { gameId: 'g1', round: 1 });
    const agg = out[0];
    const row = agg.csvRow || {};
    // The professor CSV reads from r.csvRow — these columns must reflect
    // the monthly aggregate, not day-29 with skipCostAccounting=true (which
    // would have zeros for cost / borrow / interest).
    assert.ok(row.amount_borrowed > 0,
      `monthly csvRow.amount_borrowed should be > 0 for overspending team, got ${row.amount_borrowed}`);
    assert.ok(row.interest_charged > 0,
      `monthly csvRow.interest_charged should be > 0, got ${row.interest_charged}`);
    assert.equal(row.revenue, agg.revenueNet,
      'monthly csvRow.revenue should equal monthly revenueNet (post loan-shark)');
    assert.equal(row.customer_count, agg.customerCount,
      'monthly csvRow.customer_count should equal monthly aggregate (sum across days), not day-29 only');
  });

  it('returningCustomersEarned uses MONTHLY customerCount, not day-29 alone (PR #110 re-review A)', () => {
    // computeReturningCustomersEarned is linear in customerCount. Taking
    // last.returningCustomersEarned (day-29 only) gives ~1/daysPerRound of
    // what it should be, breaking the round-to-round carryover loop.
    // Excellent satisfaction (>= 86) gives a 0.15 bonus rate, so
    // expected ≈ monthly customerCount * 0.15.
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    // High satisfaction setup (lots of stock, no competition) → excellent tier.
    assert.ok(agg.aggregateSatisfactionPct >= 86,
      `setup expected to hit excellent tier; got ${agg.aggregateSatisfactionPct}`);
    const expected = Math.round(agg.customerCount * 0.15);
    // Allow small rounding tolerance.
    assert.ok(Math.abs(agg.returningCustomersEarned - expected) <= 2,
      `returningCustomersEarned ${agg.returningCustomersEarned} should ≈ ${expected} (monthly customerCount * 0.15); ` +
      `if it's ~1/30 of expected, the day-29-only bug regressed`);
  });

  it('perProductCustomers is aggregated across days, not day-29 only (PR #110 re-review A)', () => {
    // last.perProductCustomers is day-29 only, ~1/daysPerRound of the
    // round's per-product totals. Aggregating across days gives the real
    // monthly per-product breakdown.
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    const dailySum = {};
    for (const d of agg.dailyResults) {
      for (const [k, v] of Object.entries(d.perProductCustomers || {})) {
        dailySum[k] = (dailySum[k] || 0) + (Number(v) || 0);
      }
    }
    for (const product of Object.keys(dailySum)) {
      assert.equal(agg.perProductCustomers[product], dailySum[product],
        `monthly perProductCustomers.${product} should equal sum of daily; ` +
        `got ${agg.perProductCustomers[product]} vs ${dailySum[product]}`);
    }
  });

  it('per-day rows carry apportioned amountBorrowed + interestCharged (PR #110 re-review B)', () => {
    // The frontend CSV serializeRow falls back to r.amountBorrowed (monthly)
    // if the daily row doesn't carry it — students summing the column would
    // get 30x the actual loan. Verify the wrapper exposes apportioned values
    // on each daily row so the lastRoundResult payload can forward them.
    const broke = fakePlayer('p_a', { budgetCurrent: 100 });
    const out = runMonthlySimulation([broke], prefs, config, { gameId: 'g1', round: 1 });
    const agg = out[0];
    assert.ok(agg.amountBorrowed > 0, 'setup must trigger a loan');
    for (const d of agg.dailyResults) {
      assert.ok(typeof d.amountBorrowed === 'number',
        `each daily row must expose amountBorrowed; got ${typeof d.amountBorrowed}`);
      assert.ok(typeof d.interestCharged === 'number',
        `each daily row must expose interestCharged; got ${typeof d.interestCharged}`);
      // Each day's apportioned share must be < monthly (otherwise sum > monthly).
      assert.ok(d.amountBorrowed < agg.amountBorrowed,
        `daily amountBorrowed (${d.amountBorrowed}) must be < monthly (${agg.amountBorrowed})`);
    }
  });

  it('returningCustomersPending is applied ONCE per month, not 30x (multi-day bug fix)', () => {
    // Bug discovered while building the strategy tournament: the wrapper
    // passes the player struct to runSimulation 30 times per round, and the
    // player's `returningCustomersPending` (e.g., 100) gets seeded into the
    // demand pool every single day. Over 30 days that's 30*100 = 3000
    // returning customers contributed to the monthly demand pool when only
    // 100 actually returned — a multi-round game's customer counts compound
    // 30x per round and budgets explode.
    //
    // Fix: scale returningCustomersPending by 1/daysPerRound before the
    // daily loop so summing across days gives ≈ the original returning
    // pool (matching the same approach as demand modifier scaling).
    const baseline = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const baseCust = baseline[0].customerCount;

    const withReturning = runMonthlySimulation(
      [fakePlayer('p_a', { returningCustomersPending: 100 })],
      prefs, config, { gameId: 'g1', round: 1 },
    );
    const cust = withReturning[0].customerCount;

    // Adding 100 returning customers per month should bump monthly customer
    // count by ≈100 (after foot-traffic + competitive split), NOT by 3000.
    const delta = cust - baseCust;
    assert.ok(delta < 500,
      `returning=100 should bump monthly customers by ~100, got delta=${delta} (cust=${cust} vs baseline=${baseCust}). ` +
      `If delta >= 3000 the 30x multiplication bug is back.`);
    assert.ok(delta > 0,
      `returning=100 should increase customers above baseline; got no change (cust=${cust}, baseline=${baseCust})`);
  });

  it('monthly customer count stays in pre-P2 round-level magnitude (not 30x)', () => {
    // Pre-P2: a team with 200/200/200 stock, 1 sous, $10k budget would
    // typically see a few hundred customers per round. After the day-scale
    // fix (#3), 30 daily sub-sims with demand divided by daysPerRound
    // should aggregate back to ≈ pre-P2 round-level magnitude.
    // baseDemand for croissant/cookie/bagel = 240 each = 720 total.
    // A solo player gets ~all of it (no competitor). Allow generous bounds
    // to absorb satisfaction / sellout effects.
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    assert.ok(agg.customerCount < 2000,
      `monthly customer count should be in pre-P2 range, got ${agg.customerCount} (looks like the 30x scaling bug)`);
    assert.ok(agg.customerCount > 100,
      `monthly customer count should be meaningful, got ${agg.customerCount}`);
  });

  it('cleanliness drift uses the per-day customer count, not the monthly aggregate (M-03)', () => {
    // M-03 (2026-04-28): the spec constants for cleanlinessDriftDelta were
    // calibrated for a PER-DAY customer count, not a 30-day aggregate.
    // Passing the monthly aggregate over-drained the score (5 staff vs 2000
    // monthly customers → +100 boost vs -400 drain → F regardless of
    // staffing). Fix at the apply site: divide by days.
    //
    // PR #128 originally asserted the opposite — that the FULL monthly count
    // should drain the score below 50. That was the bug, not the fix; the
    // test now asserts the corrected per-day behavior.
    const out = runMonthlySimulation(
      [fakePlayer('p_a', { cleanlinessScore: 100 })],
      prefs, config, { gameId: 'g1', round: 1 },
    );
    const agg = out[0];
    // 0 maintenance staff, hundreds of monthly customers / 30 days
    // → small drain per round. Score should stay near 100, not collapse.
    assert.ok(agg.cleanlinessScore >= 80,
      `cleanlinessScore ${agg.cleanlinessScore} should stay high when drift is ` +
      `applied per-day (>= 80). monthlyCustomers=${agg.customerCount}; expected ` +
      `drain ≈ ${(0.20 * agg.customerCount / 30).toFixed(1)}. ` +
      `If it's < 50, M-03 regressed and the monthly aggregate is back at the apply site.`);
  });

  // ---- M-02 (2026-04-28) — chef-as-bonus economy ----

  it('no-chef teams earn meaningful revenue (was $0 pre-M-02)', () => {
    // Pre-M-02: a 4-team round with no specialty chefs on most teams
    // could allocate 0 customers to the no-chef teams (sat-weighted
    // split rounded down) AND zero revenueGross via the kill-switch.
    // Post-M-02: BASE_CHEF_CUSTOMERS floor protects against the 0-customer
    // outcome; the kill-switch only fires when the team is truly closed.
    const noChef = fakePlayer('no_chef');
    const out = runMonthlySimulation([noChef], prefs, config, {
      gameId: 'm02', round: 1,
    });
    const agg = out[0];
    assert.ok(agg.revenueNet > 0,
      `no-chef team must earn > $0 net (M-02 acceptance), got $${agg.revenueNet}`);
    assert.ok(agg.customerCount > 0,
      `no-chef team must draw > 0 customers (M-02 floor), got ${agg.customerCount}`);
  });

  it('teams with specialty chefs out-earn no-chef teams (chef-as-bonus weight)', () => {
    // 4-team competition: 2 no-chef + 2 with-chef. Chef teams should
    // draw more customers via the +25%/chef weight in the per-product
    // allocator. Same stock + price + sous chef so the only differentiator
    // is the specialty chef multiplier.
    const teams = [
      fakePlayer('a_no_chef'),
      fakePlayer('b_no_chef'),
      fakePlayer('c_2_chefs', {
        specialtyChefs: [
          { id: 'c1', nationality: 'french', skillTier: 'intermediate', multiplier: 1.0 },
          { id: 'c2', nationality: 'french', skillTier: 'intermediate', multiplier: 1.0 },
        ],
      }),
      fakePlayer('d_2_chefs', {
        specialtyChefs: [
          { id: 'd1', nationality: 'italian', skillTier: 'intermediate', multiplier: 1.0 },
          { id: 'd2', nationality: 'italian', skillTier: 'intermediate', multiplier: 1.0 },
        ],
      }),
    ];
    const out = runMonthlySimulation(teams, prefs, config, {
      gameId: 'm02-4t', round: 1,
    });
    const noChef = out.find((r) => r.playerId === 'a_no_chef');
    const withChef = out.find((r) => r.playerId === 'c_2_chefs');
    assert.ok(withChef.customerCount > noChef.customerCount,
      `chef team must draw more customers than no-chef. ` +
      `chef=${withChef.customerCount}, no-chef=${noChef.customerCount}`);
    assert.ok(withChef.revenueNet > noChef.revenueNet,
      `chef team must out-earn no-chef. ` +
      `chef=$${withChef.revenueNet}, no-chef=$${noChef.revenueNet}`);
  });

  it('a closed bakery still earns $0 (kill-switch fires when no menu)', () => {
    // M-02 part 2: the V9 kill-switch was tightened from "0 customers
    // AND 0 product revenue" to "no menu OR no stock anywhere". A truly
    // closed bakery should still produce $0 — the kill-switch is the
    // only thing preventing the revenue formula's base/sat bonuses from
    // landing on a team that didn't open the doors.
    const closed = fakePlayer('closed', {
      decision: {
        menu: { croissant: false, bagel: false, coffee: false },
        quantities: {},
        sousChefCount: 0,
        sousChefAssignments: {},
        productPrices: {},
      },
    });
    const out = runMonthlySimulation([closed], prefs, config, {
      gameId: 'm02-closed', round: 1,
    });
    const agg = out[0];
    assert.equal(agg.revenueGross, 0,
      `closed bakery (no menu) should earn $0 gross, got $${agg.revenueGross}`);
  });

  it('a menu-open-but-no-stock bakery still earns $0 (kill-switch fires when no stock)', () => {
    // M-02 regression guard: the original V9 kill-switch fired on "0
    // customers AND 0 sales", which caught both empty-menu AND
    // menu-open-but-no-stock teams. Tightening to just "no menu" would
    // re-open the V9 "$527 profit / 0 customers" bug for teams that
    // check menu items but stock zero. The kill-switch must also fire
    // when nothing is stocked anywhere.
    const noStock = fakePlayer('no_stock', {
      decision: {
        menu: { croissant: true, cookie: true, bagel: true },
        quantities: { croissant: 0, cookie: 0, bagel: 0 },
        sousChefCount: 0,
        sousChefAssignments: {},
        productPrices: { croissant: 4.75, cookie: 4.0, bagel: 4.5 },
      },
    });
    const out = runMonthlySimulation([noStock], prefs, config, {
      gameId: 'm02-no-stock', round: 1,
    });
    const agg = out[0];
    assert.equal(agg.revenueGross, 0,
      `menu-open-no-stock bakery should earn $0 gross, got $${agg.revenueGross}`);
  });

  it('exposes priceCompetitivenessPct for the lastRoundResult.roundSignals panel (M-21)', () => {
    // M-21: surfaces a 0–100 metric so the FE (B-07) can render
    // "What hurt this round?" indicators on Results. Pure passthrough
    // for the four already-computed signals; this metric is the new
    // computation. At catalog-base prices (croissant 4.75, cookie 4.0,
    // bagel 4.5 — all near competitive mid), the multiplier should
    // hover around 1.0 so the metric should land near 100.
    const out = runMonthlySimulation([fakePlayer('p_a')], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    assert.ok(typeof agg.priceCompetitivenessPct === 'number',
      'priceCompetitivenessPct should be a number');
    assert.ok(agg.priceCompetitivenessPct >= 0 && agg.priceCompetitivenessPct <= 100,
      `priceCompetitivenessPct should be in [0, 100], got ${agg.priceCompetitivenessPct}`);
    assert.ok(agg.priceCompetitivenessPct >= 90,
      `at near-mid prices, expected priceCompetitivenessPct >= 90, got ${agg.priceCompetitivenessPct}`);
  });

  it('monthly qtySold cannot exceed monthly qtyStocked (per-day stock-cap fix)', () => {
    // Bug: pre-fix, each daily call saw the full monthly qtyStocked as the cap.
    // A player stocking 100 could sell up to 100/day = 3000/month while only
    // paying for 100. The fix scales qtyStocked by 1/daysPerRound inside the
    // daily call so monthly qtySold caps at the original monthly stock.
    //
    // Setup: stock 100 per product (under-stocked vs ~240 monthly demand) so
    // demand pulls in customers faster than supply allows. Without the cap,
    // qtySold would balloon past 100. With the cap, it stays ≤ 100.
    const player = {
      ...fakePlayer('p_a'),
      decision: {
        ...fakePlayer('p_a').decision,
        quantities: { croissant: 100, cookie: 100, bagel: 100 },
      },
    };
    const out = runMonthlySimulation([player], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    for (const product of ['croissant', 'cookie', 'bagel']) {
      const sold = (agg.perProductSatisfaction[product] || {}).qtySold || 0;
      assert.ok(sold <= 100,
        `${product}: monthly qtySold (${sold}) must NOT exceed monthly qtyStocked (100). ` +
        `If sold ≫ 100, the per-day stock-cap fix has regressed.`);
    }
  });

  it('daily stock slices sum to exactly monthly qtyStocked (no integer-floor loss)', () => {
    // Review feedback: an earlier `Math.floor(monthly * 1/days)` per day lost
    // up to (days-1) units to integer-floor truncation — a player stocking
    // 100 over 30 days had a sum of `floor(100/30) * 30 = 3 * 30 = 90`, so
    // they paid for 100 but could only sell 90. The fix distributes the
    // remainder across the first (monthly % days) days so the daily caps
    // sum to EXACTLY monthly stock.
    //
    // Test setup: stock with deliberate non-zero remainders (97 % 30 = 7,
    // 119 % 30 = 29, 1000 % 30 = 10). Drive demand high so all stock is
    // pulled. Verify each daily qtyStocked sums to the full monthly value.
    const trendingPrefs = { modifiers: { croissant: 4.0, cookie: 4.0, bagel: 4.0 } };
    const player = {
      ...fakePlayer('p_a'),
      decision: {
        ...fakePlayer('p_a').decision,
        quantities: { croissant: 97, cookie: 119, bagel: 1000 },
      },
    };
    const out = runMonthlySimulation([player], trendingPrefs, config, {
      gameId: 'g1', round: 1,
    });
    const agg = out[0];
    // Sum each product's daily qtyStocked across the dailyResults rows.
    const dailyStocks = { croissant: 0, cookie: 0, bagel: 0 };
    for (const d of agg.dailyResults) {
      for (const product of ['croissant', 'cookie', 'bagel']) {
        const ps = (d.perProductSatisfaction || {})[product];
        if (ps && typeof ps.qtyStocked === 'number') {
          dailyStocks[product] += ps.qtyStocked;
        }
      }
    }
    assert.equal(dailyStocks.croissant, 97,
      `daily caps must sum to monthly stock: 97. Got ${dailyStocks.croissant}.`);
    assert.equal(dailyStocks.cookie, 119,
      `daily caps must sum to monthly stock: 119. Got ${dailyStocks.cookie}.`);
    assert.equal(dailyStocks.bagel, 1000,
      `daily caps must sum to monthly stock: 1000. Got ${dailyStocks.bagel}.`);
  });

  it('priceCompetitivenessPct drops when prices move into the premium zone (M-21)', () => {
    // Premium prices reduce the demand multiplier below 1, which the
    // metric exposes as a sub-100 value — that's the signal we want
    // surfacing on the Results panel.
    const cheap = fakePlayer('cheap', {
      decision: {
        menu: { croissant: true, cookie: true, bagel: true },
        quantities: { croissant: 200, cookie: 200, bagel: 200 },
        sousChefCount: 1,
        sousChefAssignments: { croissant: 1 },
        productPrices: { croissant: 4.75, cookie: 4.0, bagel: 4.5 },
      },
    });
    const premium = fakePlayer('premium', {
      decision: {
        menu: { croissant: true, cookie: true, bagel: true },
        quantities: { croissant: 200, cookie: 200, bagel: 200 },
        sousChefCount: 1,
        sousChefAssignments: { croissant: 1 },
        // Push every price into the premium zone of its config range.
        productPrices: { croissant: 7.0, cookie: 6.0, bagel: 6.0 },
      },
    });
    const out = runMonthlySimulation([cheap, premium], prefs, config, {
      gameId: 'g1', round: 1,
    });
    const cheapAgg = out.find((r) => r.playerId === 'cheap');
    const premiumAgg = out.find((r) => r.playerId === 'premium');
    assert.ok(premiumAgg.priceCompetitivenessPct < cheapAgg.priceCompetitivenessPct,
      `premium-priced team should have a LOWER priceCompetitivenessPct than cheap. ` +
      `premium=${premiumAgg.priceCompetitivenessPct}, cheap=${cheapAgg.priceCompetitivenessPct}`);
  });

});
