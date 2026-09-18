import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { PayrollTimeline } from '../contracts/PayrollTimeline';
import { ErrorNotice } from '../ui/ErrorNotice';
import { isActive } from '../../lib/contracts';
import { previewCut } from '../../lib/cutPreview';
import { fmtM } from '../../lib/money';
import type { CatalogPlayer, Contract, TeamDoc } from '../../types/models';
import styles from './CutPreview.module.css';

export type CutPreviewProps = {
  team: TeamDoc;
  contract: Contract;
  player: CatalogPlayer;
  round: number;
  busy: boolean;
  canAct: boolean;
  error?: unknown | null;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: HTMLElement | null;
};

export function CutPreview({
  team,
  contract,
  player,
  round,
  busy,
  canAct,
  error = null,
  onConfirm,
  onCancel,
  returnFocus = null,
  fallbackFocus = null,
}: CutPreviewProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(returnFocus);
  const fallbackFocusRef = useRef(fallbackFocus);
  const cutAlreadyApplied = !team.roster.some((candidate) => (
    candidate.pid === contract.pid && isActive(candidate, round)
  ));
  const projected = cutAlreadyApplied ? team : previewCut(team, contract.pid, round);
  const endRound = contract.startRound + contract.years - 1;
  const obligations = Array.from(
    { length: endRound - round + 1 },
    (_, index) => round + index,
  );

  useEffect(() => {
    const initialFocus = !busy ? keepRef.current : dialogRef.current;
    initialFocus?.focus();

    return () => {
      const previousTrigger = returnFocusRef.current;
      if (previousTrigger?.isConnected) {
        previousTrigger.focus();
      } else if (fallbackFocusRef.current?.isConnected) {
        fallbackFocusRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (busy) {
      dialogRef.current?.focus();
    } else if (document.activeElement === dialogRef.current) {
      keepRef.current?.focus();
    }
  }, [busy]);

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [confirmRef.current, keepRef.current]
      .filter((element): element is HTMLButtonElement => Boolean(element && !element.disabled));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (
      active === first
      || active === dialogRef.current
      || !dialogRef.current?.contains(active)
    )) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (
      active === last
      || active === dialogRef.current
      || !dialogRef.current?.contains(active)
    )) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.backdrop}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={keepFocusInside}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Cut preview</p>
            <h2 id={titleId}>Cut {player.name}?</h2>
          </div>
          <span className={styles.position}>{player.position}</span>
        </header>

        <p className={styles.effect}>
          One roster spot opens. No committed salary is removed.
        </p>

        <ul aria-label="Remaining obligations" className={styles.obligations}>
          {obligations.map((obligationRound) => (
            <li key={obligationRound}>
              <span>Round {obligationRound}</span>
              <strong>{fmtM(contract.rate)} dead money</strong>
            </li>
          ))}
        </ul>

        <PayrollTimeline round={round} team={projected} />

        <ErrorNotice error={error} />

        <footer className={styles.actions}>
          <button
            className="btn cut"
            disabled={busy || !canAct}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            Confirm cut
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={onCancel}
            ref={keepRef}
            type="button"
          >
            Keep player
          </button>
        </footer>
      </section>
    </div>
  );
}
