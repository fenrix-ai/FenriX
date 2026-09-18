import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { CourtSlot } from '../components/lineup/CourtSlot';
import { LineupPlayerSummary, LineupRoster } from '../components/lineup/LineupRoster';
import { PlacementStatus } from '../components/lineup/PlacementStatus';
import { activePids } from '../lib/contracts';
import { arrangeLineup } from '../lib/arrange';
import { resolveIdentity } from '../lib/franchiseIdentity';
import { useActionReceipt } from '../hooks/useActionReceipt';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fromLineup, isComplete, place, toLineup, type SlotId, type Slots } from '../lib/slots';
import {
  PLAYSTYLES,
  PLAYSTYLE_BLURBS,
  type CatalogPlayer,
  type Playstyle,
  type Position,
} from '../types/models';
import controls from '../components/lineup/LineupControls.module.css';
import styles from './LineupPage.module.css';

const SLOT_LABELS: Record<SlotId, string> = {
  g1: 'Guard 1',
  g2: 'Guard 2',
  w1: 'Wing 1',
  w2: 'Wing 2',
  b1: 'Big',
  sixth: 'Sixth player',
  bench1: 'Active bench 1',
  bench2: 'Active bench 2',
  depth: 'Inactive depth',
};

const COURT_POSITION: Partial<Record<SlotId, Position>> = {
  g1: 'G', g2: 'G', w1: 'W', w2: 'W', b1: 'B',
};

const SLOT_ORDER: SlotId[] = [
  'g1', 'g2', 'w1', 'w2', 'b1', 'sixth', 'bench1', 'bench2', 'depth',
];

function pidAt(slots: Slots, slot: SlotId): number | null {
  return slot === 'depth' ? null : slots[slot];
}

function slotForPid(slots: Slots, pid: number): SlotId | null {
  for (const slot of SLOT_ORDER) {
    if (slot === 'depth') {
      if (slots.depth.includes(pid)) return slot;
    } else if (slots[slot] === pid) {
      return slot;
    }
  }
  return null;
}

function positionName(position: Position): string {
  if (position === 'G') return 'Guard';
  if (position === 'W') return 'Wing';
  return 'Big';
}

function SlotDropZone({
  id,
  slots,
  selectedPid,
  canEdit,
  eligible,
  recent,
  catalog,
  onChoose,
}: {
  id: SlotId;
  slots: Slots;
  selectedPid: number | null;
  canEdit: boolean;
  eligible: boolean;
  recent: boolean;
  catalog: ReadonlyMap<number, CatalogPlayer>;
  onChoose: () => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit });
  const pid = pidAt(slots, id);
  const className = [
    styles.dropZone,
    styles[id],
    recent ? styles.accepted : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={setNodeRef} className={className} data-over={isOver || undefined}>
      <CourtSlot
        label={SLOT_LABELS[id]}
        pid={pid}
        eligible={canEdit && (selectedPid === null ? pid !== null : eligible)}
        onPlace={onChoose}
      >
        {id === 'depth' ? (
          slots.depth.length > 0 ? (
            <span className={controls.depthPlayers}>
              {slots.depth.map((depthPid) => {
                const player = catalog.get(depthPid);
                return player ? <LineupPlayerSummary key={depthPid} player={player} /> : null;
              })}
            </span>
          ) : <span className={controls.empty}>No inactive players</span>
        ) : pid !== null && catalog.get(pid) ? (
          <LineupPlayerSummary player={catalog.get(pid)!} />
        ) : undefined}
      </CourtSlot>
    </div>
  );
}

export default function LineupPage(): ReactElement {
  const { game, membership, gameId } = useGame();
  const { uid } = useAuth();
  const scope = [gameId, game?.round, game?.phase, membership?.teamId, uid].join('/');

  return <LineupWorkspace key={scope} scope={scope} />;
}

