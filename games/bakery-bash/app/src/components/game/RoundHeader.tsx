import { useGame } from "../../contexts/GameContext";

function downloadResultsCsv(results: { round: number; revenue: number; customerCount: number; customerSatisfaction: number }[]) {
  const header = "Round,Revenue,Customers,Satisfaction";
  const rows = results.map(
    (r) => `${r.round},${r.revenue},${r.customerCount},${r.customerSatisfaction}`
  );
  const blob = new Blob([header + "\n" + rows.join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bakery-bash-results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function RoundHeader() {
  const { currentRound, totalRounds, timeRemaining, roundResults } = useGame();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <header className="round-header">
      <button
        className="round-header__email"
        onClick={() => downloadResultsCsv(roundResults)}
        title="Download results CSV"
      >
        <img src="/assets/ui/email.svg" alt="Download CSV" />
      </button>

      <div className="round-header__round">
        Round {currentRound} of {totalRounds}
      </div>

      {timeRemaining !== null && (
        <div
          className={`round-header__timer ${
            timeRemaining < 60 ? "round-header__timer--urgent" : ""
          }`}
        >
          {formatTime(timeRemaining)}
        </div>
      )}
    </header>
  );
}
