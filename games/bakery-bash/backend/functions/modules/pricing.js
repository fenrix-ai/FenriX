const {
  ELASTICITY_COEFFICIENTS,
  FLOOR_BONUS,
  MULTIPLIER_FLOOR,
  PRICE_STEP,
} = require('./config');

function classifyZone(price, productCfg) {
  if (price >= productCfg.premiumRangeLow) return 'premium';
  if (price >= productCfg.competitiveRangeLow) return 'competitive';
  return 'floor';
}

function calculatePriceDemandMultiplier(price, productCfg) {
  const competitiveMid =
    (productCfg.competitiveRangeLow + productCfg.competitiveRangeHigh) / 2;
  const zone = classifyZone(price, productCfg);
  const floorBonus = zone === 'floor' ? FLOOR_BONUS : 0;
  const elasticity = ELASTICITY_COEFFICIENTS[productCfg.elasticityTier];
  const pctDeltaP = (price - competitiveMid) / competitiveMid;
  const elasticityEffect = -elasticity * pctDeltaP;
  return Math.max(MULTIPLIER_FLOOR, 1 + floorBonus + elasticityEffect);
}

function snapPriceToStep(price) {
  return Math.round(price / PRICE_STEP) * PRICE_STEP;
}

function clampPrice(price, productCfg) {
  if (price < productCfg.floor) return productCfg.floor;
  if (price > productCfg.ceiling) return productCfg.ceiling;
  return price;
}

function resolvePriceForSim({
  submittedThisRound,
  priorSubmissions = [],
  productCfg,
  catalogBasePrice,
}) {
  const isValid = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  let chosen;
  if (isValid(submittedThisRound)) {
    chosen = submittedThisRound;
  } else {
    for (let i = priorSubmissions.length - 1; i >= 0; i -= 1) {
      if (isValid(priorSubmissions[i])) {
        chosen = priorSubmissions[i];
        break;
      }
    }
  }
  if (chosen === undefined) chosen = catalogBasePrice;
  return clampPrice(snapPriceToStep(chosen), productCfg);
}

module.exports = {
  classifyZone,
  calculatePriceDemandMultiplier,
  snapPriceToStep,
  clampPrice,
  resolvePriceForSim,
};
