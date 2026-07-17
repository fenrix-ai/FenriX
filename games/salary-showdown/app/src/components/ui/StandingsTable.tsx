import type { StandingsRow } from '../../types/models';

// Viewer-aware highlight (spec §11.12): team surfaces pass the viewer's franchise;
// the projector (Plan 3) passes none. wpd = wins-per-payroll-dollar — one of the
// two sanctioned derived metrics; informational only, it never affects rank order.
export function StandingsTable({ rows, highlightTeamId, wpd }: {
  rows: StandingsRow[]; highlightTeamId: string | null;
  wpd: Map<string, number> | null;
}) {
  return (
    <table className="table" data-testid="standings">
      <thead><tr>
        <th>#</th><th className="name">Team</th><th>W-L</th><th>Diff</th>
        {wpd && <th>W / $M</th>}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.teamId} className={r.teamId === highlightTeamId ? 'sel' : ''}>
            <td>{r.rank}</td>
            <td className="name" style={{ fontFamily: 'inherit', fontWeight: 700 }}>{r.name}</td>
            <td>{r.wins}-{r.losses}</td>
            <td>{r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</td>
            {wpd && <td>{(wpd.get(r.teamId) ?? 0).toFixed(3)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
