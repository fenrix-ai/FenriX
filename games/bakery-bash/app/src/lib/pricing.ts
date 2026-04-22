import type {
  ElasticityTier,
  PriceZone,
  ProductKey,
  ProductPriceConfig,
} from "../types/game";

const PRICE_STEP = 0.25;
const FLOOR_BONUS = 0.15;
const MULTIPLIER_FLOOR = 0.1;

const ELASTICITY_COEFFICIENTS: Record<ElasticityTier, number> = {
  high: 1.5,
  medium: 1.0,
  low: 0.6,
};

export const DEFAULT_PRICES: Record<ProductKey, number> = {
  croissant: 4.75,
  cookie: 2.5,
  bagel: 3.0,
  sandwich: 8.75,
  coffee: 4.0,
  matcha: 6.25,
};

export const PRICE_ZONES: Record<ProductKey, ProductPriceConfig> = {
  coffee: {
    floor: 2.0,
    competitiveRangeLow: 3.0,
    competitiveRangeHigh: 4.5,
    premiumRangeLow: 5.0,
    premiumRangeHigh: 6.0,
    ceiling: 6.5,
    elasticityTier: "high",
  },
  croissant: {
    floor: 2.5,
    competitiveRangeLow: 4.0,
    competitiveRangeHigh: 5.5,
    premiumRangeLow: 6.0,
    premiumRangeHigh: 7.0,
    ceiling: 8.0,
    elasticityTier: "medium",
  },
  bagel: {
    floor: 1.5,
    competitiveRangeLow: 2.5,
    competitiveRangeHigh: 3.5,
    premiumRangeLow: 4.0,
    premiumRangeHigh: 5.0,
    ceiling: 5.5,
    elasticityTier: "high",
  },
  cookie: {
    floor: 1.0,
    competitiveRangeLow: 2.0,
    competitiveRangeHigh: 3.0,
    premiumRangeLow: 3.5,
    premiumRangeHigh: 4.5,
    ceiling: 5.0,
    elasticityTier: "high",
  },
  sandwich: {
    floor: 5.0,
    competitiveRangeLow: 7.5,
    competitiveRangeHigh: 10.0,
    premiumRangeLow: 10.5,
    premiumRangeHigh: 12.5,
    ceiling: 14.0,
    elasticityTier: "medium",
  },
  matcha: {
    floor: 3.5,
    competitiveRangeLow: 5.5,
    competitiveRangeHigh: 7.0,
    premiumRangeLow: 7.5,
    premiumRangeHigh: 9.0,
    ceiling: 10.0,
    elasticityTier: "low",
  },
};

export function classifyZone(price: number, cfg: ProductPriceConfig): PriceZone {
  if (price >= cfg.premiumRangeLow) return "premium";
  if (price >= cfg.competitiveRangeLow) return "competitive";
  return "floor";
}

export function snapPriceToStep(price: number): number {
  return Math.round(price / PRICE_STEP) * PRICE_STEP;
}

export function clampPrice(price: number, cfg: ProductPriceConfig): number {
  if (price < cfg.floor) return cfg.floor;
  if (price > cfg.ceiling) return cfg.ceiling;
  return price;
}

export function calculatePriceDemandMultiplier(
  price: number,
  cfg: ProductPriceConfig,
): number {
  const competitiveMid =
    (cfg.competitiveRangeLow + cfg.competitiveRangeHigh) / 2;
  const zone = classifyZone(price, cfg);
  const floorBonus = zone === "floor" ? FLOOR_BONUS : 0;
  const elasticity = ELASTICITY_COEFFICIENTS[cfg.elasticityTier];
  const pctDeltaP = (price - competitiveMid) / competitiveMid;
  const elasticityEffect = -elasticity * pctDeltaP;
  return Math.max(MULTIPLIER_FLOOR, 1 + floorBonus + elasticityEffect);
}
