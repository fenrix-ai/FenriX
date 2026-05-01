/**
 * test-engine-mapping.js
 *
 * Unit test for process-round-engine-stub.js (the bridge between BB
 * Firestore docs and the huginX engine schema). No emulator needed; pure
 * JS exercising the request builder + response mapper with a known team
 * snapshot.
 *
 * Run: HUGINX_URL=https://example.test node test-engine-mapping.js
 *
 * (HUGINX_URL is required because engine-client lazy-checks it on
 * import, but no live HTTP call happens here — the response mapper is
 * fed a hand-built fixture.)
 */

"use strict";

if (!process.env.HUGINX_URL) {
  process.env.HUGINX_URL = "https://example.test";
}

const assert = require("assert");
const {
  buildSimulateRoundRequest,
  mapEngineResponseToBBResults,
  buildEnginePlayer,
  mapPlayerResult,
  hashSeed,
  PRODUCTS,
  AD_PLACEMENTS,
} = require("./process-round-engine-stub");


// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const CONFIG = {
  totalCustomers: 2000,
  baseStaffCost: 2000.0,
  unitCostPerProduct: 1,
  sousChefBaseCost: 10,
  loanSharkInterestRate: 0.10,
};

function makePlayer(overrides = {}) {
  return {
    playerId: "team_alpha",
    bakeryName: "Alpha Bakery",
    displayName: "Alpha",
    budgetCurrent: 10000,
    cumulativeRevenue: 0,
    priorSatisfactionPct: 70,
    cleanlinessScore: 75,
    priorSousChefCount: 1,
    returningCustomersPending: 0,
    specialtyChefs: [
      { id: "chef_a", skillTier: "intermediate", specialties: ["croissant", "cookie"] },
    ],
    decision: {
      menu: { croissant: true, cookie: true, bagel: true, sandwich: false, coffee: true, matcha: false },
      quantities: { croissant: 50, cookie: 80, bagel: 40, sandwich: 0, coffee: 120, matcha: 0 },
      productPrices: { croissant: 4.0, cookie: 2.5, bagel: 3.5, sandwich: 6.5, coffee: 3.5, matcha: 5.0 },
      sousChefCount: 3,
      staffCounts: { bakerySousChefs: 1, deliSousChefs: 1, baristaSousChefs: 1 },
      equipmentUpgradePurchased: false,
      submittedAt: "2026-05-01T08:30:00Z",
    },
    auctionResults: {
      adWins: ["TV", "Billboard"],
      adBidPaid: 3500,
      chefsWon: [],
      chefBidPaid: 0,
    },
    ...overrides,
  };
}


// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

function testHashSeedDeterministic() {
  const a = hashSeed("game_abc", 1);
  const b = hashSeed("game_abc", 1);
  const c = hashSeed("game_abc", 2);
  assert.strictEqual(a, b, "Same gameId+round must hash to same seed");
  assert.notStrictEqual(a, c, "Different round should hash differently");
  console.log("[OK] hashSeed deterministic + per-round unique");
}


function testBuildEnginePlayerShape() {
  const ep = buildEnginePlayer(makePlayer(), CONFIG);

  // State block
  assert.strictEqual(ep.state.player_id, "team_alpha");
  assert.strictEqual(ep.state.team_name, "Alpha Bakery");
  assert.strictEqual(ep.state.course, "MGSC_220");          // Option A: default
  assert.strictEqual(ep.state.budget, 10000);
  assert.strictEqual(ep.state.debt, 0);
  assert.strictEqual(ep.state.cleanliness_score, 75);
  assert.strictEqual(ep.state.customer_satisfaction, 70);

  // Menu: only `true` keys, in PRODUCTS order
  assert.deepStrictEqual(ep.state.menu, ["croissant", "cookie", "bagel", "coffee"]);

  // Staff: 1 specialty chef + 1 prior sous chef + 1 base padding? No —
  // sousChefBefore is 1, so 1 sous_chef pre-exists. Plus the head_chef.
  assert.ok(ep.state.staff.length >= 2, `expected >= 2 staff entries, got ${ep.state.staff.length}`);
  const head = ep.state.staff.find((s) => s.role === "head_chef");
  assert.ok(head, "head chef from specialtyChefs[] should appear in staff");
  assert.strictEqual(head.skill_tier, "intermediate");
  assert.deepStrictEqual(head.specialties, ["croissant", "cookie"]);

  // Decisions block
  assert.deepStrictEqual(Object.keys(ep.decisions.prices).sort(), [...PRODUCTS].sort());
  assert.deepStrictEqual(Object.keys(ep.decisions.quantities).sort(), [...PRODUCTS].sort());
  assert.strictEqual(ep.decisions.prices.bagel, 3.5);
  assert.strictEqual(ep.decisions.quantities.sandwich, 0);
  assert.strictEqual(ep.decisions.staffing_change, 2, "sousChefCount 3 - prior 1 = +2 delta");
  assert.deepStrictEqual(ep.decisions.chef_bids, [],
    "chef_bids empty — auctions resolved BB-side; chef is in state.staff");
  assert.deepStrictEqual(ep.decisions.ad_bids, [
    { placement: "TV", bid_amount: 1.0 },
    { placement: "Billboard", bid_amount: 1.0 },
  ], "synthetic ad_bids credit pre-resolved BB ad wins");
  assert.deepStrictEqual(ep.decisions.digital_ad_spend, { instagram: 0.0, tiktok: 0.0 });
  assert.strictEqual(ep.decisions.data_purchase, false);

  console.log("[OK] buildEnginePlayer produces engine-schema-compatible state + decisions");
}


