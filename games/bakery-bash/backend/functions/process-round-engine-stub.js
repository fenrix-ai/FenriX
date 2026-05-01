/**
 * process-round-engine-stub.js
 *
 * Bridge between Bakery Bash's `runSimulationAndPersist` (in index.js)
 * and the external simulation engine (huginX, mock-0.2.0+) at HUGINX_URL.
 *
 * Drop-in replacement for `runMonthlySimulation` — same input shape, same
 * return shape ({ results: [...] }) — so the integration site in index.js
 * is a one-line change.
 *
 * Division of responsibility (per Phase 0 design):
 *   - Engine owns: customer allocation, per-product sales, gross revenue,
 *     post-round customer satisfaction, units-sold breakdown.
 *   - BB owns: loan-shark math, total spending, budget update, returning
 *     customers, equipment / cleanliness drift, perProductSatisfaction,
 *     selloutFlags, perProductCustomers.
 *
 * The engine receives all current chefs in `state.staff` (BB has already
 * resolved auctions during the bid phases). We pass empty `chef_bids` /
 * `ad_bids` so the engine does NOT re-charge auction spend; BB's
 * authoritative `chefBidPaid` / `adBidPaid` from `auctionResults` are
 * used in the BB-side spending math instead.
 *
 * Synthetic ad bids are sent for already-won placements (bid_amount = 1.0)
 * so the engine credits the team in its `won_ad_slots` attractiveness
 * bonus. The trivial $1 cost is ignored (BB uses its own auction spend).
 *
 * Pure-ish: depends on engine-client + BB's loan-shark / revenue
 * helpers. No firebase-admin / Firestore imports here so the module
 * stays unit-testable.
 */

"use strict";

const engine = require("./modules/engine-client");
const { calculateLoanShark, calculateNetRevenue, updateBudget } = require("./modules/loan-shark");
const { calculateRoundCosts } = require("./modules/revenue");
const { computeReturningCustomersEarned } = require("./modules/simulation");


// Canonical BB product list — must match types/game.ts ProductKey and
// huginX's app/schemas.py PRODUCTS. Drift here = 422 from engine.
const PRODUCTS = ["croissant", "cookie", "bagel", "sandwich", "coffee", "matcha"];

// 4 BB ad placements that map to engine AdPlacement literals.
const AD_PLACEMENTS = ["TV", "Billboard", "Radio", "Newspaper"];

const DEFAULT_PRICE = 4.0;


// ---------------------------------------------------------------------
// Request builder: BB players → engine SimulateRoundRequest
// ---------------------------------------------------------------------

function buildSimulateRoundRequest(players, roundPreferences, config, meta) {
  const { gameId, round } = meta;
  const enginePlayers = players.map((p) => buildEnginePlayer(p, config));

  return {
    game_id: gameId,
    round_number: round,
    config: {
      total_customers: numberOr(config?.totalCustomers, 2000) + sumReturningCustomers(players),
      bots: { bot_count: 0, strategy: "moderate" },          // bots are real BB players
      seed: hashSeed(gameId, round),
      course_separated_leaderboard: false,                    // unified leaderboard for first live (Option A)
    },
    market_state: {
      cost_multipliers: defaultCostMultipliers(roundPreferences?.costMultipliers),
      // Empty pools — auctions already resolved BB-side; chefs are in state.staff.
      // Sending an empty pool means engine has no auctions to run for chefs.
      available_chefs: [],
      // All 4 placements offered with $0 minimum. Synthetic bids below
      // ensure each team's already-won placements are credited.
      available_ad_slots: AD_PLACEMENTS.map((placement) => ({
        placement, minimum_bid: 0.0,
      })),
      active_events: [],
      base_staff_cost: numberOr(config?.baseStaffCost, 2000.0),
    },
    players: enginePlayers,
  };
}


