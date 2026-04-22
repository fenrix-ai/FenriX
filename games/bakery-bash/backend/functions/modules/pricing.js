/**
 * pricing.js — Pure POST-01 pricing math.
 *
 * No Firebase. No state. Operates on per-product config from config.PRICE_ZONES.
 */

const {
  PRICE_ZONES,
  ELASTICITY_COEFFICIENTS,
  PRICE_STEP,
  FLOOR_BONUS,
  MULTIPLIER_FLOOR,
  PRODUCT_CATALOG,
} = require('./config');

/**
 * Return the zone label ('floor' | 'competitive' | 'premium') for a price.
 * Zones are mutually exclusive and cover [floor, ceiling] with no gaps.
 *
 * @param {number} price
 * @param {object} productCfg - one entry of PRICE_ZONES
 * @returns {'floor' | 'competitive' | 'premium'}
 */
function classifyZone(price, productCfg) {
  if (price >= productCfg.premiumRangeLow) return 'premium';
  if (price >= productCfg.competitiveRangeLow) return 'competitive';
  return 'floor';
}

/**
 * Demand multiplier applied per player per product. Combines:
 *   - continuous point-elasticity centered on the midpoint of the
 *     competitive range (e × %ΔP)
 *   - a discrete +FLOOR_BONUS demand bump when the price sits in the
 *     Floor zone
 *   - a hard lower bound of MULTIPLIER_FLOOR so ceiling-priced
 *     high-elasticity products still receive a nonzero allocation share.
 *
 * @param {number} price
 * @param {object} productCfg - one entry of PRICE_ZONES
 * @returns {number} multiplier in [MULTIPLIER_FLOOR, ∞), typically [0.1, 2.0]
 */
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

module.exports = {
  classifyZone,
  calculatePriceDemandMultiplier,
};
