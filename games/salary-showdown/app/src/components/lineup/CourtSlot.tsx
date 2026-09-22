import type { ReactElement, ReactNode } from 'react';
import styles from './LineupControls.module.css';

export type CourtSlotProps = {
  label: string;
  pid: number | null;
  eligible: boolean;
  onPlace: () => void;
  children?: ReactNode;
};

export function CourtSlot({
  label,
  pid,
  eligible,
  onPlace,
  children,
}: CourtSlotProps): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!eligible}
      className={styles.slot}
      data-eligible={eligible}
      data-filled={pid !== null}
      data-slot-label={label}
      onClick={onPlace}
    >
      {children ?? <span className={styles.empty}>Choose a player</span>}
    </button>
  );
}
