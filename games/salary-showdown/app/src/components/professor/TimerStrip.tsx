import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { LedTimer, fmtClock } from '../ui/LedTimer';
import { ErrorNotice } from '../ui/ErrorNotice';
import { PHASE_NAMES } from '../../lib/phaseNames';
import type { Phase } from '../../types/models';

// Professor timer strip (design spec §5.4).
// HARD RULES — do not "improve" these away:
// - Every setTimer / advancePhase call ALWAYS sends expectedPhase +
//   expectedRound, read from the transition-GATED game.
// - Timers are advisory pacing (parent spec §13): expiry never blocks a
//   submission server-side. This strip paces the room; it enforces nothing.
// - Auto-advance swallows PHASE_MISMATCH ONLY (a manual click or a second
//   panel tab won the race); every other error surfaces in the ErrorNotice.
// - If the panel tab dies, nothing auto-advances — the game waits (safe
//   failure by design).
// - Defaults are PANEL-LOCAL (localStorage), never game config.

const DEFAULTS_KEY = 'ss.profTimerDefaults';
const AUTO_ARM_KEY = 'ss.profAutoArm';         // '1' | '0' — default '1' (on)
const AUTO_ADVANCE_KEY = 'ss.profAutoAdvance'; // '1' | '0' — default '0' (off)

export const FALLBACK_TIMER_DEFAULTS: Record<string, number> = {
  FRONT_OFFICE: 180, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 90, SIMULATE: 60, RESULTS: 90,
};
const TIMER_PHASES = Object.keys(FALLBACK_TIMER_DEFAULTS) as Phase[];

function readTimerDefaults(): Record<string, number> {
  const out: Record<string, number> = { ...FALLBACK_TIMER_DEFAULTS };
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of TIMER_PHASES) {
      const v = parsed[k];
      // setTimer 'start' bounds: integer 1..3600 (server rejects with BAD_TIMER otherwise)
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3600) out[k] = v;
    }
  } catch { /* malformed JSON in localStorage: fall back to shipped defaults */ }
  return out;
}
function readFlag(key: string, dflt: '0' | '1'): boolean {
  const v = localStorage.getItem(key);
  return (v === '0' || v === '1' ? v : dflt) === '1';
}
const isPhaseMismatch = (e: unknown) =>
  e instanceof Error && e.message.includes('PHASE_MISMATCH'); // match on MESSAGE, house rule

