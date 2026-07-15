export const ORDER = ['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP', 'SIMULATE', 'RESULTS'];
export const TOTAL_ROUNDS = 5;

// Registered by game.js as resolution modules land. Keys: exit phase name.
export const HOOKS = {};

export function nextPhase(round, phase, totalRounds = TOTAL_ROUNDS) {
  if (phase === 'FINALE') throw new Error('FINALE is terminal');
  if (phase === 'RESULTS') {
    return round >= totalRounds
      ? { round, phase: 'FINALE' }
      : { round: round + 1, phase: 'FRONT_OFFICE' };
  }
  const i = ORDER.indexOf(phase);
  if (i === -1) throw new Error(`unknown phase ${phase}`);
  return { round, phase: ORDER[i + 1] };
}
