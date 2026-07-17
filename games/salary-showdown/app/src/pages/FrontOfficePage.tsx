import { useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { SectionCard } from '../components/ui/SectionCard';
import { TickerBar } from '../components/ui/TickerBar';
import { PositionBadge } from '../components/ui/PositionBadge';
import { HypeStars } from '../components/ui/HypeStars';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activeContracts, expiringPids } from '../lib/contracts';
import { askPrice, contractRate, fmtM, hypeCurve, maxYears } from '../lib/money';
import type { CatalogPlayer, Contract } from '../types/models';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

function StatLine({ p, form }: {
  p: CatalogPlayer; form: Map<number, { ppg: number }>;
}) {
  const live = form.get(p.pid);
  return (
    <div className="mono muted" style={{ fontSize: 13 }}>
      this ssn {live ? live.ppg.toFixed(1) : '—'} ppg / <span className="dim">listed {Number(p.pts_per_game).toFixed(1)} ppg</span>
    </div>
  );
}

export default function FrontOfficePage() {
  const { game, team, catalog, call, gameId, membership } = useGame();
  const { form } = useSeasonForm();
  const isGM = membership?.role === 'GM';
  const [err, setErr] = useState<unknown>(null);
  const [walked, setWalked] = useState<Set<number>>(new Set());
  const [resignYears, setResignYears] = useState<Record<number, number>>({});
  const [cutTarget, setCutTarget] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const actives = useMemo(
    () => (team ? activeContracts(team, round) : []), [team, round]);
  const stillExpiring = useMemo(
    () => (team ? expiringPids(team, round) : []), [team, round]);
  // signPlayer REPLACES the roster entry on a re-sign (it's the same pid, new
  // contract), so the instant one succeeds it drops out of expiringPids entirely —
  // during FRONT_OFFICE that can only mean a re-sign (validateSigning restricts
  // resigns to expiring pids), so union it back in by startRound === round. This
  // keeps the section's "n of n decided" denominator fixed at how many contracts
  // actually expired this round, with resigned rows staying visible (dimmed).
  const justResigned = useMemo(
    () => actives.filter((c) => c.startRound === round).map((c) => c.pid),
    [actives, round]);
  const expiring = useMemo(
    () => [...stillExpiring, ...justResigned], [stillExpiring, justResigned]);
  const tonightStars = useMemo(
    () => [...catalog.values()].filter((p) => Number(p.auction_round) === round),
    [catalog, round]);

  if (!game || !team || catalog.size === 0) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const decidedCount = expiring.filter(
    (pid) => walked.has(pid) || actives.some((c) => c.pid === pid && c.startRound === round)).length;

  return (
    <main className="page">
      <PhaseHeader title="Front Office" round={round} timerEndsAt={game.timerEndsAt} />
      <PayrollBar team={team} round={round} />
      {!isGM && <p className="dim">The GM acts this phase — decisions shown are read-only.</p>}
      <ErrorNotice error={err} />

      <SectionCard num={1} title="Expiring deals" status={`${decidedCount} of ${expiring.length} decided`}>
        {expiring.length === 0 && <p className="dim">No contracts expired this round.</p>}
        {expiring.map((pid) => {
          const p = catalog.get(pid)!;
          // Re-sign = ordinary signing at the CURRENT ask (spec §13). Auction-class
          // stars have no list price: base = hypeCurve(hype), mirroring the server.
          const base = p.salary_per_round !== '' ? Number(p.salary_per_round) : hypeCurve(Number(p.hype));
          const ask = askPrice(base, round);
          const yrs = resignYears[pid] ?? 1;
          const done = walked.has(pid) || actives.some((c) => c.pid === pid && c.startRound === round);
          return (
            <div key={pid} className="card" style={{ marginTop: 8, display: 'flex', gap: 10,
              alignItems: 'center', flexWrap: 'wrap', opacity: done ? 0.55 : 1 }}>
              <span className="num">{initials(p.name)}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong>{p.name}</strong> <PositionBadge pos={p.position} />
                <span className="muted"> {p.age}y</span>
                <StatLine p={p} form={form} />
              </div>
              <span className="mono">asks {fmtM(ask)}/rd</span>
              <select className="inset" style={{ color: 'inherit' }} value={yrs} disabled={done || busy || !isGM}
                aria-label={`years for ${p.name}`}
                onChange={(e) => setResignYears((m) => ({ ...m, [pid]: Number(e.target.value) }))}>
                {Array.from({ length: maxYears(round) }, (_, i) => i + 1).map((y) => (
                  <option key={y} value={y}>{y} rd — {fmtM(contractRate(ask, y))}/rd</option>
                ))}
              </select>
              <button className="btn green" disabled={done || busy || !isGM}
                onClick={() => void act(() => call('signPlayer', { gameId, pid, years: yrs }))}>
                Re-sign
              </button>
              <button className="btn" disabled={done || busy || !isGM}
                onClick={() => setWalked((s) => new Set(s).add(pid))}>Let walk</button>
            </div>
          );
        })}
      </SectionCard>

      <SectionCard num={2} title="Your roster" status={`${actives.length} players`}>
        {actives.map((c) => {
          const p = catalog.get(c.pid)!;
          const last = c.startRound + c.years - 1;
          return (
            <div key={c.pid} className="card" style={{ marginTop: 8, display: 'flex', gap: 10,
              alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="num">{initials(p.name)}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong>{p.name}</strong> <PositionBadge pos={p.position} />
                <span className="muted"> {p.age}y</span>
                <StatLine p={p} form={form} />
              </div>
              <span className="mono">{fmtM(c.rate)} × {last - round + 1} rd{c.hardship ? ' · hardship' : ''}</span>
              <button className="btn cut" disabled={busy || !isGM} onClick={() => setCutTarget(c)}>Cut</button>
            </div>
          );
        })}
      </SectionCard>

      <SectionCard num={3} title="Tonight's market" status={`${tonightStars.length} stars on the block`}>
        <TickerBar tag="SCOUT WIRE">League office confirms tonight's auction class.</TickerBar>
        <div style={{ marginTop: 8 }}>
          {tonightStars.map((p) => (
            // Name / position / hype ONLY (spec §4.1) — the mock's star ages are a listed erratum.
            <div key={p.pid} className="inset" style={{ marginTop: 6, display: 'flex', gap: 10 }}>
              <strong style={{ flex: 1 }}>{p.name}</strong>
              <PositionBadge pos={p.position} />
              <HypeStars hype={Number(p.hype)} />
            </div>
          ))}
          <p className="dim" style={{ marginBottom: 0 }}>Free-agent pool refreshes when the market opens.</p>
        </div>
      </SectionCard>

      {cutTarget && (() => {
        const p = catalog.get(cutTarget.pid)!;
        const end = cutTarget.startRound + cutTarget.years - 1;
        const roundsCharged = end - round + 1; // cut round + every later covered round
        return (
          <div className="drawer" role="dialog" aria-label="confirm cut"
            style={{ position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 688, margin: '0 auto' }}>
            <strong>Cut {p.name}?</strong>
            <p className="mono" style={{ margin: '8px 0' }}>
              His roster spot opens now. {fmtM(cutTarget.rate)}/rd stays on your cap as dead money
              for {roundsCharged} round{roundsCharged === 1 ? '' : 's'} — {fmtM(cutTarget.rate * roundsCharged)} total.
            </p>
            <button className="btn cut" disabled={busy || !isGM} onClick={() => void act(async () => {
              await call('cutRosterPlayer', { gameId, pid: cutTarget.pid });
              setCutTarget(null);
            })}>Confirm cut</button>{' '}
            <button className="btn" onClick={() => setCutTarget(null)}>Keep him</button>
          </div>
        );
      })()}
    </main>
  );
}
