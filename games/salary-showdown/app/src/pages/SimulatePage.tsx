import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useRoundPresentation } from '../contexts/RoundPresentationContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { MatchReveal } from '../components/simulation/MatchReveal';
import { CompletedGames } from '../components/simulation/CompletedGames';
import { MatchBoxscore } from '../components/simulation/MatchBoxscore';
import styles from './SimulatePage.module.css';

export default function SimulatePage() {
  const { game, membership, team, teams } = useGame();
  const presentation = useRoundPresentation();
  const round = game?.round ?? 1;
  const { rd, applied, complete } = presentation;
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const ownTeamId = membership?.teamId ?? null;

  const visibleGames = useMemo(
    () => rd?.games.slice(0, applied) ?? [],
    [applied, rd],
  );
  const completedGames = useMemo(
    () => ownTeamId
      ? visibleGames.filter((gameResult) =>
          gameResult.home === ownTeamId || gameResult.away === ownTeamId)
      : [],
    [ownTeamId, visibleGames],
  );

  useEffect(() => {
    setSelectedGameId(null);
  }, [round]);

  useEffect(() => {
    if (selectedGameId && !completedGames.some((gameResult) => gameResult.game_id === selectedGameId)) {
      setSelectedGameId(null);
    }
  }, [completedGames, selectedGameId]);

  const featured = useMemo(() => {
    if (!rd || !ownTeamId) return { game: null, revealed: false };
    const lastApplied = visibleGames.at(-1);
    if (lastApplied && (lastApplied.home === ownTeamId || lastApplied.away === ownTeamId)) {
      return { game: lastApplied, revealed: true };
    }
    const next = rd.games.slice(applied).find((gameResult) =>
      gameResult.home === ownTeamId || gameResult.away === ownTeamId);
    if (next) return { game: next, revealed: false };
    return { game: completedGames.at(-1) ?? null, revealed: completedGames.length > 0 };
  }, [applied, completedGames, ownTeamId, rd, visibleGames]);

  const selectedGame = selectedGameId
    ? completedGames.find((gameResult) => gameResult.game_id === selectedGameId) ?? null
    : null;
  const record = membership
    ? presentation.rows.find((row) => row.teamId === membership.teamId) ?? null
    : null;

  if (!game || !membership || !team) return null;
  return (
    <main className={`page ${styles.page}`}>
      <PhaseHeader title="Simulate" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      {!rd ? (
        <section className={styles.preparing} role="status" aria-live="polite">
          <div className={styles.preparingCourt} aria-hidden="true"><span /></div>
          <div>
            <h2>Preparing round {round} results</h2>
            <p>The server is assembling the league feed. Your franchise and current round remain in view.</p>
          </div>
        </section>
      ) : (
        <>
          <div className={styles.scoreboardBar}>
            <div>
              <span>Live record</span>
              <strong className="mono" data-testid="simulation-record">
                {record ? `${record.wins}–${record.losses}` : '—'}
              </strong>
            </div>
            <div className={styles.feedProgress}>
              <span>League feed</span>
              <strong className="mono">{applied} / {rd.games.length}</strong>
            </div>
            <button
              className="btn gold"
              disabled={complete}
              onClick={presentation.revealAll}
              type="button"
            >
              Reveal all results
            </button>
          </div>

          <MatchReveal
            game={featured.game}
            key={`${round}-${featured.game?.game_id ?? 'complete'}-${featured.revealed ? 'final' : 'intro'}`}
            ownTeamId={membership.teamId}
            revealed={featured.revealed}
            teams={teams}
          />

          <CompletedGames
            games={completedGames}
            onSelect={(gameId) => setSelectedGameId((current) => current === gameId ? null : gameId)}
            ownTeamId={membership.teamId}
            round={round}
            selectedGameId={selectedGameId}
            teams={teams}
          />

          {selectedGame ? <MatchBoxscore boxCsv={rd.boxCsv} game={selectedGame} teams={teams} /> : null}

          {complete ? (
            <p className={styles.complete} role="status">Round complete — results ready.</p>
          ) : (
            <p className={styles.progressNote}>
              Scores, the record, and completed matchups update from the same league reveal.
            </p>
          )}
        </>
      )}
    </main>
  );
}
