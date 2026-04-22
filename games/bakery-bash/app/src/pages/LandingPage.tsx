import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { useGameDispatch } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { PageShell } from "../components/ui/PageShell";
import { functions } from "../lib/firebase";

/**
 * Response shape returned by the `joinGame` Cloud Function.
 * Backend only sends back `{ gameId, playerId }` — the display name we sent
 * in the request is what we use locally.
 * See `backend/functions/index.js::exports.joinGame`.
 */
interface JoinGameResponse {
  gameId: string;
  playerId: string;
}

/**
 * Accepted join code format: 6 characters from the backend's unambiguous
 * alphabet — letters A-Z excluding I and O, digits 2-9 (excludes 0 and 1).
 * Must match `joinGame`'s server-side regex exactly so we surface a
 * friendly inline error instead of letting the request fire and bounce
 * back as a generic Firebase "internal"/"invalid-argument" toast.
 */
const JOIN_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * Team-name length matches the FRONTEND.md spec (2-40). Backend accepts up
 * to 60 for the underlying `bakeryName` payload; we stay inside the common
 * subset so both validators agree.
 */
const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 40;

/**
 * Normalize a team name so typo-tolerant matching still groups teammates
 * correctly. The backend derives `teamId` via
 * `bakeryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')`, so two teammates
 * typing "The Crumbs", "the crumbs  ", or "THE-CRUMBS" all land on the
 * same team. We preserve the user's visual casing for the outgoing
 * `bakeryName` value (display) while trimming whitespace so "  Crumbs "
 * and "Crumbs" still match.
 */
function normalizeTeamNameForSubmission(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const JOIN_FAILURE_MESSAGES: Record<string, string> = {
  unauthenticated: "Couldn't sign you in. Please reload and try again.",
  "invalid-argument":
    "Check the join code (6 letters/digits), name (2–40 characters), and team name (2–40 characters if set).",
  "not-found": "No game matches that join code. Double-check with your professor.",
  "failed-precondition": "This game has already started and isn't accepting new players.",
  "resource-exhausted":
    "This game is full. Ask the professor to open a new session.",
};

function humanizeJoinError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const fnErr = err as FunctionsError;
    const rawCode = fnErr.code || "";
    // Firebase error codes come through as `functions/not-found`, etc.
    const suffix = rawCode.split("/").pop() || rawCode;
    if (suffix && JOIN_FAILURE_MESSAGES[suffix]) {
      return JOIN_FAILURE_MESSAGES[suffix];
    }
    if (fnErr.message) return fnErr.message;
  }
  return "Could not join game. Please try again.";
}

export function LandingPage() {
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const navigate = useNavigate();
  const dispatch = useGameDispatch();
  const { user, loading: authLoading } = useAuth();

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = playerName.trim();
    const normalizedCode = gameCode.trim().toUpperCase();
    const normalizedTeamName = normalizeTeamNameForSubmission(teamName);

    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError("Please enter a display name between 2 and 40 characters.");
      return;
    }
    if (!JOIN_CODE_REGEX.test(normalizedCode)) {
      setError(
        "Join code must be 6 characters using letters A-Z (excluding I/O) and digits 2-9.",
      );
      return;
    }
    if (
      normalizedTeamName.length > 0 &&
      (normalizedTeamName.length < TEAM_NAME_MIN ||
        normalizedTeamName.length > TEAM_NAME_MAX)
    ) {
      setError(
        `Team name must be ${TEAM_NAME_MIN}-${TEAM_NAME_MAX} characters, or leave it blank to play solo.`,
      );
      return;
    }
    if (authLoading || !user) {
      setError("Still signing you in… please try again in a moment.");
      return;
    }

    setJoining(true);

    try {
      // Role + team are assigned by the backend (per BACKEND.md / DEC-21).
      // The backend derives `teamId` from `bakeryName`, so passing a
      // shared team name here is how teammates end up on the same team
      // without any separate "join team" step. Empty team name falls
      // back to the classic solo default ("<name>'s Bakery").
      const bakeryName =
        normalizedTeamName.length > 0
          ? normalizedTeamName
          : `${trimmedName}'s Bakery`;

      const joinGame = httpsCallable<
        { joinCode: string; displayName: string; bakeryName?: string },
        JoinGameResponse
      >(functions, "joinGame");

      const result = await joinGame({
        joinCode: normalizedCode,
        displayName: trimmedName,
        bakeryName,
      });
      const { gameId, playerId } = result.data;

      dispatch({
        type: "JOIN_GAME",
        payload: {
          gameId,
          playerId,
          gameCode: normalizedCode,
          player: {
            id: playerId,
            name: trimmedName,
            bakeryName,
            budget: 0,
            cumulativeRevenue: 0,
          },
        },
      });
      // Hand off to the team-assignment + naming step. Game phase listener
      // (mounted by GamePage) takes over routing once the professor starts
      // the round.
      navigate("/team");
    } catch (err) {
      setError(humanizeJoinError(err));
    } finally {
      setJoining(false);
    }
  };

  const disabled = joining || authLoading;

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
              placeholder="e.g. John"
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
              placeholder="e.g. ABC234"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">
              Team Name{" "}
              <span className="form-field__hint">
                (optional · same name as a teammate = same team)
              </span>
            </span>
            <input
              type="text"
              className="form-field__input"
              placeholder="Leave blank to play solo"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={TEAM_NAME_MAX}
            />
          </label>

          {error && <p className="landing-page__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={disabled}
          >
            {joining
              ? "Joining…"
              : authLoading
              ? "Signing you in…"
              : "Join Game"}
          </button>

          <p className="landing-page__footnote">
            Your role and team are assigned after you join.
          </p>
        </form>
      </div>
    </PageShell>
  );
}
