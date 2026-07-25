import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useProfessor } from '../../contexts/ProfessorContext';
import { fmtM } from '../../lib/money';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { SessionSetup } from '../../components/professor/SessionSetup';
import { AdvanceControl } from '../../components/professor/AdvanceControl';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { concatBoxCsv } from '../../lib/exportSeason';
import type { RoundDoc } from '../../types/models';

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
      <SessionSetup />
      <AdvanceControl />
      <ExportSeasonButton />
    </main>
  );
}

// Design spec §5.7: "Download season CSV". The panel only SUBSCRIBES to the
// current round, so the export does one-shot getDoc reads of rounds/1..round
// and concatenates client-side (single header row, concatBoxCsv). Rounds not
// yet simulated simply do not exist and are skipped — exporting mid-round is
// legal. The 23-column boxCsv format is frozen; rows pass through verbatim.
function ExportSeasonButton() {
  const { gameId, game } = useProfessor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!gameId || !game || game.round < 1) return null;
  const { joinCode, round } = game;
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const csvs: string[] = [];
      for (let r = 1; r <= round; r += 1) {
        const snap = await getDoc(doc(db, 'games', gameId, 'rounds', String(r)));
        if (snap.exists()) csvs.push((snap.data() as RoundDoc).boxCsv);
      }
      const blob = new Blob([concatBoxCsv(csvs)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salary-showdown-season-${joinCode}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card" style={{ marginTop: 10 }} aria-label="Export">
      <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
        Download season CSV
      </button>
      <ErrorNotice error={error} />
    </section>
  );
}
