import { useGame } from "../../../contexts/GameContext";

// TODO(G2): replace this placeholder with the full grade-letter UI.
// maintenanceBars / MaintenanceBars were removed in D3; equipmentGrade +
// cleanlinessGrade (added in Phase C / B1) are the canonical status fields.
export function StatusTab() {
  const { equipmentGrade, cleanlinessGrade } = useGame();
  return (
    <div className="status-tab">
      <h3 className="sidebar-tab__title">Kitchen Status</h3>
      <p>Equipment: {equipmentGrade}</p>
      <p>Cleanliness: {cleanlinessGrade}</p>
    </div>
  );
}
