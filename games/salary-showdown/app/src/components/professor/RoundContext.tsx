import { useProfessor } from '../../contexts/ProfessorContext';
import styles from './ProfessorDesk.module.css';

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
    <section className={`${styles.panel} ${styles.contextPanel}`} data-testid="round-context">
      <div>
        <h2 className={styles.panelTitle}>{`Standings · through Round ${contextRound}`}</h2>
        <div className={styles.contextList}>
          {round.standings.map((row) => (
            <div key={row.teamId} data-testid={`standing-${row.teamId}`} className="mono">
              {`${row.rank} · ${row.name} · ${row.wins}-${row.losses} · ${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}`}
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className={styles.panelTitle}>{`Round ${contextRound} scores`}</h2>
        <div className={styles.contextList}>
          {round.games.map((g) => (
            <div key={g.game_id} data-testid={`score-${g.game_id}`} className="mono">
              {`${nameOf(g.home)} ${g.homeScore}–${g.awayScore} ${nameOf(g.away)}`}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
