import { useEffect, useState } from 'react';

export function fmtClock(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Professor timers (Plan 3): the game doc carries live timer state.
// States — running: endsAt set, pausedMs null · paused: pausedMs set, endsAt
// null · off: both null (the advancePhase flip nulls both). Timers are advisory
// pacing (spec §13): expiry never blocks a submission server-side, so this
// component only ever displays — it enforces nothing.
export function LedTimer({ endsAt, pausedMs }: {
  endsAt: { toMillis(): number } | null;
  pausedMs?: number | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (pausedMs != null) {
    return (
      <span data-testid="led-wrap">
        <span className="led" data-testid="led">
          {fmtClock(Math.max(0, Math.floor(pausedMs / 1000)))}
        </span>
        <span className="dim" style={{ marginLeft: 6, fontSize: 12 }}>paused</span>
      </span>
    );
  }
  if (!endsAt) return <span className="led" data-testid="led">--:--</span>;
  const left = Math.max(0, Math.floor((endsAt.toMillis() - now) / 1000));
  return <span className="led" data-testid="led">{fmtClock(left)}</span>;
}
