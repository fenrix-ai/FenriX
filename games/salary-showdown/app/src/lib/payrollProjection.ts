import type { Contract, TeamDoc } from '../types/models';
import { payrollSplitAt } from './contracts';
import { TOTAL_ROUNDS, r01 } from './money';

export type PayrollPoint = {
  round: number;
  cash: number;
  dead: number;
  preview: number;
  total: number;
};

export function payrollProjection(team: TeamDoc, preview?: Contract): PayrollPoint[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, index) => {
    const round = index + 1;
    const { cash, dead } = payrollSplitAt(team, round);
    const previewRate = preview
      && round >= preview.startRound
      && round < preview.startRound + preview.years
      ? preview.rate
      : 0;
    const candidate = r01(previewRate);

    return {
      round,
      cash,
      dead,
      preview: candidate,
      total: r01(cash + dead + candidate),
    };
  });
}
