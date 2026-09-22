import { Link, useLocation } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useRoundPresentation } from '../../contexts/RoundPresentationContext';
import { FranchiseMark } from '../franchise/FranchiseMark';
import { LedTimer } from './LedTimer';
import styles from '../shell/StudentShell.module.css';

export function PhaseHeader({ title, round, timerEndsAt, timerPausedMs }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
  timerPausedMs?: number | null;
}) {
  const { pathname } = useLocation();
  const { membership, team } = useGame();
  const { rows } = useRoundPresentation();
  const record = membership
    ? rows.find((row) => row.teamId === membership.teamId)
    : null;
  return (
    <header className={styles.header}>
      <div className={styles.franchise}>
        {team && membership ? (
          <FranchiseMark teamId={membership.teamId} name={team.name}
            identity={team.identity} size={46} />
        ) : null}
        <div className={styles.franchiseCopy}>
          <div className={`brand ${styles.brand}`}>Salary Showdown</div>
          <div className={styles.franchiseName} title={team?.name}>{team?.name ?? 'League desk'}</div>
          <div className={styles.role}>{membership?.role ?? 'Observer'}</div>
        </div>
      </div>
      <div className={styles.phase}>
        <h1>{title}{round > 0 ? ` · Round ${round}` : ''}</h1>
        {round === 0 ? <span>Preseason</span> : null}
        <span aria-label="safe team record" data-testid="team-record">
          Record {record ? `${record.wins}–${record.losses}` : '—'}
        </span>
      </div>
      <div className={styles.actions}>
        {pathname !== '/standings' && <Link to="/standings" className="chip">Standings</Link>}
        <LedTimer endsAt={timerEndsAt} pausedMs={timerPausedMs ?? null} />
      </div>
    </header>
  );
}
