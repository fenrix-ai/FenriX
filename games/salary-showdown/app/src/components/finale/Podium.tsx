import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { FranchiseMark } from '../franchise/FranchiseMark';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { StandingsRow, TeamDoc } from '../../types/models';
import styles from '../../pages/FinalePage.module.css';

const STEP_MS = 1200;
const CELEBRATION_MS = 2500;

export function Podium({ rows, teams, celebrationKey }: {
  rows: StandingsRow[];
  teams: ReadonlyMap<string, TeamDoc>;
  celebrationKey: string;
}) {
  const reducedMotion = useReducedMotion();
  const ranked = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank).slice(0, 3), [rows]);
  const revealOrder = useMemo(() => [...ranked].reverse(), [ranked]);
  const [visibleCount, setVisibleCount] = useState(() => reducedMotion
    ? revealOrder.length : Math.min(1, revealOrder.length));
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    setVisibleCount(reducedMotion ? revealOrder.length : Math.min(1, revealOrder.length));
  }, [celebrationKey, revealOrder.length]); // eslint-disable-line react-hooks/exhaustive-deps -- preference changes may reveal more, never hide progress

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount((count) => Math.max(count, revealOrder.length));
    }
  }, [reducedMotion, revealOrder.length]);

  useEffect(() => {
    if (reducedMotion || visibleCount >= revealOrder.length) return undefined;
    const timer = window.setTimeout(() => setVisibleCount((count) =>
      Math.min(revealOrder.length, count + 1)), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, revealOrder.length, visibleCount]);

  const complete = visibleCount >= revealOrder.length;
  useEffect(() => {
    if (!complete || !celebrationKey) return undefined;
    const storageKey = `ss.finaleCelebrated.${celebrationKey}`;
    if (sessionStorage.getItem(storageKey)) return undefined;
    sessionStorage.setItem(storageKey, '1');
    if (reducedMotion) return undefined;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [celebrationKey, complete, reducedMotion]);

  const visibleIds = new Set(revealOrder.slice(0, visibleCount).map((row) => row.teamId));
  const podiumOrder = [ranked[1], ranked[0], ranked[2]]
    .filter((row): row is StandingsRow => Boolean(row && visibleIds.has(row.teamId)));

  return (
    <section className={styles.podiumSection} data-testid="podium" aria-labelledby="podium-title">
      <div className={styles.podiumHeading}>
        <div>
          <p className={styles.sectionLabel}>Season complete</p>
          <h2 id="podium-title">Final Podium</h2>
        </div>
        {!complete && !reducedMotion && (
          <button type="button" className={styles.skipButton}
            onClick={() => setVisibleCount(revealOrder.length)}>
            Skip podium animation
          </button>
        )}
      </div>

      <div className={styles.podium}>
        {podiumOrder.map((row) => {
          const team = teams.get(row.teamId);
          return (
            <article key={row.teamId}
              className={`${styles.podiumCard} ${row.rank === 1 ? styles.champion : ''}`}>
              <FranchiseMark teamId={row.teamId} name={row.name}
                identity={team?.identity} size={row.rank === 1 ? 72 : 58} />
              <span className={styles.podiumRank}>#{row.rank}</span>
              <strong>{row.name}</strong>
              <span className="mono">{row.wins}–{row.losses}</span>
            </article>
          );
        })}
      </div>

      <p className={styles.podiumStatus} aria-live="polite">
        {complete ? `${ranked[0]?.name ?? 'Champion'} finishes first.`
          : `Podium reveal ${visibleCount} of ${revealOrder.length}.`}
      </p>
      {celebrating && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => (
            <i key={index} data-testid="confetti-particle"
              style={{ '--particle': index } as CSSProperties} />
          ))}
        </div>
      )}
    </section>
  );
}
