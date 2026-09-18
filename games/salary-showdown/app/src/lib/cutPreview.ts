import type { TeamDoc } from '../types/models';
import { isActive } from './contracts';

export function previewCut(team: TeamDoc, pid: number, round: number): TeamDoc {
  const contract = team.roster.find((candidate) => (
    candidate.pid === pid && isActive(candidate, round)
  ));

  if (!contract) {
    throw new Error(`cut preview requires an active roster contract for pid ${pid}`);
  }

  const endRound = contract.startRound + contract.years - 1;
  return {
    ...team,
    roster: team.roster.filter((candidate) => candidate !== contract),
    deadMoney: [
      ...team.deadMoney,
      {
        pid: contract.pid,
        rate: contract.rate,
        startRound: round,
        endRound,
      },
    ],
  };
}
