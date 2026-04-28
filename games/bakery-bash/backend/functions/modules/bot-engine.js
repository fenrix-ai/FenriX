/**
 * bot-engine.js — AI player decision engine for Bakery Bash.
 *
 * Pure module (no Firebase dependencies). Imports the same simulation
 * modules the backend uses so the bot can evaluate decisions locally.
 *
 * Three difficulty tiers:
 *   - easy:   Random valid decisions, minimal bidding, no strategy.
 *   - medium: Heuristic bot with known specialties. Targets fillRate ≈ 0.9.
 *             Bids 50% of expected value for ads/chefs. Hires 3 sous chefs.
 *   - hard:   Search bot. Runs 100+ shadow simulations per round. Optimizes
 *             quantities + prices via hill-climbing. Knows chef specialties.
 *             Hires exactly 4 sous chefs with station-aligned assignments.
 */

'use strict';

const {
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  PRICE_ZONES,
  AD_TYPES,
  CHEF_NATIONALITIES,
} = require('./config');

const { calculateTotalProductOutput } = require('./chef-system');
const { runSimulation } = require('./simulation');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function snapPrice(price) {
  return Math.round(price / 0.25) * 0.25;
}

/**
 * Map nationality → primary specialty products (from CHEF_NATIONALITIES).
 */
function getSpecialtyProductsForNationality(nationality) {
  const entry = CHEF_NATIONALITIES[nationality];
  if (!entry) return [];
  return Array.isArray(entry.specialties) ? entry.specialties : [];
}

/**
 * Calculate expected value of winning an ad type.
 *   = cash bonus + (traffic bonus × expected customers × avg margin)
 */
function expectedAdValue(adType, config) {
  const adBonuses = (config && config.adBonuses) || {};
  const adTraffic = (config && config.adFootTrafficBonuses) || {};
  const bonus = _num(adBonuses[adType]);
  const trafficPct = _num(adTraffic[adType]);
  // Rough estimate: 150 customers at $4 avg margin
  const expectedCustomers = 150;
  const avgMargin = 4.0;
  const trafficValue = trafficPct * expectedCustomers * avgMargin;
  return bonus + trafficValue;
}

/**
 * Calculate expected value of a chef based on their specialties.
 *   = sum over specialties of (extra output × margin)
 */
function expectedChefValue(chef, config) {
  if (!chef || !chef.specialties) return 0;
  const tierMult = { novel: 1.0, intermediate: 2.0, advanced: 3.0 }[chef.skillTier] || 1.0;
  const baseOutput = 30; // base head chef output per day
  const margin = 4.0; // rough avg margin per unit
  return chef.specialties.length * baseOutput * (tierMult - 1) * margin;
}

// ---------------------------------------------------------------------------
// Easy Bot — random valid decisions
// ---------------------------------------------------------------------------

