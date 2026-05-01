/**
 * process-round-engine-stub.js
 *
 * STUB / SCAFFOLDING — not yet wired into the live round flow.
 *
 * Demonstrates the integration shape between Bakery Bash's existing
 * `runMonthlySimulation` (in `modules/multi-day-simulation.js`) and the
 * external simulation engine exposed via `modules/engine-client.js`.
 * The team owns the mapping decisions in this file; expect TODO blocks
 * where Bakery Bash's Firestore document shapes meet the engine's
 * SimulateRoundRequest schema.
 *
 * Why a stub and not a drop-in replacement?
 *   The current monthly simulator runs 30 daily sub-simulations and
 *   applies loan-shark + equipment/cleanliness drift in BB itself. The
 *   engine's domain is a single-round economy without daily aggregation
 *   or loan-shark. A clean migration is a design decision (move daily
 *   logic into the engine? keep BB's monthly wrapper around per-round
 *   engine calls?) — this stub gives you the wiring for either path
 *   without committing to one.
 *
 * Pattern when you're ready to use this:
 *   In `index.js > runSimulationAndPersist`, the call to
 *     runMonthlySimulation(players, roundPreferences, config, { gameId, round })
 *   becomes
 *     processRoundViaEngine(players, roundPreferences, config, { gameId, round })
 *   once the mapping is filled in. Same input signature, same return
 *   shape ({ results: [...] }) so the surrounding read/write code in
 *   index.js doesn't change.
 *
 * Deploy
 *   Set HUGINX_URL on the Cloud Function. See ENGINE_INTEGRATION.md.
 *
 * Pure-ish: depends on engine-client (which depends on
 * google-auth-library). No firebase-admin / Firestore imports here —
 * keep this layer clean of side-effects so it stays unit-testable.
 */

"use strict";

const engine = require("./modules/engine-client");

/**
 * Build the SimulateRoundRequest payload that the engine expects.
 *
 * The engine schema is documented in docs/engine-api.md. Field-name
 * differences between BB Firestore and the engine to be aware of:
 *
 *   BB Firestore                    →  engine field
 *   --------------------------------------------------------
 *   player.budgetCurrent            →  state.budget
 *   player.cumulativeRevenue        →  state.cumulative_revenue
 *   player.specialtyChefs[]         →  state.staff[]  (shape differs)
 *   pendingDecision.menu            →  decisions.* + state.menu
 *   pendingDecision.quantities      →  decisions.quantities
 *   pendingDecision.sousChefCount   →  decisions.staffing_change (delta!)
 *   submitPrices output             →  decisions.prices
 *   round preferences (chef bids)   →  decisions.chef_bids
 *   round preferences (ad bids)    →  decisions.ad_bids
 *
 * @param {object[]} players          From parallel Firestore reads in index.js
 * @param {object}   roundPreferences From rounds/{roundId}/preferences
 * @param {object}   config           Merged game config
 * @param {object}   meta             { gameId, round }
 * @returns {object} SimulateRoundRequest matching the engine schema
 */
function buildSimulateRoundRequest(players, roundPreferences, config, { gameId, round }) {
  // TODO(team): fill in this mapping. The skeleton below shows shape
  // only — every value is a placeholder. The engine's `extra="forbid"`
  // means any field name typo or extra key returns 422 with a clear
  // error pointing at the offending path.

  const enginePlayers = players.map((p) => ({
    state: {
      // TODO(team): Map from Firestore player doc.
      player_id: p.playerId,                 // BB → engine: same concept
      team_name: p.teamName ?? "",           // TODO: confirm BB field name
      course: p.course ?? "MGSC_220",        // TODO: confirm BB field name
      budget: p.budgetCurrent ?? 0,
      cumulative_revenue: p.cumulativeRevenue ?? 0,
      debt: p.debt ?? 0,
      // TODO(team): map p.specialtyChefs[] + base staff into the engine's
      // staff[] shape: [{role, skill, tradition?}, ...]
      staff: [],
      // TODO(team): pendingDecision.menu is the offered subset; engine
      // expects array of product strings. Verify naming matches engine
      // PRODUCTS list (croissant, muffin, cookie, coffee, matcha,
      // sandwich, sourdough, banana_bread).
      menu: p.pendingDecision?.menu ?? [],
      customer_satisfaction: p.customerSatisfaction ?? 7.0,
      cleanliness_score: p.cleanlinessScore ?? 7.0,
    },
    decisions: {
      // TODO(team): productPrices comes from a separate submitPrices
      // call — needs to be plumbed in here.
      prices: p.productPrices ?? {},
      quantities: p.pendingDecision?.quantities ?? {},
      // TODO(team): engine wants a DELTA from current staff count.
      //   delta = pendingDecision.sousChefCount - currentStaff.length
      // (or however BB models hire/fire on a single submit).
      staffing_change: 0,
      // TODO(team): pull from roundPreferences for this player.
      chef_bids: [],
      ad_bids: [],
      digital_ad_spend: { instagram: 0.0, tiktok: 0.0 },
      new_product_launch: null,
      data_purchase: false,
      submitted_at: p.pendingDecision?.submittedAt ?? new Date().toISOString(),
    },
  }));

  return {
    game_id: gameId,
    round_number: round,
    config: {
      // TODO(team): pull from merged BB config.
      total_customers: config?.totalCustomers ?? 2000,
      bots: {
        bot_count: config?.botCount ?? 0,
        strategy: config?.botStrategy ?? "moderate",
      },
      seed: config?.seed ?? hashSeed(gameId, round),
      course_separated_leaderboard: config?.courseSeparated ?? true,
    },
    market_state: {
      // TODO(team): wire from current roundPreferences / config snapshot.
      cost_multipliers: roundPreferences?.costMultipliers ?? defaultCostMultipliers(),
      available_chefs: roundPreferences?.availableChefs ?? [],
      available_ad_slots: roundPreferences?.availableAdSlots ?? [],
      active_events: roundPreferences?.activeEvents ?? [],
      base_staff_cost: config?.baseStaffCost ?? 2000.0,
    },
    players: enginePlayers,
  };
}

