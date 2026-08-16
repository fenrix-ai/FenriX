import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

const ROLES = ['GM', 'Scout', 'Coach'] as const;

// Seats card (playtest-2 item 3): per-team claimed seats with a professor-only
// two-click release. Releasing deletes the membership server-side: the
// absent-seat fallback then lets teammates cover the role, and the seat
// reopens for a fresh claim. Names are public lobby facts — never bid
// contents or any private submission data.
export function SeatPanel() {
  const { gameId, game, teams, players, call } = useProfessor();
  const [arm, setArm] = useState<string | null>(null); // `${teamId}:${role}` awaiting confirm
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!gameId || !game) return null;
  const rows = [...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const seatHolder = (teamId: string, role: string) =>
    [...players.values()].find((p) => p.teamId === teamId && p.role === role) ?? null;
  const release = async (teamId: string, role: string) => {
    setBusy(true); setError(null);
    try {
      await call('releaseSeat', { gameId, teamId, role });
      setArm(null);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <section className="card" data-testid="seat-panel" style={{ marginTop: 12 }}>
      <strong>Seats</strong>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Releasing a seat signs that player out. Teammates can act for any
        role with no claimed seat.
      </p>
      {rows.map(([teamId, t]) => (
        <div key={teamId} data-testid={`seats-${teamId}`}
          style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {/* Trailing colon (deviation from the task-7 brief's literal draft):
              SeatPanel is deliberately visible during LOBBY (the release itest
              never calls startSeason), the exact window where SessionSetup's
              "Lobby setup" card ALSO lists every team name as a bare chip
              span. A bare `{t.name}` span here duplicates that text node
              exactly and breaks professor.itest.tsx's
              `screen.getByText('Franchise 1')` ("Found multiple elements").
              The colon — consistent with the row's own "Role: value" format —
              gives this span distinct text without changing anything the
              itests assert on (they only match on 'Scout: <name>' / role
              substrings via panel.textContent, never the bare team name). */}
          <span style={{ minWidth: 120 }}>{t.name}:</span>
          {ROLES.map((role) => {
            const holder = seatHolder(teamId, role);
            const key = `${teamId}:${role}`;
            if (!holder) return <span key={role} className="dim">{role}: open</span>;
            return (
              <span key={role} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span className="ok">{role}: {holder.displayName}</span>
                <button type="button" className="btn" disabled={busy}
                  onClick={() => (arm === key ? void release(teamId, role) : setArm(key))}>
                  {arm === key ? 'Confirm release' : 'Release'}
                </button>
              </span>
            );
          })}
        </div>
      ))}
      <ErrorNotice error={error} />
    </section>
  );
}
