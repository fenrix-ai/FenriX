import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activePids } from '../lib/contracts';
import { arrangeLineup } from '../lib/arrange';
import { fromLineup, isComplete, place, toLineup, type SlotId, type Slots } from '../lib/slots';
import { PLAYSTYLES, PLAYSTYLE_BLURBS, type Playstyle } from '../types/models';

function Card({ pid }: { pid: number }) {
  const { catalog } = useGame();
  const p = catalog.get(pid)!;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: pid });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="inset"
      style={{ cursor: 'grab', padding: '6px 8px', fontSize: 13, touchAction: 'none',
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}>
      <strong>{p.name}</strong> <PositionBadge pos={p.position} />
      <div className="mono dim">{Number(p.pts_per_game).toFixed(1)} ppg · {Number(p.rebounds_per_game).toFixed(1)} reb</div>
    </div>
  );
}

function Slot({ id, pid, label, cls = '' }: {
  id: SlotId; pid: number | null; label: string; cls?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`slot ${pid != null ? 'filled' : ''} ${cls}`}
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minWidth: 110, padding: 4 }}>
      {pid != null ? <Card pid={pid} /> : <span className="dim" style={{ fontSize: 12 }}>{label}</span>}
    </div>
  );
}

export default function LineupPage() {
  const { game, team, catalog, membership, call, gameId } = useGame();
  const [slots, setSlots] = useState<Slots | null>(null);
  const [style, setStyle] = useState<Playstyle>('Balanced');
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const isCoach = membership?.role === 'Coach';
  const active = useMemo(
    () => (team ? activePids(team, round) : []), [team, round]);

  useEffect(() => { // pre-arrange EVERY active pid (server requires all assigned)
    if (!team || catalog.size === 0 || active.length === 0 || slots) return;
    const arranged = arrangeLineup(active, catalog, team.lineup);
    setSlots(fromLineup(arranged, catalog));
    setStyle((arranged.playstyle as Playstyle) ?? 'Balanced');
  }, [team, catalog, active, slots]);

  if (!game || !team || !slots || catalog.size === 0) return null;

  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of [slots.g1, slots.g2, slots.w1, slots.w2, slots.b1]) {
    if (pid != null) counts[catalog.get(pid)!.position] += 1;
  }
  const legal = isComplete(slots) && counts.G === 2 && counts.W === 2 && counts.B === 1;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !isCoach) return;
    const next = place(slots, Number(e.active.id), e.over.id as SlotId, catalog);
    if (next) setSlots(next); // illegal drops are silently ignored (validation, not evaluation)
  };

  const submit = async () => {
    setBusy(true); setErr(null); setNote('');
    try {
      await call('submitLineup', { gameId, lineup: toLineup(slots, style) });
      setNote(`Lineup locked for round ${round} — you can revise until the phase closes.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <PhaseHeader title="Set Lineup" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      <ErrorNotice error={err} />
      {note && <p className="ok" role="status">{note}</p>}
      <DndContext onDragEnd={onDragEnd}>
        <div className="court">
          <div className="arc" />
          <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, display: 'flex',
            justifyContent: 'center', gap: 24 }}>
            <Slot id="g1" pid={slots.g1} label="GUARD" />
            <Slot id="g2" pid={slots.g2} label="GUARD" />
          </div>
          <div style={{ position: 'absolute', top: '48%', left: '3%' }}>
            <Slot id="w1" pid={slots.w1} label="WING" />
          </div>
          <div style={{ position: 'absolute', top: '48%', right: '3%' }}>
            <Slot id="w2" pid={slots.w2} label="WING" />
          </div>
          <div style={{ position: 'absolute', bottom: '6%', left: 0, right: 0,
            display: 'flex', justifyContent: 'center' }}>
            <Slot id="b1" pid={slots.b1} label="BIG" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div><div className="dim" style={{ fontSize: 12 }}>SIXTH MAN</div>
            <Slot id="sixth" pid={slots.sixth} label="SIXTH" cls="sixth" /></div>
          <div><div className="dim" style={{ fontSize: 12 }}>ACTIVE BENCH — these two play</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Slot id="bench1" pid={slots.bench1} label="BENCH 1" />
              <Slot id="bench2" pid={slots.bench2} label="BENCH 2" />
            </div></div>
          <div style={{ flex: 1 }}>
            <div className="dim" style={{ fontSize: 12 }}>INACTIVE DEPTH — no minutes tonight</div>
            <DepthZone pids={slots.depth} />
          </div>
        </div>
      </DndContext>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {PLAYSTYLES.map((s) => (
          <button key={s} className="card" disabled={!isCoach}
            style={{ flex: '1 0 120px', textAlign: 'left', cursor: 'pointer',
              border: style === s ? '1.5px solid var(--gold)' : '1px solid var(--border)' }}
            onClick={() => setStyle(s)}>
            <strong>{s}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{PLAYSTYLE_BLURBS[s]}</div>
          </button>
        ))}
      </div>

      <p className="mono" role="status">
        Lineup: {counts.G} G · {counts.W} W · {counts.B} B — {legal ? 'Legal' : 'Incomplete'} · Playstyle: {style}
      </p>
      {isCoach
        ? <button className="btn green" style={{ width: '100%' }} disabled={!legal || busy}
            onClick={() => void submit()}>Submit lineup</button>
        : <p className="dim">The Coach submits this phase.</p>}
    </main>
  );
}

function DepthZone({ pids }: { pids: number[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'depth' });
  return (
    <div ref={setNodeRef} className="slot"
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minHeight: 56,
        display: 'flex', gap: 8, justifyContent: 'flex-start', padding: 4, flexWrap: 'wrap' }}>
      {pids.length === 0 ? <span className="dim" style={{ fontSize: 12 }}>empty</span>
        : pids.map((pid) => <Card key={pid} pid={pid} />)}
    </div>
  );
}
