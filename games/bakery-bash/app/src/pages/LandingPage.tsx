import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { useGameDispatch } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { PageShell } from "../components/ui/PageShell";
import { functions } from "../lib/firebase";
import {
  PLAYER_ROLE_LABELS,
  type PlayerRole,
} from "../types/game";

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

const JOIN_FAILURE_MESSAGES: Record<string, string> = {
  unauthenticated: "Couldn't sign you in. Please reload and try again.",
  "invalid-argument":
    "Check the join code (6 letters/digits) and name (2–40 characters).",
  "not-found": "No game matches that join code. Double-check with your professor.",
  "failed-precondition": "This game has already started and isn't accepting new players.",
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

const ROLE_OPTIONS: PlayerRole[] = [
  "operations",
  "advertising",
  "finance",
  "solo",
];

const ROLE_DESCRIPTIONS: Record<PlayerRole, string> = {
  operations: "Picks quantities, sous chefs, maintenance",
  advertising: "Picks ad bids (TV / Radio / Newspaper / Billboard)",
  finance: "Picks chef bids and roster decisions",
  solo: "All three buttons enabled (no teammates)",
};

// Stash role + teamName so a refresh during a round doesn't silently demote
// the player to "solo". Cleared on JOIN_GAME for the next session.
const ROLE_KEY = "fenrix.bakery.role";
const TEAM_KEY = "fenrix.bakery.teamName";

function readPersistedRole(): PlayerRole {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    if (v && ROLE_OPTIONS.includes(v as PlayerRole)) return v as PlayerRole;
  } catch {
    /* localStorage unavailable in some embedded contexts */
  }
  return "solo";
}
function readPersistedTeamName(): string {
  try {
    return localStorage.getItem(TEAM_KEY) ?? "";
  } catch {
    return "";
  }
}

export function LandingPage() {
  const [playerName, setPlayerName] = useState("");
  const [teamName, setTeamName] = useState(readPersistedTeamName());
  const [gameCode, setGameCode] = useState("");
  const [role, setRole] = useState<PlayerRole>(readPersistedRole());
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const navigate = useNavigate();
  const dispatch = useGameDispatch();
  const { user, loading: authLoading } = useAuth();

  // Persist role/teamName so a refresh keeps them.
  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore */
    }
  }, [role]);
  useEffect(() => {
    try {
      localStorage.setItem(TEAM_KEY, teamName);
    } catch {
      /* ignore */
    }
  }, [teamName]);

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = playerName.trim();
    const trimmedTeam = teamName.trim();
    const normalizedCode = gameCode.trim().toUpperCase();

    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError("Please enter a display name between 2 and 40 characters.");
      return;
    }
    if (trimmedTeam.length > 0 && (trimmedTeam.length < 2 || trimmedTeam.length > 40)) {
      setError("Team name must be 2–40 characters, or leave it blank.");
      return;
    }
    if (!JOIN_CODE_REGEX.test(normalizedCode)) {
      setError(
        "Join code must be 6 characters using letters A-Z (excluding I/O) and digits 2-9.",
      );
      return;
    }
    if (authLoading || !user) {
      setError("Still signing you in… please try again in a moment.");
      return;
    }

    setJoining(true);

    try {
      // joinGame currently accepts `bakeryName` as the team-facing label
      // (per `backend/functions/index.js::exports.joinGame`). Once BE-20
      // ships per-team docs we'll start sending `teamName` + `role`
      // explicitly; today they're carried as a `bakeryName` payload + a
      // local role state.
      const joinGame = httpsCallable<
        { joinCode: string; displayName: string; bakeryName?: string },
        JoinGameResponse
      >(functions, "joinGame");

      const teamLabel =
        trimmedTeam.length > 0 ? trimmedTeam : `${trimmedName}'s Bakery`;

      const result = await joinGame({
        joinCode: normalizedCode,
        displayName: trimmedName,
        bakeryName: teamLabel,
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
            bakeryName: teamLabel,
            budget: 0,
            cumulativeRevenue: 0,
            teamName: trimmedTeam.length > 0 ? trimmedTeam : undefined,
            role,
          },
          role,
          teamName: trimmedTeam.length > 0 ? trimmedTeam : null,
        },
      });
      navigate("/lobby");
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
            <span className="form-field__label">
              Team Name <span className="form-field__hint">(optional)</span>
            </span>
            <input
              type="text"
              className="form-field__input"
              placeholder="e.g. Crumb Lords"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
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

          <fieldset className="form-field role-picker">
            <legend className="form-field__label">Your Role</legend>
            <p className="form-field__hint role-picker__intro">
              Each teammate picks a different role — only that role's button
              is active on their device. Pick "Solo" if you have no teammates.
            </p>
            {ROLE_OPTIONS.map((r) => (
              <label key={r} className="role-picker__option">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                />
                <span className="role-picker__option-name">
                  {PLAYER_ROLE_LABELS[r]}
                </span>
                <span className="role-picker__option-desc">
                  {ROLE_DESCRIPTIONS[r]}
                </span>
              </label>
            ))}
          </fieldset>

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
        </form>
      </div>
    </PageShell>
  );
}