function testBuildSimulateRoundRequestShape() {
  const players = [makePlayer(), makePlayer({ playerId: "team_beta", bakeryName: "Beta" })];
  const req = buildSimulateRoundRequest(players, {}, CONFIG, { gameId: "game_t1", round: 2 });

  assert.strictEqual(req.game_id, "game_t1");
  assert.strictEqual(req.round_number, 2);
  assert.strictEqual(req.config.bots.bot_count, 0, "BB owns bots; engine bot_count must be 0");
  assert.strictEqual(req.config.course_separated_leaderboard, false, "Option A: unified leaderboard");
  assert.strictEqual(req.config.seed, hashSeed("game_t1", 2));
  assert.strictEqual(req.market_state.available_chefs.length, 0,
    "no chef pool — auctions resolved BB-side");
  assert.strictEqual(req.market_state.available_ad_slots.length, AD_PLACEMENTS.length);
  for (const slot of req.market_state.available_ad_slots) {
    assert.ok(AD_PLACEMENTS.includes(slot.placement));
    assert.strictEqual(slot.minimum_bid, 0.0);
  }
  assert.strictEqual(req.players.length, 2);
  console.log("[OK] buildSimulateRoundRequest top-level shape");
}


function testMapPlayerResultBBSpending() {
  const player = makePlayer();
  const engineResult = {
    player_id: "team_alpha",
    revenue: 5000,
    units_sold: { croissant: 50, cookie: 60, bagel: 40, sandwich: 0, coffee: 100, matcha: 0 },
    customers_visited: 200,
    orders_received: 250,
    walkout_count: 30,
    customer_satisfaction: 75,
    budget_after: 8000,
    debt_after: 0,
    spending_breakdown: {
      inventory_cost: 0, staff_cost: 0, digital_ad_spend: 0,
      auction_spend: 2, data_purchase_cost: 0, interest_charged: 0,
      total_expenses: 2,
    },
    auction_wins: [],
    auction_losses: [],
    staff_after: [],
    notifications: [],
  };

  const bb = mapPlayerResult(engineResult, player, CONFIG);

  assert.strictEqual(bb.playerId, "team_alpha");
  assert.strictEqual(bb.revenueGross, 5000, "revenueGross taken straight from engine");
  // BB spending: inventory + sous-chef + auction (BB-authoritative).
  // Quantities sum = 50+80+40+0+120+0 = 290, unit cost = 1 → 290.
  // 3 sous chefs (escalating per station, 1 each, base=10 → ~10 per).
  // adBidPaid 3500 + chefBidPaid 0 = 3500. chefHire 0.
  // Total ≈ 290 + (some sous-chef cost) + 3500 ≈ ~3820.
  // Don't pin exact value — just sanity-check it's > 3500 (auction floor).
  assert.ok(bb.totalSpent > 3500, `expected totalSpent > 3500, got ${bb.totalSpent}`);
  // Player budget 10000, totalSpent ~3820 → no borrowing.
  assert.strictEqual(bb.amountBorrowed, 0);
  assert.strictEqual(bb.interestCharged, 0);
  assert.strictEqual(bb.revenueNet, 5000);
  assert.strictEqual(bb.aggregateSatisfactionPct, 75);
  assert.strictEqual(bb.customerCount, 200);
  // Sellouts: croissant 50/50 = sellout, cookie 60/80 = no sellout
  assert.strictEqual(bb.selloutFlags.croissant, true);
  assert.strictEqual(bb.selloutFlags.cookie, false);
  assert.strictEqual(bb.perProductSatisfaction.cookie.fillRate, 0.75);
  assert.strictEqual(bb.perProductSold.coffee, 100);
  console.log("[OK] mapPlayerResult applies BB-side loan-shark + derives perProductSatisfaction");
}


