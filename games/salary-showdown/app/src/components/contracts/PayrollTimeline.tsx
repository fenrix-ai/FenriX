import { useId } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { payrollProjection } from '../../lib/payrollProjection';
import { CAP, fmtM } from '../../lib/money';
import type { Contract, TeamDoc } from '../../types/models';
import styles from './PayrollTimeline.module.css';

export type PayrollTimelineProps = {
  team: TeamDoc;
  round: number;
  preview?: Contract;
};

export function PayrollTimeline({ team, round, preview }: PayrollTimelineProps): ReactElement {
  const titleId = useId();
  const points = payrollProjection(team, preview);
  const scale = Math.max(CAP, ...points.map((point) => point.total));
  const capPosition = `${(CAP / scale) * 100}%`;

  return (
    <section className={styles.timeline} aria-labelledby={titleId}>
      <header className={styles.heading}>
        <div>
          <h2 id={titleId}>Five-round payroll</h2>
          <p>Committed salary and dead money by round.</p>
        </div>
        <span className={styles.cap}>Cap {fmtM(CAP)}</span>
      </header>

      <ul className={styles.legend} aria-label="Payroll categories">
        <li><span className={styles.cashKey} />Cash</li>
        <li><span className={styles.deadKey} />Dead money</li>
        <li><span className={styles.previewKey} />Candidate</li>
      </ul>

      <ol className={styles.rounds}>
        {points.map((point) => {
          const overCap = point.total > CAP + 1e-9;
          const heights = {
            '--cash-height': `${(point.cash / scale) * 100}%`,
            '--dead-height': `${(point.dead / scale) * 100}%`,
            '--preview-height': `${(point.preview / scale) * 100}%`,
            '--cap-position': capPosition,
          } as CSSProperties;

          return (
            <li
              aria-label={`Round ${point.round}: cash ${fmtM(point.cash)}, dead money ${fmtM(point.dead)}, candidate ${fmtM(point.preview)}, total ${fmtM(point.total)}${overCap ? ', over cap' : ''}`}
              className={`${styles.round}${point.round === round ? ` ${styles.current}` : ''}${overCap ? ` ${styles.over}` : ''}`}
              key={point.round}
              style={heights}
            >
              <header>
                <span>Round {point.round}</span>
                {point.round === round ? <small>Current</small> : null}
              </header>
              <strong>{fmtM(point.total)}</strong>
              <div className={styles.chart} aria-hidden="true">
                <span className={styles.capLine} />
                <div className={styles.stack}>
                  <span className={styles.cashBar} />
                  <span className={styles.deadBar} />
                  <span className={styles.previewBar} />
                </div>
              </div>
              <dl className={styles.values}>
                <div><dt>Cash</dt><dd>{fmtM(point.cash)}</dd></div>
                <div><dt>Dead</dt><dd>{fmtM(point.dead)}</dd></div>
                <div><dt>Candidate</dt><dd>{fmtM(point.preview)}</dd></div>
              </dl>
              {overCap ? <span className={styles.warning}>Over cap</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
