import { useId } from 'react';
import type { ReactElement } from 'react';
import { PayrollTimeline } from '../contracts/PayrollTimeline';
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
  onConfirm: () => void;
  onCancel: () => void;
};

export function CutPreview({
  team,
  contract,
  player,
  round,
  busy,
  canAct,
  onConfirm,
  onCancel,
}: CutPreviewProps): ReactElement {
  const titleId = useId();
  const cutAlreadyApplied = !team.roster.some((candidate) => (
    candidate.pid === contract.pid && isActive(candidate, round)
  ));
  const projected = cutAlreadyApplied ? team : previewCut(team, contract.pid, round);
  const endRound = contract.startRound + contract.years - 1;
  const obligations = Array.from(
    { length: endRound - round + 1 },
    (_, index) => round + index,
  );

  return (
    <div className={styles.backdrop}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
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

        <footer className={styles.actions}>
          <button
            className="btn cut"
            disabled={busy || !canAct}
            onClick={onConfirm}
            type="button"
          >
            Confirm cut
          </button>
          <button className="btn" disabled={busy} onClick={onCancel} type="button">
            Keep player
          </button>
        </footer>
      </section>
    </div>
  );
}
