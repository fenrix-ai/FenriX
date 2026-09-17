import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useRoundPresentation } from '../contexts/RoundPresentationContext';
import type { RoundDoc } from '../types/models';

export function useRoundDoc(round: number) {
  const { uid } = useAuth();
  const { gameId, membership } = useGame();
  const presentation = useRoundPresentation();
  const queryKey = gameId && uid && membership && round > 0 && round < presentation.round
    ? JSON.stringify([gameId, uid, round])
    : '';
  const [historical, setHistorical] = useState<{
    key: string; rd: RoundDoc | null;
  }>({ key: '', rd: null });
  useEffect(() => {
    if (!queryKey) return undefined;
    let active = true;
    void presentation.getRound(round).then((rd) => {
      if (active) setHistorical({ key: queryKey, rd });
    });
    return () => { active = false; };
  }, [presentation.getRound, queryKey, round]);
  if (round === presentation.round) return presentation.rd;
  // Check during render: an effect-only reset would briefly publish the prior
  // game/user's document before the new query starts.
  return queryKey && historical.key === queryKey ? historical.rd : null;
}