function testMapPlayerResultBorrowingPath() {
  const player = makePlayer({
    budgetCurrent: 100,                  // tiny budget — must borrow
    auctionResults: { adWins: [], adBidPaid: 0, chefsWon: [], chefBidPaid: 0 },
  });
  const engineResult = {
    player_id: "team_alpha",
    revenue: 10000,
    units_sold: { croissant: 0, cookie: 0, bagel: 0, sandwich: 0, coffee: 0, matcha: 0 },
    customers_visited: 100,
    orders_received: 0,
    walkout_count: 0,
    customer_satisfaction: 70,
    budget_after: 0,
    debt_after: 0,
    spending_breakdown: {
      inventory_cost: 0, staff_cost: 0, digital_ad_spend: 0,
      auction_spend: 0, data_purchase_cost: 0, interest_charged: 0,
      total_expenses: 0,
    },
    auction_wins: [],
    auction_losses: [],
    staff_after: [],
    notifications: [],
  };
  const bb = mapPlayerResult(engineResult, player, CONFIG);
  assert.ok(bb.amountBorrowed > 0, "should borrow when totalSpent > budget");
  assert.ok(bb.interestCharged > 0, "interest = borrowed * 0.10");
  // revenueNet = revenueGross - loanSharkDeduction
  assert.ok(bb.revenueNet < bb.revenueGross, "borrowing reduces net revenue");
  console.log("[OK] mapPlayerResult triggers loan-shark when overspending");
}


function testFullRoundtrip() {
  const players = [makePlayer(), makePlayer({ playerId: "team_beta", bakeryName: "Beta" })];
  const fakeEngineResponse = {
    game_id: "g1",
    round_number: 1,
    config_version: "bakery-bash-mock-2026.05",
    engine_version: "mock-0.2.0",
    processing_time_ms: 12,
    player_results: players.map((p) => ({
      player_id: p.playerId,
      revenue: 4000,
      units_sold: { croissant: 30, cookie: 40, bagel: 20, sandwich: 0, coffee: 80, matcha: 0 },
      customers_visited: 150,
      orders_received: 170,
      walkout_count: 10,
      customer_satisfaction: 72,
      budget_after: 9000,
      debt_after: 0,
      spending_breakdown: {
        inventory_cost: 0, staff_cost: 0, digital_ad_spend: 0,
        auction_spend: 0, data_purchase_cost: 0, interest_charged: 0,
        total_expenses: 0,
      },
      auction_wins: [],
      auction_losses: [],
      staff_after: [],
      notifications: [],
    })),
    bot_results: [],
    market_update: {
      next_round_cost_multipliers: {}, next_round_available_chefs: [],
      next_round_available_ad_slots: [], new_events: [],
      next_round_base_staff_cost: 2060, new_products_available: [],
    },
    leaderboard: { mgsc_220: [], mgsc_310: [], combined: [] },
  };

  const out = mapEngineResponseToBBResults(fakeEngineResponse, players, CONFIG);
  assert.strictEqual(out.results.length, 2);
  for (const r of out.results) {
    assert.ok(typeof r.revenueGross === "number");
    assert.ok(typeof r.budgetAfter === "number");
    assert.ok(r.perProductSatisfaction.croissant);
  }
  console.log("[OK] full roundtrip: response → BB-shaped results array");
}


// ---------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------

const TESTS = [
  testHashSeedDeterministic,
  testBuildEnginePlayerShape,
  testBuildSimulateRoundRequestShape,
  testMapPlayerResultBBSpending,
  testMapPlayerResultBorrowingPath,
  testFullRoundtrip,
];

let failed = 0;
console.log(`\nRunning ${TESTS.length} engine-mapping unit tests...\n`);
for (const t of TESTS) {
  try {
    t();
  } catch (e) {
    console.error(`[FAIL] ${t.name}: ${e.message}`);
    if (e.stack) console.error(e.stack.split("\n").slice(1, 4).join("\n"));
    failed += 1;
  }
}

console.log(`\n${"=".repeat(60)}`);
if (failed === 0) {
  console.log(`ALL ${TESTS.length} TESTS PASSED`);
  process.exit(0);
} else {
  console.error(`FAILED: ${failed}/${TESTS.length}`);
  process.exit(1);
}
