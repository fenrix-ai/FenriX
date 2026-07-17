import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import type { Phase } from '../types/models';

const ROUTE: Record<Phase, string> = {
  LOBBY: '/lobby', FRONT_OFFICE: '/game/office', FREE_AGENCY: '/game/market',
  AUCTION: '/game/auction', LINEUP: '/game/lineup', SIMULATE: '/game/simulate',
  RESULTS: '/game/results', FINALE: '/game/conclusion',
};

// The professor's advancePhase is the game's only clock; this component makes
// every team screen follow it. /standings is exempt — it is "always accessible"
// (spec §11.9): navigation TO it is manual, and we do not yank the user off it.
export function PhaseRouter() {
  const { game, membership } = useGame();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!game || !membership) return;
    if (pathname === '/standings') return;
    const want = ROUTE[game.phase];
    if (want && pathname !== want) nav(want, { replace: true });
  }, [game?.phase, membership, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
