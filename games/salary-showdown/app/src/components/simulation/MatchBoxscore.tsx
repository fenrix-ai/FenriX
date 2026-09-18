import { useMemo } from 'react';
import type { GameResult, TeamDoc } from '../../types/models';
import { matchRows } from '../../lib/matchRows';
import { FranchiseMark } from '../franchise/FranchiseMark';
import styles from '../../pages/SimulatePage.module.css';

const BOX_COLUMNS = [
  'round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
  'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
  'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'playstyle',
] as const;

type MatchBoxscoreProps = {
  boxCsv: string;
  game: GameResult;
  teams: ReadonlyMap<string, TeamDoc>;
};

export function MatchBoxscore({ boxCsv, game, teams }: MatchBoxscoreProps) {
  const rows = useMemo(() => matchRows(boxCsv, game.game_id), [boxCsv, game.game_id]);
  const home = teams.get(game.home);
  const away = teams.get(game.away);
  const homeName = home?.name ?? 'League opponent';
  const awayName = away?.name ?? 'League opponent';
  const namesMatch = homeName === awayName;

  return (
    <section className={styles.boxscore} data-testid="match-boxscore" id={`boxscore-${game.game_id}`}>
      <div className={styles.boxscoreHeading}>
        <div className={styles.boxscoreTeam}>
          <FranchiseMark teamId={game.home} name={homeName} identity={home?.identity} size={44} />
          <span>{homeName}</span>
        </div>
        <div className={styles.boxscoreFinal}>
          <span>Final</span>
          <strong>{game.homeScore}–{game.awayScore}</strong>
        </div>
        <div className={`${styles.boxscoreTeam} ${styles.awayTeam}`}>
          <FranchiseMark teamId={game.away} name={awayName} identity={away?.identity} size={44} />
          <span>{awayName}</span>
        </div>
      </div>
      {namesMatch ? (
        <p className={styles.ambiguityNote} role="note">
          These franchise names match. The full matchup is shown without assigning rows by name.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className={styles.noRows}>No boxscore rows were included for this matchup.</p>
      ) : (
        <div className={styles.tableViewport} tabIndex={0} aria-label="Complete matchup boxscore">
          <table className="table">
            <caption className={styles.tableCaption}>
              {homeName} vs {awayName} · all 23 server columns
            </caption>
            <thead>
              <tr>{BOX_COLUMNS.map((column) => (
                <th className={column === 'player_name' ? 'name' : ''} key={column} scope="col">
                  {column}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.game_id}-${row.team}-${row.player_id}-${index}`}>
                  {BOX_COLUMNS.map((column) => (
                    <td className={column === 'player_name' ? 'name' : ''} key={column}>
                      {String(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
