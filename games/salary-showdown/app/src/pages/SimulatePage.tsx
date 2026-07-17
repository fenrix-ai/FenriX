import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';

export default function SimulatePage() {
  const { game, membership, teams } = useGame();
  const round = game?.round ?? 1;
  const rd = useRoundDoc(round);
  const [shown, setShown] = useState(0);

  const mine = useMemo(() => {
    if (!rd || !membership) return [];
    return rd.games
      .filter((g) => g.home === membership.teamId || g.away === membership.teamId)
      .map((g) => {
        const home = g.home === membership.teamId;
        return {
          id: g.game_id,
          opponent: teams.get(home ? g.away : g.home)?.name ?? '—',
          us: home ? g.homeScore : g.awayScore,
          them: home ? g.awayScore : g.homeScore,
        };
      });
  }, [rd, membership, teams]);

  useEffect(() => { // cosmetic client pacing — the data is already server-final
    if (mine.length === 0) return;
    setShown(0);
    const interval = Math.min(3000, 45000 / mine.length);
    const id = setInterval(() => setShown((n) => {
      if (n + 1 >= mine.length) clearInterval(id);
      return n + 1;
    }), interval);
    return () => clearInterval(id);
  }, [mine.length]);

  if (!game || !membership) return null;
  const done = mine.length > 0 && shown >= mine.length;
  return (
    <main className="page">
      <PhaseHeader title="Simulate" round={round} timerEndsAt={game.timerEndsAt} />
      {mine.length === 0 && <p className="muted">Crunching the round…</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mine.slice(0, shown).map((g) => (
          <div key={g.id} className="card mono" style={{ display: 'flex', gap: 12 }}
            data-testid={g.us > g.them ? 'game-win' : 'game-loss'}>
            <span className={g.us > g.them ? 'ok' : 'neg'}>{g.us > g.them ? 'W' : 'L'}</span>
            <span style={{ flex: 1 }}>vs {g.opponent}</span>
            <span>{g.us}–{g.them}</span>
          </div>
        ))}
      </div>
      {done && <p className="ok" role="status">Round complete — results ready.</p>}
    </main>
  );
}
