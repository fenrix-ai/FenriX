import { useGame } from "../../contexts/GameContext";

export function BakeryView() {
  const { player, currentRound, totalRounds } = useGame();

  return (
    <div className="bakery-view">
      <div className="bakery-view__storefront">
        <div className="bakery-view__sign">
          <h2 className="bakery-view__name">
            {player?.bakeryName ?? "My Bakery"}
          </h2>
          <span className="bakery-view__round">
            Round {currentRound} of {totalRounds}
          </span>
        </div>

        <div className="bakery-view__window">
          <div className="bakery-view__display">
            <div className="bakery-view__shelf">
              <span className="bakery-view__shelf-item">🥐</span>
              <span className="bakery-view__shelf-item">🍪</span>
              <span className="bakery-view__shelf-item">🥯</span>
            </div>
            <div className="bakery-view__shelf">
              <span className="bakery-view__shelf-item">🥪</span>
              <span className="bakery-view__shelf-item">☕</span>
              <span className="bakery-view__shelf-item">🍵</span>
            </div>
          </div>
        </div>

        <div className="bakery-view__floor">
          <div className="bakery-view__counter" />
        </div>
      </div>

      <p className="bakery-view__hint">
        Use the tabs on the right to set your menu quantities, hire staff, and
        place auction bids. Hit <strong>Submit</strong> when ready.
      </p>
    </div>
  );
}
