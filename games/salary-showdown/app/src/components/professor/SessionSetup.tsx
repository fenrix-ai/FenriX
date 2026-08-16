import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

// HARD RULE (contracts): max 21 franchises, enforced HERE in the panel —
// count check + this exact copy — NOT server-side. The server only enforces
// the minimum of 2. Reason: rounds/{r} approaches Firestore's 1 MiB document
// ceiling beyond 21 teams (parent spec).
const CAP_COPY =
  "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.";
const MIN_COPY = 'Enter how many franchises are playing — at least 2.';

// Game lifecycle (design spec §5.2): create a game (franchise-count input —
// students name their own teams from the lobby), resume an existing gameId,
// and start the season while in lobby. Renders nothing once the season is
// running — AdvanceControl owns the game from there.
export function SessionSetup() {
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [countText, setCountText] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!gameId) {
    const create = async () => {
      // Count-first create (playtest-2 item 1): students name their own
      // franchises from the lobby. The 21-franchise cap stays enforced HERE
      // with the exact CAP_COPY string — standing hard rule, not server-side.
      const n = Number(countText);
      if (!Number.isInteger(n) || n < 2) { setInlineError(MIN_COPY); return; }
      if (n > 21) { setInlineError(CAP_COPY); return; }
      setInlineError(null);
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>(
          'createGame', { teamCount: n });
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
        <input aria-label="franchise count" className="mono" inputMode="numeric"
          value={countText}
          onChange={(e) => setCountText(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="How many franchises? (2 to 21)"
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 16 }} />
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Teams arrive as Franchise 1..N — students name their own from the
          lobby before you press Start season.
        </p>
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
