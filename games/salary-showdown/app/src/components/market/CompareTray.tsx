import { useRef } from 'react';
import type { CatalogPlayer } from '../../types/models';
import { HypeStars } from '../ui/HypeStars';
import styles from '../../pages/FreeAgencyPage.module.css';

const fields: [keyof CatalogPlayer, string][] = [
  ['position', 'Position'], ['age', 'Age'], ['years_pro', 'Years pro'],
  ['salary_per_round', 'Base $M / round'], ['auction_round', 'Auction round'],
  ['hype', 'Hype'], ['scout_grade', 'Scout grade'], ['personality', 'Personality'],
  ['social_media_followers', 'Followers'], ['games_played', 'Games played'],
  ['mins_per_game', 'MPG'], ['pts_per_game', 'PPG'], ['fg_attempts_per_game', 'FGA'],
  ['fg_pct', 'FG%'], ['three_pt_pct', '3P%'], ['ft_pct', 'FT%'],
  ['rebounds_per_game', 'REB'], ['assists_per_game', 'AST'], ['steals_per_game', 'STL'],
  ['blocks_per_game', 'BLK'], ['turnovers_per_game', 'TOV'],
  ['prev_pts_per_game', 'Previous PPG'], ['prev_fg_pct', 'Previous FG%'],
  ['prev_mins_per_game', 'Previous MPG'],
];

export function CompareTray({ players, onRemove }: {
  players: CatalogPlayer[]; onRemove: (pid: number) => void;
}) {
  const shown = players.slice(0, 3);
  const heading = useRef<HTMLHeadingElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  function remove(pid: number, index: number) {
    // Focus a surviving control before the removed button leaves the DOM.
    const next = shown[index + 1] ?? shown[index - 1];
    if (next) buttons.current.get(next.pid)?.focus();
    else heading.current?.focus();
    onRemove(pid);
  }
  return <section className={styles.compare} aria-label="Player comparison">
    <h2 ref={heading} tabIndex={-1}>Player comparison <span>{shown.length}/3</span></h2>
    {shown.length === 0 ? <p>Choose Compare beside a player to view up to three raw stat columns.</p>
      : <div className={styles.compareScroll} role="region" aria-label="Comparison statistics" tabIndex={0}>
        <table className={styles.compareTable}>
          <thead><tr><th scope="col">Catalog data</th>{shown.map((p, i) => <th scope="col" key={p.pid}>
            {p.name}<button className="chip" ref={(el) => {
              if (el) buttons.current.set(p.pid, el); else buttons.current.delete(p.pid);
            }} aria-label={`Remove ${p.name} from comparison`} onClick={() => remove(p.pid, i)}>Remove</button>
          </th>)}</tr></thead>
          <tbody>{fields.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>
            {shown.map((p) => <td key={p.pid}>{p[key] == null || String(p[key]).trim() === '' ? '—'
              : key === 'hype' ? <HypeStars hype={Number(p.hype)} /> : p[key]}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
