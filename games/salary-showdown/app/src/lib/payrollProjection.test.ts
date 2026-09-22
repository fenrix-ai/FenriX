import { expect, test } from 'vitest';
import { payrollProjection } from './payrollProjection';
import type { Contract, TeamDoc } from '../types/models';

test('candidate adds only covered rounds while dead money remains', () => {
  const team = { roster: [], deadMoney: [
    { pid: 10, rate: 7, startRound: 2, endRound: 4 },
  ] } as unknown as TeamDoc;
  const candidate: Contract = {
    pid: 11, rate: 9, startRound: 3, years: 2,
    viaAuction: false, hardship: false,
  };

  expect(payrollProjection(team, candidate).map((point) => point.total))
    .toEqual([0, 7, 16, 16, 0]);
});

test('projection returns five rounded cash, dead, preview and total values', () => {
  const team = {
    roster: [
      { pid: 1, rate: 10.04, startRound: 1, years: 2, viaAuction: false, hardship: false },
      { pid: 2, rate: 2.04, startRound: 2, years: 1, viaAuction: false, hardship: false },
    ],
    deadMoney: [{ pid: 3, rate: 1.04, startRound: 2, endRound: 3 }],
  } as unknown as TeamDoc;
  const preview = {
    pid: 4, rate: 3.04, startRound: 3, years: 2, viaAuction: false, hardship: false,
  } satisfies Contract;

  expect(payrollProjection(team, preview)).toEqual([
    { round: 1, cash: 10, dead: 0, preview: 0, total: 10 },
    { round: 2, cash: 12.1, dead: 1, preview: 0, total: 13.1 },
    { round: 3, cash: 0, dead: 1, preview: 3, total: 4 },
    { round: 4, cash: 0, dead: 0, preview: 3, total: 3 },
    { round: 5, cash: 0, dead: 0, preview: 0, total: 0 },
  ]);
});

test('an expired contract is not counted when previewing its re-sign', () => {
  const team = {
    roster: [
      { pid: 8, rate: 12, startRound: 1, years: 1, viaAuction: false, hardship: false },
    ],
    deadMoney: [],
  } as unknown as TeamDoc;
  const renewal = {
    pid: 8, rate: 14, startRound: 2, years: 2, viaAuction: false, hardship: false,
  } satisfies Contract;

  expect(payrollProjection(team, renewal).map((point) => point.total))
    .toEqual([12, 14, 14, 0, 0]);
});
