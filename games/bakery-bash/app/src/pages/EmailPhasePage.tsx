import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { useGame } from "../contexts/GameContext";
import { useGamePhaseNav } from "../hooks/useGamePhaseNav";
import { PageShell } from "../components/ui/PageShell";
import { functions } from "../lib/firebase";
import { parseGamePhase } from "../types/game";
import { monthNameForRound } from "../lib/dateSystem";

/**
 * FE-06 — `/game/email` phase page (round briefing).
 *
 * Shows a big "Round N" hero while the game is in a `round_N_email` phase;
 * when the professor advances to `round_N_decide`, this page auto-navigates.
 */

const FLOATS = [
  "croissant",
  "coffee",
  "bagel",
  "cookie",
  "matcha",
  "sandwich",
] as const;

const ROUND1_AUTO_ADVANCE_MS = 5000;

export function EmailPhasePage() {
  useGamePhaseNav();
  const { gameId, currentRound, phase } = useGame();
  const navigate = useNavigate();
  const [autoAdvancing, setAutoAdvancing] = useState(false);

  useEffect(() => {
    if (!gameId || !phase) return;
    const parsed = parseGamePhase(phase, currentRound);
    if (parsed.base === "decide") navigate("/game/decide");
    else if (parsed.base === "bid_ad" || parsed.base === "bid_chef")
      navigate("/auction");
    else if (parsed.base === "roster") navigate("/game/roster");
    else if (parsed.base === "simulating" || parsed.base === "results_ready")
      navigate("/game");
    else if (parsed.base === "game_over") navigate("/game/conclusion");
  }, [phase, currentRound, gameId, navigate]);

  // Round 1 transition: auto-advance after 5s without requiring any player
  // interaction. The professor would normally press "Advance" after the
  // briefing; for Round 1 specifically we trigger that automatically so the
  // class can flow straight into the Decide screen. Guarded to Round 1 only.
  useEffect(() => {
    if (!gameId || !phase) return;
    const parsed = parseGamePhase(phase, currentRound);
    if (parsed.base !== "email" || currentRound !== 1) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setAutoAdvancing(true);
      const advance = httpsCallable<
        { gameId: string; expectedFromPhase?: string },
        { phase?: string }
      >(functions, "advanceGamePhase");
      advance({ gameId, expectedFromPhase: phase }).catch((err) => {
        // Non-professor callers will hit permission-denied; that's fine —
        // the professor's own tab will own the advance. We swallow quietly
        // so student browsers don't show a scary error.
        console.debug("round1 auto-advance skipped:", err);
      });
    }, ROUND1_AUTO_ADVANCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameId, phase, currentRound]);

  const roundLabel = currentRound && currentRound > 0 ? currentRound : "—";
  const monthName =
    typeof currentRound === "number" ? monthNameForRound(currentRound) : null;

  return (
    <PageShell className="round-briefing">
      <div className="round-briefing__stage" aria-live="polite">
        {FLOATS.map((name) => (
          <img
            key={name}
            src={`/assets/products/${name}.svg`}
            alt=""
            aria-hidden="true"
            className={`round-briefing__float round-briefing__float--${name}`}
          />
        ))}

        <div className="round-briefing__panel">
          <div className="round-briefing__eyebrow">Get Ready To Bake</div>
          <div className="round-briefing__round">
            <span className="round-briefing__round-word">Round</span>
            <span className="round-briefing__round-number">{roundLabel}</span>
          </div>
          {monthName && (
            <div className="round-briefing__month" aria-label="Calendar month">
              {monthName}
            </div>
          )}
          <div className="round-briefing__tagline">
            {autoAdvancing
              ? "Opening the bakery…"
              : "Ovens hot. Beans ground. Let's go."}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
