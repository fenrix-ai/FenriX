import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { parseBoxCsv, seasonForm, type BoxRow } from '../lib/boxfeed';

// Live form from every persisted round feed. Refetches when a new round doc can
// exist (game.round changes); rounds/* are immutable once written.
export function useSeasonForm() {
  const { gameId, membership, game } = useGame();
  const [form, setForm] = useState<Map<number, { gp: number; ppg: number; fgPct: number }>>(new Map());
  const [rows, setRows] = useState<BoxRow[]>([]);
  useEffect(() => {
    if (!gameId || !membership) return;
    let cancelled = false;
    void getDocs(collection(db, 'games', gameId, 'rounds')).then((snap) => {
      const all: BoxRow[] = [];
      snap.forEach((d) => all.push(...parseBoxCsv((d.data() as { boxCsv: string }).boxCsv)));
      if (!cancelled) {
        setRows(all);
        setForm(seasonForm(all));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [gameId, !!membership, game?.round]);
  return { form, rows };
}
