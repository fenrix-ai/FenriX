import { useEffect, useState } from 'react';
import { useRoundPresentation } from '../contexts/RoundPresentationContext';
import type { RoundDoc } from '../types/models';

export function useRoundDoc(round: number) {
  const presentation = useRoundPresentation();
  const [historical, setHistorical] = useState<{
    round: number; rd: RoundDoc | null;
  }>({ round: 0, rd: null });
  useEffect(() => {
    if (round === presentation.round || round < 1) return undefined;
    let active = true;
    void presentation.getRound(round).then((rd) => {
      if (active) setHistorical({ round, rd });
    });
    return () => { active = false; };
  }, [presentation.getRound, presentation.round, round]);
  if (round === presentation.round) return presentation.rd;
  return historical.round === round ? historical.rd : null;
}
