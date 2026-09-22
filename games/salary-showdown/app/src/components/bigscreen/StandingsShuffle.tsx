import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { computeShuffleSteps, deltaClass, deltaGlyph, type ShuffleStep } from '../../lib/shuffle';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { FranchiseMark } from '../franchise/FranchiseMark';
import { useWallPage, WallPageStatus } from './useWallPage';

const PAGE_SIZE = 7;

// RESULTS wall: playback of computeShuffleSteps(round.standings). One reveal
// per 0.8s, bottom-up (rank N first, rank 1 last); the top three render as
// '#<rank> — ?' until their own step. In round 5 the last three reveals slow
// to 3s each — the championship reveal. Round 5 IS the final round:
// config.totalRounds is decorative (Plan 1 ruling) and is deliberately not
// consulted. Rest state: the full table with deltas, held until the professor
// advances. Display-only; facts only (rank, name, record, movement).
export function StandingsShuffle() {
  const { gameId, game, round } = useProfessor();
  const steps = useMemo(() => computeShuffleSteps(round?.standings ?? []), [round]);
  const championship = game?.round === 5;
  const reduced = useReducedMotion();
  const scope = `${gameId ?? 'no-game'}/${game?.round ?? 0}`;
  const [progress, setProgress] = useState({ scope, shown: 0 });
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const ready = steps.length > 0;
  const shown = progress.scope === scope ? Math.min(progress.shown, steps.length) : 0;
  const pager = useWallPage(steps.length, PAGE_SIZE, scope, !reduced);

  useEffect(() => { // cosmetic client pacing — the standings are already server-final
    setProgress((current) => current.scope === scope ? current : { scope, shown: 0 });
    if (!ready) return undefined;
    let cancelled = false;
    let id: ReturnType<typeof setTimeout>;
    const schedule = (i: number) => { // i = index of the NEXT step to reveal
      const count = stepsRef.current.length;
      const slow = championship && i >= count - 3;
      id = setTimeout(() => {
        if (cancelled) return;
        setProgress((current) => current.scope === scope
          ? { ...current, shown: Math.max(current.shown, Math.min(count, i + 1)) }
          : current);
        if (i + 1 < count) schedule(i + 1);
      }, slow ? 3000 : 800);
    };
    schedule(0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [championship, ready, scope]);

  useEffect(() => {
    if (!reduced || !ready) return;
    setProgress((current) => current.scope === scope
      ? { ...current, shown: Math.max(current.shown, steps.length) }
      : { scope, shown: steps.length });
  }, [ready, reduced, scope, steps.length]);

  if (!game) return null;
  const revealed = new Set(steps.slice(0, shown).map((s) => s.teamId));
  const rows: ShuffleStep[] = [...steps].sort((a, b) => a.rank - b.rank);
  const complete = shown >= steps.length;
  const latest = shown > 0 ? steps[Math.min(shown, steps.length) - 1] : null;
  const activePage = latest ? Math.floor((latest.rank - 1) / PAGE_SIZE) : 0;
  const page = complete ? pager.page : activePage;
  const start = page * PAGE_SIZE;
  const end = Math.min(rows.length, (page + 1) * PAGE_SIZE);
  const visibleRows = reduced ? rows : rows.slice(start, end);
  return (
    <main className="bigscreen bs-results">
      <header>
        <div className="brand bs-brand">Salary Showdown</div>
        <h1 className="bs-phase-title">{PHASE_NAMES.RESULTS}</h1>
        <p className="bs-sub">Round {game.round}</p>
      </header>
      <div className={`bs-shuffle${reduced ? ' is-static-grid' : ''}`} data-testid="bs-shuffle">
        {visibleRows.map((s) => {
          // Bottom-up reveal: an unrevealed row is absent — EXCEPT the top
          // three, whose shrouded placeholders hold the podium slots open.
          if (!revealed.has(s.teamId) && !s.shroud) return null;
          return revealed.has(s.teamId) ? (
            <div key={s.teamId} className="bs-shuffle-row" data-testid="bs-shuffle-row">
              <span className="bs-shuffle-rank mono">#{s.rank}</span>
              <FranchiseMark teamId={s.teamId} name={s.name} size={30} />
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
      {!reduced && (
        <WallPageStatus page={page} pageCount={pager.pageCount} start={start} end={end}
          noun="ranks" testId="bs-page-status" />
      )}
    </main>
  );
}
