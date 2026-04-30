import { useGame } from "../../contexts/GameContext";

/**
 * Game Progress Bar (Apr 22).
 *
 * Visualizes where the team is in the overall game loop. The bar has one
 * segment per round; the current + completed rounds fill with a warm
 * yellow, while upcoming rounds render at low opacity so players can see
 * the full roadmap at a glance.
 *
 * Colours intentionally use the existing `--honey` + `--caramel` palette
 * so the component blends in with the rest of the game shell.
 *
 * V9 (Apr 26): dropped the per-segment 🥐 emoji — it was visual noise
 * stacked above the R1/R2/etc. labels.
 */
export function GameProgressBar() {
  const { currentRound, totalRounds } = useGame();

  const total =
    typeof totalRounds === "number" && totalRounds > 0 ? totalRounds : 5;
  const current =
    typeof currentRound === "number" && currentRound > 0 ? currentRound : 0;

  const segments = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className="game-progress"
      role="progressbar"
      aria-label={`Round ${current} of ${total}`}
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <div className="game-progress__track">
        {segments.map((seg) => {
          const isComplete = seg < current;
          const isCurrent = seg === current;
          return (
            <div
              key={seg}
              className={`game-progress__segment${
                isComplete ? " game-progress__segment--complete" : ""
              }${isCurrent ? " game-progress__segment--current" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="game-progress__label">R{seg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
