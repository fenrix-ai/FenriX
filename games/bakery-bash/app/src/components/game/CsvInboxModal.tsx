import { useEffect, useMemo } from "react";
import { useGame } from "../../contexts/GameContext";
import { downloadResultsCsv } from "./RoundHeader";
import type { AcquiredCsv, AcquiredCsvKind } from "../../types/game";

/**
 * CSV Inbox popup.
 *
 * Shows a scrollable list of every data file the team has picked up this
 * game — the auto-generated round-history CSV plus any purchasable data
 * (competitor intel, Tier 1 chef tables, Tier 2 chef profiles). Each row
 * has its own "Download" button so the player picks what they actually
 * want instead of triggering an immediate download when they tap the
 * header mail button (the previous behaviour).
 *
 * Mounted from `RoundHeader`; visibility is controlled there so the same
 * `<dialog>`-style overlay can be reused from anywhere in the game shell.
 */
const KIND_LABELS: Record<AcquiredCsvKind, string> = {
  "competitor-intel": "Competitor Intel",
  "chef-tier1": "Chef Specialties (Tier 1)",
  "chef-tier2": "Chef Profile Dump (Tier 2)",
};

function triggerDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface CsvInboxModalProps {
  open: boolean;
  onClose: () => void;
}

export function CsvInboxModal({ open, onClose }: CsvInboxModalProps) {
  const { roundResults, acquiredCsvs } = useGame();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Sort acquired CSVs newest-first so the most recent purchase is at the top.
  const sortedAcquired = useMemo<AcquiredCsv[]>(
    () =>
      [...acquiredCsvs].sort((a, b) => b.acquiredAtMs - a.acquiredAtMs),
    [acquiredCsvs],
  );

  if (!open) return null;

  const hasResults = roundResults.length > 0;

  return (
    <div
      className="csv-inbox__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-inbox-title"
      onClick={onClose}
    >
      <div
        className="csv-inbox__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="csv-inbox__header">
          <h2 id="csv-inbox-title" className="csv-inbox__title">
            📬 CSV Inbox
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--small csv-inbox__close"
            onClick={onClose}
            aria-label="Close CSV inbox"
          >
            Close
          </button>
        </header>

        <p className="csv-inbox__hint">
          Every data file your team has acquired this game. Pick which one to
          download.
        </p>

        <ul className="csv-inbox__list">
          <li className="csv-inbox__item">
            <div className="csv-inbox__item-meta">
              <span className="csv-inbox__kind">Results</span>
              <span className="csv-inbox__label">
                Round-by-round history
              </span>
              <span className="csv-inbox__sub">
                {hasResults
                  ? `${roundResults.length} round${
                      roundResults.length === 1 ? "" : "s"
                    } recorded so far`
                  : "No rounds completed yet — download once a round wraps."}
              </span>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={!hasResults}
              onClick={() => downloadResultsCsv(roundResults)}
            >
              Download
            </button>
          </li>

          {sortedAcquired.length === 0 && (
            <li className="csv-inbox__item csv-inbox__item--empty">
              <em>
                No purchased data yet. Finance can buy competitor intel and
                chef-data CSVs in the Results phase.
              </em>
            </li>
          )}

          {sortedAcquired.map((entry) => (
            <li key={entry.id} className="csv-inbox__item">
              <div className="csv-inbox__item-meta">
                <span className="csv-inbox__kind">
                  {KIND_LABELS[entry.kind]}
                </span>
                <span className="csv-inbox__label">{entry.label}</span>
                {entry.round !== undefined && (
                  <span className="csv-inbox__sub">
                    Round {entry.round}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={() => triggerDownload(entry.filename, entry.csv)}
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
