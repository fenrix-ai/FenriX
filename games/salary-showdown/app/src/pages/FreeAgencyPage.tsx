import { useMemo, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { useActionReceipt } from '../hooks/useActionReceipt';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { HypeStars } from '../components/ui/HypeStars';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { PlayerCard } from '../components/players/PlayerCard';
import { CompareTray } from '../components/market/CompareTray';
import { ContractComposer } from '../components/market/ContractComposer';
import { RosterRail } from '../components/market/RosterRail';
import { isSynthetic } from '../lib/contracts';
import { askPrice, contractRate, fmtM, maxYears } from '../lib/money';
import type { CatalogPlayer } from '../types/models';
import styles from './FreeAgencyPage.module.css';

type Row = CatalogPlayer & { ask: number; inMarket: boolean };
const COLS = [
  ['name', 'Player'], ['position', 'Pos'], ['age', 'Age'], ['hype', 'Hype'],
  ['ask', '$/rd'], ['pts_per_game', 'PPG'], ['fg_attempts_per_game', 'FGA'],
  ['fg_pct', 'FG%'], ['three_pt_pct', '3P%'], ['rebounds_per_game', 'REB'],
  ['assists_per_game', 'AST'], ['steals_per_game', 'STL'], ['blocks_per_game', 'BLK'],
  ['turnovers_per_game', 'TOV'],
] as const;

export default function FreeAgencyPage() {
  const { gameId, game, membership } = useGame();
  const { uid } = useAuth();
  const scope = `${gameId}/${game?.round}/${game?.phase}/${membership?.teamId}/${uid}`;
  // A new session scope cannot inherit drafts, errors or late acknowledgments.
  return <MarketWorkspace key={scope} scope={scope} />;
}

function MarketWorkspace({ scope }: { scope: string }) {
  const { game, team, catalog, market, call, gameId, membership, actsAs } = useGame();
  const { form } = useSeasonForm();
  const { receipt, run } = useActionReceipt(scope);
  const isGM = actsAs('GM');
  const gmFallback = isGM && membership?.role !== 'GM';
  const [chip, setChip] = useState<'tonight' | 'all'>('tonight');
  const [pos, setPos] = useState<'' | 'G' | 'W' | 'B'>('');
  const [cheap, setCheap] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'ask', dir: -1 });
  const [sel, setSel] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, number>>({});
  const [compared, setCompared] = useState<number[]>([]);
  const [compareMessage, setCompareMessage] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [doneErr, setDoneErr] = useState<unknown>(null);
  const [pending, setPending] = useState<number | 'done' | null>(null);
  const [acceptedPid, setAcceptedPid] = useState<number | null>(null);
  const inFlight = useRef(false);
  const round = game?.round ?? 1;
  const rows = useMemo<Row[]>(() => {
    if (!market) return [];
    const avail = new Set(market.available);
    const all: Row[] = [];
    for (const p of catalog.values()) {
      if (isSynthetic(p.pid)) continue; // Default Role Players are never a signable FA/market row
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
    return [...v].sort((a, b) => (sort.key === 'name' || sort.key === 'position')
      ? sort.dir * String(a[sort.key as 'name' | 'position']).localeCompare(String(b[sort.key as 'name' | 'position']))
      : sort.dir * (num(a, sort.key) - num(b, sort.key)));
  }, [rows, chip, pos, cheap, q, sort]);

  if (!game || !team || !market || catalog.size === 0) return null;
  const selRow = rows.find((r) => r.pid === sel);
  const years = sel == null ? 1 : Math.min(drafts[sel] ?? 1, maxYears(round));
  const live = selRow ? form.get(selRow.pid) : null;
  const comparisonPlayers = compared.flatMap((pid) => {
    const player = catalog.get(pid); return player ? [player] : [];
  });
  const isDone = team.doneRound === game.round && team.donePhase === game.phase;
  function compare(pid: number) {
    if (compared.includes(pid)) { setCompared(compared.filter((id) => id !== pid)); setCompareMessage(''); }
    else if (compared.length === 3) setCompareMessage('Compare up to three players. Remove one to add another.');
    else { setCompared([...compared, pid]); setCompareMessage(''); }
  }
  async function sign() {
    if (!selRow || inFlight.current || !isGM || !selRow.inMarket) return;
    inFlight.current = true;
    setPending(selRow.pid); setErr(null);
    const label = `Signed ${selRow.name} — ${fmtM(contractRate(selRow.ask, years))}/rd × ${years}. He remains available to every team.`;
    try {
      await run(label, () => call('signPlayer', { gameId, pid: selRow.pid, years }));
      setAcceptedPid(selRow.pid);
    } catch (e) { setErr(e); }
    finally { inFlight.current = false; setPending(null); }
  }
  async function markDone() {
    if (inFlight.current || !isGM) return;
    inFlight.current = true; setPending('done'); setDoneErr(null);
    try { await call('markDone', { gameId }); }
    catch (e) { setDoneErr(e); }
    finally { inFlight.current = false; setPending(null); }
  }
  return <main className={`page ${styles.page}`}>
    <PhaseHeader title={round === 1 ? 'Draft Night' : 'Free Agency'} round={round}
      timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
    <div className={styles.summary}>
      <PayrollBar team={team} round={round} />
      {isGM && <button className="btn gold" disabled={pending !== null} onClick={() => void markDone()}>
        {pending === 'done' ? 'Noting done…' : isDone ? 'Done noted' : "We're done"}
      </button>}
    </div>
    {isDone && <p className="ok" data-testid="done-note">Marked done — you can still make changes until the phase closes.</p>}
    <ErrorNotice error={doneErr} />
    {gmFallback && <p className={styles.muted} data-testid="role-fallback">No GM on your team — any member may sign.</p>}
    <div className={styles.workspace}>
      <details className={styles.rosterDrawer}>
        <summary>Your roster · show / hide</summary>
        <RosterRail team={team} round={round} catalog={catalog}
          accepted={receipt && acceptedPid !== null ? { pid: acceptedPid, id: receipt.id } : null} />
      </details>
      <section className={styles.catalog} aria-label="Player catalog">
        <header className={styles.sectionHeader}><h2>Build your roster</h2><span>Round {round} market</span></header>
        <div className={styles.filters}>
          <button className={chip === 'tonight' ? 'chip on' : 'chip'} aria-pressed={chip === 'tonight'}
            onClick={() => setChip('tonight')}>In market tonight ({rows.filter((r) => r.inMarket).length})</button>
          <button className={chip === 'all' ? 'chip on' : 'chip'} aria-pressed={chip === 'all'}
            onClick={() => setChip('all')}>All players ({rows.length})</button>
          {(['G', 'W', 'B'] as const).map((p) => <button key={p} className={pos === p ? 'chip on' : 'chip'}
            aria-pressed={pos === p} onClick={() => setPos(pos === p ? '' : p)}>{p}</button>)}
          <button className={cheap ? 'chip on' : 'chip'} aria-pressed={cheap}
            onClick={() => setCheap(!cheap)}>Under $8M</button>
          <input className="chip" placeholder="Search players" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="search players" />
        </div>
        <p className={styles.tableHint}>{view.length} players shown · Scroll table for all stats. Ordinary free agents remain available to every team.</p>
        <div className={styles.tableScroll} role="region" aria-label="Market statistics" tabIndex={0}>
          <table className={`table ${styles.marketTable}`}>
            <thead><tr>{COLS.map(([key, label]) => <th key={key} scope="col"
              aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
              <button aria-label={`Sort by ${label}`} onClick={() => setSort((s) => ({ key,
                dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
              </button></th>)}</tr></thead>
            <tbody>{view.map((r) => <tr key={r.pid} data-selected={sel === r.pid || undefined}>
              <td className={styles.playerName}><button aria-pressed={sel === r.pid} disabled={pending !== null}
                onClick={() => { setSel(r.pid); setErr(null); setAcceptedPid(null); }}>{r.name}</button>
                <button className={compared.includes(r.pid) ? 'chip on' : 'chip'}
                aria-label={`Compare ${r.name}`} aria-pressed={compared.includes(r.pid)}
                onClick={() => compare(r.pid)}>Compare</button>
                {!r.inMarket && <small>Not in market tonight</small>}</td>
              <td><PositionBadge pos={r.position} /></td><td>{r.age}</td>
              <td><HypeStars hype={Number(r.hype)} /></td><td>{r.ask.toFixed(1)}</td>
              {COLS.slice(5).map(([key]) => <td key={key}>{Number(r[key]).toFixed(key.endsWith('pct') ? 3 : 1)}</td>)}
            </tr>)}</tbody>
          </table>
          {view.length === 0 && <p className={styles.empty}>No players match these filters. Try another name or position.</p>}
        </div>
        <p role="status" className={styles.limit}>{compareMessage}</p>
        <CompareTray players={comparisonPlayers} onRemove={(pid) => {
          setCompared(compared.filter((id) => id !== pid)); setCompareMessage('');
        }} />
      </section>
      <aside className={`drawer ${styles.detail}`} aria-label="Player details and contract">
        <h2>Player details</h2>
        {selRow ? <>
          <div key={receipt && acceptedPid === selRow.pid ? `${selRow.pid}-${receipt.id}` : selRow.pid}
            className={receipt && acceptedPid === selRow.pid ? styles.accepted : undefined}>
            <PlayerCard player={selRow} identity={team.identity} selected />
          </div>
          <p className={styles.muted}>This season: {live ? `${live.ppg.toFixed(1)} PPG` : '—'}</p>
          <ErrorNotice error={err} />
          {receipt && <p key={receipt.id} role="status" className="ok" data-testid="sign-note">{receipt.label}</p>}
          <ContractComposer team={team} round={round} pid={selRow.pid} ask={selRow.ask} years={years}
            onYears={(value) => setDrafts({ ...drafts, [selRow.pid]: value })} onSign={() => void sign()}
            inMarket={selRow.inMarket} canSign={isGM} pending={pending === selRow.pid} blocked={pending !== null} />
        </> : <p>Select a player to inspect their stats, choose a contract, and see all five payroll rounds.</p>}
      </aside>
    </div>
  </main>;
}
