import type { GameResult, TeamDoc } from '../../types/models';
import styles from '../../pages/SimulatePage.module.css';

type CompletedGamesProps = {
  games: GameResult[];
  ownTeamId: string;
  round: number;
  selectedGameId: string | null;
  teams: ReadonlyMap<string, TeamDoc>;
  onSelect: (gameId: string) => void;
};

export function CompletedGames({
  games,
  ownTeamId,
  round,
  selectedGameId,
  teams,
  onSelect,
}: CompletedGamesProps) {
  return (
    <section className={styles.completedSection} aria-labelledby="completed-games-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="completed-games-title">Completed matchups</h2>
          <p>Open any posted final to inspect its full boxscore.</p>
        </div>
        <span className={styles.completedCount}>{games.length} posted</span>
      </div>
      {games.length === 0 ? (
        <p className={styles.emptyStrip}>No finals have reached your franchise yet.</p>
      ) : (
        <div className={styles.reel}>
          {games.map((game, index) => {
            const home = game.home === ownTeamId;
            const opponentId = home ? game.away : game.home;
            const opponent = teams.get(opponentId)?.name ?? 'League opponent';
            const us = home ? game.homeScore : game.awayScore;
            const them = home ? game.awayScore : game.homeScore;
            const won = us > them;
            const selected = game.game_id === selectedGameId;
            return (
              <button
                aria-controls={`boxscore-${game.game_id}`}
                aria-expanded={selected}
                className={`${styles.completedGame} ${selected ? styles.selectedGame : ''}`}
                data-testid={`completed-game-${game.game_id}`}
                key={game.game_id}
                onClick={() => onSelect(game.game_id)}
                type="button"
              >
                <span className={styles.gameSequence}>Round {round} · Match {index + 1}</span>
                <strong title={opponent}>vs {opponent}</strong>
                <span className={won ? styles.winScore : styles.lossScore}>
                  {won ? 'W' : 'L'} <span className={styles.finalScore}>{us}–{them}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
