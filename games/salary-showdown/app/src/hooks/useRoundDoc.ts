import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import type { RoundDoc } from '../types/models';

export function useRoundDoc(round: number) {
  const { gameId, membership } = useGame();
  const [rd, setRd] = useState<RoundDoc | null>(null);
  useEffect(() => {
    if (!gameId || !membership || round < 1) { setRd(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'rounds', String(round)),
      (s) => setRd(s.exists() ? (s.data() as RoundDoc) : null),
      () => {});
  }, [gameId, !!membership, round]);
  return rd;
}
