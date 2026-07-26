import { useProfessor } from '../../contexts/ProfessorContext';
import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';

// Submission grid (design spec §5.5): one row per team, one light for the
// CURRENT phase. Lights only — this component must NEVER render bid contents
// (rates, years, target pids) or any other private submission data; the
// filled/empty dot is the entire disclosure. submittedTeamIds (Task 7) owns
// the per-phase rule; LIGHT_PHASES (also Task 7) names the four phases that
// have a lights section — outside them (LOBBY / SIMULATE / RESULTS / FINALE)
// this renders nothing at all, not an empty shell. ● / ○ are sanctioned
// glyphs, not emojis.
export function SubmissionGrid() {
  const { game, teams, bidsSubmitted } = useProfessor();
  if (!game) return null;
  if (!LIGHT_PHASES.has(game.phase)) return null;
  const lit = submittedTeamIds(game.phase, game.round, teams, bidsSubmitted);
  const rows = [...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  return (
    <section className="card" data-testid="submission-grid" style={{ marginTop: 12 }}>
      <strong>Submissions</strong>
      <span className="mono muted" style={{ marginLeft: 8, fontSize: 13 }}>
        {lit.size} of {rows.length} in
      </span>
      {rows.map(([teamId, t]) => (
        <div key={teamId} data-testid={`light-${teamId}`}
          style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
          <span className={lit.has(teamId) ? 'ok' : 'dim'} style={{ marginRight: 8 }}>
            {lit.has(teamId) ? '●' : '○'}
          </span>
          {/* Explicit space text node: JSX strips the bare newline between the
              two spans, and the Step 6 tests (and the '● <name>' text contract
              in Produces) assert textContent '● Alpha' WITH a space. The flex
              row ignores this node visually (marginRight above provides the
              gap) but it is part of textContent. Do not remove. */}
          {' '}
          <span>{t.name}</span>
        </div>
      ))}
    </section>
  );
}
