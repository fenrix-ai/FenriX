import { scatterGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 1 — Hype vs TrueImpact. THE FINALE IS THE SANCTIONED REVEAL
// (parent spec section 11.14): trap/bargain labels are exactly what this chart
// exists to show. Hand-rolled SVG, theme colors, no chart library.
const F: Frame = { w: 720, h: 440, padL: 48, padR: 14, padT: 14, padB: 44 };
const DOT: Record<'trap' | 'bargain' | 'normal', { fill: string; r: number }> = {
  trap: { fill: 'var(--neg)', r: 5.5 },
  bargain: { fill: 'var(--ok)', r: 5.5 },
  normal: { fill: 'var(--muted)', r: 3.5 },
};

export type ScatterTIProps = {
  rows: RevealDoc['scatter'];
  selectedPid?: number | null;
  onSelectPid?: (pid: number) => void;
  highlightPids?: ReadonlySet<number>;
  visiblePids?: ReadonlySet<number>;
};

export function ScatterTI({ rows, selectedPid = null, onSelectPid,
  highlightPids, visiblePids }: ScatterTIProps) {
  const g = scatterGeometry(rows, F);
  const interactive = Boolean(onSelectPid);
  const x0 = F.padL, x1 = F.w - F.padR, y0 = F.padT, y1 = F.h - F.padB;
  const points = visiblePids ? g.points.filter((point) => visiblePids.has(point.pid)) : g.points;
  return (
    <svg data-testid="chart-scatter-ti" viewBox={`0 0 ${F.w} ${F.h}`}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive
        ? 'Interactive Hype versus TrueImpact player chart'
        : 'Hype versus TrueImpact, traps and bargains labeled'}
      data-total-points={g.points.length} data-visible-points={points.length}
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <desc>
        Hype is shown on the horizontal axis and TrueImpact on the vertical axis.
        Trap, bargain, selected, and highlighted states use labels and outlines in addition to color.
      </desc>
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--border)" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="var(--border)" />
      {g.xTicks.map((t) => (
        <g key={`x${t.label}`}>
          <line x1={t.pos} y1={y1} x2={t.pos} y2={y1 + 4} stroke="var(--border)" />
          <text x={t.pos} y={y1 + 18} textAnchor="middle" fontSize={12} fill="var(--dim)">
            {t.label}</text>
        </g>
      ))}
      {g.yTicks.map((t) => (
        <g key={`y${t.label}`}>
          <line x1={x0 - 4} y1={t.pos} x2={x0} y2={t.pos} stroke="var(--border)" />
          <text x={x0 - 8} y={t.pos + 4} textAnchor="end" fontSize={12} fill="var(--dim)">
            {t.label}</text>
        </g>
      ))}
      <text x={(x0 + x1) / 2} y={F.h - 6} textAnchor="middle" fontSize={13}
        fill="var(--muted)">Hype</text>
      <text x={14} y={(y0 + y1) / 2} textAnchor="middle" fontSize={13} fill="var(--muted)"
        transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>TrueImpact</text>
      {points.map((p) => {
        const selected = p.pid === selectedPid;
        const highlighted = highlightPids?.has(p.pid) ?? false;
        const label = `${p.name}. Hype ${p.hype}. TrueImpact ${p.ti}. ${
          p.salary === null ? 'No list salary.' : `$${p.salary.toFixed(1)}M list salary.`} ${
          p.cls === 'trap' ? 'Known trap.' : p.cls === 'bargain' ? 'Known bargain.' : 'Other player.'}`;
        return (
        <circle key={p.pid} cx={p.x} cy={p.y} r={DOT[p.cls].r + (selected ? 2 : 0)}
          fill={DOT[p.cls].fill} opacity={p.cls === 'normal' ? 0.62 : 0.94}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={interactive ? label : undefined}
          aria-pressed={interactive ? selected : undefined}
          data-highlighted={highlighted ? 'true' : 'false'}
          stroke={selected ? 'var(--gold)' : highlighted ? 'var(--ss-accent-sky)' : 'none'}
          strokeWidth={selected || highlighted ? 3 : 0}
          onClick={onSelectPid ? () => onSelectPid(p.pid) : undefined}
          onKeyDown={onSelectPid ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectPid(p.pid);
            }
          } : undefined}>
          <title>{`${p.name} — hype ${p.hype}, TI ${p.ti}${
            p.salary === null ? '' : `, $${p.salary.toFixed(1)}M`}`}</title>
        </circle>
      );})}
      <g fontSize={12}>
        <circle cx={x0 + 12} cy={y0 + 10} r={5.5} fill="var(--neg)" />
        <text x={x0 + 24} y={y0 + 14} fill="var(--text)">Trap (volume trap, aging legend)</text>
        <circle cx={x0 + 12} cy={y0 + 30} r={5.5} fill="var(--ok)" />
        <text x={x0 + 24} y={y0 + 34} fill="var(--text)">
          Bargain (bottom-half salary, top-quartile TrueImpact)</text>
        <circle cx={x0 + 12} cy={y0 + 50} r={3.5} fill="var(--muted)" />
        <text x={x0 + 24} y={y0 + 54} fill="var(--text)">Everyone else</text>
      </g>
    </svg>
  );
}
