import { Link, useLocation } from 'react-router-dom';
import { LedTimer } from './LedTimer';

export function PhaseHeader({ title, round, timerEndsAt, timerPausedMs }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
  timerPausedMs?: number | null;
}) {
  const { pathname } = useLocation();
  return (
    <div className="phase-head">
      <div>
        <div className="brand">Salary Showdown</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>{title}{round > 0 ? ` · Round ${round}` : ''}</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {pathname !== '/standings' && <Link to="/standings" className="chip">Standings</Link>}
        <LedTimer endsAt={timerEndsAt} pausedMs={timerPausedMs ?? null} />
      </div>
    </div>
  );
}
