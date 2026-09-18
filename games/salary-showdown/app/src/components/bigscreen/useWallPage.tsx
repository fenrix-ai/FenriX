import { useEffect, useState } from 'react';

export const WALL_PAGE_MS = 6000;

export function useWallPage(
  itemCount: number,
  pageSize: number,
  scope: string,
  enabled = true,
) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const [state, setState] = useState({ scope, page: 0 });
  const page = state.scope === scope ? Math.min(state.page, pageCount - 1) : 0;

  useEffect(() => {
    setState({ scope, page: 0 });
    if (!enabled || pageCount <= 1) return undefined;
    const id = window.setInterval(() => {
      setState((current) => ({
        scope,
        page: current.scope === scope ? (current.page + 1) % pageCount : 0,
      }));
    }, WALL_PAGE_MS);
    return () => window.clearInterval(id);
  }, [enabled, pageCount, scope]);

  return {
    page,
    pageCount,
    start: page * pageSize,
    end: Math.min(itemCount, (page + 1) * pageSize),
  };
}

export function WallPageStatus({
  page,
  pageCount,
  start,
  end,
  noun,
  testId,
}: {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  noun: string;
  testId?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <p className="bs-page-status mono" data-testid={testId} aria-live="polite">
      Page {page + 1} of {pageCount} · {noun} {start + 1}–{end}
    </p>
  );
}
