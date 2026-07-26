import { useProfessor } from '../../contexts/ProfessorContext';

// Round context (design spec §5 item 6, wording synced in this task's
// commit): compact READ-ONLY facts from the last COMPLETED round.
// ProfessorContext picks the doc (contextRound): rounds/{round} during
// SIMULATE/RESULTS/FINALE, rounds/{round-1} during the decision phases —
// so the panel is no longer blank while a round is being played. The
// headers name the round shown. Facts, never conclusions (hard rule): no
// judgment labels, and the wins-per-payroll-dollar column is NOT part of
// this compact view (the FINALE is the sanctioned reveal). games[].home/
// away are teamIds, NOT names — resolve through the teams map.
export function RoundContext() {
  const { round, teams, contextRound } = useProfessor();
  if (!round || contextRound == null) return null;
  const nameOf = (teamId: string) => teams.get(teamId)?.name ?? teamId;
  return (
    <section className="card" data-testid="round-context" style={{ marginTop: 12 }}>
      <strong>{`Standings · through Round ${contextRound}`}</strong>
      {round.standings.map((row) => (
        <div key={row.teamId} data-testid={`standing-${row.teamId}`} className="mono"
          style={{ marginTop: 4, fontSize: 13 }}>
          {`${row.rank} · ${row.name} · ${row.wins}-${row.losses} · ${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}`}
        </div>
      ))}
      <strong style={{ display: 'block', marginTop: 10 }}>{`Round ${contextRound} scores`}</strong>
      {round.games.map((g) => (
        <div key={g.game_id} data-testid={`score-${g.game_id}`} className="mono"
          style={{ marginTop: 4, fontSize: 13 }}>
          {`${nameOf(g.home)} ${g.homeScore}–${g.awayScore} ${nameOf(g.away)}`}
        </div>
      ))}
    </section>
  );
}
