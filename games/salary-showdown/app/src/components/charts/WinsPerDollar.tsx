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
    w: 860, h: 38 + rows.length * 40 + 12, padL: 12, padR: 24, padT: 38, padB: 8,
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
          <text x={f.padL} y={b.y + b.h / 2 - ((b.nameLines.length - 1) * 6) + 4}
            fontSize={12} fontWeight={700} fill="var(--text)">
            {b.nameLines.slice(0, 2).map((line, index) => (
              <tspan key={line} x={f.padL} dy={index === 0 ? 0 : 13}>{line}</tspan>
            ))}
          </text>
          {b.ratio != null && (
            <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
              fill="var(--gold)" opacity={0.85} />
          )}
          <text x={b.detailX} y={b.y + b.h / 2 + 4} fontSize={11}
            textAnchor="end" fill="var(--muted)" fontFamily="var(--mono)">
            {b.ratioLabel} · {b.detail}</text>
        </g>
      ))}
    </svg>
  );
}
