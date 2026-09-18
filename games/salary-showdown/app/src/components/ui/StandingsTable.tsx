import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { StandingsRow } from '../../types/models';

// Viewer-aware highlight (spec §11.12): team surfaces pass the viewer's franchise;
// the projector (Plan 3) passes none. wpd = wins-per-payroll-dollar — one of the
// two sanctioned derived metrics; informational only, it never affects rank order.
// A null (or absent) ratio means zero spend: the ratio is undefined, and renders
// "—" exactly like the finale's chart (F8) — never a fabricated 0.000.
export function StandingsTable({
  rows,
  highlightTeamId,
  wpd,
  round,
  showMovement = false,
  animateRows = true,
}: {
  rows: StandingsRow[]; highlightTeamId: string | null;
  wpd: Map<string, number | null> | null;
  round?: number;
  showMovement?: boolean;
  animateRows?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const previousTops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();
    for (const row of rows) {
      const element = rowRefs.current.get(row.teamId);
      if (!element) continue;
      const top = element.getBoundingClientRect().top;
      nextTops.set(row.teamId, top);
      const previousTop = previousTops.current.get(row.teamId);
      const distance = previousTop === undefined ? 0 : previousTop - top;
      if (animateRows && !reducedMotion && distance !== 0) {
        element.animate?.([
          { transform: `translateY(${distance}px)` },
          { transform: 'translateY(0)' },
        ], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    previousTops.current = nextTops;
  }, [animateRows, reducedMotion, rows]);

  const movement = (row: StandingsRow) => {
    if (row.previousRank === null) return '—';
    const change = row.previousRank - row.rank;
    if (change === 0) return 'Held';
    return `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}`;
  };

  return (
    <table className="table" data-testid="standings" data-round={round}>
      <thead><tr>
        <th>#</th><th className="name">Team</th><th>W-L</th><th>Diff</th>
        {showMovement && <th>Movement</th>}
        {wpd && <th>W / $M</th>}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.teamId} className={r.teamId === highlightTeamId ? 'sel' : ''}
            ref={(element) => {
              if (element) rowRefs.current.set(r.teamId, element);
              else rowRefs.current.delete(r.teamId);
            }}>
            <td>{r.rank}</td>
            <td className="name" style={{ fontFamily: 'inherit', fontWeight: 700 }}>{r.name}</td>
            <td>{r.wins}-{r.losses}</td>
            <td>{r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</td>
            {showMovement && <td>{movement(r)}</td>}
            {wpd && <td>{wpd.get(r.teamId)?.toFixed(3) ?? '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
