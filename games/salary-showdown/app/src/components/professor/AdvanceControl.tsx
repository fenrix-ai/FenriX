import { useEffect, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';
import { ErrorNotice } from '../ui/ErrorNotice';
import { nextOf, TOTAL_ROUNDS } from '../../lib/phaseOrder';

// Phase order + nextOf live in src/lib/phaseOrder.ts (client mirror of
// backend phases.js, parity-pinned by phaseOrder.test.ts).

type Confirm = { kind: 'missing'; names: string[] } | { kind: 'season-end' };

// Phase control (design spec §5.3): ONE primary Advance button labelled with
// the concrete next phase. Confirmation guards: (1) any current-phase light
// off → modal listing the un-submitted teams BY NAME (facts only — never bid
// contents) with explicit confirm; (2) the RESULTS·R5 → FINALE advance gets
// its own end-the-season confirm. Force-advance is this same path — the exit
// hooks already apply every §13 timeout default; no new backend semantics.
//
// stuckThresholdMs (3b T1): after this many ms of CONTINUOUS settling the
// panel offers "Resolve stuck advance". A healthy advance clears the
// transition marker in well under a second; ten uninterrupted seconds means
// the advancing caller crashed mid-hooks. Prop exists so itests can shrink
// it; ProfessorPage mounts this with the 10s default.
export function AdvanceControl({ stuckThresholdMs = 10_000 }: { stuckThresholdMs?: number }) {
  const { gameId, game, settling, raw, teams, bidsSubmitted, call } = useProfessor();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [stuck, setStuck] = useState(false);

  // Continuous-settling detector. The effect re-runs only when `settling`
  // flips, so the timeout measures ONE continuous stretch — any recovery
  // resets it.
  useEffect(() => {
    if (!settling) { setStuck(false); return; }
    const id = setTimeout(() => setStuck(true), stuckThresholdMs);
    return () => clearTimeout(id);
  }, [settling, stuckThresholdMs]);

  if (!gameId || !game) return null;
  // status !== 'active' normally hides this control (lobby / post-finale).
  // EXCEPTION: the final RESULTS→FINALE flip sets status 'finished' in the
  // same transaction that writes the marker, so a CRASHED finale advance
  // leaves status 'finished' + settling — it must stay resolvable here
  // (server-side it stays adoptable by design: the transition check runs
  // before the finished check).
  if (game.status !== 'active' && !settling) return null;
  const next = nextOf(game.phase, game.round);
  if (!next) return null;

  const submitted = LIGHT_PHASES.has(game.phase)
    ? submittedTeamIds(game.phase, game.round, teams, bidsSubmitted)
    : null;

  const advance = async () => {
    setBusy(true);
    setError(null);
    try {
      // HARD RULE: advancePhase callers ALWAYS send expectedPhase +
      // expectedRound, taken from the transition-GATED game view.
      await call('advancePhase',
        { gameId, expectedPhase: game.phase, expectedRound: game.round });
      setConfirm(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // SANCTIONED EXCEPTION — the ONE place expectations come from the RAW doc.
  // The hard rule everywhere else: advancePhase/setTimer expectations are
  // read from the transition-GATED view. This button's entire mechanism is
  // the server's adoption path (game.js advancePhase: the mismatch check
  // runs against the CURRENT — already-flipped — doc BEFORE
  // `if (g.transition) return { resume: true, ... }`), which is reachable
  // only when expectations match the post-flip state. Sending the gated
  // (pre-flip) values here would deterministically PHASE_MISMATCH — that is
  // exactly how concurrent losers are rejected. Do NOT "fix" this to use
  // game.phase/game.round.
  const resolveStuck = async () => {
    if (!raw) return;
    setBusy(true);
    setError(null);
    try {
      await call('advancePhase',
        { gameId, expectedPhase: raw.phase, expectedRound: raw.round });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const onAdvanceClick = () => {
    setError(null);
    if (submitted) {
      const missing = [...teams.entries()]
        .filter(([teamId]) => !submitted.has(teamId))
        .map(([, t]) => t.name)
        .sort();
      if (missing.length > 0) {
        setConfirm({ kind: 'missing', names: missing });
        return;
      }
    }
    if (game.phase === 'RESULTS' && game.round >= TOTAL_ROUNDS) {
      setConfirm({ kind: 'season-end' });
      return;
    }
    void advance();
  };

  return (
    <section className="card" style={{ marginTop: 10 }} aria-label="Phase control">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn gold" disabled={settling || busy}
          onClick={onAdvanceClick}>
          {`Advance → ${PHASE_NAMES[next.phase]} · R${next.round}`}
        </button>
        {submitted && (
          <span className="muted">{`Submitted: ${submitted.size} of ${teams.size}`}</span>
        )}
        {settling && stuck && raw && (
          <button type="button" className="btn cut" disabled={busy}
            onClick={() => void resolveStuck()}>
            Resolve stuck advance
          </button>
        )}
      </div>
      <ErrorNotice error={error} />
      {confirm && (
        <div className="drawer" role="dialog" aria-label="confirm advance"
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 688, margin: '0 auto' }}>
          <p style={{ marginTop: 0 }}>
            {confirm.kind === 'missing'
              ? `${confirm.names.length} teams haven't submitted: ${confirm.names.join(', ')}. Advance anyway? Server defaults will apply.`
              : 'End the season and reveal? This cannot be undone.'}
          </p>
          <button type="button" className="btn gold" disabled={settling || busy}
            onClick={() => void advance()}>
            {confirm.kind === 'missing' ? 'Advance anyway' : 'End the season'}
          </button>{' '}
          <button type="button" className="btn" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}
    </section>
  );
}
