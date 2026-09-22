import styles from '../../pages/ResultsPage.module.css';

export type ResultsHeroProps = {
  wins: number;
  losses: number;
  rank: number;
  previousRank: number | null;
};

function movementLabel(rank: number, previousRank: number | null): string {
  if (previousRank === null) return 'First round standing';
  const change = previousRank - rank;
  if (change === 0) return 'Held position';
  const places = Math.abs(change);
  return `${change > 0 ? 'Up' : 'Down'} ${places} ${places === 1 ? 'place' : 'places'}`;
}

export function ResultsHero({ wins, losses, rank, previousRank }: ResultsHeroProps) {
  return (
    <section className={styles.hero} aria-label="Round result">
      <div className={styles.recordBlock}>
        <span className={styles.heroValue}>{wins}–{losses}</span>
        <span className={styles.heroLabel}>Round record</span>
      </div>
      <div className={styles.rankBlock}>
        <span className={styles.rank}>League rank {rank}</span>
        <span className={styles.movement}>{movementLabel(rank, previousRank)}</span>
      </div>
    </section>
  );
}
