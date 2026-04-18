import { useGame } from "../../contexts/GameContext";
import type { MaintenanceBars, RoundResult, StaffCounts } from "../../types/game";

/**
 * Column schema for the round-history CSV download. Kept in one place so
 * the header row and row serializer cannot drift apart.
 *
 * Replaces the legacy `staff_count` column with three per-station counts +
 * a dedicated maintenance count, and adds maintenance bar averages per the
 * game-design-proposal CSV spec.
 */
const CSV_COLUMNS = [
  "round",
  "revenue",
  "customer_count",
  "customer_satisfaction",
  "chef_satisfaction_score",
  "avg_cleanliness_pct",
  "avg_machine_health_pct",
  "bakery_sous_chef_count",
  "deli_sous_chef_count",
  "barista_sous_chef_count",
  "maintenance_guy_count",
] as const;

function pct(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function avgMachineHealth(bars: MaintenanceBars | undefined): string {
  if (!bars) return "";
  const { ovenHealth, slicerHealth, espressoHealth } = bars;
  const parts = [ovenHealth, slicerHealth, espressoHealth].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (parts.length === 0) return "";
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return String(Math.round(avg));
}

function num(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
}

function serializeRow(r: RoundResult): string {
  const counts: Partial<StaffCounts> = r.staffCounts ?? {};
  return [
    r.round,
    r.revenue,
    r.customerCount,
    r.customerSatisfaction,
    pct(r.chefSatisfactionScore),
    pct(r.maintenanceBars?.cleanliness),
    avgMachineHealth(r.maintenanceBars),
    num(counts.bakerySousChefs),
    num(counts.deliSousChefs),
    num(counts.baristaSousChefs),
    num(counts.maintenanceGuys),
  ].join(",");
}

function downloadResultsCsv(results: RoundResult[]) {
  const header = CSV_COLUMNS.join(",");
  const rows = results.map(serializeRow);
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