export function TimerStrip() {
  const { gameId, game, settling, call } = useProfessor();
  const [defaults, setDefaults] = useState<Record<string, number>>(readTimerDefaults);
  const [autoArm, setAutoArmState] = useState<boolean>(() => readFlag(AUTO_ARM_KEY, '1'));
  const [autoAdvance, setAutoAdvanceState] =
    useState<boolean>(() => readFlag(AUTO_ADVANCE_KEY, '0'));
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const armedKeyRef = useRef<string | null>(null);      // one auto-arm per (round, phase)
  const advancedForRef = useRef<number | null>(null);   // one auto-advance per deadline

  const running = game != null && game.timerEndsAt != null;
  const paused = game != null && game.timerPausedMs != null;

  const setTimer = useCallback(async (action: string, seconds?: number) => {
    if (!gameId || !game) return;
    setBusy(true); setErr(null);
    try {
      await call('setTimer', {
        gameId, action, ...(seconds != null ? { seconds } : {}),
        expectedPhase: game.phase, expectedRound: game.round,
      });
    } catch (e) {
      // PHASE_MISMATCH: an advance beat this click; the doc re-renders the strip.
      if (!isPhaseMismatch(e)) setErr(e);
    } finally { setBusy(false); }
  }, [gameId, game, call]);

  // 500ms tick while running — feeds the auto-advance zero-detection below.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Auto-arm: when (round, phase) changes and the timer is off, start the
  // per-phase default. Fires at most once per (round, phase) — the ref is
  // marked even when auto-arm is off, so toggling it mid-phase never arms
  // retroactively. The gated game keeps presenting the OLD phase while
  // settling, so the key only changes once the transition marker clears.
  useEffect(() => {
    if (!game || !gameId || settling) return;
    if (!(game.phase in FALLBACK_TIMER_DEFAULTS)) return; // LOBBY/FINALE: no timers
    const key = `${game.round}:${game.phase}`;
    if (armedKeyRef.current === key) return;
    armedKeyRef.current = key;
    if (!autoArm) return;
    if (game.timerEndsAt != null || game.timerPausedMs != null) return; // not off
    void call('setTimer', {
      gameId, action: 'start', seconds: defaults[game.phase],
      expectedPhase: game.phase, expectedRound: game.round,
    }).catch((e) => { if (!isPhaseMismatch(e)) setErr(e); });
  }, [game, gameId, settling, autoArm, defaults, call]);

  // Auto-advance: a RUNNING timer hitting 0 advances the phase, once per
  // deadline. PHASE_MISMATCH (lost to a manual click) is swallowed silently.
  useEffect(() => {
    if (!autoAdvance || !game || !gameId || settling) return;
    if (game.timerEndsAt == null) return; // paused/off timers never auto-advance
    const endsMillis = game.timerEndsAt.toMillis();
    if (endsMillis - now > 0) return;
    if (advancedForRef.current === endsMillis) return;
    advancedForRef.current = endsMillis;
    void call('advancePhase', { gameId, expectedPhase: game.phase, expectedRound: game.round })
      .catch((e) => { if (!isPhaseMismatch(e)) setErr(e); });
  }, [autoAdvance, game, gameId, settling, now, call]);

  if (!game || !(game.phase in FALLBACK_TIMER_DEFAULTS)) return null;

  const defaultSeconds = defaults[game.phase];
  const disabled = busy || settling;
  const setAutoArm = (v: boolean) => {
    localStorage.setItem(AUTO_ARM_KEY, v ? '1' : '0'); setAutoArmState(v);
  };
  const setAutoAdvance = (v: boolean) => {
    localStorage.setItem(AUTO_ADVANCE_KEY, v ? '1' : '0'); setAutoAdvanceState(v);
  };
  const openSettings = () => {
    setDraft(Object.fromEntries(TIMER_PHASES.map((k) => [k, String(defaults[k])])));
    setShowSettings(true);
  };
  const saveSettings = () => {
    const next = { ...defaults };
    for (const k of TIMER_PHASES) {
      const n = Number(draft[k]);
      if (Number.isInteger(n) && n >= 1 && n <= 3600) next[k] = n;
    }
    setDefaults(next);
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    setShowSettings(false);
  };

  return (
    <section className="card" data-testid="timer-strip">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <LedTimer endsAt={game.timerEndsAt} pausedMs={game.timerPausedMs} />
        {!running && !paused && (
          <button className="btn green" disabled={disabled}
            onClick={() => void setTimer('start', defaultSeconds)}>
            Start {fmtClock(defaultSeconds)}
          </button>
        )}
        {running && (
          <button className="btn" disabled={disabled} onClick={() => void setTimer('pause')}>
            Pause
          </button>
        )}
        {paused && (
          <button className="btn green" disabled={disabled} onClick={() => void setTimer('resume')}>
            Resume
          </button>
        )}
        {(running || paused) && (
          <button className="btn" disabled={disabled} onClick={() => void setTimer('extend', 30)}>
            +30s
          </button>
        )}
        {(running || paused) && (
          <button className="btn cut" disabled={disabled} onClick={() => void setTimer('clear')}>
            Clear
          </button>
        )}
        <label className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={autoArm}
            onChange={(e) => setAutoArm(e.target.checked)} />
          Auto-arm
        </label>
        <label className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)} />
          Auto-advance
        </label>
        <button className="btn"
          onClick={() => (showSettings ? setShowSettings(false) : openSettings())}>
          Timer settings
        </button>
      </div>
      {showSettings && (
        <div className="inset"
          style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIMER_PHASES.map((k) => (
            <label key={k} className="mono"
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {PHASE_NAMES[k]}
              <input type="number" min={1} max={3600} value={draft[k] ?? ''}
                style={{ width: 70 }}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
              s
            </label>
          ))}
          <button className="btn gold" onClick={saveSettings}>Save defaults</button>
        </div>
      )}
      <ErrorNotice error={err} />
    </section>
  );
}
