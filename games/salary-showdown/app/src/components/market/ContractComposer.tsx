import { activeContracts, capOkWith } from '../../lib/contracts';
import { contractRate, fmtM, maxYears } from '../../lib/money';
import { PayrollTimeline } from '../contracts/PayrollTimeline';
import type { TeamDoc } from '../../types/models';
import styles from '../../pages/FreeAgencyPage.module.css';

export function ContractComposer({ team, round, pid, ask, years, onYears, onSign,
  canSign, inMarket, pending, blocked = false }: {
  team: TeamDoc; round: number; pid: number; ask: number; years: number;
  onYears: (years: number) => void; onSign: () => void; canSign: boolean;
  inMarket: boolean; pending: boolean; blocked?: boolean;
}) {
  const term = Math.min(years, maxYears(round));
  const rate = contractRate(ask, term);
  const contract = { pid, rate, startRound: round, years: term, viaAuction: false, hardship: false };
  const actives = activeContracts(team, round);
  const owned = actives.some((c) => c.pid === pid);
  const cap = capOkWith(team, contract);
  const full = actives.length >= 10;
  return <div className={styles.composer}>
    <h3>Contract offer</h3>
    <p>asks {fmtM(ask)}/rd tonight</p>
    <div className={styles.terms} role="group" aria-label="Contract duration">
      {Array.from({ length: maxYears(round) }, (_, i) => i + 1).map((y) =>
        <button className={term === y ? 'chip on' : 'chip'} key={y} aria-pressed={term === y}
          disabled={pending} onClick={() => onYears(y)}>{y} rd — {fmtM(contractRate(ask, y))}</button>)}
    </div>
    <strong className={styles.guarantee}>{fmtM(rate * term)} guaranteed</strong>
    <p className="mono">{fmtM(rate)}/rd × {term} · Rounds {round}–{round + term - 1}</p>
    <p>Salary is charged every covered round. Cutting a player leaves dead money.</p>
    {owned ? <p>Already on your roster. The timeline shows your saved payroll.</p>
      : full ? <p className="neg">Roster full — 10 players is the maximum.</p>
      : cap.ok ? <p className="ok">Fits — peak payroll stays under {fmtM(100)}.</p>
      : <p className="neg">Exceeds cap in round {cap.worstRound}: {fmtM(cap.worstPayroll!)}.</p>}
    {!inMarket && <p>Not in market tonight. You can still inspect and compare this player.</p>}
    {!canSign && <p>The GM signs this phase.</p>}
    <button className="btn gold" disabled={(!owned && (full || !cap.ok)) || !canSign || !inMarket}
      aria-disabled={pending || blocked}
      onClick={() => { if (!pending && !blocked) onSign(); }}>{pending ? 'Signing…' : 'Confirm signing'}</button>
    <div className={styles.payrollPreview} tabIndex={0} role="region" aria-label="Contract payroll preview — scroll for all five rounds">
      <PayrollTimeline team={team} round={round} preview={owned || !inMarket ? undefined : contract} />
    </div>
  </div>;
}
