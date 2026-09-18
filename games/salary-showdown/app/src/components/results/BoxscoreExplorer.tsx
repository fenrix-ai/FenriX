import { useMemo, useState } from 'react';
import type { BoxRow } from '../../lib/boxfeed';
import styles from '../../pages/ResultsPage.module.css';

export const BOX_COLUMNS = [
  'round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
  'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
  'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'playstyle',
] as const satisfies readonly (keyof BoxRow)[];

type DetailMode = 'games' | 'players';

export type BoxscoreExplorerProps = {
  rows: BoxRow[];
  round: number;
  csv: string;
  ambiguityNote?: string | null;
};

export function BoxscoreExplorer({ rows, round, csv, ambiguityNote }: BoxscoreExplorerProps) {
  const [mode, setMode] = useState<DetailMode>('games');
  const [gameId, setGameId] = useState('all');
  const [playerId, setPlayerId] = useState('all');

  const games = useMemo(() => [...new Set(rows.map((row) => row.game_id))], [rows]);
  const players = useMemo(() => {
    const found = new Map<number, string>();
    rows.forEach((row) => found.set(row.player_id, row.player_name));
    return [...found].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const filtered = useMemo(() => rows.filter((row) => (
    mode === 'games'
      ? gameId === 'all' || row.game_id === gameId
      : playerId === 'all' || row.player_id === Number(playerId)
  )), [gameId, mode, playerId, rows]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = Object.assign(document.createElement('a'), {
      href: url,
      download: `boxscores_round_${round}.csv`,
    });
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.explorer} aria-labelledby="boxscore-title" data-testid="box-lines">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="boxscore-title">Round data</h2>
          <p>Raw player lines from your completed matchups.</p>
        </div>
        <button className="btn gold" type="button" onClick={download}>
          Download boxscores_round_{round}.csv
        </button>
      </div>

      <div className={styles.detailToolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Boxscore detail">
          <button type="button" role="tab" aria-selected={mode === 'games'}
            className={mode === 'games' ? styles.activeTab : styles.tab}
            onClick={() => setMode('games')}>
            Games
          </button>
          <button type="button" role="tab" aria-selected={mode === 'players'}
            className={mode === 'players' ? styles.activeTab : styles.tab}
            onClick={() => setMode('players')}>
            Players
          </button>
        </div>

        {mode === 'games' ? (
          <label className={styles.filterLabel}>
            Filter by game
            <select value={gameId} onChange={(event) => setGameId(event.target.value)}>
              <option value="all">All matchups</option>
              {games.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        ) : (
          <label className={styles.filterLabel}>
            Filter by player
            <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
              <option value="all">All players</option>
              {players.map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}
            </select>
          </label>
        )}
        <span className={styles.rowCount} aria-live="polite">{filtered.length} lines</span>
      </div>

      {ambiguityNote ? <p className={styles.ambiguity}>{ambiguityNote}</p> : null}
      <div className={styles.tableScroll} data-testid="box-scroll" tabIndex={0}
        role="region" aria-label="Raw boxscore table, horizontally scrollable">
        <table className="table">
          <caption className={styles.visuallyHidden}>All 23 raw boxscore columns</caption>
          <thead>
            <tr>{BOX_COLUMNS.map((column) => (
              <th key={column} className={column === 'player_name' ? 'name' : ''}>{column}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={`${row.game_id}-${row.team}-${row.player_id}-${index}`}>
                {BOX_COLUMNS.map((column) => (
                  <td key={column} className={column === 'player_name' ? 'name' : ''}>
                    {String(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
