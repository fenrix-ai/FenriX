import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

// Finale reveal stepper (design spec §5.8): FINALE-only professor control
// walking the projector wall through the five reveal steps via setRevealStep
// (professor-only callable; phase must be FINALE server-side too). Renders
// null outside FINALE, so ProfessorPage mounts it unconditionally.
// ‹ › are sanctioned glyphs, not emojis. Step names are contract-fixed,
// verbatim — shared with FinaleWall. Never re-word them.
const STEPS = [
  'Podium',
  'Hype vs Reality',
  'What the engine paid for',
  'Wins per dollar',
  'Best & worst signings',
] as const;

export function RevealStepper() {
  const { gameId, game, call } = useProfessor();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (!gameId || !game || game.phase !== 'FINALE') return null;
  // Display clamp mirrors the wall's: revealStep can legally be 0..8 on the
  // wire, but this panel only addresses the 5 steps the wall renders.
  // revealStep is absent until the first setRevealStep call (T3) — the `?? 0`
  // default shows "1 of 5 · Podium" on a freshly finished game.
  const step = Math.min(STEPS.length - 1, Math.max(0, game.revealStep ?? 0));
  const go = async (next: number) => {
    const target = Math.min(STEPS.length - 1, Math.max(0, next));
    if (target === step) return;
    setBusy(true); setErr(null);
    try {
      await call('setRevealStep', { gameId, step: target });
      // No local step state: the games/{id} listener delivers revealStep and
      // re-renders the label — single source of truth, same doc the wall reads.
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <section className="card" data-testid="reveal-stepper" style={{ marginTop: 12 }}>
      <strong>Finale reveal</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button type="button" className="btn" aria-label="previous step"
          disabled={busy || step === 0} onClick={() => void go(step - 1)}>
          {'‹'}
        </button>
        <span data-testid="reveal-step-name"
          style={{ minWidth: 230, textAlign: 'center' }}>
          {step + 1} of {STEPS.length} · {STEPS[step]}
        </span>
        <button type="button" className="btn" aria-label="next step"
          disabled={busy || step === STEPS.length - 1} onClick={() => void go(step + 1)}>
          {'›'}
        </button>
      </div>
      <ErrorNotice error={err} />
    </section>
  );
}
