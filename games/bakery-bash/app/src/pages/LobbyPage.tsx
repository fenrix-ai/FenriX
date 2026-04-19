import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { useGame } from "../contexts/GameContext";
import { db } from "../lib/firebase";
import { PageShell } from "../components/ui/PageShell";

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
  const { player, playerId, gameId, gameCode } = useGame();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);

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
      },
      (err) => {
        console.error("games/{gameId}/roster listener error:", err);
        setRosterError(
          "Could not load the player list. Refresh if this persists.",
        );
      },
    );
    return unsubscribe;
  }, [gameId]);

  // Fallback to the local context-only player while the listener is warming
  // up — better than briefly showing "0 players" right after join.
  const showFallback = roster.length === 0 && player !== null;

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
            Your bakery: <strong>{player.bakeryName}</strong>
          </div>
        )}

        <div className="lobby-page__players">
          <h2>Players ({showFallback ? 1 : roster.length})</h2>

          {rosterError && (
            <p className="lobby-page__error" role="alert">
              {rosterError}
            </p>
          )}

          <ul className="lobby-page__player-list">
            {showFallback ? (
              <li className="lobby-page__player lobby-page__player--you">
                <span className="lobby-page__player-name">
                  {player!.name} (you)
                </span>
                {player!.bakeryName && (
                  <span className="lobby-page__player-bakery">
                    {player!.bakeryName}
                  </span>
                )}
              </li>
            ) : (
              roster.map((entry, i) => {
                const isYou = entry.uid === playerId;
                return (
                  <li
                    key={entry.uid}
                    className={`lobby-page__player${
                      isYou ? " lobby-page__player--you" : ""
                    }`}
                  >
                    <span
                      className="lobby-page__player-rank"
                      aria-hidden="true"
                    >
                      {i + 1}.
                    </span>
                    <span className="lobby-page__player-name">
                      {entry.displayName}
                      {isYou && " (you)"}
                    </span>
                    {entry.bakeryName && (
                      <span className="lobby-page__player-bakery">
                        {entry.bakeryName}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <p className="lobby-page__status">
          Waiting for the professor to start the game…
        </p>
      </div>
    </PageShell>
  );
}
