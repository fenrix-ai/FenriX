import { useState } from "react";
import type { MaintenanceTask, StaffCounts } from "../../../types/game";
import { useGame } from "../../../contexts/GameContext";

const SOUS_CHEF_BASE_COST = 50;
const MAINTENANCE_BASE_COST = 50;

const ESCALATION_MULTIPLIERS = [1.0, 1.5, 2.25, 3.0];
function getHireCost(base: number, currentCount: number): number {
  if (currentCount < ESCALATION_MULTIPLIERS.length) {
    return base * ESCALATION_MULTIPLIERS[currentCount];
  }
  return base * (ESCALATION_MULTIPLIERS[ESCALATION_MULTIPLIERS.length - 1] + 0.75 * (currentCount - ESCALATION_MULTIPLIERS.length + 1));
}

function totalRoleCost(base: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += getHireCost(base, i);
  return total;
}

const MAINTENANCE_TASK_LABELS: Record<MaintenanceTask, string> = {
  clean:            "Clean Store",
  repair_oven:      "Repair Oven (Bakery)",
  repair_slicer:    "Repair Meat Slicer (Deli)",
  repair_espresso:  "Repair Espresso Machine (Barista)",
};

const BAR_WARNING_THRESHOLD = 30;

interface BarProps {
  label: string;
  value: number;
}
function StatusBar({ label, value }: BarProps) {
  const warn = value <= BAR_WARNING_THRESHOLD;
  return (
    <div className="staff-tab__bar-row">
      <span className="staff-tab__bar-label">
        {label}{warn && " ⚠"}
      </span>
      <div className="staff-tab__bar-track">
        <div
          className="staff-tab__bar-fill"
          style={{
            width: `${value}%`,
            background: warn ? "var(--berry)" : "var(--sage)",
          }}
        />
      </div>
      <span className="staff-tab__bar-pct">{value}%</span>
    </div>
  );
}

interface StepperProps {
  label: string;
  sublabel: string;
  count: number;
  onDecrement: () => void;
  onIncrement: () => void;
  nextCost: number;
  totalCost: number;
}
function StationStepper({ label, sublabel, count, onDecrement, onIncrement, nextCost, totalCost }: StepperProps) {
  return (
    <div className="staff-tab__station">
      <div className="staff-tab__station-header">
        <span className="staff-tab__station-label">{label}</span>
        <span className="staff-tab__station-sublabel">{sublabel}</span>
      </div>
      <div className="staff-tab__stepper">
        <button
          className="staff-tab__stepper-btn"
          onClick={onDecrement}
          disabled={count <= 0}
        >
          −
        </button>
        <span className="staff-tab__stepper-value">{count}</span>
        <button className="staff-tab__stepper-btn" onClick={onIncrement}>
          +
        </button>
      </div>
      <div className="staff-tab__station-cost">
        Next hire: <strong>${nextCost.toFixed(0)}</strong>
        {" · "}Total: <strong>${totalCost.toFixed(0)}</strong>
      </div>
    </div>
  );
}

