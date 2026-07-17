export const CAP = 100.0;
export const TOTAL_ROUNDS = 5;
export const INFLATION = 1.08;
export const DISCOUNTS: Record<number, number> = { 1: 1.0, 2: 0.92, 3: 0.85, 4: 0.8, 5: 0.75 };

export const r01 = (x: number) => Math.round(x * 10) / 10;
export const askPrice = (base: number, round: number) => r01(base * INFLATION ** (round - 1));
export const contractRate = (ask: number, years: number) => r01(ask * DISCOUNTS[years]);
export const minBid = (round: number) => r01(2.0 * INFLATION ** (round - 1));
export const maxYears = (round: number) => TOTAL_ROUNDS - round + 1;
export const fmtM = (x: number) => `$${x.toFixed(1)}M`;
export const hypeCurve = (hype: number) => 2.0 + ((hype - 1.0) / 4.0) ** 1.35 * 24.0;
