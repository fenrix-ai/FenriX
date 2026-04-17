import { useGame, useGameDispatch } from "../../contexts/GameContext";

function buildCsv(
  results: {
    round: number;
    revenue: number;
    customerCount: number;
    customerSatisfaction: number;
  }[]
) {
  const header = "Round,Revenue,Customers,Satisfaction";
  const rows = results.map(
    (r) =>
      `${r.round},${r.revenue},${r.customerCount},${r.customerSatisfaction}`
  );
  return header + "\n" + rows.join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EmailPhase() {
  const { roundResults, currentRound } = useGame();
  const dispatch = useGameDispatch();

  const latestResult = roundResults[roundResults.length - 1];

  const handleExport = () => {
    downloadCsv(buildCsv(roundResults), "bakery-bash-results.csv");
  };

  const handleContinue = () => {
    dispatch({ type: "ADVANCE_ROUND" });
  };

  return (
    <div className="email-phase">
      <div className="email-phase__envelope">
        <img
          src="/assets/ui/email.svg"
          alt="Company Email"
          className="email-phase__icon"
        />
        <h2>Company Email</h2>
      </div>

      <p className="email-phase__intro">
        Round {currentRound} results are in. Export your data to build your
        models.
      </p>

      {latestResult && (
        <div className="email-phase__summary">
          <div className="email-phase__stat">
            <span className="email-phase__stat-label">Revenue</span>
            <span className="email-phase__stat-value">
              ${latestResult.revenue.toLocaleString()}
            </span>
          </div>
          <div className="email-phase__stat">
            <span className="email-phase__stat-label">Customers</span>
            <span className="email-phase__stat-value">
              {latestResult.customerCount}
            </span>
          </div>
          <div className="email-phase__stat">
            <span className="email-phase__stat-label">Satisfaction</span>
            <span className="email-phase__stat-value">
              {latestResult.customerSatisfaction}%
            </span>
          </div>
        </div>
      )}

      {!latestResult && (
        <p className="email-phase__empty">
          No results yet — data will appear after your first round.
        </p>
      )}

      <div className="email-phase__actions">
        <button className="btn btn--primary" onClick={handleExport}>
          Export CSV
        </button>
        <button className="btn btn--secondary" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