function buildEnginePlayer(p, config) {
  const decision = p.decision || {};
  const auctionResults = p.auctionResults || {};
  const adWins = Array.isArray(auctionResults.adWins) ? auctionResults.adWins : [];

  const menu = menuObjectToList(decision.menu);
  const prices = fillProductPrices(decision.productPrices);
  const quantities = fillProductQuantities(decision.quantities);
  const sousChefBefore = numberOr(p.priorSousChefCount, 0);
  const sousChefAfter = numberOr(decision.sousChefCount, sousChefBefore);

  return {
    state: {
      // BB groups by team; the canonical UID is the engine's player_id.
      player_id: p.playerId,
      team_name: p.bakeryName || p.displayName || "Team",
      // Course-separated leaderboard is off for first live; default to MGSC_220.
      course: "MGSC_220",
      budget: numberOr(p.budgetCurrent, 0),
      cumulative_revenue: numberOr(p.cumulativeRevenue, 0),
      debt: 0.0,                                             // BB owns loan-shark; never carries debt
      staff: mapSpecialtyChefsToStaff(p.specialtyChefs, sousChefBefore),
      menu,
      customer_satisfaction: clamp(numberOr(p.priorSatisfactionPct, 70.0), 0, 100),
      cleanliness_score: clamp(numberOr(p.cleanlinessScore, 75.0), 0, 100),
    },
    decisions: {
      prices,
      quantities,
      // BB submits an absolute target; engine wants a delta from prior staff.
      staffing_change: clamp(sousChefAfter - sousChefBefore, -20, 20),
      // Auctions already resolved BB-side; pass synthetic ad bids for
      // already-won placements so engine credits attractiveness bonus.
      chef_bids: [],
      ad_bids: adWins
        .filter((p) => AD_PLACEMENTS.includes(p))
        .map((placement) => ({ placement, bid_amount: 1.0 })),
      digital_ad_spend: { instagram: 0.0, tiktok: 0.0 },     // BB doesn't model digital today
      new_product_launch: null,
      data_purchase: !!decision.equipmentUpgradePurchased,
      submitted_at: toISOStringSafe(decision.submittedAt),
    },
  };
}


// ---------------------------------------------------------------------
// Response mapper: engine SimulateRoundResponse → BB round-result rows
// ---------------------------------------------------------------------

function mapEngineResponseToBBResults(response, players, config) {
  const playerByEngineId = new Map(players.map((p) => [p.playerId, p]));
  const results = response.player_results.map((pr) => mapPlayerResult(pr, playerByEngineId.get(pr.player_id), config));
  return { results };
}


function mapPlayerResult(pr, player, config) {
  const decision = (player && player.decision) || {};
  const auctionResults = (player && player.auctionResults) || {};
  const budgetCurrent = numberOr(player && player.budgetCurrent, 0);
  const returningCustomersPending = numberOr(player && player.returningCustomersPending, 0);

  // BB-authoritative spending: stock + sous-chef hire + auction (chef + ad).
  // calculateRoundCosts returns { stockCost, sousChefHireCost, adBidCost,
  // chefBidCost, totalSpent } — we use .totalSpent.
  const decisionForCosts = {
    ...decision,
    perProductQtyStocked: decision.quantities || {},
    staffCounts: decision.staffCounts || {},
    sousChefCount: decision.sousChefCount || 0,
  };
  const auctionResultsForCosts = {
    adAuctionWinningBid: numberOr(auctionResults.adBidPaid, 0),
    chefAuctionWinningBid: numberOr(auctionResults.chefBidPaid, 0),
  };
  const costs = calculateRoundCosts(decisionForCosts, auctionResultsForCosts, config) || {};
  const totalSpent = numberOr(costs.totalSpent, 0);

  // Loan-shark on BB-authoritative totals.
  const revenueGross = numberOr(pr.revenue, 0);
  const ls = calculateLoanShark(totalSpent, budgetCurrent, config);
  const revenueNet = calculateNetRevenue(revenueGross, ls.loanSharkDeduction);
  const budgetAfter = updateBudget(budgetCurrent, revenueNet, totalSpent);

  // Per-product satisfaction from engine units_sold vs ordered quantities.
  const unitsSold = pr.units_sold || {};
  const ordered = decision.quantities || {};
  const perProductSatisfaction = {};
  const perProductSold = {};
  const selloutFlags = {};
  const perProductCustomers = {};
  for (const product of PRODUCTS) {
    const qtyOrdered = numberOr(ordered[product], 0);
    const qtySold = numberOr(unitsSold[product], 0);
    perProductSold[product] = qtySold;
    selloutFlags[product] = qtyOrdered > 0 && qtySold >= qtyOrdered;
    const fillRate = qtyOrdered > 0 ? Math.min(1, qtySold / qtyOrdered) : 1;
    perProductSatisfaction[product] = {
      fillRate,
      satisfactionPct: Math.round(fillRate * 100),
      qtySold,
      sellout: selloutFlags[product],
    };
    // Approximation: sold units ≈ customers buying that product.
    perProductCustomers[product] = qtySold;
  }

  const aggregateSatisfactionPct = numberOr(pr.customer_satisfaction, 70);
  const customerCount = numberOr(pr.customers_visited, 0);
  const returningCustomersEarned = computeReturningCustomersEarned(
    aggregateSatisfactionPct, customerCount, config,
  );

  return {
    playerId: pr.player_id,
    round: undefined,                                 // index.js writer fills this
    revenueGross: round2(revenueGross),
    revenueNet: round2(revenueNet),
    amountBorrowed: round2(ls.borrowed),
    interestCharged: round2(ls.interest),
    totalSpent: round2(totalSpent),
    budgetAfter: round2(budgetAfter),
    budgetBefore: round2(budgetCurrent),              // RC-10/11 idempotency anchor
    customerCount,
    returningCustomersEarned,
    aggregateSatisfactionPct: Math.round(aggregateSatisfactionPct),
    perProductSatisfaction,
    perProductSold,
    selloutFlags,
    perProductCustomers,
    // Pass through useful engine fields for any downstream consumers.
    walkoutCount: numberOr(pr.walkout_count, 0),
    ordersReceived: numberOr(pr.orders_received, 0),
  };
}