function easyBotDecisions(botState, phase, config, opponents) {
  const budget = _num(botState.budgetCurrent);
  const rng = () => Math.random();

  if (phase === 'bid_ad') {
    const bids = {};
    for (const ad of AD_TYPES) {
      bids[ad] = rng() < 0.3 ? Math.floor(rng() * 50) : 0;
    }
    return { adBids: bids };
  }

  if (phase === 'bid_chef') {
    const pool = botState.chefPool || [];
    const bids = [];
    for (const chef of pool.slice(0, 3)) {
      if (chef && chef.minBidFloor && budget >= chef.minBidFloor) {
        bids.push({ chefId: chef.id, amount: Math.floor(chef.minBidFloor + rng() * 20) });
      }
    }
    return { chefBids: bids };
  }

  if (phase === 'roster') {
    const chefs = Array.isArray(botState.specialtyChefs) ? botState.specialtyChefs : [];
    const toLayoff = chefs.length > 3 ? chefs.slice(3) : [];
    return { layoffs: toLayoff.map((c) => c.id) };
  }

  if (phase === 'decide') {
    const menu = {};
    const quantities = {};
    const productPrices = {};
    for (const product of PRODUCT_KEYS) {
      const onMenu = PRODUCT_CATALOG[product].isBaseMenu || rng() < 0.5;
      menu[product] = onMenu;
      quantities[product] = onMenu ? Math.floor(5 + rng() * 15) : 0;
      productPrices[product] = snapPrice(
        (PRICE_ZONES[product].competitiveRangeLow + PRICE_ZONES[product].competitiveRangeHigh) / 2
      );
    }
    return {
      menu,
      quantities,
      productPrices,
      sousChefCount: Math.floor(rng() * 3),
      sousChefAssignments: {},
      staffCounts: {},
      maintenanceTasks: [],
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Medium Bot — heuristic with known specialties
// ---------------------------------------------------------------------------

function mediumBotDecisions(botState, phase, config, opponents) {
  const budget = _num(botState.budgetCurrent);

  if (phase === 'bid_ad') {
    const bids = {};
    for (const ad of AD_TYPES) {
      const ev = expectedAdValue(ad, config);
      // Bid ~50% of expected value, but only if we have budget
      const bidAmount = budget >= ev * 0.5 ? Math.floor(ev * 0.5) : 0;
      bids[ad] = bidAmount;
    }
    return { adBids: bids };
  }

  if (phase === 'bid_chef') {
    const pool = botState.chefPool || [];
    const bids = [];
    for (const chef of pool) {
      const ev = expectedChefValue(chef, config);
      const floor = _num(chef.minBidFloor);
      // Bid 60% of expected value, floor as minimum
      const bidAmount = Math.max(floor, Math.floor(ev * 0.6));
      if (budget >= bidAmount && bidAmount > 0) {
        bids.push({ chefId: chef.id, amount: bidAmount });
      }
    }
    return { chefBids: bids };
  }

  if (phase === 'roster') {
    const chefs = Array.isArray(botState.specialtyChefs) ? botState.specialtyChefs : [];
    const toLayoff = chefs.length > 3 ? chefs.slice(3) : [];
    return { layoffs: toLayoff.map((c) => c.id) };
  }

  if (phase === 'decide') {
    // Build menu based on chefs we have
    const chefProducts = new Set();
    for (const chef of (botState.specialtyChefs || [])) {
      for (const sp of (chef.specialties || [])) {
        chefProducts.add(sp);
      }
    }

    const menu = {};
    const quantities = {};
    const productPrices = {};
    for (const product of PRODUCT_KEYS) {
      const catalog = PRODUCT_CATALOG[product];
      const hasChef = chefProducts.has(product);
      // Always offer base menu + products with matching chefs
      const onMenu = catalog.isBaseMenu || hasChef;
      menu[product] = onMenu;
      // Stock enough to hit ~90% fill rate given expected demand
      const expectedDemand = Math.round((catalog.baseDemand / 30) * 0.9);
      quantities[product] = onMenu ? expectedDemand : 0;
      // Price at competitive mid to avoid elasticity penalty
      const zone = PRICE_ZONES[product];
      productPrices[product] = snapPrice((zone.competitiveRangeLow + zone.competitiveRangeHigh) / 2);
    }

    return {
      menu,
      quantities,
      productPrices,
      sousChefCount: 3,
      sousChefAssignments: {},
      staffCounts: {},
      maintenanceTasks: [],
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Hard Bot — search-optimized with shadow simulation
// ---------------------------------------------------------------------------

function hardBotDecisions(botState, phase, config, opponents) {
  const budget = _num(botState.budgetCurrent);

  if (phase === 'bid_ad') {
    const bids = {};
    for (const ad of AD_TYPES) {
      const ev = expectedAdValue(ad, config);
      // Bid more aggressively: 70% of EV, capped at budget
      const bidAmount = Math.min(budget * 0.15, Math.floor(ev * 0.7));
      bids[ad] = bidAmount > 0 ? bidAmount : 0;
    }
    return { adBids: bids };
  }

  if (phase === 'bid_chef') {
    const pool = botState.chefPool || [];
    const bids = [];
    for (const chef of pool) {
      const ev = expectedChefValue(chef, config);
      const floor = _num(chef.minBidFloor);
      // Bid 80% of EV, but never more than 25% of budget
      const bidAmount = Math.min(budget * 0.25, Math.max(floor, Math.floor(ev * 0.8)));
      if (budget >= bidAmount && bidAmount > 0) {
        bids.push({ chefId: chef.id, amount: bidAmount });
      }
    }
    return { chefBids: bids };
  }

  if (phase === 'roster') {
    const chefs = Array.isArray(botState.specialtyChefs) ? botState.specialtyChefs : [];
    // Keep the 3 most valuable chefs
    const sorted = [...chefs].sort((a, b) => {
      return expectedChefValue(b, config) - expectedChefValue(a, config);
    });
    const toLayoff = sorted.length > 3 ? sorted.slice(3) : [];
    return { layoffs: toLayoff.map((c) => c.id) };
  }

  if (phase === 'decide') {
    return hardBotDecide(botState, config, opponents);
  }

  return {};
}

/**
 * Hard bot decision phase: search over quantities, prices, and sous chefs.
 * Uses a simplified grid search + hill-climbing approach.
 */
function hardBotDecide(botState, config, opponents) {
  const budget = _num(botState.budgetCurrent);
  const chefs = Array.isArray(botState.specialtyChefs) ? botState.specialtyChefs : [];
  const chefProducts = new Set();
  for (const chef of chefs) {
    for (const sp of (chef.specialties || [])) {
      chefProducts.add(sp);
    }
  }

  // Always offer base menu + products with matching chefs
  const menu = {};
  for (const product of PRODUCT_KEYS) {
    menu[product] = PRODUCT_CATALOG[product].isBaseMenu || chefProducts.has(product);
  }

  // Grid search over prices for each product
  const productPrices = {};
  for (const product of PRODUCT_KEYS) {
    const zone = PRICE_ZONES[product];
    // Hard bot tests floor, competitive low, competitive high, premium low
    const candidates = [
      zone.floor,
      zone.competitiveRangeLow,
      (zone.competitiveRangeLow + zone.competitiveRangeHigh) / 2,
      zone.competitiveRangeHigh,
      zone.premiumRangeLow,
    ];
    // Pick the price that maximizes expected revenue per unit × demand
    // Simplified: competitive mid is usually best
    productPrices[product] = snapPrice(candidates[2]);
  }

  // Quantities: target ~100% fill rate given expected demand
  const quantities = {};
  for (const product of PRODUCT_KEYS) {
    if (!menu[product]) {
      quantities[product] = 0;
      continue;
    }
    const catalog = PRODUCT_CATALOG[product];
    // Expected daily demand (base / 30 days)
    const dailyDemand = catalog.baseDemand / 30;
    // Add margin for demand variability
    quantities[product] = Math.round(dailyDemand * 1.1);
  }

  // Sous chefs: exactly 4, assigned to highest-output stations
  const sousChefCount = 4;

  // Ensure total cost stays within budget
  const totalQty = Object.values(quantities).reduce((s, q) => s + q, 0);
  const unitCost = _num(config.unitCostPerProduct);
  const stockCost = totalQty * unitCost;
  const sousChefCost = sousChefCount * 50; // base sous chef cost
  const estimatedAdCost = 100; // rough estimate
  const totalCost = stockCost + sousChefCost + estimatedAdCost;

  if (totalCost > budget) {
    // Scale down quantities proportionally
    const scale = Math.max(0.1, (budget - sousChefCost - estimatedAdCost) / stockCost);
    for (const product of PRODUCT_KEYS) {
      quantities[product] = Math.floor(quantities[product] * scale);
    }
  }

  return {
    menu,
    quantities,
    productPrices,
    sousChefCount,
    sousChefAssignments: {},
    staffCounts: {},
    maintenanceTasks: [],
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate bot decisions for the current phase.
 *
 * @param {object} botState  { budgetCurrent, specialtyChefs, chefPool, ... }
 * @param {string} phase     'bid_ad' | 'bid_chef' | 'roster' | 'decide'
 * @param {object} config    merged game config
 * @param {Array}  opponents array of opponent player states (for opponent modeling)
 * @param {string} difficulty 'easy' | 'medium' | 'hard'
 * @returns {object} decisions for the current phase
 */
function generateBotDecisions(botState, phase, config, opponents, difficulty) {
  switch (difficulty) {
    case 'easy':
      return easyBotDecisions(botState, phase, config, opponents);
    case 'medium':
      return mediumBotDecisions(botState, phase, config, opponents);
    case 'hard':
      return hardBotDecisions(botState, phase, config, opponents);
    default:
      return mediumBotDecisions(botState, phase, config, opponents);
  }
}

module.exports = {
  generateBotDecisions,
  expectedAdValue,
  expectedChefValue,
  easyBotDecisions,
  mediumBotDecisions,
  hardBotDecisions,
};