export function StaffTab() {
  const { maintenanceBars } = useGame();

  const [staffCounts, setStaffCounts] = useState<StaffCounts>({
    bakerySousChefs: 0,
    deliSousChefs: 0,
    baristaSousChefs: 0,
    maintenanceGuys: 0,
  });

  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);

  const adjust = (role: keyof StaffCounts, delta: number) => {
    setStaffCounts((prev) => {
      const next = Math.max(0, prev[role] + delta);
      const updated = { ...prev, [role]: next };
      if (role === "maintenanceGuys") {
        setMaintenanceTasks((tasks) => {
          if (delta > 0) return [...tasks, "clean"];
          return tasks.slice(0, next);
        });
      }
      return updated;
    });
  };

  const setTask = (index: number, task: MaintenanceTask) => {
    setMaintenanceTasks((prev) => {
      const updated = [...prev];
      updated[index] = task;
      return updated;
    });
  };

  const totalSousChefs =
    staffCounts.bakerySousChefs +
    staffCounts.deliSousChefs +
    staffCounts.baristaSousChefs;

  const grandTotal =
    totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.bakerySousChefs) +
    totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.deliSousChefs) +
    totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.baristaSousChefs) +
    totalRoleCost(MAINTENANCE_BASE_COST, staffCounts.maintenanceGuys);

  return (
    <div className="staff-tab">
      <h3 className="sidebar-tab__title">Staff</h3>

      {/* Maintenance status bars */}
      <div className="staff-tab__bars">
        <StatusBar label="Cleanliness"       value={maintenanceBars.cleanliness} />
        <StatusBar label="Oven Health"        value={maintenanceBars.ovenHealth} />
        <StatusBar label="Meat Slicer Health" value={maintenanceBars.slicerHealth} />
        <StatusBar label="Espresso Machine"   value={maintenanceBars.espressoHealth} />
      </div>

      <div className="staff-tab__divider" />

      {/* Sous chef station steppers */}
      <p className="sidebar-tab__hint">Sous Chefs</p>

      <StationStepper
        label="Bakery Station"
        sublabel="Croissant · Cookie"
        count={staffCounts.bakerySousChefs}
        onDecrement={() => adjust("bakerySousChefs", -1)}
        onIncrement={() => adjust("bakerySousChefs", 1)}
        nextCost={getHireCost(SOUS_CHEF_BASE_COST, staffCounts.bakerySousChefs)}
        totalCost={totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.bakerySousChefs)}
      />

      <StationStepper
        label="Deli"
        sublabel="Bagel · Sandwich"
        count={staffCounts.deliSousChefs}
        onDecrement={() => adjust("deliSousChefs", -1)}
        onIncrement={() => adjust("deliSousChefs", 1)}
        nextCost={getHireCost(SOUS_CHEF_BASE_COST, staffCounts.deliSousChefs)}
        totalCost={totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.deliSousChefs)}
      />

      <StationStepper
        label="Barista Station"
        sublabel="Coffee · Matcha"
        count={staffCounts.baristaSousChefs}
        onDecrement={() => adjust("baristaSousChefs", -1)}
        onIncrement={() => adjust("baristaSousChefs", 1)}
        nextCost={getHireCost(SOUS_CHEF_BASE_COST, staffCounts.baristaSousChefs)}
        totalCost={totalRoleCost(SOUS_CHEF_BASE_COST, staffCounts.baristaSousChefs)}
      />

      {totalSousChefs > 4 && (
        <p className="staff-tab__warning">
          ⚠ {totalSousChefs} sous chefs — kitchen satisfaction penalty active
        </p>
      )}

      <div className="staff-tab__divider" />

      {/* Maintenance guys */}
      <p className="sidebar-tab__hint">Maintenance</p>

      <StationStepper
        label="Maintenance Guy"
        sublabel="Cleaning · Machine Repair"
        count={staffCounts.maintenanceGuys}
        onDecrement={() => adjust("maintenanceGuys", -1)}
        onIncrement={() => adjust("maintenanceGuys", 1)}
        nextCost={getHireCost(MAINTENANCE_BASE_COST, staffCounts.maintenanceGuys)}
        totalCost={totalRoleCost(MAINTENANCE_BASE_COST, staffCounts.maintenanceGuys)}
      />

      {/* Per-maintenance-guy task assignment */}
      {staffCounts.maintenanceGuys > 0 && (
        <div className="staff-tab__tasks">
          {Array.from({ length: staffCounts.maintenanceGuys }).map((_, i) => (
            <div key={i} className="staff-tab__task-row">
              <span className="staff-tab__task-label">Guy {i + 1}</span>
              <select
                className="staff-tab__task-select"
                value={maintenanceTasks[i] ?? "clean"}
                onChange={(e) => setTask(i, e.target.value as MaintenanceTask)}
              >
                {(Object.keys(MAINTENANCE_TASK_LABELS) as MaintenanceTask[]).map((task) => (
                  <option key={task} value={task}>
                    {MAINTENANCE_TASK_LABELS[task]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="staff-tab__divider" />

      <div className="staff-tab__cost">
        Total Staff Cost: <strong>${grandTotal.toFixed(0)}</strong>
      </div>
    </div>
  );
}
