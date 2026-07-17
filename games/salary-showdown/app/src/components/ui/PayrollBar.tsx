import type { TeamDoc } from '../../types/models';
import { payrollSplitAt } from '../../lib/contracts';
import { CAP, fmtM, r01 } from '../../lib/money';

// Segment widths are COMPUTED percentages of the cap — the mock's hard-coded
// 70%/8% widths are a known sample-number error (spec §11 Mockup errata).
export function PayrollBar({ team, round }: { team: TeamDoc; round: number }) {
  const { cash, dead } = payrollSplitAt(team, round);
  const room = r01(CAP - cash - dead);
  return (
    <div className="payroll" data-testid="payroll-bar">
      <span className="mono">
        Payroll {fmtM(cash)}{dead > 0 ? <> + <span className="neg">{fmtM(dead)} dead</span></> : null}
        {' '}/ {fmtM(CAP)} cap · <span className={room < 0 ? 'neg' : 'ok'}>{fmtM(room)} room</span>
      </span>
      <div className="track">
        <div className="cash" style={{ width: `${Math.min(100, (cash / CAP) * 100)}%` }} />
        <div className="dead" style={{ width: `${Math.min(100, (dead / CAP) * 100)}%` }} />
      </div>
    </div>
  );
}
