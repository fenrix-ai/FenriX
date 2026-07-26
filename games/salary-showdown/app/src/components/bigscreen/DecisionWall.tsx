import { useProfessor } from '../../contexts/ProfessorContext';
import { LedTimer } from '../ui/LedTimer';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';

// Submission-light rules live in src/lib/submissionLights.ts (T7) — ONE
// definition shared by the panel's confirm guard (T7), SubmissionGrid (T9) and
// this wall. BigscreenPage's mode switch guarantees DecisionWall only renders
// for FRONT_OFFICE / FREE_AGENCY / AUCTION / LINEUP — exactly T7's
// LIGHT_PHASES — so the shared function applies directly; the LIGHT_PHASES
// check below is a consistency guard that can never fire under that switch.

// Projector wall for the four decision phases (FO / FA / Auction / Lineup).
// Facts only, display-only: phase title in student vocabulary, round, a huge
// LedTimer (timers are advisory pacing — 0:00 changes nothing here), and one
// light per team: name + filled/empty dot. The dots are the glyphs ● / ○ (no
// emojis) and NEVER reveal bid contents — presence is public by design; it is
// on the wall to create pace pressure.
export function DecisionWall() {
  const { game, teams, bidsSubmitted } = useProfessor();
  if (!game || !LIGHT_PHASES.has(game.phase)) return null;
  const lit = submittedTeamIds(game.phase, game.round, teams, bidsSubmitted);
  return (
    <main className="bigscreen">
      <header className="bs-head">
        <div>
          <div className="brand bs-brand">Salary Showdown</div>
          <h1 className="bs-phase-title">{PHASE_NAMES[game.phase]}</h1>
          <p className="bs-sub">Round {game.round}</p>
        </div>
        <div className="bs-led">
          <LedTimer endsAt={game.timerEndsAt} pausedMs={game.timerPausedMs} />
        </div>
      </header>
      <div className="bs-lights" data-testid="bs-lights">
        {/* Sorted by name — the SAME order as the panel's SubmissionGrid, so
            the professor and the wall read the room identically. */}
        {[...teams.entries()]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([tid, t]) => (
          <div key={tid} className="bs-light-row">
            <span className={lit.has(tid) ? 'bs-dot ok' : 'bs-dot dim'} aria-hidden="true">
              {lit.has(tid) ? '●' : '○'}
            </span>
            <span className="bs-light-name">{t.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
