import { useProfessor } from '../../contexts/ProfessorContext';
import type { Role } from '../../types/models';

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
  return (
    <main className="bigscreen bs-center">
      <div className="brand bs-brand">Salary Showdown</div>
      <div className="mono bs-joincode" data-testid="bs-joincode">{game.joinCode}</div>
      <p className="bs-joinline">join at {window.location.origin}/?code={game.joinCode}</p>
      <p className="bs-seats">{claimed.length} of {seatTotal} seats filled</p>
      <div className="bs-teamgrid">
        {/* Sorted by name — same ordering as SubmissionGrid on the panel. */}
        {[...teams.entries()]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([tid, t]) => (
          <section key={tid} className="bs-teamcard">
            <h2>{t.name}</h2>
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
