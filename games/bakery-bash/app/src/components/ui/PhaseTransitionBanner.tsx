import { useEffect, useState } from "react";
import {
  cancelPhaseNav,
  flushPhaseNav,
  subscribePhaseNav,
  type PhaseNavState,
} from "../../lib/phaseNav";

/**
 * Top-of-viewport banner that surfaces the 7-second grace window between a
 * backend phase change and the actual client-side route swap (see
 * `lib/phaseNav.ts`). While pending:
 *   - shows the target page and a live seconds countdown
 *   - offers a "Go now" button that skips the wait
 *   - offers a "Stay here" button that cancels the pending nav (useful
 *     when a teammate is mid-submit and the professor accidentally
 *     advanced the game)
 *
 * Renders nothing when `state.kind === 'idle'`, so it's safe to mount at
 * the app root next to `GamePhaseListener`.
 */
const TARGET_LABELS: Array<{ prefix: string; label: string }> = [
  { prefix: "/auction", label: "auction" },
  { prefix: "/game/email", label: "market email" },
  { prefix: "/game/roster", label: "chef roster" },
  { prefix: "/game/conclusion", label: "final results" },
  { prefix: "/game", label: "next phase" },
  { prefix: "/leaderboard", label: "leaderboard" },
];

function describeTarget(target: string): string {
  const hit = TARGET_LABELS.find((t) => target.startsWith(t.prefix));
  return hit ? hit.label : "next page";
}

export function PhaseTransitionBanner() {
  const [state, setState] = useState<PhaseNavState>({ kind: "idle" });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => subscribePhaseNav(setState), []);

  useEffect(() => {
    if (state.kind !== "pending") return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [state.kind]);

  if (state.kind !== "pending") return null;

  const secondsLeft = Math.max(0, Math.ceil((state.firesAt - now) / 1000));
  const label = describeTarget(state.target);

  return (
    <div className="phase-transition-banner" role="status" aria-live="polite">
      <div className="phase-transition-banner__body">
        <span className="phase-transition-banner__label">
          Moving to <strong>{label}</strong> in {secondsLeft}s…
        </span>
        <div className="phase-transition-banner__actions">
          <button
            type="button"
            className="btn btn--ghost phase-transition-banner__btn"
            onClick={cancelPhaseNav}
            title="Cancel the pending page switch — stay on this page."
          >
            Stay here
          </button>
          <button
            type="button"
            className="btn btn--primary phase-transition-banner__btn"
            onClick={flushPhaseNav}
            title="Skip the countdown and go now."
          >
            Go now
          </button>
        </div>
      </div>
    </div>
  );
}
