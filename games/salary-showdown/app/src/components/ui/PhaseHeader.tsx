import { LedTimer } from './LedTimer';

export function PhaseHeader({ title, round, timerEndsAt }: {
  title: string; round: number; timerEndsAt: { toMillis(): number } | null;
}) {
  return (
    <div className="phase-head">
      <div>
        <div className="brand">Salary Showdown</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>{title} · Round {round}</h1>
      </div>
      <LedTimer endsAt={timerEndsAt} />
    </div>
  );
}
