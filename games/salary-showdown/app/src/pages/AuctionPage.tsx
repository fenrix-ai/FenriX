import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { PositionBadge } from '../components/ui/PositionBadge';
import { HypeStars } from '../components/ui/HypeStars';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { payrollAt } from '../lib/contracts';
import { CAP, fmtM, maxYears, minBid, r01, TOTAL_ROUNDS } from '../lib/money';
import type { AuctionDoc } from '../types/models';

interface Draft { rate: string; years: number }
const fansM = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M fans` : `${Math.round(n / 1e3)}k fans`;

export default function AuctionPage() {
  const { game, team, catalog, membership, call, gameId } = useGame();
  const [wave, setWave] = useState<AuctionDoc | null>(null);
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const isScout = membership?.role === 'Scout';
  const my = maxYears(round);
  const floor = minBid(round);

  useEffect(() => { // tonight's wave
    if (!gameId || round < 1) return;
    return onSnapshot(doc(db, 'games', gameId, 'auctions', String(round)),
      (s) => setWave(s.exists() ? (s.data() as AuctionDoc) : null));
  }, [gameId, round]);

  useEffect(() => { // own team's stored bids (private doc, readable by teammates)
    if (!gameId || !membership) return;
    return onSnapshot(doc(db, 'games', gameId, 'teams', membership.teamId, 'private', 'auction'),
      (s) => {
        const d = s.data() as { bids?: Record<string, { rate: number; years: number }>; round?: number } | undefined;
        if (!d?.bids || d.round !== round) return;
        setDraft(Object.fromEntries(Object.entries(d.bids).map(
          ([pid, b]) => [Number(pid), { rate: b.rate.toFixed(1), years: b.years }])));
      });
  }, [gameId, membership, round]);

  const bids = useMemo(() => {
    const out: Record<number, { rate: number; years: number }> = {};
    for (const [pid, d] of Object.entries(draft)) {
      const rate = Number(d.rate);
      if (d.rate !== '' && Number.isFinite(rate) && rate > 0) {
        out[Number(pid)] = { rate: r01(rate), years: d.years };
      }
    }
    return out;
  }, [draft]);

  const problems = useMemo(() => {
    const out: Record<number, string> = {};
    for (const [pid, b] of Object.entries(bids)) {
      if (b.rate < floor - 1e-9) out[Number(pid)] = `Minimum tonight is ${fmtM(floor)}.`;
      else if (Math.abs(b.rate * 10 - Math.round(b.rate * 10)) > 1e-6) {
        out[Number(pid)] = 'Bids move in $0.1M steps.';
      }
    }
    return out;
  }, [bids, floor]);

  // Exposure: worst case if EVERY bid wins — peak payroll across covered rounds.
  // Over-cap exposure is LEGAL (spec §4.3); the meter informs, it does not block.
  const exposure = useMemo(() => {
    if (!team) return null;
    let worst = { round, payroll: 0 };
    for (let r = round; r <= TOTAL_ROUNDS; r++) {
      let p = payrollAt(team, r);
      for (const b of Object.values(bids)) if (r < round + b.years) p = r01(p + b.rate);
      if (p > worst.payroll) worst = { round: r, payroll: p };
    }
    return worst;
  }, [team, bids, round]);

  if (!game || !team || !wave || catalog.size === 0) return null;

  const lockIn = async () => {
    setBusy(true); setErr(null); setNote('');
    try {
      // ALWAYS a plain object — {} clears every bid; never send null.
      await call('submitBids', { gameId, bids });
      setNote(`Bids locked (${Object.keys(bids).length}) — you can revise until the phase closes.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <PhaseHeader title="Star Auction" round={round} timerEndsAt={game.timerEndsAt} />
      <PayrollBar team={team} round={round} />
      <div className="inset" style={{ border: '1.5px dashed var(--gold)', margin: '10px 0' }}>
        Sealed contract offers: salary per round × years. The most guaranteed money wins.
        Winners pay their own offer; losers pay nothing. Minimum tonight: <span className="mono">{fmtM(floor)}</span>
        {my > 1 ? ` · years 1–${my}` : ' · one-round offers only'}.
      </div>
      <ErrorNotice error={err} />
      {note && <p className="ok" role="status">{note}</p>}

      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {wave.stars.map((pid) => {
          const p = catalog.get(pid)!;
          const d = draft[pid] ?? { rate: '', years: 1 };
          const b = bids[pid];
          const g = b ? r01(b.rate * b.years) : null;
          return (
            <div key={pid} className="card" style={{ minWidth: 170, flex: '1 0 170px' }}>
              <strong>{p.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                <PositionBadge pos={p.position} /> {p.age}y · grade {p.scout_grade}
              </div>
              <HypeStars hype={Number(p.hype)} />
              <div className="mono muted" style={{ fontSize: 12, margin: '6px 0' }}>
                {Number(p.pts_per_game).toFixed(1)} p / {Number(p.fg_attempts_per_game).toFixed(1)} fga<br />
                {Number(p.fg_pct).toFixed(3)} fg / {Number(p.turnovers_per_game).toFixed(1)} to<br />
                {fansM(Number(p.social_media_followers))}
              </div>
              <input className="inset mono" style={{ color: 'inherit', width: '100%' }}
                placeholder={`$${floor.toFixed(1)}+`} inputMode="decimal" disabled={!isScout}
                aria-label={`salary for ${p.name}`} value={d.rate}
                onChange={(e) => setDraft((m) => ({ ...m, [pid]: { ...d, rate: e.target.value } }))} />
              <div style={{ margin: '6px 0' }}>
                {Array.from({ length: my }, (_, i) => i + 1).map((y) => (
                  <button key={y} className={d.years === y ? 'chip on' : 'chip'} disabled={!isScout}
                    onClick={() => setDraft((m) => ({ ...m, [pid]: { ...d, years: y } }))}>{y}</button>
                ))}
              </div>
              <div className="mono" style={{ fontSize: 13 }}>
                {problems[pid] ? <span className="neg">{problems[pid]}</span>
                  : g != null ? `= ${fmtM(g)} gtd` : <span className="dim">no bid</span>}
              </div>
            </div>
          );
        })}
      </div>

      {exposure && Object.keys(bids).length > 0 && (
        <p className="mono" role="status">
          Worst case if all bids win: peak payroll {fmtM(exposure.payroll)} / {fmtM(CAP)} (round {exposure.round}) —{' '}
          {exposure.payroll <= CAP
            ? <span className="ok">fits</span>
            : <span style={{ color: 'var(--gold)' }}>over the cap — over-cap wins are skipped at resolution, this is allowed</span>}
        </p>
      )}
      {isScout
        ? <button className="btn gold" style={{ width: '100%' }}
            disabled={busy || Object.keys(problems).length > 0} onClick={() => void lockIn()}>
            Lock in bids
          </button>
        : <p className="dim">The Scout submits this phase. Bids shown are your team's current sealed set.</p>}
    </main>
  );
}
