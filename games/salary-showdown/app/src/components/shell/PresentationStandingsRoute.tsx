import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useRoundPresentation } from '../../contexts/RoundPresentationContext';
import { spendThroughRound } from '../../lib/contracts';
import StandingsPage from '../../pages/StandingsPage';
import { PhaseHeader } from '../ui/PhaseHeader';
import { StandingsTable } from '../ui/StandingsTable';

// The existing Standings screen owns historical browsing. During SIMULATE its
// legacy collection read would expose the server-final round document, so this
// route guard supplies the shared presentation prefix until RESULTS unlocks it.
export function PresentationStandingsRoute() {
  const { game, membership, teams } = useGame();
  const presentation = useRoundPresentation();
  const wpd = useMemo(() => new Map(presentation.rows.map((row) => {
    const spend = spendThroughRound(teams.get(row.teamId)?.spendLog ?? [], presentation.round);
    return [row.teamId, spend > 0 ? row.wins / spend : null] as const;
  })), [presentation.round, presentation.rows, teams]);

  if (game?.phase !== 'SIMULATE') return <StandingsPage />;
  if (!membership) return null;

  return (
    <main className="page">
      <PhaseHeader title="Standings" round={presentation.round}
        timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      {presentation.rd ? (
        <StandingsTable rows={presentation.rows}
          highlightTeamId={membership.teamId} wpd={wpd} />
      ) : <p className="muted">Waiting for the round broadcast…</p>}
      <p style={{ marginTop: 14 }}>
        <Link to="/game/simulate" className="chip">Back to the game</Link>
      </p>
    </main>
  );
}
