import { weightsGeometry, type Frame } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 2 — what the engine paid for vs what the class regression found.
// HARD RULE (contracts): the two sides have DIFFERENT units — engine weights
// are TrueImpact points; the regression side is R²/coefficient/t-statistics
// from league_history.csv. Two independently normalized groups, each with its
// own zero line and unit label. NEVER a single shared axis.
const F: Frame = { w: 720, h: 400, padL: 12, padR: 12, padT: 56, padB: 34 };

export function WeightsCompare({ trueWeights }: { trueWeights: RevealDoc['trueWeights'] }) {
  const g = weightsGeometry(trueWeights, F);
  return (
    <svg data-testid="chart-weights-compare" viewBox={`0 0 ${F.w} ${F.h}`} role="img"
      aria-label="Engine weights next to the class regression, separate axes"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[g.engine, g.regression].map((grp) => (
        <g key={grp.title}>
          <text x={grp.boxX} y={22} fontSize={15} fontWeight={700} fill="var(--gold)">
            {grp.title}</text>
          <text x={grp.boxX} y={40} fontSize={11} fill="var(--dim)">{grp.unitLabel}</text>
          <line x1={grp.zeroX} y1={F.padT} x2={grp.zeroX} y2={F.h - F.padB}
            stroke="var(--border)" />
          {grp.bars.map((b) => (
            <g key={b.key}>
              <text x={grp.boxX} y={b.y + b.h / 2 + 4} fontSize={12} fill="var(--text)">
                {b.label}</text>
              <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
                fill={b.neg ? 'var(--neg)' : 'var(--ok)'} opacity={0.85} />
              <text x={b.neg ? b.x - 4 : b.x + b.w + 4} y={b.y + b.h / 2 + 4} fontSize={11}
                textAnchor={b.neg ? 'end' : 'start'} fill="var(--muted)"
                fontFamily="var(--mono)">
                {b.valueLabel}{b.note ? ` (${b.note})` : ''}</text>
            </g>
          ))}
        </g>
      ))}
      <text x={F.w / 2} y={F.h - 10} textAnchor="middle" fontSize={12} fill="var(--dim)">
        {g.caption}</text>
    </svg>
  );
}
