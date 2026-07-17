import { useEffect, useState } from 'react';

// timerEndsAt is ALWAYS null in Plan 2 (professor timers land in Plan 3).
// The null state is the product, not a fallback — render a steady "--:--".
export function LedTimer({ endsAt }: { endsAt: { toMillis(): number } | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return <span className="led" data-testid="led">--:--</span>;
  const left = Math.max(0, Math.floor((endsAt.toMillis() - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return <span className="led" data-testid="led">{mm}:{ss}</span>;
}
