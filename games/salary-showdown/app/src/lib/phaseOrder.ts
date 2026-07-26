import type { Phase } from '../types/models';

// Phase order within a round (contracts): FRONT_OFFICE → FREE_AGENCY →
// AUCTION → LINEUP → SIMULATE → RESULTS → (next round's FRONT_OFFICE, or
// FINALE after round 5). Round 1 enters at FREE_AGENCY via startSeason; the
// order still applies from there.
//
// CLIENT MIRROR of backend/functions/src/phases.js (ORDER, TOTAL_ROUNDS,
// nextPhase). phaseOrder.test.ts pins parity — a server order change must
// land here in the same commit or the unit suite goes red.
export const ORDER: Phase[] =
  ['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP', 'SIMULATE', 'RESULTS'];
// config.totalRounds is decorative (Plan 1 ruling: display read-only, never
// editable, never authoritative). The season is 5 rounds, hard-coded.
export const TOTAL_ROUNDS = 5;

export function nextOf(phase: Phase, round: number): { phase: Phase; round: number } | null {
  const i = ORDER.indexOf(phase);
  if (i === -1) return null; // LOBBY / FINALE: no advance control
  if (phase === 'RESULTS') {
    return round >= TOTAL_ROUNDS
      ? { phase: 'FINALE', round }
      : { phase: 'FRONT_OFFICE', round: round + 1 };
  }
  return { phase: ORDER[i + 1], round };
}
