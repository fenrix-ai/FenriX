import type { Phase } from '../types/models';

// Student vocabulary (design spec §5/§6): FREE_AGENCY is presented as "Draft
// Night" and AUCTION as "Star Auction" everywhere a phase is named in UI.
// Record<Phase, string> makes tsc enforce exhaustiveness if Phase ever grows.
export const PHASE_NAMES: Record<Phase, string> = {
  LOBBY: 'Lobby',
  FRONT_OFFICE: 'Front Office',
  FREE_AGENCY: 'Draft Night',
  AUCTION: 'Star Auction',
  LINEUP: 'Lineup',
  SIMULATE: 'Simulate',
  RESULTS: 'Results',
  FINALE: 'Finale',
};
