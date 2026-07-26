import { bestWorstRows } from '../../lib/revealCharts';
import type { RevealDoc } from '../../types/models';

// Finale chart 4 — every team's best and worst signing by TrueImpact per $M of
// contract rate. valuePerDollar renders here BY DESIGN: the Finale is the
// sanctioned reveal (parent spec section 11.14); the never-render rule applies
// to the in-game Results bargain award, not to this page.
export function BestWorst({ perTeam, teamNames, playerNames, order, highlightTeamId }: {
  perTeam: RevealDoc['perTeam']; teamNames: Map<string, string>;
  playerNames: Map<number, string>; order?: string[];
  highlightTeamId?: string | null;
}) {
  const rows = bestWorstRows(perTeam, teamNames, playerNames, order);
  const rowH = 34, headH = 30, w = 720;
  const h = headH + rows.length * rowH + 8;
  return (
    <svg data-testid="chart-best-worst" viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label="Best and worst signing per team, TrueImpact per million dollars"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <g fontSize={11} fill="var(--dim)">
        <text x={12} y={18}>TEAM</text>
        <text x={210} y={18}>BEST SIGNING · TI PER $M</text>
        <text x={470} y={18}>WORST SIGNING · TI PER $M</text>
      </g>
      {rows.map((r, i) => {
        const y = headH + i * rowH;
        return (
          <g key={r.teamId}>
            {r.teamId === highlightTeamId && (
              <rect x={2} y={y} width={w - 4} height={rowH} rx={4}
                fill="rgba(255, 201, 77, 0.12)" />
            )}
            <line x1={2} y1={y} x2={w - 2} y2={y} stroke="var(--track)" />
            <text x={12} y={y + 22} fontSize={13} fontWeight={700} fill="var(--text)">
              {r.team}</text>
            <text x={210} y={y + 22} fontSize={12} fill="var(--ok)" fontFamily="var(--mono)">
              {r.best ? `${r.best.name} · ${r.best.vpd}` : '—'}</text>
            <text x={470} y={y + 22} fontSize={12} fill="var(--neg)" fontFamily="var(--mono)">
              {r.worst ? `${r.worst.name} · ${r.worst.vpd}` : '—'}</text>
          </g>
        );
      })}
    </svg>
  );
}
