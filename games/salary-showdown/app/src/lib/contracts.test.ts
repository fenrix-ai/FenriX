import { expiringPids, isSynthetic, SYNTHETIC_MIN_PID, activePids } from './contracts';
import type { TeamDoc } from '../types/models';

const c = (pid: number, startRound: number, years: number, hardship = false) =>
  ({ pid, rate: hardship ? 0 : 4, startRound, years, viaAuction: false, hardship });
const team = (roster: ReturnType<typeof c>[]) =>
  ({ roster, deadMoney: [], spendLog: [] } as unknown as TeamDoc);

test('isSynthetic keys off the reserved pid floor, not the hardship flag', () => {
  expect(SYNTHETIC_MIN_PID).toBe(9000);
  expect(isSynthetic(9001)).toBe(true);
  expect(isSynthetic(1175)).toBe(false);   // highest real datagen pid
});

// Mirrors backend payroll.js expiringPids (spec §2, 2026-07-26). A Default Role
// Player's 1-round hardship deal expires EVERY round, so without this filter the
// front office's "Expiring deals" list fills with contracts the server refuses to
// re-sign — validateSigning rejects the whole 9000+ range.
test('expiringPids never offers an expired synthetic Default Role Player', () => {
  const t = team([
    c(1001, 1, 1),          // real, expired at end of round 1 -> offered
    c(9001, 1, 1, true),    // synthetic hardship, also expired -> never offered
    c(9021, 1, 1, true),
    c(1002, 1, 5),          // still running -> not expiring
  ]);
  expect(expiringPids(t, 2)).toEqual([1001]);
});

test('expiringPids still returns real expiring contracts untouched', () => {
  const t = team([c(1001, 1, 1), c(1002, 1, 2), c(1003, 2, 1)]);
  expect(expiringPids(t, 2)).toEqual([1001]);
  expect(expiringPids(t, 3)).toEqual([1002, 1003]);
});

// the synthetic filter is scoped to the re-sign list only — a DRP is a real,
// playable roster member during the round it was signed for.
test('activePids still includes a synthetic during its own round', () => {
  const t = team([c(1001, 2, 1), c(9001, 2, 1, true)]);
  expect(activePids(t, 2)).toEqual([1001, 9001]);
  expect(activePids(t, 3)).toEqual([]);
});
