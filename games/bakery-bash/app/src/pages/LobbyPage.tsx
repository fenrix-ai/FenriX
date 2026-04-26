import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { useGame } from "../contexts/GameContext";
import type { GamePhaseString } from "../types/game";
import { db } from "../lib/firebase";
import { PageShell } from "../components/ui/PageShell";
import { PLAYER_ROLE_LABELS } from "../types/game";

/**
 * Roster entry as published to `/games/{gameId}/roster/{playerId}` by the
 * `joinGame` callable. Schema canonical source: `firestore-schema.js`
 * `RosterMemberDocument` (added in PR #25). Financial state is intentionally
 * absent — that lives on `/players/{uid}` under owner-only rules.
 */
interface RosterEntry {
  uid: string;
  displayName: string;
  bakeryName?: string;
  joinedAt?: Timestamp | null;
}

export function LobbyPage() {
  const { player, playerId, gameId, gameCode, role, teamId, teamName, phase } = useGame();
  const navigate = useNavigate();

  const [gamePhase, setGamePhase] = useState<GamePhaseString | null>(null);
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    return onSnapshot(
      gameRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as DocumentData;
        if (typeof data.phase === "string") setGamePhase(data.phase as GamePhaseString);
      },
      (err) => {
        console.error("lobby game-doc listener error:", { gameId, err });
      },
    );
  }, [gameId]);
  useEffect(() => {
    const livePhase = gamePhase ?? phase;
    if (livePhase && livePhase !== "lobby") navigate("/game");
  }, [gamePhase, phase, navigate]);

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Distinct from `roster.length === 0`: tells us whether the snapshot
  // listener has produced *any* result yet (success or failure). Without
  // this, the fallback row paints over a successful-but-empty roster the
  // same way it paints over a still-loading one.
  const [rosterReady, setRosterReady] = useState(false);

  // ── Subscribe to /games/{gameId}/roster ──
  // Why /roster (not /players): the players collection has owner-only read
  // rules, which means a `list` query can never authorize. The roster
  // subcollection (PR #25) carries only public-safe fields and is readable
  // by any signed-in player so the lobby can render the live join order.
  useEffect(() => {
    if (!gameId) return;
    const rosterRef = collection(db, "games", gameId, "roster");
    const unsubscribe = onSnapshot(
      rosterRef,
      (snap) => {
        const entries: RosterEntry[] = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            uid: typeof data.uid === "string" ? data.uid : d.id,
            displayName:
              typeof data.displayName === "string" ? data.displayName : "Player",
            bakeryName:
              typeof data.bakeryName === "string" ? data.bakeryName : undefined,
            joinedAt: (data.joinedAt as Timestamp | null) ?? null,
          };
        });
        // Stable join-order: `joinedAt` ascending, with players whose stamp
        // hasn't materialized yet (rejoin race) appended in document order.
        entries.sort((a, b) => {
          const ta = a.joinedAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
          const tb = b.joinedAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return a.uid.localeCompare(b.uid);
        });
        setRoster(entries);
        setRosterError(null);
        setRosterReady(true);
      },
      (err) => {
        console.error("games/roster listener error", { gameId, err });
        setRosterError(
          "Could not load the player list. Refresh if this persists.",
        );
        setRosterReady(true);
      },
    );
    return unsubscribe;
  }, [gameId]);


  // Fallback to the local context-only "you" row only while the listener is
  // genuinely still warming up. Once we've heard from Firestore (success or
  // error) we trust its answer — even if that answer is an empty roster or
  // an error banner — so we don't double-render alongside the real list.
  const showFallback =
    !rosterReady && !rosterError && player !== null;

  return (
    <PageShell className="lobby-page">
      <div className="lobby-page__card">
        <h1 className="lobby-page__title">Waiting Room</h1>

        {gameCode && (
          <div className="lobby-page__code">
            Game Code: <strong>{gameCode}</strong>
          </div>
        )}

        {player && (
          <div className="lobby-page__bakery">
            Your bakery: <strong>{teamName ?? player.bakeryName}</strong>{" "}
            {/* Only render the badge for an actual specialist role. "solo"
                is a placeholder backend role that opens every submit while
                the team is still picking; surfacing it on the lobby card
                read as if the latest joiner had a unique solo role. */}
            {teamId && role && role !== "solo" && (
              <span className={`role-badge role-badge--${role}`}>
                {PLAYER_ROLE_LABELS[role]}
              </span>
            )}
          </div>
        )}

        {!teamId && (
          <p className="lobby-page__team-hint">
            <Link to="/team">Set your team name →</Link>
          </p>
        )}

        <div className="lobby-page__teams">
          {/* V6 (Apr 26): users wanted teams + members rather than a flat
              numbered roster. Roster docs carry `bakeryName`, which is the
              team name for players who joined via createTeam (the only
              codepath that creates teams in V6). Group on bakeryName so
              each team renders as one card with its members listed below
              the team name. The roster count is preserved as a heading
              suffix so professors still see the live join count. */}
          <h2>
            Teams ({rosterReady ? new Set(roster.map((e) => e.bakeryName ?? e.displayName)).size : "—"})
            {" · "}
            Players ({rosterReady ? roster.length : "—"})
          </h2>

          {rosterError && (
            <p className="lobby-page__error" role="alert">
              {rosterError}
            </p>
          )}

          {showFallback ? (
            <ul className="lobby-page__team-list">
              <li className="lobby-page__team lobby-page__team--you">
                <div className="lobby-page__team-name">
                  {player!.bakeryName ?? player!.name}
                </div>
                <ul className="lobby-page__team-members">
                  <li>{player!.name} (you)</li>
                </ul>
              </li>
            </ul>
          ) : (
            <ul className="lobby-page__team-list">
              {(() => {
                const groups = new Map<string, typeof roster>();
                for (const entry of roster) {
                  const key = entry.bakeryName ?? entry.displayName;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(entry);
                }
                return Array.from(groups.entries()).map(([teamLabel, members]) => {
                  const youOnThisTeam = members.some((m) => m.uid === playerId);
                  return (
                    <li
                      key={teamLabel}
                      className={`lobby-page__team${
                        youOnThisTeam ? " lobby-page__team--you" : ""
                      }`}
                    >
                      <div className="lobby-page__team-name">{teamLabel}</div>
                      <ul className="lobby-page__team-members">
                        {members.map((m) => (
                          <li key={m.uid}>
                            {m.displayName}
                            {m.uid === playerId && " (you)"}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </div>

        <p className="lobby-page__status">
          Waiting for the professor to start the game…
        </p>
      </div>
    </PageShell>
  );
}
