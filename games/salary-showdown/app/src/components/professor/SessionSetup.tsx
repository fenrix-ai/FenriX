import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

// HARD RULE (contracts): max 21 franchises, enforced HERE in the panel —
// count check + this exact copy — NOT server-side. The server only enforces
// the minimum of 2. Reason: rounds/{r} approaches Firestore's 1 MiB document
// ceiling beyond 21 teams (parent spec).
const CAP_COPY =
  "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.";
const MIN_COPY = 'Enter at least 2 team names — one per line.';

// Game lifecycle (design spec §5.2): create a game (team-names textarea, one
// per line), resume an existing gameId, and start the season while in lobby.
// Renders nothing once the season is running — AdvanceControl owns the game
// from there.
export function SessionSetup() {
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [namesText, setNamesText] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!gameId) {
    const create = async () => {
      const names = namesText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
      if (names.length < 2) { setInlineError(MIN_COPY); return; }
      if (names.length > 21) { setInlineError(CAP_COPY); return; }
      setInlineError(null);
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>(
          'createGame', { teamNames: names });
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
        <textarea aria-label="team names" rows={8} value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          placeholder="One team name per line (2 to 21 teams)"
          style={{ width: '100%', boxSizing: 'border-box' }} />
        {inlineError && (
          <p className="neg" role="alert" style={{ margin: '8px 0' }}>{inlineError}</p>
        )}
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...teams.entries()].map(([id, t]) => (
          <span key={id} className="chip">{t.name}</span>
        ))}
      </div>
      <button type="button" className="btn green" style={{ marginTop: 10 }} disabled={busy}
        onClick={() => void start()}>Start season</button>
      <ErrorNotice error={error} />
    </section>
  );
}
