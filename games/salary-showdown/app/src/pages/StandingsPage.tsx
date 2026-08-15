import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { winsPerDollarThroughRound } from '../lib/contracts';
import type { RoundDoc, StandingsRow } from '../types/models';

export default function StandingsPage() {
  const { game, gameId, teams, membership } = useGame();
  const [latest, setLatest] = useState<{ round: number; rows: StandingsRow[] } | null>(null);

  useEffect(() => { // most recently played round's standings snapshot
    if (!game || !membership || !gameId) return;
    let cancelled = false;
    void getDocs(collection(db, 'games', gameId, 'rounds'))
      .then((snap) => {
        let best: { round: number; rows: StandingsRow[] } | null = null;
        snap.forEach((d) => {
          const r = Number(d.id);
          if (!best || r > best.round) best = { round: r, rows: (d.data() as RoundDoc).standings };
        });
        if (!cancelled) setLatest(best);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [game?.round, game?.phase, membership, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const wpd = useMemo(
    () => (latest ? winsPerDollarThroughRound(teams, latest.round) : null),
    [teams, latest]);

  if (!game || !membership) return null;
  return (
    <main className="page">
      <PhaseHeader title="Standings" round={latest?.round ?? 0} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      {latest
        ? <StandingsTable rows={latest.rows} highlightTeamId={membership.teamId} wpd={wpd} />
        : <p className="muted">No games in the books yet.</p>}
      <p style={{ marginTop: 14 }}><Link to="/game/office" className="chip">Back to the game</Link></p>
    </main>
  );
}
