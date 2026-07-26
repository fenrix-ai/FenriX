import { useProfessor } from '../../contexts/ProfessorContext';

// Round context (design spec §5 item 6): compact READ-ONLY facts from the
// current round doc — current standings and last-round scores. Facts, never
// conclusions (hard rule): no judgment labels, and the wins-per-payroll-
// dollar column is NOT part of this compact view (the FINALE is the
// sanctioned reveal). games[].home/away are teamIds, NOT names — resolve
// through the teams map. rounds/{game.round} does not exist until the
// enter:SIMULATE hook writes it, so this renders nothing until then.
export function RoundContext() {
  const { round, teams } = useProfessor();
  if (!round) return null;
  const nameOf = (teamId: string) => teams.get(teamId)?.name ?? teamId;
  return (
    <section className="card" data-testid="round-context" style={{ marginTop: 12 }}>
      <strong>Standings</strong>
      {round.standings.map((row) => (
        <div key={row.teamId} data-testid={`standing-${row.teamId}`} className="mono"
          style={{ marginTop: 4, fontSize: 13 }}>
          {`${row.rank} · ${row.name} · ${row.wins}-${row.losses} · ${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}`}
        </div>
      ))}
      <strong style={{ display: 'block', marginTop: 10 }}>Last round</strong>
      {round.games.map((g) => (
        <div key={g.game_id} data-testid={`score-${g.game_id}`} className="mono"
          style={{ marginTop: 4, fontSize: 13 }}>
          {`${nameOf(g.home)} ${g.homeScore}–${g.awayScore} ${nameOf(g.away)}`}
        </div>
      ))}
    </section>
  );
}
