import { StaffTab } from "./tabs/StaffTab";

/**
 * Right-hand control panel for the decide phase.
 *
 * Product quantities live directly on the main `BakeryView` (station-grid
 * layout), so the sidebar is dedicated to staffing + maintenance. No tab UI
 * is needed — just render the staff controls. Keeping the `.game-sidebar`
 * wrapper preserves the existing dashboard grid sizing in `global.css`.
 */
export function GameSidebar() {
  return (
    <aside className="game-sidebar">
      <div className="game-sidebar__panel">
        <StaffTab />
      </div>
    </aside>
  );
}
