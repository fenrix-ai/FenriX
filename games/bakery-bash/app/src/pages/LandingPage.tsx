import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useGameDispatch } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { PageShell } from "../components/ui/PageShell";
import { functions, storage } from "../lib/firebase";

interface JoinGameResponse {
  gameId: string;
  playerId: string;
}

interface CreateTeamResponse {
  gameId: string;
  playerId: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
}

interface LobbyTeam {
  teamId: string;
  name: string;
  logoUrl: string | null;
  memberCount: number;
}

interface GetTeamsInLobbyResponse {
  teams: LobbyTeam[];
}

const JOIN_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const JOIN_FAILURE_MESSAGES: Record<string, string> = {
  unauthenticated: "Couldn't sign you in. Please reload and try again.",
  "invalid-argument":
    "Check the game code (6 letters/digits) and name (2–40 characters).",
  "not-found":
    "No game matches that game code. Double-check with your professor.",
  "failed-precondition":
    "This game has already started and isn't accepting new players.",
  "already-exists":
    "A team with that name already exists. Try a different name.",
  "resource-exhausted": "This game is full.",
};

function humanizeJoinError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const fnErr = err as FunctionsError;
    const rawCode = fnErr.code || "";
    const suffix = rawCode.split("/").pop() || rawCode;
    if (suffix && JOIN_FAILURE_MESSAGES[suffix]) {
      return JOIN_FAILURE_MESSAGES[suffix];
    }
    if (fnErr.message) return fnErr.message;
  }
  return "Something went wrong. Please try again.";
}

type ModalKind = "create" | "join" | null;

/**
 * Landing page (redesigned Apr 22).
 *
 * Two primary actions on the main card: **Create Team** and **Join Team**.
 * Each opens a modal:
 *   - Create Team modal: team name + optional logo upload + submit.
 *   - Join Team modal: scrollable list of teams already in the lobby.
 *
 * Once the player creates a team successfully (but before the "Join Game"
 * press), we surface the created team's logo + name above the Join button
 * so they can confirm the team was registered before they commit. The
 * logo upload has been removed from the Join Game panel — logos are now
 * authored exclusively inside the Create Team popup.
 */
