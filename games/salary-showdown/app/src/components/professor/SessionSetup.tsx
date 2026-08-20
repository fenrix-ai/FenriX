import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

// AMENDED HARD RULE (2026-08-17): the 21-franchise cap is now enforced
// SERVER-SIDE in createTeam — students create their own franchises from the
// join screen, so the panel takes no count at all. The rationale is unchanged
// (rounds/{r} approaches Firestore's 1 MiB ceiling beyond 21 teams); only the
// enforcement site moved. The 2-franchise floor is server-side too
// (startSeason); the disabled Start button below is a UX mirror, not the gate.

// Game lifecycle (design spec §5.2): create a game (franchise-count input —
// students name their own teams from the lobby), resume an existing gameId,
// and start the season while in lobby. Renders nothing once the season is
// running — AdvanceControl owns the game from there.
export function SessionSetup() {
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [resumeId, setResumeId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!gameId) {
    const create = async () => {
      // Zero-team create (student-created teams): the game starts empty and
      // students create their own franchises from the join screen. The 21-cap
      // and the 2-franchise floor are both server-enforced now (createTeam /
      // startSeason).
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>('createGame', {});
        setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="card" style={{ marginTop: 10 }} aria-label="Session setup">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>New session</h2>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Students create and name their own franchises from the join screen —
          share the join code and they appear below. The server caps the
          league at 21 franchises.
        </p>
        <button type="button" className="btn gold" disabled={busy}
          onClick={() => void create()}>Create game</button>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <input aria-label="game id" className="mono" value={resumeId}
            onChange={(e) => setResumeId(e.target.value)} placeholder="Existing game id"
            style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={resumeId.trim().length === 0}
            onClick={() => setGameId(resumeId.trim())}>Resume</button>
        </div>
        <ErrorNotice error={error} />
      </section>
    );
  }

  if (game?.status !== 'lobby') return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('startSeason', { gameId });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card" style={{ marginTop: 10 }} aria-label="Lobby setup">
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Franchises</h2>
      {teams.size === 0 && (
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>
          No franchises yet — students create them from the join screen.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...teams.entries()]
          // numeric-aware: Franchise 2 before Franchise 10 (collation sweep)
          .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true }))
          .map(([id, t]) => (
            <span key={id} className="chip">{t.name}</span>
          ))}
      </div>
      {teams.size < 2 && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Start season unlocks once 2 franchises exist.
        </p>
      )}
      <button type="button" className="btn green" style={{ marginTop: 10 }}
        disabled={busy || teams.size < 2}
        onClick={() => void start()}>Start season</button>
      <ErrorNotice error={error} />
    </section>
  );
}
