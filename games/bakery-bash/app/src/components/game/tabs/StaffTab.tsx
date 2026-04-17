import { useGame, useGameDispatch } from "../../../contexts/GameContext";

// Default until /games/{gameId}/config/params resolves. Matches
// backend/seed/local-game.json.costPerStaffPerRound.
const FALLBACK_COST_PER_STAFF = 50;

export function StaffTab() {
  const { pendingDecision, config } = useGame();
  const dispatch = useGameDispatch();

  const staffCount = pendingDecision.staffCount;
  const costPerStaff =
    config?.costPerStaffPerRound ?? FALLBACK_COST_PER_STAFF;

  const setStaffCount = (next: number) => {
    dispatch({
      type: "UPDATE_PENDING_DECISION",
      payload: { staffCount: Math.min(20, Math.max(1, next)) },
    });
  };

  return (
    <div className="staff-tab">
      <h3 className="sidebar-tab__title">Staff</h3>
      <p className="sidebar-tab__hint">
        Hire staff to serve customers faster.
      </p>

      <div className="staff-tab__control">
        <label className="staff-tab__label">
          Number of Staff
        </label>
        <div className="staff-tab__stepper">
          <button
            className="staff-tab__stepper-btn"
            onClick={() => setStaffCount(staffCount - 1)}
            disabled={staffCount <= 1}
          >
            −
          </button>
          <span className="staff-tab__stepper-value">{staffCount}</span>
          <button
            className="staff-tab__stepper-btn"
            onClick={() => setStaffCount(staffCount + 1)}
            disabled={staffCount >= 20}
          >
            +
          </button>
        </div>
      </div>

      <div className="staff-tab__cost">
        Cost: <strong>${(staffCount * costPerStaff).toLocaleString()}</strong>
      </div>
    </div>
  );
}
