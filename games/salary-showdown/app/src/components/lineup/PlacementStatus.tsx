import type { ReactElement } from 'react';
import styles from './LineupControls.module.css';

export function PlacementStatus({ message, summary }: {
  message: string;
  summary: string;
}): ReactElement {
  return (
    <div className={styles.statusPanel}>
      <p className={styles.placementStatus} role="status" aria-label="Placement status">
        {message}
      </p>
      <p className={styles.lineupStatus} role="status">{summary}</p>
    </div>
  );
}
