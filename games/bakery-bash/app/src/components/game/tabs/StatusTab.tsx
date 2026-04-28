import { useGame } from "../../../contexts/GameContext";

const GRADE_COLORS: Record<string, string> = {
  A: "var(--sage)",
  B: "var(--lime)",
  C: "var(--honey)",
  D: "var(--honey)",
  E: "var(--berry)",
  F: "var(--berry)",
};

interface GradeProps {
  label: string;
  grade: string;
  hint: string;
}

function GradeDisplay({ label, grade, hint }: GradeProps) {
  const color = GRADE_COLORS[grade] || "var(--honey)";
  return (
    <div className="status-tab__grade-row">
      <div className="status-tab__grade-label">{label}</div>
      <div
        className="status-tab__grade-letter"
        style={{ color, fontSize: "3rem", fontWeight: 700, lineHeight: 1 }}
        aria-label={`${label} grade ${grade}`}
      >
        {grade}
      </div>
      <div className="status-tab__grade-hint" style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        {hint}
      </div>
    </div>
  );
}

export function StatusTab() {
  const { equipmentGrade, cleanlinessGrade } = useGame();

  return (
    <div className="status-tab">
      <h3 className="sidebar-tab__title">Kitchen Status</h3>
      <p className="sidebar-tab__hint">
        Equipment and cleanliness are graded A through F. Equipment upgrades
        cost cash; cleanliness drifts each round based on maintenance staffing.
      </p>

      <div className="status-tab__grades" aria-label="Kitchen status grades">
        <GradeDisplay
          label="Equipment"
          grade={equipmentGrade}
          hint="Upgrade during the Decide phase"
        />
        <GradeDisplay
          label="Cleanliness"
          grade={cleanlinessGrade}
          hint="Hire maintenance staff to keep this up"
        />
      </div>
    </div>
  );
}
