import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useGame, useGameDispatch } from "../contexts/GameContext";
import { db } from "../lib/firebase";
import { RoundHeader } from "../components/game/RoundHeader";
import { BakeryView } from "../components/game/BakeryView";
import { GameSidebar } from "../components/game/GameSidebar";
import { PageShell } from "../components/ui/PageShell";
import { SimulatePhase } from "./phases/SimulatePhase";
import { ResultsPhase } from "./phases/ResultsPhase";
import type { GameConfigParams, GamePhase } from "../types/game";

const KNOWN_PHASES: GamePhase[] = [
  "lobby",
  "email",
  "decide",
  "bid",
  "simulating",
  "results_ready",
  "game_over",
];

function isGamePhase(value: unknown): value is GamePhase {
  return typeof value === "string" && (KNOWN_PHASES as string[]).includes(value);
}

export function GamePage() {
  const { gameId, phase, currentRound, pendingDecision, player } = useGame();
  const playerId = player?.id ?? null;
  const dispatch = useGameDispatch();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastSyncedRoundRef = useRef<number | null>(null);

  // Subscribe to /games/{gameId} for phase + round changes.
  // The professor advances the state machine; clients react via this listener.
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    const unsubscribe = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      const nextPhase = data.phase;
      if (isGamePhase(nextPhase)) {
        dispatch({ type: "SET_PHASE", payload: nextPhase });
      }

      const nextRound = data.currentRound;
      if (typeof nextRound === "number" && nextRound !== lastSyncedRoundRef.current) {
        lastSyncedRoundRef.current = nextRound;
        dispatch({ type: "SET_ROUND", payload: nextRound });
      }
    });
    return unsubscribe;
  }, [gameId, dispatch]);

  // Subscribe to /games/{gameId}/config/params so decision UI (e.g. StaffTab)
  // can show server-driven costs instead of hardcoded constants.
  useEffect(() => {
    if (!gameId) return;
    const configRef = doc(db, "games", gameId, "config", "params");
    const unsubscribe = onSnapshot(configRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const config: GameConfigParams = {
        costPerStaffPerRound:
          typeof data.costPerStaffPerRound === "number"
            ? data.costPerStaffPerRound
            : 50,
        unitCostPerProduct:
          typeof data.unitCostPerProduct === "number"
            ? data.unitCostPerProduct
            : 1,
        startingBudget:
          typeof data.startingBudget === "number" ? data.startingBudget : 2000,
      };
      dispatch({ type: "SET_CONFIG", payload: config });
    });
    return unsubscribe;
  }, [gameId, dispatch]);

  // The /auction route hosts the BidPhase UI; navigate there when backend
  // moves the game into the `bid` phase. Phase routing is otherwise handled
  // below by rendering the appropriate component for the current phase.
  useEffect(() => {
    if (phase === "bid") {
      navigate("/auction");
    }
  }, [phase, navigate]);

  const isDecisionPhase = phase === "decide";

  const handleSubmit = async () => {
    if (!gameId || !playerId) {
      setSubmitError("You're not connected to a game yet.");
      return;
    }
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const playerRef = doc(db, "games", gameId, "players", playerId);
      // Security rules only permit changes to displayName, pendingDecision, pendingBids.
      // Snapshot the current draft and mark it submitted; backend snapshots into
      // /decisions/{roundId} when the phase advances.
      await updateDoc(playerRef, {
        pendingDecision: {
          ...pendingDecision,
          submitted: true,
          submittedAt: serverTimestamp(),
        },
      });
      // Optimistically advance to the bid (auction) phase so the player isn't
      // stuck on the dashboard while we wait for the server-driven phase update.
      dispatch({ type: "SET_PHASE", payload: "bid" });
    } catch (err) {
      console.error("Failed to save decisions", err);
      setSubmitError("Couldn't save your decisions. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "simulating") {
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <div className="game-page__content">
          <SimulatePhase />
        </div>
      </PageShell>
    );
  }

  if (phase === "results_ready" || phase === "game_over") {
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <div className="game-page__content">
          <ResultsPhase />
        </div>
      </PageShell>
    );
  }

  if (!isDecisionPhase) {
    // Lobby / email / bid (handled by /auction route) — render a lightweight
    // shell while the listener catches up or the navigation fires.
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <div className="game-page__content">
          <p className="game-page__waiting">
            Waiting for the next phase…
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="game-page game-page--wide">
      <RoundHeader />
      <div className="game-page__dashboard">
        <BakeryView />
        <GameSidebar />
      </div>
      {submitError && (
        <p className="game-page__error" role="alert">
          {submitError}
        </p>
      )}
      <button
        className="btn btn--primary game-page__submit"
        onClick={handleSubmit}
        disabled={submitting || !gameId || !playerId}
        data-current-round={currentRound}
      >
        {submitting ? "Submitting…" : "Submit Decisions"}
      </button>
    </PageShell>
  );
}
