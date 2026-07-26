import { winsPerDollarGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 3 — wins per $M of committed payroll, best first. Sanctioned
// here (THE FINALE IS THE SANCTIONED REVEAL); the server computed totalSpend
// over spendLog, so cut contracts still count — committed money is never
// recovered. Height grows with the team count (2..21 franchises).
export function WinsPerDollar({ rows, teamNames }: {
  rows: RevealDoc['winsPerDollar']; teamNames: Map<string, string>;
}) {
  const f: Frame = {
    w: 720, h: 30 + rows.length * 36 + 12, padL: 12, padR: 88, padT: 30, padB: 8,
  };
  const bars = winsPerDollarGeometry(rows, teamNames, f);
  return (
    <svg data-testid="chart-wins-per-dollar" viewBox={`0 0 ${f.w} ${f.h}`} role="img"
      aria-label="Wins per payroll dollar by team, best first"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <text x={f.padL} y={18} fontSize={11} fill="var(--dim)">
        Wins per $M of committed payroll — cut contracts still count</text>
      {bars.map((b) => (
        <g key={b.teamId}>
          <text x={f.padL} y={b.y + b.h / 2 + 4} fontSize={13} fontWeight={700}
            fill="var(--text)">{b.name}</text>
          <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
            fill="var(--gold)" opacity={0.85} />
          <text x={b.x + Math.max(b.w, 0.5) + 6} y={b.y + b.h / 2 + 4} fontSize={11}
            fill="var(--muted)" fontFamily="var(--mono)">
            {b.ratioLabel} · {b.detail}</text>
        </g>
      ))}
    </svg>
  );
}
