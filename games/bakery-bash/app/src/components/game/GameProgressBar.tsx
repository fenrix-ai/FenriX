import { useGame } from "../../contexts/GameContext";
import { parseGamePhase } from "../../types/game";

/**
 * GameProgressBar — visual round-by-round progress indicator with a croissant
 * marker that travels from left to right as the team progresses through the
 * game. Completed rounds use high-opacity yellow; upcoming rounds use
 * low-opacity yellow.
 */
export function GameProgressBar() {
  const { currentRound, totalRounds, phase } = useGame();

  const total = totalRounds && totalRounds > 0 ? totalRounds : 5;
  const round = currentRound && currentRound > 0 ? currentRound : 1;

  const parsed = parseGamePhase(phase ?? "lobby", round);
  // A round counts as "completed" once we are at results_ready or beyond.
  const completedRounds =
    parsed.base === "results_ready" || parsed.base === "game_over"
      ? round
      : Math.max(0, round - 1);

  const sections = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className="game-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completedRounds}
      aria-label={`Round ${round} of ${total}`}
    >
      {sections.map((n) => {
        const isDone = n <= completedRounds;
        const isCurrent = n === round && !isDone;
        return (
          <div
            key={n}
            className={[
              "game-progress-bar__section",
              isDone ? "game-progress-bar__section--done" : "",
              isCurrent ? "game-progress-bar__section--current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <img
              src="/assets/products/croissant.svg"
              alt=""
              aria-hidden="true"
              className="game-progress-bar__croissant"
            />
            <span className="game-progress-bar__label">R{n}</span>
          </div>
        );
      })}
    </div>
  );
}
