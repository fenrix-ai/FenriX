import { useState } from "react";
import { BudgetSummary } from "./BudgetSummary";
import { StaffTab } from "./tabs/StaffTab";
import { StatusTab } from "./tabs/StatusTab";

/**
 * Right-hand control panel for the decide phase. Two tabs:
 *
 *  - **Hire** (default): per-station sous-chef steppers, maintenance guys +
 *    task assignments, escalating hire cost display.
 *  - **Status**: read-only health/cleanliness bars. Product quantities live
 *    on the main BakeryView (station grid), not here.
 */
const TABS = ["Hire", "Status"] as const;
type Tab = (typeof TABS)[number];

export function GameSidebar() {
  const [activeTab, setActiveTab] = useState<Tab>("Hire");

  return (
    <aside className="game-sidebar">
      <BudgetSummary />
      <nav className="game-sidebar__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`game-sidebar__tab ${
              activeTab === tab ? "game-sidebar__tab--active" : ""
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="game-sidebar__panel" role="tabpanel">
        {activeTab === "Hire" && <StaffTab />}
        {activeTab === "Status" && <StatusTab />}
      </div>
    </aside>
  );
}
