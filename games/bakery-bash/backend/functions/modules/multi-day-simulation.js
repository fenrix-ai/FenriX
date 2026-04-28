/**
 * multi-day-simulation.js
 *
 * Wraps the pure runSimulation() in a per-day loop. A round represents one
 * month; this module runs daysPerRound (default 30) sub-simulations, each
 * with an independent demand-variability multiplier and noise seed. Returns
 * monthly aggregates with the daily rows attached for CSV export.
 *
 * Cost / loan-shark / burglary / budget update happen ONCE per month at the
 * wrapper level using monthly aggregates, NOT per day. Per-day runSimulation
 * calls use skipCostAccounting=true so they only emit customer / revenue /
 * satisfaction. Without that flag a 30-day month would charge stock cost
 * 30x and loan-shark interest 30x for any team that overspends.
 *
 * Pure: no Firebase deps. All randomness goes through seeded utilities or
 * is derived from gameId/round/day so simulations are reproducible.
 */

const config = require('./config');
const { runSimulation } = require('./simulation');
const { calculateRoundCosts } = require('./revenue');
const { calculateLoanShark, updateBudget } = require('./loan-shark');

/**
 * Build a per-day deterministic demand-variability multiplier.
 * Uniform in [min, max], seeded by `${gameId}:${round}:${day}:demand`.
 */
function demandMultiplierForDay(gameId, round, day, cfg = config) {
  const min = (cfg.MULTI_DAY && cfg.MULTI_DAY.demandVariabilityMin) || 0.7;
  const max = (cfg.MULTI_DAY && cfg.MULTI_DAY.demandVariabilityMax) || 1.3;
  // Simple deterministic FNV-1a hash → [0, 1)
  const seed = `${gameId}:${round}:${day}:demand`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) / 0xffffffff);
  return min + u * (max - min);
}

/**
 * Apply a per-day multiplier to roundPreferences.modifiers so the daily
 * demand pool wobbles around the round-level baseline.
 */
