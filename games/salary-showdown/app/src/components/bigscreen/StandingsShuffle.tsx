import { useEffect, useMemo, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { computeShuffleSteps, type ShuffleStep } from '../../lib/shuffle';

// Movement markers are GLYPHS + plain text, never emojis: ▲ climbed, ▼ fell,
// — held, NEW when previousRank is null (round 1).
function deltaGlyph(delta: number | null): string {
  if (delta === null) return 'NEW';
  if (delta > 0) return `▲ ${delta}`;
  if (delta < 0) return `▼ ${-delta}`;
  return '—';
}
function deltaClass(delta: number | null): string {
  if (delta === null) return 'bs-delta mono';
  if (delta > 0) return 'bs-delta mono ok';
  if (delta < 0) return 'bs-delta mono neg';
  return 'bs-delta mono dim';
}

// RESULTS wall: playback of computeShuffleSteps(round.standings). One reveal
// per 0.8s, bottom-up (rank N first, rank 1 last); the top three render as
// '#<rank> — ?' until their own step. In round 5 the last three reveals slow
// to 3s each — the championship reveal. Round 5 IS the final round:
// config.totalRounds is decorative (Plan 1 ruling) and is deliberately not
// consulted. Rest state: the full table with deltas, held until the professor
// advances. Display-only; facts only (rank, name, record, movement).
export function StandingsShuffle() {
  const { game, round } = useProfessor();
  const steps = useMemo(() => computeShuffleSteps(round?.standings ?? []), [round]);
  const championship = game?.round === 5;
  const [shown, setShown] = useState(0);

  useEffect(() => { // cosmetic client pacing — the standings are already server-final
    setShown(0);
    if (steps.length === 0) return;
    let cancelled = false;
    let id: ReturnType<typeof setTimeout>;
    const schedule = (i: number) => { // i = index of the NEXT step to reveal
      const slow = championship && i >= steps.length - 3;
      id = setTimeout(() => {
        if (cancelled) return;
        setShown(i + 1);
        if (i + 1 < steps.length) schedule(i + 1);
      }, slow ? 3000 : 800);
    };
    schedule(0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [steps, championship]);

  if (!game) return null;
  const revealed = new Set(steps.slice(0, shown).map((s) => s.teamId));
  const rows: ShuffleStep[] = [...steps].sort((a, b) => a.rank - b.rank);
  return (
    <main className="bigscreen">
      <header>
        <div className="brand bs-brand">Salary Showdown</div>
        <h1 className="bs-phase-title">{PHASE_NAMES.RESULTS}</h1>
        <p className="bs-sub">Round {game.round}</p>
      </header>
      <div className="bs-shuffle" data-testid="bs-shuffle">
        {rows.map((s) => {
          // Bottom-up reveal: an unrevealed row is absent — EXCEPT the top
          // three, whose shrouded placeholders hold the podium slots open.
          if (!revealed.has(s.teamId) && !s.shroud) return null;
          return revealed.has(s.teamId) ? (
            <div key={s.teamId} className="bs-shuffle-row" data-testid="bs-shuffle-row">
              <span className="bs-shuffle-rank mono">#{s.rank}</span>
              <span className="bs-shuffle-name">{s.name}</span>
              <span className="bs-shuffle-record mono">{s.wins}–{s.losses}</span>
              <span className={deltaClass(s.delta)} data-testid={`bs-delta-${s.teamId}`}>
                {deltaGlyph(s.delta)}
              </span>
            </div>
          ) : (
            <div key={s.teamId} className="bs-shuffle-row">
              <span className="bs-shuffle-shroud mono">#{s.rank} — ?</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
