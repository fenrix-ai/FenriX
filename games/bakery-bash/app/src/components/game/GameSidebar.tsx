import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useGame, useGameDispatch } from "../../contexts/GameContext";
import { functions } from "../../lib/firebase";
import { StaffTab } from "./tabs/StaffTab";
import { StatusTab } from "./tabs/StatusTab";
import type { AcquiredCsv } from "../../types/game";

/**
 * Right-hand control panel for the decide phase. Two tabs:
 *
 *  - **Hire** (default): per-station sous-chef steppers, maintenance guys +
 *    task assignments, escalating hire cost display.
 *  - **Status**: read-only health/cleanliness bars. Product quantities live
 *    on the main BakeryView (station grid), not here.
 *
 * Data purchases (competitor intel + Tier 1/Tier 2 chef CSVs) live below
 * the tabs and are role-gated to Finance. Each purchase drops an entry
 * into `acquiredCsvs` on the game context so the CSV Inbox popup can
 * redownload it later without re-charging the team.
 */
const TABS = ["Hire", "Status"] as const;
type Tab = (typeof TABS)[number];
const tabId = (tab: Tab) => `game-sidebar-tab-${tab.toLowerCase()}`;
const panelId = (tab: Tab) => `game-sidebar-panel-${tab.toLowerCase()}`;

const TIER1_COST = 2500;
const TIER2_COST = 7500;
const COMPETITOR_INTEL_COST = 5000;

export interface GameSidebarProps {
  readOnly?: boolean;
}

export function GameSidebar({ readOnly = false }: GameSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Hire");
  const [showIntelConfirm, setShowIntelConfirm] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [purchasedThisSession, setPurchasedThisSession] = useState<
    Record<string, boolean>
  >({});

  const { gameId, role, currentRound, acquiredCsvs } = useGame();
  const dispatch = useGameDispatch();

  const addCsv = (entry: AcquiredCsv) => {
    dispatch({ type: "ADD_ACQUIRED_CSV", payload: entry });
  };

  const handlePurchaseIntel = async () => {
    if (!gameId) return;
    setShowIntelConfirm(false);
    setPending("intel");
    setError(null);
    setInfo(null);
    try {
      const purchaseFn = httpsCallable(functions, "purchaseCompetitorInsight");
      const result = await purchaseFn({
        gameId,
        round: (currentRound ?? 1) - 1,
      });
      const data = result.data as { csv: string };
      const prevRound = (currentRound ?? 1) - 1;
      addCsv({
        id: `competitor-intel-round-${prevRound}-${Date.now()}`,
        kind: "competitor-intel",
        label: `Round ${prevRound} competitor intel`,
        round: prevRound,
        acquiredAtMs: Date.now(),
        csv: data.csv,
        filename: `competitor-intel-round-${prevRound}.csv`,
      });
      setInfo("Intel added to your CSV Inbox.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not purchase insight.";
      setError(message);
    } finally {
      setPending(null);
    }
  };

  const handlePurchaseChefData = async (tier: 1 | 2) => {
    if (!gameId) return;
    setPending(`chef-tier${tier}`);
    setError(null);
    setInfo(null);
    try {
      // Backend implementation (chef CSV tiers) is tracked separately; we
      // try the callable but fall back to a clear error if it isn't
      // deployed yet so the UI doesn't look silently broken.
      const purchaseFn = httpsCallable(functions, "purchaseChefData");
      const result = await purchaseFn({ gameId, tier });
      const data = result.data as { csv: string };
      const id = `chef-tier${tier}-round-${currentRound ?? 1}-${Date.now()}`;
      addCsv({
        id,
        kind: tier === 1 ? "chef-tier1" : "chef-tier2",
        label:
          tier === 1
            ? "Specialty chef nationality → product map"
            : "Full chef profile dump",
        round: currentRound ?? undefined,
        acquiredAtMs: Date.now(),
        csv: data.csv,
        filename:
          tier === 1
            ? "chef-specialties.csv"
            : "chef-profiles.csv",
      });
      setPurchasedThisSession((prev) => ({ ...prev, [`tier${tier}`]: true }));
      setInfo(`Tier ${tier} chef data added to your CSV Inbox.`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not purchase chef data. Backend may not be live yet.";
      setError(message);
    } finally {
      setPending(null);
    }
  };

  const isFinance = role === "finance" || role === "solo";
  const canPurchase = isFinance && !readOnly && !!gameId;
  const hasIntel = acquiredCsvs.some((c) => c.kind === "competitor-intel");

  return (
    <aside className="game-sidebar">
      <nav className="game-sidebar__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={tabId(tab)}
            role="tab"
            type="button"
            aria-selected={activeTab === tab}
            aria-controls={panelId(tab)}
            className={`game-sidebar__tab ${
              activeTab === tab ? "game-sidebar__tab--active" : ""
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div
        id={panelId(activeTab)}
        className="game-sidebar__panel"
        role="tabpanel"
        aria-labelledby={tabId(activeTab)}
      >
        {activeTab === "Hire" && <StaffTab readOnly={readOnly} />}
        {activeTab === "Status" && <StatusTab />}
      </div>

      {canPurchase && (
        <div className="sidebar__data-section">
          <h3 className="sidebar__data-title">Purchasable Data</h3>

          {(currentRound ?? 0) > 1 && (
            <div className="sidebar__intel-section">
              <button
                className="btn btn--secondary btn--small sidebar__intel-btn"
                onClick={() => setShowIntelConfirm(true)}
                disabled={pending !== null}
              >
                {hasIntel
                  ? `Buy Competitor Intel (again) — $${COMPETITOR_INTEL_COST.toLocaleString()}`
                  : `Buy Competitor Intel — $${COMPETITOR_INTEL_COST.toLocaleString()}`}
              </button>
              {showIntelConfirm && (
                <div className="sidebar__intel-confirm">
                  <p>
                    Spend ${COMPETITOR_INTEL_COST.toLocaleString()} to see all
                    teams' submitted quantities and prices from last round?
                  </p>
                  <button
                    className="btn btn--primary btn--small"
                    onClick={handlePurchaseIntel}
                    disabled={pending !== null}
                  >
                    Confirm
                  </button>
                  <button
                    className="btn btn--ghost btn--small"
                    onClick={() => setShowIntelConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="sidebar__chef-data">
            <button
              type="button"
              className="btn btn--secondary btn--small sidebar__chef-data-btn"
              onClick={() => void handlePurchaseChefData(1)}
              disabled={pending !== null}
              title="Table of chef nationalities → product specialties."
            >
              Buy Chef Specialties (T1) — ${TIER1_COST.toLocaleString()}
            </button>
            <p className="sidebar__chef-data-hint">
              Tier 1 — See which nationality bakes which products best.
              {purchasedThisSession.tier1 ? " ✓ Purchased" : ""}
            </p>

            <button
              type="button"
              className="btn btn--secondary btn--small sidebar__chef-data-btn"
              onClick={() => void handlePurchaseChefData(2)}
              disabled={pending !== null}
              title="Full profile dump: skill, satisfaction, avg production + revenue, 30+ chefs per nationality."
            >
              Buy Chef Profiles (T2) — ${TIER2_COST.toLocaleString()}
            </button>
            <p className="sidebar__chef-data-hint">
              Tier 2 — Full chef-by-chef profile CSV (30+ per nationality).
              {purchasedThisSession.tier2 ? " ✓ Purchased" : ""}
            </p>
          </div>

          {info && <p className="sidebar__data-info">{info}</p>}
          {error && (
            <p className="sidebar__data-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
