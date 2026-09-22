import { useProfessor } from '../../contexts/ProfessorContext';
import type { Role } from '../../types/models';
import { FranchiseMark } from '../franchise/FranchiseMark';

const ROLES: Role[] = ['GM', 'Scout', 'Coach'];

// Projector lobby wall. Display-only: giant join code (the professor reads this
// aloud if the wall dies), the join URL, a live seat counter, and one card per
// franchise with GM/Scout/Coach chips filling in as seats are claimed.
// No emojis; no interactive elements.
export function LobbyWall() {
  const { game, teams, players } = useProfessor();
  if (!game) return null;
  const seatTotal = game.teamCount * 3;
  const claimed = [...players.values()];
  const dense = teams.size > 12;
  return (
    <main className={`bigscreen bs-center bs-lobby${dense ? ' bs-dense' : ''}`}>
      <div className="brand bs-brand">Salary Showdown</div>
      <div className="mono bs-joincode" data-testid="bs-joincode">{game.joinCode}</div>
      <p className="bs-joinline">join at {window.location.origin}/?code={game.joinCode}</p>
      <p className="bs-seats">{claimed.length} of {seatTotal} seats filled</p>
      <div className="bs-teamgrid">
        {/* Sorted by name — same ordering as SubmissionGrid on the panel. */}
        {[...teams.entries()]
          // numeric-aware: Franchise 2 before Franchise 10
          .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true }))
          .map(([tid, t]) => (
          <section key={tid} className="bs-teamcard">
            <div className="bs-team-title">
              <FranchiseMark teamId={tid} name={t.name} identity={t.identity}
                size={dense ? 32 : 44} />
              <h2>{t.name}</h2>
            </div>
            <div className="bs-chips">
              {ROLES.map((role) => {
                const seat = claimed.find((p) => p.teamId === tid && p.role === role);
                return (
                  <span key={role} className={seat ? 'chip on' : 'chip'}>
                    {role}: {seat ? seat.displayName : 'open'}
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
