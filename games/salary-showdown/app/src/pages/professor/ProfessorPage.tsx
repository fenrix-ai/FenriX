import { useProfessor } from '../../contexts/ProfessorContext';
import { fmtM } from '../../lib/money';
import { PHASE_NAMES } from '../../lib/phaseNames';

// /professor control-panel shell (design spec §5.1). Later tasks mount below
// the header: SessionSetup + AdvanceControl (T7), TimerStrip (T8),
// SubmissionGrid (T9), RevealStepper (T13).
export default function ProfessorPage() {
  const { gameId, game, settling } = useProfessor();
  return (
    <main className="page">
      <div className="phase-head">
        <div>
          <div className="brand">Salary Showdown</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Professor panel</h1>
        </div>
        <button type="button" className="btn" onClick={() => window.open('/bigscreen')}>
          Open projector
        </button>
      </div>
      {game ? (
        <section className="card" style={{ marginTop: 10 }} aria-label="Session">
          <div className="mono" aria-label="Join code"
            style={{ fontSize: 44, fontWeight: 700, letterSpacing: 6, lineHeight: 1.1 }}>
            {game.joinCode}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 4 }}>
            <strong>
              {PHASE_NAMES[game.phase]}{game.round > 0 ? ` · Round ${game.round}` : ''}
            </strong>
            {settling && <span className="dim">advancing…</span>}
          </div>
          {/* Config shown read-only (spec §5 item 9). Hard rule: cap/totalRounds
              are DECORATIVE — plain text only, never an input or button. */}
          <div className="muted" style={{ marginTop: 4 }}>
            Cap {fmtM(game.config.cap)} · {game.config.totalRounds} rounds
          </div>
        </section>
      ) : (
        <p className="muted" style={{ marginTop: 10 }}>
          {gameId ? 'Connecting to session…' : 'No active session.'}
        </p>
      )}
    </main>
  );
}
