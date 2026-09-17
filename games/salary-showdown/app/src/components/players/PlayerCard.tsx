import type { ReactElement, ReactNode } from 'react';
import { HypeStars } from '../ui/HypeStars';
import { PositionBadge } from '../ui/PositionBadge';
import { fmtM } from '../../lib/money';
import type { TeamIdentity } from '../../lib/franchiseIdentity';
import type { CatalogPlayer } from '../../types/models';
import styles from './PlayerCard.module.css';

export type PlayerCardProps = {
  player: CatalogPlayer;
  identity?: TeamIdentity;
  selected?: boolean;
  children?: ReactNode;
};

const shown = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text === '' ? '—' : text;
};

const salary = (value: unknown): string => {
  const text = shown(value);
  if (text === '—') return text;
  const amount = Number(text);
  return Number.isFinite(amount) ? `${fmtM(amount)}/rd` : '—';
};

const STATS: { key: keyof CatalogPlayer; label: string }[] = [
  { key: 'pts_per_game', label: 'PPG' },
  { key: 'fg_attempts_per_game', label: 'FGA' },
  { key: 'fg_pct', label: 'FG%' },
  { key: 'three_pt_pct', label: '3P%' },
  { key: 'rebounds_per_game', label: 'REB' },
  { key: 'assists_per_game', label: 'AST' },
  { key: 'steals_per_game', label: 'STL' },
  { key: 'blocks_per_game', label: 'BLK' },
  { key: 'turnovers_per_game', label: 'TOV' },
];

export function PlayerCard({
  player,
  identity,
  selected = false,
  children,
}: PlayerCardProps): ReactElement {
  const hypeText = shown(player.hype);
  const hype = hypeText === '—' ? null : Number(hypeText);

  return (
    <article
      aria-label={`${shown(player.name)} player card`}
      className={styles.card}
      data-accent={identity?.accent ?? 'gold'}
      data-selected={selected || undefined}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <PositionBadge pos={player.position} />
          <div>
            <h3 className={styles.name}>{shown(player.name)}</h3>
            <p className={styles.meta}>Age {shown(player.age)} · {shown(player.scout_grade)}</p>
          </div>
        </div>
        <div className={styles.market}>
          <span className={styles.salary}>{salary(player.salary_per_round)}</span>
          {hype !== null && Number.isFinite(hype) ? <HypeStars hype={hype} /> : <span>—</span>}
        </div>
      </header>

      <dl className={styles.stats}>
        {STATS.map(({ key, label }) => (
          <div className={styles.stat} key={key}>
            <dt>{label}</dt>
            <dd>{shown(player[key])}</dd>
          </div>
        ))}
      </dl>

      {children !== undefined && children !== null ? (
        <footer className={styles.actions}>{children}</footer>
      ) : null}
    </article>
  );
}