function dayPreferences(roundPreferences, dayMult) {
  const baseMods = (roundPreferences && roundPreferences.modifiers)
    ? roundPreferences.modifiers
    : (roundPreferences || {});
  const scaled = {};
  for (const [product, mod] of Object.entries(baseMods)) {
    scaled[product] = (Number(mod) || 1.0) * dayMult;
  }
  return { ...(roundPreferences || {}), modifiers: scaled };
}

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function runMonthlySimulation(players, roundPreferences, cfg = config, { gameId = 'game', round = 0 } = {}) {
  const days = (cfg.MULTI_DAY && cfg.MULTI_DAY.daysPerRound) || 30;

  // Run N daily sims. skipCostAccounting=true means each daily call only
  // produces customer / revenue / satisfaction (no cost, no loan-shark, no
  // burglary, no budget update). The wrapper handles all of those once at
  // the monthly level below.
  const dailyResultsByPlayer = new Map();
  for (const p of players) {
    dailyResultsByPlayer.set(p.playerId, []);
  }

  for (let day = 0; day < days; day += 1) {
    const dayMult = demandMultiplierForDay(gameId, round, day, cfg);
    const dayPrefs = dayPreferences(roundPreferences, dayMult);
    const dayResults = runSimulation(players, dayPrefs, cfg, {
      gameId, round, day, skipCostAccounting: true,
    });
    for (const r of dayResults) {
      dailyResultsByPlayer.get(r.playerId).push({ day, ...r });
    }
  }

  // Build monthly aggregates per player.
  const monthlyResults = [];
  for (const p of players) {
    const daily = dailyResultsByPlayer.get(p.playerId) || [];

    const sum = (k) => daily.reduce((s, d) => s + (Number(d[k]) || 0), 0);
    const avg = (k) => (daily.length ? sum(k) / daily.length : 0);

    // Monthly aggregate gross revenue = sum of daily gross revenues.
    // (revenueGross from runSimulation includes per-day product revenue +
    // base + sous + sat + numProducts coefficients + ad bonus + noise. The
    // skipCostAccounting flag does NOT change revenueGross — it just zeros
    // out cost/loan-shark/budget.)
    const revenueGross = sum('revenueGross');
    const customerCount = sum('customerCount');
    const aggregateSatisfactionPct = avg('aggregateSatisfactionPct');
    const chefSatisfactionScore = daily.length ? daily[0].chefSatisfactionScore : 0;
    const last = daily[daily.length - 1] || {};

    // ---- Compute MONTHLY cost / loan-shark / budget ONCE ----
    const decision = (p && p.decision) || {};
    const sousChefCount = Number.isFinite(decision.sousChefCount)
      ? decision.sousChefCount
      : Number(p.sousChefCount) || 0;
    const auctionResults = (p && p.auctionResults) || {};
    const adBidPaid = _num(auctionResults.adBidPaid);
    const chefBidPaid = _num(auctionResults.chefBidPaid);

    const costDecision = {
      perProductQtyStocked: decision.quantities || {},
      sousChefCount,
    };
    const costAuction = {
      adAuctionWinningBid: adBidPaid,
      chefAuctionWinningBid: chefBidPaid,
    };
    const roundCosts = calculateRoundCosts(costDecision, costAuction, cfg);
    const totalSpent = roundCosts.totalSpent;

    const budgetCurrent = _num(p.budgetCurrent);
    const loanResult = calculateLoanShark(totalSpent, budgetCurrent, cfg);
    const amountBorrowed = loanResult.borrowed;
    const interestCharged = loanResult.interest;
    const loanSharkDeduction = loanResult.loanSharkDeduction;
    const revenueNet = revenueGross - loanSharkDeduction;
    const budgetAfter = Math.round(updateBudget(budgetCurrent, revenueNet, totalSpent));

    // ---- Roll burglary ONCE per month ----
    const burglaryThreshold = (cfg && cfg.curveballs && cfg.curveballs.burglaryThreshold) || 40;
    const burglaryChance = (cfg && cfg.curveballs && cfg.curveballs.burglaryChance) || 0.25;
    const burglaryAmount = (cfg && cfg.curveballs && cfg.curveballs.burglaryAmount) || 10000;
    let burglary = false;
    let actualBurglaryAmount = 0;
    let budgetAfterBurglary = budgetAfter;
    if (typeof p.cleanliness_pct === 'number'
        && p.cleanliness_pct < burglaryThreshold
        && Math.random() < burglaryChance) {
      burglary = true;
      actualBurglaryAmount = burglaryAmount;
      budgetAfterBurglary = Math.max(0, budgetAfter - burglaryAmount);
    }
    // Mark the middle day as the burglary day so the daily breakdown
    // shows where the hit landed.
    const burgledDayIndex = burglary ? Math.floor(daily.length / 2) : -1;
    if (burglary && daily[burgledDayIndex]) {
      daily[burgledDayIndex].burglary = true;
      daily[burgledDayIndex].burglaryAmount = actualBurglaryAmount;
    }

    monthlyResults.push({
      playerId: p.playerId,
      displayName: p.displayName,
      bakeryName: p.bakeryName,
      revenueGross,
      revenueNet,
      amountBorrowed,
      interestCharged,
      totalSpent,
      budgetAfter: budgetAfterBurglary,
      customerCount,
      perProductCustomers: last.perProductCustomers || {},
      aggregateSatisfactionPct,
      chefSatisfactionScore,
      perProductSatisfaction: last.perProductSatisfaction || {},
      returningCustomersEarned: last.returningCustomersEarned || 0,
      selloutAnywhere: daily.some((d) => d.selloutAnywhere),
      adWon: last.adWon,
      adWins: last.adWins,
      adBidPaid: last.adBidPaid,
      chefsWon: last.chefsWon,
      chefBidPaid: last.chefBidPaid,
      csvRow: last.csvRow,
      productPrices: last.productPrices,
      revenueBreakdown: last.revenueBreakdown,
      burglary,
      burglaryAmount: actualBurglaryAmount,
      // Daily breakdown for CSV per-day rows.
      dailyResults: daily.map((d) => ({
        day: d.day,
        revenueGross: d.revenueGross,
        // Per-day net = per-day gross (no per-day cost; cost is monthly).
        revenueNet: d.revenueGross,
        customerCount: d.customerCount,
        aggregateSatisfactionPct: d.aggregateSatisfactionPct,
        perProductCustomers: d.perProductCustomers,
        perProductSatisfaction: d.perProductSatisfaction,
        burglary: d.burglary || false,
        burglaryAmount: d.burglaryAmount || 0,
        csvRow: d.csvRow,
      })),
    });
  }

  return monthlyResults;
}

module.exports = {
  runMonthlySimulation,
  demandMultiplierForDay,
};
