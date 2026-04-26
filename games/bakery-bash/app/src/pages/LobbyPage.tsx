import { useGame } from "../contexts/GameContext";
import { PageShell } from "../components/ui/PageShell";

export function LobbyPage() {
  const { player, players, gameCode, totalPlayers, phase } = useGame();
  const allPlayers = player ? [player, ...players.filter((p) => p.id !== player.id)] : players;

  return (
    <PageShell className="lobby-page">
      <div className="lobby-page__card">
        <h1 className="lobby-page__title">
          {phase === "lobby" ? "Waiting Room" : "Game in Progress"}
        </h1>

        {gameCode && (
          <div className="lobby-page__code">
            Game Code: <strong>{gameCode}</strong>
          </div>
        )}

        {player && (
          <div className="lobby-page__bakery">
            Your bakery: <strong>{player.displayName || player.name}</strong>
          </div>
        )}

        <div className="lobby-page__players">
          <h2>Players ({totalPlayers || allPlayers.length || 1})</h2>
          <ul className="lobby-page__player-list">
            {allPlayers.map((p) => (
              <li
                key={p.id}
                className={`lobby-page__player ${p.id === player?.id ? "lobby-page__player--you" : ""}`}
              >
                {p.displayName || p.name} {p.id === player?.id ? "(you)" : ""}
              </li>
            ))}
          </ul>
        </div>

        <p className="lobby-page__status">
          {phase === "lobby"
            ? "Waiting for the professor to start the game…"
            : `Game has started! Phase: ${phase}`}
        </p>
      </div>
    </PageShell>
  );
}