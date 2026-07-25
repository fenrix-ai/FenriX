import type { Phase, TeamDoc } from '../types/models';

// Submission lights (contracts §Panel behaviors): which teams count as
// "submitted" for the CURRENT phase. Shared by AdvanceControl's confirm guard
// (T7) and SubmissionGrid (T9) — one definition, imported by both. Lights are
// STATUS ONLY: presence facts, never bid contents, and never a lock —
// markDone is a flag, teams keep acting until the professor closes the phase.
export const LIGHT_PHASES: ReadonlySet<Phase> =
  new Set<Phase>(['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP']);

export function submittedTeamIds(
  phase: Phase,
  round: number,
  teams: Map<string, TeamDoc>,
  bidsSubmitted: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const [teamId, t] of teams) {
    switch (phase) {
      case 'FRONT_OFFICE':
      case 'FREE_AGENCY':
        // Staleness is implicit in the (doneRound, donePhase) pair — nothing
        // ever clears it, so BOTH the round and the phase must match.
        if (t.doneRound === round && t.donePhase === phase) out.add(teamId);
        break;
      case 'AUCTION':
        // PRESENCE only: ProfessorContext sets membership from
        // private/auction.round === current round. Bid contents never reach
        // this layer.
        if (bidsSubmitted.has(teamId)) out.add(teamId);
        break;
      case 'LINEUP':
        if (t.lineupLockedRound === round) out.add(teamId);
        break;
      default:
        // LOBBY / SIMULATE / RESULTS / FINALE: no lights section — empty set.
        break;
    }
  }
  return out;
}
