import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useGame, useGameDispatch } from "../contexts/GameContext";
import { PageShell } from "../components/ui/PageShell";
import {
  PLAYER_ROLE_LABELS,
  type GamePhaseString,
  type PlayerRole,
} from "../types/game";

/**
 * /team — post-join landing where the player learns which team they're on,
 * sees their teammates, and (any of them) can name the team. The team name
 * lives at `/games/{gameId}/teams/{teamId}.name` and is editable by any
 * team member, with realtime sync via `onSnapshot`.
 *
 * This page intentionally does NOT collect a role from the player: per the
 * April 19 design (DEC-21), roles are assigned by the backend on team
 * formation. Until backend assignment ships (BE-20/BE-21), this page shows
 * a "waiting for assignment" state.
 */

interface RosterEntry {
  uid: string;
  displayName: string;
  joinedAt?: Timestamp | null;
}

interface TeamDoc {
  name: string | null;
  memberUids: string[];
}

const TEAM_NAME_MAX = 40;
const TEAM_NAME_MIN = 2;

export function TeamPage() {
  const { gameId, playerId, player, teamId, teamName, role, phase } = useGame();
  const dispatch = useGameDispatch();
  const navigate = useNavigate();

  const [roster, setRoster] = useState<Record<string, RosterEntry>>({});
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [teamReady, setTeamReady] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Local draft for the name input. Hydrated from the live team doc but
  // edited freely; only flushed to the backend on blur/Enter so we don't
  // hammer Firestore on every keystroke.
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const lastSyncedNameRef = useRef<string | null>(null);

  // ── Subscribe: my own player doc (so we get teamId + role even if /team
  // is the first page mounted; GamePage is not on this route).
  useEffect(() => {
    if (!gameId || !playerId) return;
    const playerRef = doc(db, "games", gameId, "players", playerId);
    const unsubscribe = onSnapshot(playerRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DocumentData;
      if (
        data.role === "operations" ||
        data.role === "advertising" ||
        data.role === "finance" ||
        data.role === "solo"
      ) {
        dispatch({ type: "SET_ROLE", payload: data.role as PlayerRole });
      }
      if (typeof data.teamId === "string" && data.teamId.length > 0) {
        dispatch({ type: "SET_TEAM_ID", payload: data.teamId });
      } else if (data.teamId === null) {
        dispatch({ type: "SET_TEAM_ID", payload: null });
      }
    });
    return unsubscribe;
  }, [gameId, playerId, dispatch]);

  // ── Subscribe: roster (so we can map memberUids → displayName).
  useEffect(() => {
    if (!gameId) return;
    const rosterRef = collection(db, "games", gameId, "roster");
    const unsubscribe = onSnapshot(rosterRef, (snap) => {
      const next: Record<string, RosterEntry> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as DocumentData;
        const uid = typeof data.uid === "string" ? data.uid : d.id;
        next[uid] = {
          uid,
          displayName:
            typeof data.displayName === "string" ? data.displayName : "Player",
          joinedAt: (data.joinedAt as Timestamp | null) ?? null,
        };
      });
      setRoster(next);
    });
    return unsubscribe;
  }, [gameId]);

  // ── Subscribe: team doc (name + memberUids), once we know our teamId.
  useEffect(() => {
    if (!gameId || !teamId) {
      setTeam(null);
      setTeamReady(false);
      return;
    }
    const teamRef = doc(db, "games", gameId, "teams", teamId);
    const unsubscribe = onSnapshot(
      teamRef,
      (snap) => {
        setTeamReady(true);
        if (!snap.exists()) {
          setTeam(null);
          dispatch({ type: "SET_TEAM_NAME", payload: null });
          return;
        }
        const data = snap.data() as DocumentData;
        const next: TeamDoc = {
          name:
            typeof data.name === "string" && data.name.length > 0
              ? data.name
              : null,
          memberUids: Array.isArray(data.memberUids)
            ? data.memberUids.filter(
                (uid): uid is string => typeof uid === "string",
              )
            : [],
        };
        setTeam(next);
        dispatch({ type: "SET_TEAM_NAME", payload: next.name });

        // Hydrate the editor only when the *server* value changes
        // underneath us (e.g. teammate edited it). Don't clobber what
        // the local user is typing.
        if (lastSyncedNameRef.current !== next.name) {
          lastSyncedNameRef.current = next.name;
          setDraftName(next.name ?? "");
        }
      },
      (err) => {
        console.error("teams/{teamId} listener error:", err);
        setTeamReady(true);
        setTeamError(
          "Could not load your team. Refresh if this persists.",
        );
      },
    );
    return unsubscribe;
  }, [gameId, teamId, dispatch]);

  // Watch the game doc directly so we can auto-route into /game when the
  // professor starts the round. The GamePage's own phase listener isn't
  // mounted on /team, so without this the player would sit on the team
  // page forever after the game starts.
  const [gamePhase, setGamePhase] = useState<GamePhaseString | null>(null);
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    const unsubscribe = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DocumentData;
      if (typeof data.phase === "string") setGamePhase(data.phase);
    });
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const livePhase = gamePhase ?? phase;
    if (livePhase && livePhase !== "lobby") {
      navigate("/game");
    }
  }, [gamePhase, phase, navigate]);


  const memberRoster = useMemo(() => {
    if (!team) return [];
    return team.memberUids.map((uid) => ({
      uid,
      displayName: roster[uid]?.displayName ?? "Teammate",
      isYou: uid === playerId,
    }));
  }, [team, roster, playerId]);

  const handleSaveName = async () => {
    if (!gameId || !teamId) return;
    const trimmed = draftName.trim();
    if (trimmed === (team?.name ?? "")) {
      // No-op: nothing changed.
      return;
    }
    if (trimmed.length > 0 && trimmed.length < TEAM_NAME_MIN) {
      setNameError(`Team name must be at least ${TEAM_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > TEAM_NAME_MAX) {
      setNameError(`Team name must be ${TEAM_NAME_MAX} characters or fewer.`);
      return;
    }

    setNameError(null);
    setNameSaved(false);
    setSavingName(true);
    try {
      const updateTeamName = httpsCallable<
        { gameId: string; teamId: string; name: string },
        { ok: true }
      >(functions, "updateTeamName");
      await updateTeamName({
        gameId,
        teamId,
        name: trimmed,
      });
      setNameSaved(true);
    } catch (err) {
      const fnErr = err as FunctionsError;
      const code = (fnErr?.code || "").split("/").pop();
      if (code === "not-found" || code === "internal") {
        // Backend has not shipped `updateTeamName` yet (BE-20/BE-23).
        setNameError(
          "Team naming will be enabled once the professor finalizes teams.",
        );
      } else if (fnErr?.message) {
        setNameError(fnErr.message);
      } else {
        setNameError("Could not save team name. Try again.");
      }
    } finally {
      setSavingName(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSaveName();
    }
  };

  // States: (1) not joined, (2) joined but no teamId yet, (3) team loaded.
  if (!gameId || !playerId) {
    return (
      <PageShell className="team-page">
        <div className="team-page__card">
          <h1 className="team-page__title">Join a game first</h1>
          <button
            className="btn btn--primary"
            onClick={() => navigate("/")}
          >
            Back to start
          </button>
        </div>
      </PageShell>
    );
  }

  const waitingForAssignment = !teamId || !teamReady || !team;

  return (
    <PageShell className="team-page">
      <div className="team-page__card">
        <h1 className="team-page__title">Your Team</h1>

        {player && (
          <p className="team-page__hello">
            Hi, <strong>{player.name}</strong>.
          </p>
        )}

        {waitingForAssignment ? (
          <div className="team-page__waiting" role="status">
            <p>Waiting for the professor to assign you to a team…</p>
            <p className="team-page__waiting-hint">
              You'll see your teammates and your role here as soon as
              teams are formed. You don't need to do anything.
            </p>
          </div>
        ) : (
          <>
            <div className="team-page__assignment">
              <div className="team-page__assignment-row">
                <span className="team-page__assignment-label">Team</span>
                <span className="team-page__assignment-value">
                  {team.name ?? "Unnamed team"}
                </span>
              </div>
              <div className="team-page__assignment-row">
                <span className="team-page__assignment-label">Your Role</span>
                <span className={`role-badge role-badge--${role}`}>
                  {PLAYER_ROLE_LABELS[role]}
                </span>
              </div>
            </div>

            <section className="team-page__members">
              <h2 className="team-page__members-title">
                Teammates ({memberRoster.length})
              </h2>
              <ul className="team-page__members-list">
                {memberRoster.map((m) => (
                  <li
                    key={m.uid}
                    className={`team-page__member${
                      m.isYou ? " team-page__member--you" : ""
                    }`}
                  >
                    <span className="team-page__member-name">
                      {m.displayName}
                      {m.isYou && " (you)"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="team-page__naming">
              <label className="form-field">
                <span className="form-field__label">
                  Team Name{" "}
                  <span className="form-field__hint">
                    (any teammate can edit — syncs live)
                  </span>
                </span>
                <input
                  type="text"
                  className="form-field__input"
                  placeholder="e.g. Crumb Lords"
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    setNameSaved(false);
                  }}
                  onBlur={() => void handleSaveName()}
                  onKeyDown={handleKeyDown}
                  maxLength={TEAM_NAME_MAX}
                  disabled={savingName}
                />
              </label>
              <div className="team-page__naming-status" aria-live="polite">
                {savingName && (
                  <span className="team-page__naming-saving">Saving…</span>
                )}
                {!savingName && nameSaved && !nameError && (
                  <span className="team-page__naming-saved">
                    Saved · synced to teammates
                  </span>
                )}
                {nameError && (
                  <span className="team-page__naming-error" role="alert">
                    {nameError}
                  </span>
                )}
              </div>
              {teamError && (
                <p className="team-page__error" role="alert">
                  {teamError}
                </p>
              )}
            </section>
          </>
        )}

        <div className="team-page__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate("/lobby")}
          >
            See all players in lobby
          </button>
        </div>

        <p className="team-page__status">
          Waiting for the professor to start the game…
        </p>
      </div>
    </PageShell>
  );
}
