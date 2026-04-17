import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { useGameDispatch } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { functions } from "../lib/firebase";
import { PageShell } from "../components/ui/PageShell";

const JOIN_CODE_PATTERN = /^[A-Z0-9]{6}$/;

interface JoinGameRequest {
  joinCode: string;
  displayName: string;
}

interface JoinGameResponse {
  uid: string;
  gameId: string;
  playerId: string;
  displayName: string;
  joinedAt: number | null;
}

const joinGame = httpsCallable<JoinGameRequest, JoinGameResponse>(
  functions,
  "joinGame"
);

function isFunctionsError(err: unknown): err is FunctionsError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  );
}

function joinErrorMessage(err: unknown): string {
  if (isFunctionsError(err)) {
    switch (err.code) {
      case "functions/unauthenticated":
        return "Couldn't sign you in. Refresh and try again.";
      case "functions/invalid-argument":
        return err.message || "That join code or name doesn't look right.";
      case "functions/not-found":
        return "No game found for that code. Double-check with the professor.";
      case "functions/failed-precondition":
        return "This game has already started or ended.";
      default:
        return err.message || "Couldn't join the game. Try again.";
    }
  }
  return "Couldn't join the game. Try again.";
}

export function LandingPage() {
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const navigate = useNavigate();
  const dispatch = useGameDispatch();
  const { user, loading: authLoading } = useAuth();

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = playerName.trim();
    const trimmedCode = gameCode.trim().toUpperCase();

    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError("Name must be 2–40 characters.");
      return;
    }
    if (!JOIN_CODE_PATTERN.test(trimmedCode)) {
      setError("Game code must be 6 letters or digits (e.g. ABC123).");
      return;
    }
    if (authLoading || !user) {
      setError("Still signing you in. Try again in a moment.");
      return;
    }

    setJoining(true);

    try {
      const result = await joinGame({
        joinCode: trimmedCode,
        displayName: trimmedName,
      });
      const { gameId, playerId, displayName } = result.data;

      dispatch({
        type: "JOIN_GAME",
        payload: {
          gameId,
          gameCode: trimmedCode,
          player: {
            id: playerId,
            name: displayName,
            bakeryName: displayName,
            budget: 0,
            cumulativeRevenue: 0,
          },
        },
      });
      navigate("/lobby");
    } catch (err) {
      setError(joinErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const isBusy = joining || authLoading;

  return (
    <PageShell className="landing-page">
      <div className="landing-page__card">
        <h1 className="landing-page__title">🥐 Bakery Bash</h1>
        <p className="landing-page__subtitle">
          Run your bakery. Outprice the competition. Win.
        </p>

        <form className="landing-page__form" onSubmit={handleJoin}>
          <label className="form-field">
            <span className="form-field__label">Your Name</span>
            <input
              type="text"
              className="form-field__input"
              placeholder="e.g. The Rolling Scone"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={40}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">Game Code</span>
            <input
              type="text"
              className="form-field__input"
              placeholder="e.g. ABC123"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </label>

          {error && <p className="landing-page__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={isBusy}
          >
            {joining ? "Joining…" : authLoading ? "Signing in…" : "Join Game"}
          </button>
        </form>
      </div>
    </PageShell>
  );
}
