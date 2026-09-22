import { describe, expect, test } from 'vitest';
import type { Contract, TeamDoc } from '../types/models';
import { payrollProjection } from './payrollProjection';
import { previewCut } from './cutPreview';

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  pid: 42,
  rate: 8,
  startRound: 1,
  years: 4,
  viaAuction: false,
  hardship: false,
  ...overrides,
});

const teamWith = (roster: Contract[]): TeamDoc => ({
  name: 'Cap City',
  wins: 0,
  losses: 0,
  pointDiff: 0,
  pointsFor: 0,
  roster,
  deadMoney: [],
  spendLog: [...roster],
  lineup: null,
  lineupLockedRound: 0,
  hardshipUsed: [],
  doneRound: 0,
  donePhase: '',
});

describe('previewCut', () => {
  test('cut changes roster but preserves remaining contractual payroll', () => {
    const team = teamWith([contract()]);

    const cut = previewCut(team, 42, 3);

    expect(cut.roster).toHaveLength(0);
    expect(payrollProjection(cut).slice(2).map((point) => point.total))
      .toEqual([8, 8, 0]);
    expect(team.roster).toHaveLength(1);
  });

  test('keeps existing dead money and the append-only spend log unchanged', () => {
    const deal = contract({ pid: 7, rate: 5, startRound: 2, years: 3 });
    const team = teamWith([deal]);
    team.deadMoney = [{ pid: 3, rate: 2, startRound: 1, endRound: 5 }];
    const original = structuredClone(team);

    const cut = previewCut(team, 7, 3);

    expect(cut.deadMoney).toEqual([
      { pid: 3, rate: 2, startRound: 1, endRound: 5 },
      { pid: 7, rate: 5, startRound: 3, endRound: 4 },
    ]);
    expect(cut.spendLog).toEqual(team.spendLog);
    expect(team).toEqual(original);
    expect(payrollProjection(cut).map((point) => point.total))
      .toEqual([2, 2, 7, 7, 2]);
  });

  test('a last-round cut records exactly the final covered obligation', () => {
    const team = teamWith([contract({ startRound: 5, years: 1, rate: 11 })]);

    const cut = previewCut(team, 42, 5);

    expect(cut.deadMoney).toEqual([
      { pid: 42, rate: 11, startRound: 5, endRound: 5 },
    ]);
    expect(payrollProjection(cut).map((point) => point.total))
      .toEqual([0, 0, 0, 0, 11]);
  });

  test.each([
    { label: 'missing', pid: 99, round: 3, deal: contract() },
    { label: 'expired', pid: 42, round: 3, deal: contract({ years: 2 }) },
    {
      label: 'expired synthetic',
      pid: 9001,
      round: 2,
      deal: contract({ pid: 9001, startRound: 1, years: 1, rate: 0, hardship: true }),
    },
  ])('rejects a $label roster deal', ({ pid, round, deal }) => {
    const team = teamWith([deal]);

    expect(() => previewCut(team, pid, round)).toThrow('active roster contract');
    expect(team.roster).toEqual([deal]);
    expect(team.deadMoney).toEqual([]);
  });
});