/**
 * Map the engine's SimulateRoundResponse back into the per-player
 * round-result shape the rest of `runSimulationAndPersist` expects.
 *
 * Engine returns:                      BB writes to rounds/{roundId}:
 *   player_results[].revenue        →    revenueGross  (and revenueNet?)
 *   player_results[].budget_after   →    budgetAfter
 *   player_results[].debt_after     →    (no current field — add?)
 *   player_results[].spending_breakdown.interest_charged → interestCharged
 *   player_results[].customers_visited → customerCount
 *   player_results[].customer_satisfaction → aggregateSatisfactionPct
 *   ...
 *
 * BB's existing fields not produced by the engine (must be derived BB-side
 * or moved into the engine schema):
 *   - amountBorrowed (loan-shark concept; engine has debt model differently)
 *   - perProductSatisfaction
 *   - aggregate market email / class stats
 *
 * @returns {{ results: object[] }} Same shape `runMonthlySimulation` returns,
 *   so index.js's batch-writer doesn't need to change.
 */
function mapEngineResponseToBBResults(response, { gameId, round }) {
  // TODO(team): fill in. This is the second half of the mapping work —
  // every BB-side rounds/{roundId} field needs a value derived from the
  // engine response or computed BB-side.
  const results = response.player_results.map((pr) => ({
    playerId: pr.player_id,
    revenueGross: pr.revenue,
    revenueNet: pr.revenue,                   // TODO: factor loan-shark if BB still owns it
    amountBorrowed: 0,                        // TODO: derive or move concept to engine
    interestCharged: pr.spending_breakdown.interest_charged,
    budgetAfter: pr.budget_after,
    customerCount: pr.customers_visited,
    aggregateSatisfactionPct: pr.customer_satisfaction * 10,  // TODO: confirm scale
    perProductSatisfaction: {},               // TODO: not in engine response — derive BB-side
    computedAt: new Date(),
    // TODO(team): preserve all fields BB downstream code reads. Grep
    // index.js + modules/ for `data().revenue` / `data().budgetAfter`
    // etc. and ensure each is mapped.
  }));
  return { results };
}

/**
 * Drop-in alternative to runMonthlySimulation. Wraps the engine call
 * with the same signature and return shape so the integration site in
 * index.js > runSimulationAndPersist is a one-line change.
 *
 * NOT YET WIRED — index.js still calls runMonthlySimulation. Switch by
 * editing the call site to call this instead, after the TODOs above
 * are filled in and you've integration-tested against the live engine.
 *
 * Idempotency: index.js already guards on rounds/{roundId}.simulationStatus
 * before this function is called. The engine itself is also idempotent
 * for the same payload + seed, so a Cloud Function retry will produce
 * the same response.
 *
 * @param {object[]} players
 * @param {object}   roundPreferences
 * @param {object}   config
 * @param {object}   meta { gameId, round }
 * @returns {Promise<{ results: object[] }>}
 */
async function processRoundViaEngine(players, roundPreferences, config, meta) {
  const { gameId, round } = meta;
  const requestId = `${gameId}-r${round}`;

  const payload = buildSimulateRoundRequest(players, roundPreferences, config, meta);
  const res = await engine.simulateRound(payload, { requestId });

  if (res.status !== 200) {
    // engine returns request_id in error body for log correlation
    const body = res.body || {};
    const err = new Error(
      `engine returned ${res.status}: ${body.error || "unknown"} (request_id=${body.request_id || requestId})`,
    );
    err.engineStatus = res.status;
    err.engineBody = body;
    err.engineRequestId = body.request_id || requestId;
    throw err;
  }

  return mapEngineResponseToBBResults(res.body, meta);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Stable seed from gameId + round. Same gameId + round → same seed
 * → same engine response (engine is idempotent on (payload, seed)).
 * Cheap FNV-1a, no crypto needed.
 */
function hashSeed(gameId, round) {
  let h = 0x811c9dc5;
  const s = `${gameId}:${round}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const PRODUCTS = [
  "croissant", "muffin", "cookie", "coffee",
  "matcha", "sandwich", "sourdough", "banana_bread",
];

function defaultCostMultipliers() {
  return PRODUCTS.reduce((acc, p) => { acc[p] = 1.0; return acc; }, {});
}

module.exports = {
  processRoundViaEngine,
  buildSimulateRoundRequest,
  mapEngineResponseToBBResults,
  // exported for tests / debugging
  hashSeed,
};
