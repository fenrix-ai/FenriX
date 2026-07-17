import { askPrice, contractRate, fmtM, hypeCurve, maxYears, minBid, r01 } from './money';

test('askPrice: round 1 is the CSV base exactly; 8% compounds per round', () => {
  expect(askPrice(4.8, 1)).toBe(4.8);
  expect(askPrice(4.8, 3)).toBe(5.6);   // 4.8 * 1.1664 = 5.59872 → r01 → 5.6
  expect(askPrice(28.0, 5)).toBe(38.1); // 28 * 1.08^4 = 38.0938…
});
test('contractRate applies the discount then rounds to $0.1M', () => {
  expect(contractRate(4.8, 1)).toBe(4.8);
  expect(contractRate(4.8, 2)).toBe(4.4); // 4.416 — the mock’s $4.42M is a sample-number error
  expect(contractRate(4.8, 3)).toBe(4.1); // 4.08 → 4.1
  expect(contractRate(10, 4)).toBe(8);
  expect(contractRate(10, 5)).toBe(7.5);
});
test('minBid inflates the $2.0M league minimum', () => {
  expect(minBid(1)).toBe(2.0);
  expect(minBid(3)).toBe(2.3);  // 2 * 1.1664 = 2.3328
});
test('maxYears is rounds remaining', () => {
  expect(maxYears(1)).toBe(5);
  expect(maxYears(4)).toBe(2);
  expect(maxYears(5)).toBe(1);
});
test('r01 and fmtM', () => {
  expect(r01(4.416)).toBe(4.4);
  expect(fmtM(4.4)).toBe('$4.4M');
});
test('hypeCurve endpoints match payroll.js', () => {
  expect(hypeCurve(1.0)).toBe(2.0);
  expect(hypeCurve(5.0)).toBe(26.0);
  expect(r01(hypeCurve(3.5))).toBe(14.7); // 2 + (0.625^1.35)*24 = 14.726…
});

import { capOkWith, expiringPids, payrollAt, payrollSplitAt, spendThroughRound } from './contracts';
import type { TeamDoc } from '../types/models';

const team = {
  name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
  roster: [
    { pid: 1, rate: 40, startRound: 1, years: 3, viaAuction: false, hardship: false },
    { pid: 2, rate: 30, startRound: 2, years: 2, viaAuction: false, hardship: false },
  ],
  deadMoney: [{ pid: 3, rate: 10, startRound: 2, endRound: 3 }],
  spendLog: [
    { pid: 1, rate: 40, startRound: 1, years: 3, viaAuction: false, hardship: false },
    { pid: 2, rate: 30, startRound: 2, years: 2, viaAuction: false, hardship: false },
    { pid: 3, rate: 10, startRound: 1, years: 3, viaAuction: false, hardship: false },
  ],
  lineup: null, lineupLockedRound: 0, hardshipUsed: [],
} satisfies TeamDoc;

test('payrollAt = active rates + dead money per round', () => {
  expect(payrollAt(team, 1)).toBe(40);
  expect(payrollAt(team, 2)).toBe(80);  // 40 + 30 + 10 dead
  expect(payrollSplitAt(team, 3)).toEqual({ cash: 70, dead: 10 });
  expect(payrollAt(team, 4)).toBe(0);   // everything expired / dead money ended
});
test('capOkWith checks EVERY covered round and reports the peak', () => {
  const c = { pid: 9, rate: 21, startRound: 2, years: 2, viaAuction: false, hardship: false };
  const res = capOkWith(team, c);
  expect(res).toEqual({ ok: false, worstRound: 2, worstPayroll: 101 }); // 80 + 21
  expect(capOkWith(team, { ...c, rate: 20 }).ok).toBe(true);            // exactly 100.0 fits
});
test('expiringPids lists contracts whose last covered round was r-1', () => {
  expect(expiringPids(team, 4)).toEqual([1, 2]); // both end in round 3
  expect(expiringPids(team, 2)).toEqual([]);
});
test('spendThroughRound counts committed schedule, cut or not', () => {
  expect(spendThroughRound(team.spendLog, 1)).toBe(50);  // 40 + 10 (pid 3 cut later, still charged)
  expect(spendThroughRound(team.spendLog, 5)).toBe(210); // 120 + 60 + 30
});