export function LandingPage() {
  const [modal, setModal] = useState<ModalKind>(null);

  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");

  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [createdTeam, setCreatedTeam] = useState<CreateTeamResponse | null>(
    null,
  );

  const [lobbyTeams, setLobbyTeams] = useState<LobbyTeam[] | null>(null);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const dispatch = useGameDispatch();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (modal !== "join") {
      setLobbyTeams(null);
      return;
    }
    const normalized = gameCode.trim().toUpperCase();
    if (!JOIN_CODE_REGEX.test(normalized)) {
      setLobbyTeams(null);
      return;
    }
    if (authLoading || !user) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLobbyLoading(true);
      setError(null);
      try {
        const getTeamsInLobby = httpsCallable<
          { joinCode: string },
          GetTeamsInLobbyResponse
        >(functions, "getTeamsInLobby");
        const result = await getTeamsInLobby({ joinCode: normalized });
        if (!cancelled) setLobbyTeams(result.data.teams ?? []);
      } catch (err) {
        if (!cancelled) {
          setLobbyTeams([]);
          setError(humanizeJoinError(err));
        }
      } finally {
        if (!cancelled) setLobbyLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [modal, gameCode, authLoading, user]);

  useEffect(() => {
    if (modal === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const resetCreateFields = () => {
    setTeamName("");
    setLogoFile(null);
    setLogoPreview(null);
  };

  const validateNameAndCode = (): boolean => {
    const trimmedPlayer = playerName.trim();
    const normalizedCode = gameCode.trim().toUpperCase();
    if (trimmedPlayer.length < 2 || trimmedPlayer.length > 40) {
      setError("Please enter your name (2–40 characters).");
      return false;
    }
    if (!JOIN_CODE_REGEX.test(normalizedCode)) {
      setError(
        "Game code must be 6 characters using letters A–Z (excluding I/O) and digits 2–9.",
      );
      return false;
    }
    if (authLoading || !user) {
      setError("Still signing you in… please try again in a moment.");
      return false;
    }
    return true;
  };

  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateNameAndCode()) return;

    const trimmedPlayer = playerName.trim();
    const trimmedTeam = teamName.trim();
    const normalizedCode = gameCode.trim().toUpperCase();

    if (trimmedTeam.length < 2 || trimmedTeam.length > 30) {
      setError("Team name must be 2–30 characters.");
      return;
    }

    setSubmitting(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop() || "png";
        const slug = trimmedTeam
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 50);
        const storageRef = ref(
          storage,
          `teams/${normalizedCode}/${slug || "team"}/logo.${ext}`,
        );
        await uploadBytes(storageRef, logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }

      const createTeam = httpsCallable<
        {
          joinCode: string;
          teamName: string;
          displayName: string;
          logoUrl?: string;
        },
        CreateTeamResponse
      >(functions, "createTeam");
      const result = await createTeam({
        joinCode: normalizedCode,
        teamName: trimmedTeam,
        displayName: trimmedPlayer,
        ...(logoUrl ? { logoUrl } : {}),
      });
      const { gameId, playerId, teamId } = result.data;

      dispatch({
        type: "JOIN_GAME",
        payload: {
          gameId,
          playerId,
          gameCode: normalizedCode,
          player: {
            id: playerId,
            name: trimmedPlayer,
            bakeryName: trimmedTeam,
            budget: 0,
            cumulativeRevenue: 0,
          },
        },
      });
      setCreatedTeam(result.data);
      setModal(null);
      navigate("/team", { state: { teamId } });
    } catch (err) {
      setError(humanizeJoinError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    setError(null);
    if (!validateNameAndCode()) return;
    const normalizedCode = gameCode.trim().toUpperCase();
    const trimmedPlayer = playerName.trim();

    const selectedTeam = lobbyTeams?.find((t) => t.teamId === teamId);
    if (!selectedTeam) {
      setError("That team is no longer available. Please pick another.");
      return;
    }

    setSelectedTeamId(teamId);
    setSubmitting(true);
    try {
      const joinGame = httpsCallable<
        {
          joinCode: string;
          displayName: string;
          teamId: string;
          bakeryName?: string;
        },
        JoinGameResponse
      >(functions, "joinGame");
      const result = await joinGame({
        joinCode: normalizedCode,
        displayName: trimmedPlayer,
        teamId: selectedTeam.teamId,
        bakeryName: selectedTeam.name,
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
            name: trimmedPlayer,
            bakeryName: selectedTeam.name,
            budget: 0,
            cumulativeRevenue: 0,
          },
        },
      });
      setModal(null);
      navigate("/team", { state: { teamId: selectedTeam.teamId } });
    } catch (err) {
      setError(humanizeJoinError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || authLoading;

  return (
    <PageShell className="landing-page">
      <div className="landing-page__card">
        <h1 className="landing-page__title">🥐 Bakery Bash</h1>
        <p className="landing-page__subtitle">
          Run your bakery. Outprice the competition. Win.
        </p>

        <div className="landing-page__shared-fields">
          <label className="form-field">
            <span className="form-field__label">Your Name</span>
            <input
              type="text"
              className="form-field__input"
              placeholder="e.g. John"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={40}
              disabled={disabled}
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
              disabled={disabled}
            />
          </label>
        </div>

        {createdTeam && (
          <div
            className="landing-page__created-team"
            aria-label="Team you just created"
          >
            <div className="landing-page__created-team-label">
              Team Created
            </div>
            <div className="landing-page__created-team-card">
              {createdTeam.logoUrl ? (
                <img
                  src={createdTeam.logoUrl}
                  alt=""
                  className="landing-page__created-team-logo"
                />
              ) : (
                <div
                  className="landing-page__created-team-logo landing-page__created-team-logo--placeholder"
                  aria-hidden
                >
                  🥐
                </div>
              )}
              <span className="landing-page__created-team-name">
                {createdTeam.teamName}
              </span>
            </div>
          </div>
        )}

        <div className="landing-page__primary-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setError(null);
              resetCreateFields();
              setModal("create");
            }}
            disabled={disabled}
          >
            Create Team
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setError(null);
              setModal("join");
            }}
            disabled={disabled}
          >
            Join Team
          </button>
        </div>

        {error && !modal && (
          <p className="landing-page__error" role="alert">
            {error}
          </p>
        )}

        <a href="/how-to-play" className="landing-page__how-to-play-link">
          How to Play
        </a>
      </div>

      {modal === "create" && (
        <div
          className="landing-modal__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-team-title"
          onClick={() => setModal(null)}
        >
          <form
            className="landing-modal__panel"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateTeam}
          >
            <header className="landing-modal__header">
              <h2 id="create-team-title" className="landing-modal__title">
                Create a Team
              </h2>
            </header>

            <label className="form-field">
              <span className="form-field__label">Team Name</span>
              <input
                type="text"
                className="form-field__input"
                placeholder="e.g. Sourdough Squad"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={30}
                disabled={disabled}
                autoFocus
              />
            </label>

            <label className="form-field">
              <span className="form-field__label">
                Team Logo (optional)
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="form-field__input"
                disabled={disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setLogoFile(file);
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) =>
                      setLogoPreview(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  } else {
                    setLogoPreview(null);
                  }
                }}
              />
              {logoPreview && (
                <img
                  src={logoPreview}
                  className="join-form__logo-preview"
                  alt="Team logo preview"
                />
              )}
            </label>

            {error && (
              <p className="landing-page__error" role="alert">
                {error}
              </p>
            )}

            <div className="landing-modal__actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={disabled}
              >
                {submitting ? "Submitting…" : "Submit Team"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setModal(null)}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {modal === "join" && (
        <div
          className="landing-modal__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-team-title"
          onClick={() => setModal(null)}
        >
          <div
            className="landing-modal__panel landing-modal__panel--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="landing-modal__header">
              <h2 id="join-team-title" className="landing-modal__title">
                Join a Team
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setModal(null)}
              >
                Close
              </button>
            </header>

            {!JOIN_CODE_REGEX.test(gameCode.trim().toUpperCase()) && (
              <p className="landing-page__hint">
                Enter your game code above to see registered teams.
              </p>
            )}

            {JOIN_CODE_REGEX.test(gameCode.trim().toUpperCase()) && (
              <>
                {lobbyLoading && (
                  <p className="landing-page__hint">Loading teams…</p>
                )}
                {!lobbyLoading &&
                  lobbyTeams &&
                  lobbyTeams.length === 0 && (
                    <div className="landing-page__empty-teams">
                      <p>No teams yet. Be the first to create one.</p>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          resetCreateFields();
                          setModal("create");
                        }}
                      >
                        Create a Team
                      </button>
                    </div>
                  )}
                {!lobbyLoading &&
                  lobbyTeams &&
                  lobbyTeams.length > 0 && (
                    <ul
                      className="landing-modal__team-list"
                      role="listbox"
                    >
                      {lobbyTeams.map((t, idx) => (
                        <li key={t.teamId} className="landing-modal__team-row">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedTeamId === t.teamId}
                            className="landing-modal__team-btn"
                            onClick={() => void handleJoinTeam(t.teamId)}
                            disabled={disabled}
                          >
                            <span className="landing-modal__team-index">
                              {idx + 1}
                            </span>
                            {t.logoUrl ? (
                              <img
                                src={t.logoUrl}
                                alt=""
                                className="landing-modal__team-logo"
                              />
                            ) : (
                              <div
                                className="landing-modal__team-logo landing-modal__team-logo--placeholder"
                                aria-hidden
                              >
                                🥐
                              </div>
                            )}
                            <div className="landing-modal__team-meta">
                              <span className="landing-modal__team-name">
                                {t.name}
                              </span>
                              <span className="landing-modal__team-count">
                                {t.memberCount}{" "}
                                {t.memberCount === 1
                                  ? "member"
                                  : "members"}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </>
            )}

            {error && (
              <p className="landing-page__error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