function LineupWorkspace({ scope }: { scope: string }): ReactElement | null {
  const { game, team, catalog, membership, call, gameId, actsAs } = useGame();
  const [slots, setSlots] = useState<Slots | null>(null);
  const [style, setStyle] = useState<Playstyle>('Balanced');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [dragPid, setDragPid] = useState<number | null>(null);
  const [placementMessage, setPlacementMessage] = useState(
    'Select a player, then choose a highlighted destination. Dragging is optional.',
  );
  const [recentSlot, setRecentSlot] = useState<SlotId | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const recentTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const round = game?.round ?? 1;
  const isCoach = actsAs('Coach');
  const coachFallback = isCoach && membership?.role !== 'Coach';
  const active = useMemo(
    () => (team ? activePids(team, round) : []),
    [team, round],
  );
  const identity = team && membership
    ? resolveIdentity(membership.teamId, team.identity)
    : undefined;
  const { receipt, run } = useActionReceipt(scope);

  useEffect(() => {
    if (!team || catalog.size === 0 || active.length === 0 || slots) return;
    if (team.lineupLockedRound === round && team.lineup) {
      setSlots(fromLineup(team.lineup, catalog));
      setStyle((team.lineup.playstyle as Playstyle) ?? 'Balanced');
      return;
    }
    const arranged = arrangeLineup(active, catalog, team.lineup);
    setSlots(fromLineup(arranged, catalog));
    setStyle((arranged.playstyle as Playstyle) ?? 'Balanced');
  }, [team, catalog, active, slots, round]);

  useEffect(() => () => {
    if (recentTimer.current !== null) window.clearTimeout(recentTimer.current);
  }, []);

  const liveSlots = useMemo(() => {
    if (!team || catalog.size === 0 || active.length === 0) return null;
    if (team.lineupLockedRound === round && team.lineup) {
      return fromLineup(team.lineup, catalog);
    }
    return fromLineup(arrangeLineup(active, catalog, team.lineup), catalog);
  }, [team, catalog, active, round]);
  const shown = isCoach ? slots : liveSlots;
  const shownStyle = isCoach
    ? style
    : ((team?.lineup?.playstyle as Playstyle) ?? 'Balanced');

  if (!game || !team || !shown || catalog.size === 0) return null;

  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of [shown.g1, shown.g2, shown.w1, shown.w2, shown.b1]) {
    if (pid !== null) counts[catalog.get(pid)!.position] += 1;
  }
  const legal = isComplete(shown) && counts.G === 2 && counts.W === 2 && counts.B === 1;
  const summary = `Lineup: ${counts.G} G · ${counts.W} W · ${counts.B} B — ${
    legal ? 'Legal' : 'Incomplete'
  } · Playstyle: ${shownStyle}`;

  const legalTargets = new Set<SlotId>();
  if (isCoach && slots && selectedPid !== null) {
    for (const target of SLOT_ORDER) {
      if (place(slots, selectedPid, target, catalog) !== null) legalTargets.add(target);
    }
  }

  const markAccepted = (target: SlotId) => {
    if (recentTimer.current !== null) window.clearTimeout(recentTimer.current);
    if (reducedMotion) {
      setRecentSlot(null);
      return;
    }
    setRecentSlot(target);
    recentTimer.current = window.setTimeout(() => setRecentSlot(null), 450);
  };

  const focusSlot = (label: string) => {
    window.requestAnimationFrame(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot-label]'))
        .find((candidate) => candidate.dataset.slotLabel === label);
      button?.focus();
    });
  };

  const selectPlayer = (pid: number) => {
    if (!isCoach) return;
    setSelectedPid(pid);
    setPlacementMessage(`${catalog.get(pid)!.name} selected. Choose a highlighted destination.`);
  };

  const attemptPlacement = (pid: number, target: SlotId, focusAfter: boolean) => {
    if (!isCoach || !slots) return;
    const source = slotForPid(slots, pid);
    const displaced = target === 'depth' ? null : slots[target];
    const next = place(slots, pid, target, catalog);
    if (!next) {
      const targetPosition = COURT_POSITION[target];
      const moving = catalog.get(pid)!;
      if (targetPosition && moving.position !== targetPosition) {
        setPlacementMessage(
          `${moving.name} cannot play ${SLOT_LABELS[target]}. Choose a ${
            positionName(moving.position)
          } slot or a reserve spot.`,
        );
      } else if (displaced !== null && source) {
        setPlacementMessage(
          `${catalog.get(displaced)!.name} cannot move to ${SLOT_LABELS[source]}, so that swap is not legal.`,
        );
      } else {
        setPlacementMessage(`${moving.name} cannot be placed in ${SLOT_LABELS[target]}.`);
      }
      if (focusAfter) focusSlot(SLOT_LABELS[target]);
      return;
    }

    setSlots(next);
    setSelectedPid(null);
    const moved = catalog.get(pid)!;
    const swapMessage = displaced !== null && displaced !== pid && source
      ? ` ${catalog.get(displaced)!.name} moved to ${SLOT_LABELS[source]}.`
      : '';
    setPlacementMessage(`Placed ${moved.name} in ${SLOT_LABELS[target]}.${swapMessage}`);
    markAccepted(target);
    if (focusAfter) focusSlot(SLOT_LABELS[target]);
  };

  const chooseSlot = (target: SlotId) => {
    if (!isCoach) return;
    if (selectedPid !== null) {
      attemptPlacement(selectedPid, target, false);
      return;
    }
    const pid = pidAt(shown, target);
    if (pid !== null) selectPlayer(pid);
  };

  const onDragStart = (event: DragStartEvent) => {
    const pid = Number(event.active.id);
    setDragPid(pid);
    selectPlayer(pid);
  };

  const onDragCancel = (_event: DragCancelEvent) => {
    setDragPid(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragPid(null);
    if (!event.over) return;
    attemptPlacement(Number(event.active.id), event.over.id as SlotId, true);
  };

  const cancelSelection = () => {
    if (selectedPid === null) return;
    setSelectedPid(null);
    setPlacementMessage('Placement cancelled.');
  };

  const submit = async () => {
    if (!slots) return;
    setBusy(true);
    setErr(null);
    try {
      await run(`Lineup saved for round ${round}`, () =>
        call('submitLineup', { gameId, lineup: toLineup(slots, style) }));
      setPlacementMessage(
        `Lineup saved for round ${round}. You can revise it until the phase closes.`,
      );
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  const renderSlot = (id: SlotId) => (
    <SlotDropZone
      key={id}
      id={id}
      slots={shown}
      selectedPid={selectedPid}
      canEdit={isCoach}
      eligible={legalTargets.has(id)}
      recent={recentSlot === id}
      catalog={catalog}
      onChoose={() => chooseSlot(id)}
    />
  );

  return (
    <main
      className={`page ${styles.page}`}
      data-accent={identity?.accent ?? 'gold'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancelSelection();
      }}
    >
      <PhaseHeader
        title="Set Lineup"
        round={round}
        timerEndsAt={game.timerEndsAt}
        timerPausedMs={game.timerPausedMs}
      />

      <div className={styles.noticeStack}>
        {team.lineupLockedRound === round && (
          <p className="ok" data-testid="lineup-locked-badge">
            Lineup locked for round {round} — the Coach can revise until the phase closes.
          </p>
        )}
        {coachFallback && (
          <p className="dim" data-testid="role-fallback">
            No Coach on your team — any member may set the lineup.
          </p>
        )}
        <ErrorNotice error={err} />
      </div>

      <DndContext onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
        <div className={styles.workspace}>
          <section className={styles.courtPanel} aria-labelledby="court-heading">
            <div className={styles.courtHeading}>
              <h2 id="court-heading">Starting five</h2>
              <p>{isCoach ? 'Select, drag, or use the keyboard' : 'Live team lineup'}</p>
            </div>
            <div className={styles.court} aria-label="Half court lineup">
              <div className={styles.paint} aria-hidden="true" />
              <div className={styles.freeThrow} aria-hidden="true" />
              <div className={styles.rim} aria-hidden="true" />
              <div className={styles.backboard} aria-hidden="true" />
              {(['g1', 'g2', 'w1', 'w2', 'b1'] as SlotId[]).map(renderSlot)}
            </div>

            <section className={styles.reserveSection} aria-label="Reserve order">
              <div className={styles.reserveGrid}>
                <div className={styles.reserveZone}>
                  <p className={styles.zoneLabel}>SIXTH PLAYER</p>
                  {renderSlot('sixth')}
                </div>
                <div className={styles.reserveZone}>
                  <p className={styles.zoneLabel}>ACTIVE BENCH — these two play</p>
                  <div className={styles.activeBench} data-testid="active-bench">
                    {renderSlot('bench1')}
                    {renderSlot('bench2')}
                  </div>
                </div>
                <div className={styles.reserveZone}>
                  <p className={styles.zoneLabel}>INACTIVE DEPTH — zero minutes tonight</p>
                  {renderSlot('depth')}
                </div>
              </div>
            </section>
          </section>

          <aside className={styles.rail}>
            <section className={styles.railSection} aria-labelledby="roster-heading">
              <div className={styles.railHeading}>
                <h2 id="roster-heading">Roster</h2>
                <p>{active.length} active</p>
              </div>
              <LineupRoster
                pids={active}
                catalog={catalog}
                selectedPid={selectedPid}
                canEdit={isCoach}
                onSelect={selectPlayer}
              />
            </section>

            <section className={styles.railSection} aria-labelledby="playstyle-heading">
              <div className={styles.railHeading}>
                <h2 id="playstyle-heading">Playstyle</h2>
                <p>Applies to this lineup</p>
              </div>
              <div className={styles.styleOptions}>
                {PLAYSTYLES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.styleButton}
                    disabled={!isCoach}
                    aria-pressed={shownStyle === option}
                    onClick={() => setStyle(option)}
                  >
                    <strong>{option}</strong>
                    <span>{PLAYSTYLE_BLURBS[option]}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <DragOverlay>
          {dragPid !== null && catalog.get(dragPid) ? (
            <div className={styles.dragOverlay}>
              <LineupPlayerSummary player={catalog.get(dragPid)!} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className={styles.submitArea}>
        <PlacementStatus message={placementMessage} summary={summary} />
        {receipt ? <p className={styles.receipt}>{receipt.label}</p> : null}
        {isCoach ? (
          <button
            type="button"
            className={`btn green ${styles.submitButton}`}
            disabled={!legal || busy}
            onClick={() => void submit()}
          >
            {busy ? 'Saving lineup…' : 'Submit lineup'}
          </button>
        ) : <p className={styles.observer}>The Coach submits this phase.</p>}
      </div>
    </main>
  );
}