// ---------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------

async function processRoundViaEngine(players, roundPreferences, config, meta) {
  const { gameId, round } = meta;
  const requestId = `${gameId}-r${round}`;

  const payload = buildSimulateRoundRequest(players, roundPreferences, config, meta);
  const res = await engine.simulateRound(payload, { requestId });

  if (res.status !== 200) {
    const body = res.body || {};
    const err = new Error(
      `engine returned ${res.status}: ${body.error || "unknown"} (request_id=${body.request_id || requestId})`,
    );
    err.engineStatus = res.status;
    err.engineBody = body;
    err.engineRequestId = body.request_id || requestId;
    throw err;
  }

  return mapEngineResponseToBBResults(res.body, players, config);
}


// ---------------------------------------------------------------------
// Helpers (pure, unit-testable)
// ---------------------------------------------------------------------

function menuObjectToList(menu) {
  if (!menu || typeof menu !== "object") return [];
  return PRODUCTS.filter((p) => menu[p] === true);
}

function fillProductPrices(productPrices) {
  const out = {};
  for (const p of PRODUCTS) {
    out[p] = clamp(numberOr(productPrices && productPrices[p], DEFAULT_PRICE), 0, 20);
  }
  return out;
}

function fillProductQuantities(quantities) {
  const out = {};
  for (const p of PRODUCTS) {
    const q = numberOr(quantities && quantities[p], 0);
    out[p] = Math.max(0, Math.min(10000, Math.floor(q)));
  }
  return out;
}

function mapSpecialtyChefsToStaff(specialtyChefs, sousChefCount) {
  const staff = [];
  if (Array.isArray(specialtyChefs)) {
    for (const chef of specialtyChefs) {
      const tier = chef && chef.skillTier ? chef.skillTier : "base";
      const specialties = (chef && Array.isArray(chef.specialties)) ? chef.specialties.slice() : [];
      // Engine SkillTier literal: base | novel | intermediate | advanced.
      // Anything else maps to "base" so the engine doesn't 422.
      const safeTier = ["base", "novel", "intermediate", "advanced"].includes(tier) ? tier : "base";
      staff.push({ role: "head_chef", skill_tier: safeTier, specialties });
    }
  }
  // Add sous chefs as base-tier staff so the engine staff-count math is right.
  for (let i = 0; i < Math.max(0, Math.floor(sousChefCount || 0)); i++) {
    staff.push({ role: "sous_chef", skill_tier: "base", specialties: [] });
  }
  if (staff.length === 0) {
    // Engine PlayerState.staff is required (no min_length but having at
    // least one entry keeps attractiveness math sensible).
    staff.push({ role: "base_chef", skill_tier: "base", specialties: [] });
  }
  return staff;
}

function defaultCostMultipliers(provided) {
  const out = {};
  for (const p of PRODUCTS) {
    out[p] = numberOr(provided && provided[p], 1.0);
  }
  return out;
}

function sumReturningCustomers(players) {
  let total = 0;
  for (const p of players) total += numberOr(p.returningCustomersPending, 0);
  return total;
}

function hashSeed(gameId, round) {
  let h = 0x811c9dc5;
  const s = `${gameId}:${round}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function numberOr(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v) {
  return Math.round(numberOr(v, 0) * 100) / 100;
}

function toISOStringSafe(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") {
    try { return value.toDate().toISOString(); } catch (e) { /* fall through */ }
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}


module.exports = {
  processRoundViaEngine,
  buildSimulateRoundRequest,
  mapEngineResponseToBBResults,
  // exported for tests
  buildEnginePlayer,
  mapPlayerResult,
  hashSeed,
  PRODUCTS,
  AD_PLACEMENTS,
};
