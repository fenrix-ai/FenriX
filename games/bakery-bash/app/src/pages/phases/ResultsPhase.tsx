import { useGame } from "../../contexts/GameContext";

const LOW_SATISFACTION_THRESHOLD = 40;

export function ResultsPhase() {
  const { roundResults, currentRound, chefSatisfactionScores } = useGame();
  const latest = roundResults[roundResults.length - 1];

  // Prefer the per-chef map from the latest result (server authoritative for
  // the round just finished); fall back to the live context map.
  const scores: Record<string, number> =
    latest?.chefSatisfactionScores ?? chefSatisfactionScores;
  const lowChefs = Object.entries(scores).filter(
    ([, score]) => typeof score === "number" && score <= LOW_SATISFACTION_THRESHOLD,
  );

  const departures = latest?.chefDepartures ?? [];
  const departureNames = latest?.chefDepartureNames ?? [];
  const chefLabel = (id: string, index: number) =>
    departureNames[index] || id;

  return (
    <section className="results-phase">
      <h2>Round {currentRound} Results</h2>

      {latest ? (
        <div className="results-phase__stats">
          <div className="results-phase__stat">
            <span className="results-phase__stat-label">Revenue</span>
            <span className="results-phase__stat-value">
              ${latest.revenue.toLocaleString()}
            </span>
          </div>
          <div className="results-phase__stat">
            <span className="results-phase__stat-label">Customers</span>
            <span className="results-phase__stat-value">
              {latest.customerCount}
            </span>
          </div>
          <div className="results-phase__stat">
            <span className="results-phase__stat-label">Satisfaction</span>
            <span className="results-phase__stat-value">
              {latest.customerSatisfaction}/100
            </span>
          </div>
          {typeof latest.chefSatisfactionScore === "number" && (
            <div className="results-phase__stat">
              <span className="results-phase__stat-label">Chef Satisfaction</span>
              <span className="results-phase__stat-value">
                {Math.round(latest.chefSatisfactionScore)}/100
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="results-phase__placeholder">
          Results will appear here once the round is simulated.
        </p>
      )}

      {/* Low-satisfaction warnings — one card per affected chef. */}
      {lowChefs.length > 0 && (
        <div
          className="results-phase__satisfaction-warnings"
          role="alert"
          aria-label="Chef satisfaction warnings"
        >
          {lowChefs.map(([chefId, score]) => (
            <div key={chefId} className="results-phase__warning-card">
              <span className="results-phase__warning-icon" aria-hidden>
                ⚠
              </span>
              <p className="results-phase__warning-text">
                <strong>{chefId}</strong>'s satisfaction is low (
                {Math.round(score)}%). Keep your kitchen clean and machines
                maintained to retain them.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Chef departure notices. */}
      {departures.length > 0 && (
        <div
          className="results-phase__departures"
          role="status"
          aria-label="Chef departures"
        >
          {departures.map((chefId, i) => (
            <p key={chefId} className="results-phase__departure">
              <strong>{chefLabel(chefId, i)}</strong> has left the kitchen and
              re-entered the auction pool.
            </p>
          ))}
        </div>
      )}

      <p className="results-phase__waiting">
        Waiting for professor to advance to the next round…
      </p>
    </section>
  );
}
