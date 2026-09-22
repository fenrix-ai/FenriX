import { useEffect, useState } from 'react';
import { presentationProgress } from '../../lib/presentationProgress';

type StoredProgress = {
  scope: string;
  startedAt: number;
  highWater: number;
};

function storageKey(scope: string) {
  return `ss.bigscreen-presentation.${scope}`;
}

function load(scope: string, total: number): StoredProgress {
  const now = Date.now();
  const fresh = (): StoredProgress => ({ scope, startedAt: now, highWater: 0 });
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? 'null') as (
      Partial<StoredProgress> | null
    );
    if (!parsed || parsed.scope !== scope) return fresh();
    return {
      scope,
      startedAt: typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt)
        ? Math.max(0, Math.min(now, parsed.startedAt))
        : now,
      highWater: typeof parsed.highWater === 'number' && Number.isFinite(parsed.highWater)
        ? Math.max(0, Math.min(total, Math.floor(parsed.highWater)))
        : 0,
    };
  } catch {
    return fresh();
  }
}

export function useBroadcastProgress(scope: string, total: number, reduced: boolean): number {
  const [progress, setProgress] = useState<StoredProgress>(() => load(scope, total));
  const [clock, setClock] = useState(Date.now);
  const current = progress.scope === scope ? progress : load(scope, total);
  const elapsed = presentationProgress(clock - current.startedAt, total, reduced);
  const shown = Math.max(current.highWater, elapsed);

  useEffect(() => {
    setProgress((value) => value.scope === scope ? value : load(scope, total));
    setClock(Date.now());
  }, [scope, total]);

  useEffect(() => {
    const update = () => setClock(Date.now());
    const id = window.setInterval(update, 250);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scope]);

  useEffect(() => {
    if (progress.scope !== scope || shown <= progress.highWater) return;
    const next = { ...progress, highWater: shown };
    setProgress(next);
    try {
      sessionStorage.setItem(storageKey(scope), JSON.stringify(next));
    } catch {
      // Projector pacing remains correct in memory when storage is unavailable.
    }
  }, [progress, scope, shown]);

  return Math.min(total, shown);
}
