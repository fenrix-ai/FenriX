/**
 * bot-engine unit tests
 *
 * Run with: node backend/functions/modules/__tests__/bot-engine-test.js
 */

'use strict';

const { generateBotDecisions, expectedAdValue, expectedChefValue } = require('../bot-engine');
const { mergeConfig } = require('../config');

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected} ±${tolerance}, got ${actual}`);
  }
}

const TEST_CONFIG = mergeConfig({});

// ---------------------------------------------------------------------------
// expectedAdValue
// ---------------------------------------------------------------------------
console.log('--- expectedAdValue ---');
{
  const tvValue = expectedAdValue('TV', TEST_CONFIG);
  assert(tvValue > 0, 'TV ad value should be positive');
  // $400 bonus + 0.15 * 150 customers * $4 margin = $490
  assertClose(tvValue, 490, 50, 'TV expected value');

  const newspaperValue = expectedAdValue('Newspaper', TEST_CONFIG);
  assert(newspaperValue > 0, 'Newspaper ad value should be positive');
  assert(newspaperValue < tvValue, 'Newspaper should be cheaper than TV');
  console.log('  ✓ expectedAdValue computed correctly');
}

// ---------------------------------------------------------------------------
// expectedChefValue
// ---------------------------------------------------------------------------
console.log('--- expectedChefValue ---');
{
  const advancedFrench = {
    nationality: 'french',
    skillTier: 'advanced',
    specialties: ['croissant', 'coffee'],
  };
  const val = expectedChefValue(advancedFrench, TEST_CONFIG);
  assert(val > 0, 'Advanced French chef should have positive value');
  // 2 specialties × 30 base × (3.0 - 1) mult × $4 margin = 480
  assertClose(val, 480, 50, 'Advanced French chef value');

  const novelChef = {
    nationality: 'american',
    skillTier: 'novel',
    specialties: ['bagel'],
  };
  const novelVal = expectedChefValue(novelChef, TEST_CONFIG);
  // Novel chef has (1.0 - 1) = 0 extra multiplier, so value is 0
  assert(novelVal === 0, 'Novel chef should have zero extra value (same as base)');
  assert(novelVal < val, 'Novel chef should be worth less than advanced');
  console.log('  ✓ expectedChefValue computed correctly');
}

// ---------------------------------------------------------------------------
// Easy bot
// ---------------------------------------------------------------------------
console.log('--- Easy bot decisions ---');
{
  const botState = {
    budgetCurrent: 10000,
    specialtyChefs: [],
    chefPool: [],
  };

  const adDecisions = generateBotDecisions(botState, 'bid_ad', TEST_CONFIG, [], 'easy');
  assert(typeof adDecisions.adBids === 'object', 'easy bot should return adBids');
  assert(Object.keys(adDecisions.adBids).length === 4, 'easy bot should bid on 4 ad types');
  console.log('  ✓ Easy bot ad bids');

  const chefDecisions = generateBotDecisions(botState, 'bid_chef', TEST_CONFIG, [], 'easy');
  assert(Array.isArray(chefDecisions.chefBids), 'easy bot should return chefBids array');
  console.log('  ✓ Easy bot chef bids');

  const decideDecisions = generateBotDecisions(botState, 'decide', TEST_CONFIG, [], 'easy');
  assert(typeof decideDecisions.menu === 'object', 'easy bot should return menu');
  assert(typeof decideDecisions.quantities === 'object', 'easy bot should return quantities');
  assert(typeof decideDecisions.productPrices === 'object', 'easy bot should return prices');
  console.log('  ✓ Easy bot operational decisions');
}

// ---------------------------------------------------------------------------
// Medium bot
// ---------------------------------------------------------------------------
console.log('--- Medium bot decisions ---');
{
  const botState = {
    budgetCurrent: 10000,
    specialtyChefs: [
      { id: 'c1', nationality: 'french', skillTier: 'advanced', specialties: ['croissant', 'coffee'] },
    ],
    chefPool: [
      { id: 'chef1', nationality: 'french', skillTier: 'advanced', specialties: ['croissant'], minBidFloor: 100 },
    ],
  };

  const adDecisions = generateBotDecisions(botState, 'bid_ad', TEST_CONFIG, [], 'medium');
  assert(typeof adDecisions.adBids === 'object', 'medium bot should return adBids');
  // Medium bot bids ~50% of EV
  const tvBid = adDecisions.adBids.TV;
  assert(tvBid >= 0, 'medium bot TV bid should be non-negative');
  console.log('  ✓ Medium bot ad bids');

  const chefDecisions = generateBotDecisions(botState, 'bid_chef', TEST_CONFIG, [], 'medium');
  assert(Array.isArray(chefDecisions.chefBids), 'medium bot should return chefBids array');
  if (chefDecisions.chefBids.length > 0) {
    assert(chefDecisions.chefBids[0].amount >= 100, 'medium bot should bid at least floor');
  }
  console.log('  ✓ Medium bot chef bids');

  const decideDecisions = generateBotDecisions(botState, 'decide', TEST_CONFIG, [], 'medium');
  assert(decideDecisions.menu.croissant === true, 'medium bot should stock croissant (has French chef)');
  assert(decideDecisions.sousChefCount === 3, 'medium bot should hire 3 sous chefs');
  console.log('  ✓ Medium bot operational decisions');
}

// ---------------------------------------------------------------------------
// Hard bot
// ---------------------------------------------------------------------------
console.log('--- Hard bot decisions ---');
{
  const botState = {
    budgetCurrent: 10000,
    specialtyChefs: [
      { id: 'c1', nationality: 'french', skillTier: 'advanced', specialties: ['croissant', 'coffee'] },
    ],
    chefPool: [
      { id: 'chef1', nationality: 'french', skillTier: 'advanced', specialties: ['croissant'], minBidFloor: 100 },
    ],
  };

  const adDecisions = generateBotDecisions(botState, 'bid_ad', TEST_CONFIG, [], 'hard');
  assert(typeof adDecisions.adBids === 'object', 'hard bot should return adBids');
  console.log('  ✓ Hard bot ad bids');

  const chefDecisions = generateBotDecisions(botState, 'bid_chef', TEST_CONFIG, [], 'hard');
  assert(Array.isArray(chefDecisions.chefBids), 'hard bot should return chefBids array');
  console.log('  ✓ Hard bot chef bids');

  const decideDecisions = generateBotDecisions(botState, 'decide', TEST_CONFIG, [], 'hard');
  assert(decideDecisions.menu.croissant === true, 'hard bot should stock croissant');
  assert(decideDecisions.sousChefCount === 4, 'hard bot should hire exactly 4 sous chefs');

  // Verify prices are snapped to $0.25
  for (const [product, price] of Object.entries(decideDecisions.productPrices)) {
    const snapped = Math.round(price * 4) / 4;
    assert(price === snapped, `hard bot price for ${product} should be snapped to $0.25 step`);
  }
  console.log('  ✓ Hard bot operational decisions');
}

// ---------------------------------------------------------------------------
// Roster decisions
// ---------------------------------------------------------------------------
console.log('--- Roster decisions ---');
{
  const botState = {
    budgetCurrent: 10000,
    specialtyChefs: [
      { id: 'c1', nationality: 'french', skillTier: 'advanced', specialties: ['croissant'] },
      { id: 'c2', nationality: 'japanese', skillTier: 'intermediate', specialties: ['matcha'] },
      { id: 'c3', nationality: 'italian', skillTier: 'novel', specialties: ['sandwich'] },
      { id: 'c4', nationality: 'american', skillTier: 'advanced', specialties: ['bagel', 'cookie'] },
    ],
    chefPool: [],
  };

  // Easy / medium: keep first 3
  const easyRoster = generateBotDecisions(botState, 'roster', TEST_CONFIG, [], 'easy');
  assert(easyRoster.layoffs.length === 1, 'easy bot should lay off 1 chef (4→3)');
  console.log('  ✓ Easy bot roster');

  const mediumRoster = generateBotDecisions(botState, 'roster', TEST_CONFIG, [], 'medium');
  assert(mediumRoster.layoffs.length === 1, 'medium bot should lay off 1 chef (4→3)');
  console.log('  ✓ Medium bot roster');

  // Hard: keep 3 most valuable (sort by expected value)
  const hardRoster = generateBotDecisions(botState, 'roster', TEST_CONFIG, [], 'hard');
  assert(hardRoster.layoffs.length === 1, 'hard bot should lay off 1 chef (4→3)');
  // The least valuable should be laid off (novel Italian with 1 specialty)
  assert(hardRoster.layoffs.includes('c3'), 'hard bot should lay off the least valuable chef');
  console.log('  ✓ Hard bot roster (value-sorted)');
}

// ---------------------------------------------------------------------------
// Budget constraints
// ---------------------------------------------------------------------------
console.log('--- Budget constraints ---');
{
  const botState = {
    budgetCurrent: 500,
    specialtyChefs: [],
    chefPool: [],
  };

  const hardDecisions = generateBotDecisions(botState, 'decide', TEST_CONFIG, [], 'hard');
  const totalQty = Object.values(hardDecisions.quantities).reduce((s, q) => s + q, 0);
  const unitCost = TEST_CONFIG.unitCostPerProduct;
  const stockCost = totalQty * unitCost;
  assert(stockCost <= 500, 'hard bot should stay within budget');
  console.log('  ✓ Hard bot respects budget constraints');
}

console.log('\n========================================');
console.log('BOT ENGINE TESTS: ALL PASSED');
console.log('========================================');
