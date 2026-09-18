import { useRef, useState, type MouseEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useProfessor } from '../../contexts/ProfessorContext';
import { fmtM } from '../../lib/money';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { SessionSetup } from '../../components/professor/SessionSetup';
import { AdvanceControl } from '../../components/professor/AdvanceControl';
import { TimerStrip } from '../../components/professor/TimerStrip';
import { SubmissionGrid } from '../../components/professor/SubmissionGrid';
import { SeatPanel } from '../../components/professor/SeatPanel';
import { RevealStepper } from '../../components/professor/RevealStepper';
import { RoundContext } from '../../components/professor/RoundContext';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { concatBoxCsv } from '../../lib/exportSeason';
import type { RoundDoc } from '../../types/models';
import styles from './ProfessorPage.module.css';

export default function ProfessorPage() {
  const { gameId, game, settling, gameError, setGameId } = useProfessor();
  const [seatPanelOpen, setSeatPanelOpen] = useState(false);
  const [seatTeamId, setSeatTeamId] = useState<string | null>(null);
  const seatOpener = useRef<HTMLElement | null>(null);

  const openSeatPanel = (teamId: string | null, trigger: HTMLElement) => {
    seatOpener.current = trigger;
    setSeatTeamId(teamId);
    setSeatPanelOpen(true);
  };
  const closeSeatPanel = () => {
    setSeatPanelOpen(false);
    queueMicrotask(() => seatOpener.current?.focus());
  };
  const openGeneralSeatPanel = (event: MouseEvent<HTMLButtonElement>) => {
    openSeatPanel(null, event.currentTarget);
  };

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.titleGroup}>
          <div className={styles.brand}>Salary Showdown</div>
          <h1 className={styles.title}>Professor control desk</h1>
        </div>
        <div className={styles.headerActions}>
          {game && (
            <button type="button" className="btn" aria-expanded={seatPanelOpen}
              aria-controls="professor-seat-panel" onClick={openGeneralSeatPanel}>
              Manage seats
            </button>
          )}
          <button type="button" className="btn" onClick={() => window.open('/bigscreen')}>
            Open projector
          </button>
        </div>
      </header>

      {game ? (
        <section className={styles.session} aria-label="Session">
          <div>
            <div className={styles.sessionLabel}>Join code</div>
            <div className={styles.sessionCode} aria-label="Join code">{game.joinCode}</div>
          </div>
          <div className={styles.sessionDetails}>
            <strong className={styles.phaseLine}>
              {PHASE_NAMES[game.phase]}{game.round > 0 ? ` · Round ${game.round}` : ''}
            </strong>
            {settling && <span className={styles.settling}>advancing…</span>}
            <span className={styles.configLine}>
              Cap {fmtM(game.config.cap)} · {game.config.totalRounds} rounds
            </span>
          </div>
          <button type="button" className="btn" onClick={() => setGameId(null)}>
            Clear session
          </button>
        </section>
      ) : gameId ? (
        <section className={styles.connection} aria-label="Session">
          <p className="muted">Connecting to session…</p>
          {gameError && (
            <p className="muted" data-testid="connect-error">
              This browser can't open that game — either the game id is mistyped, or
              this isn't the browser that created it (professor identity stays in the
              creating browser). If that browser is gone, see the runbook's Lost
              laptop recovery.
            </p>
          )}
          <button type="button" className="btn" onClick={() => setGameId(null)}>
            Clear session
          </button>
        </section>
      ) : null}

      {!game ? (
        <div className={styles.setupOnly}><SessionSetup /></div>
      ) : (
        <>
          <div className={styles.workspace}>
            <div className={styles.boardColumn}>
              <SubmissionGrid onManageSeats={openSeatPanel} />
            </div>
            <aside className={styles.controlRail} aria-label="Session controls">
              <div className={styles.stickyControls}>
                <SessionSetup />
                <AdvanceControl />
                <TimerStrip />
                <RevealStepper />
              </div>
            </aside>
          </div>
          <div className={styles.contextGrid}>
            <RoundContext />
            <ExportSeasonButton />
          </div>
        </>
      )}

      <SeatPanel open={seatPanelOpen} initialTeamId={seatTeamId} onClose={closeSeatPanel} />
    </main>
  );
}

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
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.exportCard} aria-label="Export">
      <div>
        <strong>Season data</strong>
        <p className="muted">Download every completed round in the frozen 23-column format.</p>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
        {busy ? 'Preparing CSV…' : 'Download season CSV'}
      </button>
      <ErrorNotice error={error} />
    </section>
  );
}
