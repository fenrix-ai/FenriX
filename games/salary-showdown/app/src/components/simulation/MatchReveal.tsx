import { FranchiseMark } from '../franchise/FranchiseMark';
import type { GameResult, TeamDoc } from '../../types/models';
import styles from '../../pages/SimulatePage.module.css';

type MatchRevealProps = {
  game: GameResult | null;
  ownTeamId: string;
  teams: ReadonlyMap<string, TeamDoc>;
  revealed: boolean;
};

const teamName = (teamId: string, teams: ReadonlyMap<string, TeamDoc>) =>
  teams.get(teamId)?.name ?? 'League opponent';

export function MatchReveal({ game, ownTeamId, teams, revealed }: MatchRevealProps) {
  if (!game) {
    return (
      <section className={styles.broadcast} aria-label="Matchup broadcast">
        <div className={styles.feedState}>League feed</div>
        <h2 className={styles.emptyHeadline}>Your schedule is complete</h2>
        <p className={styles.emptyCopy}>Completed matchups remain available below.</p>
      </section>
    );
  }

  const home = teams.get(game.home);
  const away = teams.get(game.away);
  const homeName = teamName(game.home, teams);
  const awayName = teamName(game.away, teams);
  const ownScore = game.home === ownTeamId ? game.homeScore : game.awayScore;
  const opponentScore = game.home === ownTeamId ? game.awayScore : game.homeScore;
  const result = ownScore > opponentScore ? 'Win' : 'Loss';

  return (
    <section className={styles.broadcast} aria-label="Matchup broadcast">
      <div className={styles.feedState}>{revealed ? 'Final' : 'Next matchup'}</div>
      <div className={styles.matchupGrid}>
        <div className={styles.franchiseSide}>
          <FranchiseMark teamId={game.home} name={homeName} identity={home?.identity} size={72} />
          <span className={styles.homeAway}>Home</span>
          <strong title={homeName}>{homeName}</strong>
        </div>
        <div className={styles.scoreStage} aria-live="polite">
          {revealed ? (
            <>
              <div className={styles.scoreReveal}>
                <span>{game.homeScore}</span><span aria-hidden="true">–</span><span>{game.awayScore}</span>
              </div>
              <div className={result === 'Win' ? styles.winResult : styles.lossResult}>
                {result} for your franchise
              </div>
            </>
          ) : (
            <>
              <span className={styles.versus} aria-hidden="true">VS</span>
              <span className={styles.scoreHeld}>Final score held</span>
            </>
          )}
        </div>
        <div className={styles.franchiseSide}>
          <FranchiseMark teamId={game.away} name={awayName} identity={away?.identity} size={72} />
          <span className={styles.homeAway}>Away</span>
          <strong title={awayName}>{awayName}</strong>
        </div>
      </div>
    </section>
  );
}
