import { useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { HypeStars } from '../components/ui/HypeStars';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activeContracts, capOkWith } from '../lib/contracts';
import { askPrice, contractRate, fmtM, maxYears } from '../lib/money';
import type { CatalogPlayer } from '../types/models';

type Row = CatalogPlayer & { ask: number; inMarket: boolean };
const COLS = [
  ['name', 'Player'], ['position', 'Pos'], ['age', 'Age'], ['hype', 'Hype'],
  ['ask', '$/rd'], ['pts_per_game', 'PPG'], ['fg_attempts_per_game', 'FGA'],
  ['fg_pct', 'FG%'], ['three_pt_pct', '3P%'], ['rebounds_per_game', 'REB'],
  ['assists_per_game', 'AST'], ['steals_per_game', 'STL'], ['blocks_per_game', 'BLK'],
  ['turnovers_per_game', 'TOV'],
] as const;

export default function FreeAgencyPage() {
  const { game, team, catalog, market, call, gameId, membership } = useGame();
  const { form } = useSeasonForm();
  const isGM = membership?.role === 'GM';
  const [chip, setChip] = useState<'tonight' | 'all'>('tonight');
  const [pos, setPos] = useState<'' | 'G' | 'W' | 'B'>('');
  const [cheap, setCheap] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'ask', dir: -1 });
  const [sel, setSel] = useState<number | null>(null);
  const [years, setYears] = useState(1);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const rows = useMemo<Row[]>(() => {
    if (!market) return [];
    const avail = new Set(market.available);
    const all: Row[] = [];
    for (const p of catalog.values()) {
      const unsoldBase = market.unsoldPrices[p.pid];
      const isFa = p.salary_per_round !== '';
      if (!isFa && unsoldBase == null) continue; // auction-class, not fallen through → not a market row
      const base = isFa ? Number(p.salary_per_round) : Number(unsoldBase);
      all.push({ ...p, ask: askPrice(base, round), inMarket: avail.has(p.pid) });
    }
    return all;
  }, [catalog, market, round]);

  const view = useMemo(() => {
    let v = rows.filter((r) => (chip === 'tonight' ? r.inMarket : true));
    if (pos) v = v.filter((r) => r.position === pos);
    if (cheap) v = v.filter((r) => r.ask < 8);
    if (q) v = v.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    const num = (r: Row, k: string) =>
      k === 'ask' ? r.ask : Number((r as unknown as Record<string, string>)[k]);
    return [...v].sort((a, b) => sort.key === 'name'
      ? sort.dir * a.name.localeCompare(b.name)
      : sort.dir * (num(a, sort.key) - num(b, sort.key)));
  }, [rows, chip, pos, cheap, q, sort]);

  if (!game || !team || !market || catalog.size === 0) return null;
  const actives = activeContracts(team, round);
  const counts = { G: 0, W: 0, B: 0 };
  for (const c of actives) counts[catalog.get(c.pid)!.position] += 1;

  const selRow = sel != null ? rows.find((r) => r.pid === sel) : null;
  const my = maxYears(round);
  const rate = selRow ? contractRate(selRow.ask, Math.min(years, my)) : 0;
  const proposed = selRow ? {
    pid: selRow.pid, rate, startRound: round, years: Math.min(years, my),
    viaAuction: false, hardship: false,
  } : null;
  const cap = proposed ? capOkWith(team, proposed) : null;
  const full = actives.length >= 10;
  const live = selRow ? form.get(selRow.pid) : null;

  const sign = async () => {
    if (!selRow) return;
    setBusy(true); setErr(null); setNote('');
    try {
      await call('signPlayer', { gameId, pid: selRow.pid, years: Math.min(years, my) });
      // NON-EXCLUSIVE (spec §4.2): the row stays exactly as it is — never grey it.
      setNote(`Signed ${selRow.name} — ${fmtM(rate)}/rd × ${Math.min(years, my)}. He remains available to every team.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <PhaseHeader title={round === 1 ? 'Draft Night' : 'Free Agency'} round={round}
        timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      <PayrollBar team={team} round={round} />
      {round === 1 && (
        <p className="mono" role="status">
          Roster checklist: {actives.length}/8+ players · G {counts.G}/2 · W {counts.W}/2 · B {counts.B}/1
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        <button className={chip === 'tonight' ? 'chip on' : 'chip'}
          onClick={() => setChip('tonight')}>In market tonight ({rows.filter((r) => r.inMarket).length})</button>
        <button className={chip === 'all' ? 'chip on' : 'chip'}
          onClick={() => setChip('all')}>All players ({rows.length})</button>
        {(['G', 'W', 'B'] as const).map((p2) => (
          <button key={p2} className={pos === p2 ? 'chip on' : 'chip'}
            onClick={() => setPos(pos === p2 ? '' : p2)}>{p2}</button>
        ))}
        <button className={cheap ? 'chip on' : 'chip'}
          onClick={() => setCheap(!cheap)}>Under $8M</button>
        <input className="chip" style={{ minWidth: 100 }} placeholder="Search"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="search players" />
      </div>
      <ErrorNotice error={err} />
      {note && <p className="ok" data-testid="sign-note">{note}</p>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>
              {COLS.map(([key, label]) => (
                <th key={key} className={key === 'name' ? 'name' : ''}
                  onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                  {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.pid} className={sel === r.pid ? 'sel' : ''}
                  style={{ cursor: r.inMarket ? 'pointer' : 'default',
                    opacity: r.inMarket ? 1 : 0.4 }}
                  onClick={() => { if (r.inMarket) { setSel(r.pid); setYears(1); setNote(''); } }}>
                  <td className="name" style={{ fontFamily: 'inherit' }}>{r.name}</td>
                  <td><PositionBadge pos={r.position} /></td>
                  <td>{r.age}</td>
                  <td><HypeStars hype={Number(r.hype)} /></td>
                  <td>{r.ask.toFixed(1)}</td>
                  <td>{Number(r.pts_per_game).toFixed(1)}</td>
                  <td>{Number(r.fg_attempts_per_game).toFixed(1)}</td>
                  <td>{Number(r.fg_pct).toFixed(3)}</td>
                  <td>{Number(r.three_pt_pct).toFixed(3)}</td>
                  <td>{Number(r.rebounds_per_game).toFixed(1)}</td>
                  <td>{Number(r.assists_per_game).toFixed(1)}</td>
                  <td>{Number(r.steals_per_game).toFixed(1)}</td>
                  <td>{Number(r.blocks_per_game).toFixed(1)}</td>
                  <td>{Number(r.turnovers_per_game).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selRow && (
          <aside className="drawer" style={{ width: 240, flexShrink: 0, position: 'sticky', top: 60 }}>
            <strong>{selRow.name}</strong>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
              <PositionBadge pos={selRow.position} /> · {selRow.age}y ·{' '}
              <HypeStars hype={Number(selRow.hype)} /> · asks {fmtM(selRow.ask)}/rd tonight
            </div>
            <div className="mono muted" style={{ fontSize: 13 }}>
              this ssn {live ? `${live.ppg.toFixed(1)} ppg` : '—'}
            </div>
            <div style={{ margin: '10px 0' }}>
              {Array.from({ length: my }, (_, i) => i + 1).map((y) => (
                <button key={y} className={years === y ? 'chip on' : 'chip'}
                  style={{ marginRight: 4 }} onClick={() => setYears(y)}>
                  {y} rd — {fmtM(contractRate(selRow.ask, y))}
                </button>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 13 }}>
              {fmtM(rate)} × {Math.min(years, my)} rds = {fmtM(rate * Math.min(years, my))} committed
            </div>
            <div className="mono" style={{ fontSize: 13, margin: '6px 0' }}>
              {full ? <span className="neg">Roster full — 10 players is the maximum.</span>
                : cap!.ok
                  ? <span className="ok">Fits — peak payroll stays under {fmtM(100)}.</span>
                  : <span className="neg">Exceeds cap in round {cap!.worstRound}: {fmtM(cap!.worstPayroll!)}.</span>}
            </div>
            {!isGM && <p className="dim" style={{ fontSize: 13 }}>The GM signs this phase.</p>}
            <button className="btn green" style={{ width: '100%' }}
              disabled={busy || full || !cap!.ok || !isGM} onClick={() => void sign()}>
              Confirm signing
            </button>
          </aside>
        )}
      </div>
    </main>
  );
}
