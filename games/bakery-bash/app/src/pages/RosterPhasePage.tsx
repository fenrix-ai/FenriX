import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { db, functions } from "../lib/firebase";
import { useGame } from "../contexts/GameContext";
import { useGamePhaseNav } from "../hooks/useGamePhaseNav";
import { PageShell } from "../components/ui/PageShell";
import { RoundHeader } from "../components/game/RoundHeader";
import { ChefCard } from "../components/game/ChefCard";
import {
  ChefWinnerBanner,
  type ChefWinnerEntry,
} from "../components/game/ChefWinnerBanner";
import {
  ChefOutbidBanner,
  type ChefOutbidEntry,
} from "../components/game/ChefOutbidBanner";
import { SubmissionLock } from "../components/game/SubmissionLock";
import {
  toChefCardInput,
  roleOwnsRoster,
  ownerOfRoster,
  type ChefGender,
  type ChefNationality,
  type ChefPoolEntry,
} from "../types/game";
import { humanizeFunctionError } from "../lib/errors";

/**
 * FE-09 — `/game/roster` phase page.
 *
 * Split-screen layout. Left side = "current roster" (cap slots filled by
 * the first `cap` chefs in the array). Right side = "newly won + beyond
 * capacity" — chefs that need a placement decision. Players drag a
 * right-side chef onto a filled left slot to swap them in: the slot
 * occupant is laid off and the dragged chef is moved into that slot via
 * the `swapSpecialtyChef` callable so the swap is atomic. Click-based
 * layoff still works via the existing ChefCard button.
 *
 * Role-gated: only `operations` or `solo` can lay off / continue.
 */

type RosterChef = ChefPoolEntry;

interface LaidOffChef extends RosterChef {
  returnedByPlayerId?: string | null;
}

function coerceChef(raw: DocumentData): RosterChef | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  const name = typeof raw.name === "string" ? raw.name : null;
  const nat = raw.nationality;
  const validNat =
    nat === "american" ||
    nat === "french" ||
    nat === "italian" ||
    nat === "japanese";
  const rawGen = raw.gender;
  const gen = rawGen === "male" || rawGen === "m" ? "m" : rawGen === "female" || rawGen === "f" ? "f" : null;
  const tier = raw.skillTier;
  const validTier =
    tier === "base" || tier === "novel" || tier === "intermediate" || tier === "advanced";
  if (!id || !name || !validNat || !gen || !validTier) return null;
  return {
    id,
    name,
    nationality: nat,
    gender: gen,
    skillTier: tier,
    specialties: Array.isArray(raw.specialties) ? raw.specialties : [],
    minBidFloor: typeof raw.minBidFloor === "number" ? raw.minBidFloor : 0,
  };
}

function normalizeRosterBenchIds(
  rawBenchIds: unknown,
  chefs: RosterChef[],
  specialtyChefCap: number,
): Set<string> {
  const chefIds = new Set(chefs.map((chef) => chef.id));
  const benchIds = new Set<string>();
  if (Array.isArray(rawBenchIds)) {
    rawBenchIds.forEach((id) => {
      if (typeof id === "string" && id.length > 0 && chefIds.has(id)) {
        benchIds.add(id);
      }
    });
  }
  const activeChefs = chefs.filter((chef) => !benchIds.has(chef.id));
  activeChefs.slice(specialtyChefCap).forEach((chef) => {
    benchIds.add(chef.id);
  });
  return benchIds;
}

/* ---------------- Drag-drop pieces ---------------- */

interface DraggableChefProps {
  chef: RosterChef;
  isNew: boolean;
  canAct: boolean;
  onLayoff: (chefId: string) => void;
  onAddToRoster?: (chefId: string) => void;
}

function DraggableChef({ chef, isNew, canAct, onLayoff, onAddToRoster }: DraggableChefProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: chef.id,
      data: { chef },
      disabled: !canAct,
    });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`roster-phase-page__draggable${
        isDragging ? " roster-phase-page__draggable--dragging" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {isNew && (
        <span
          className="roster-phase-page__new-badge"
          aria-label="Newly hired this round"
        >
          NEW
        </span>
      )}
      <ChefCard
        chef={toChefCardInput(chef)}
        mode="roster"
        canLayoff={canAct && !onAddToRoster}
        onLayoff={onLayoff}
        onAddToRoster={canAct && onAddToRoster ? onAddToRoster : undefined}
      />
    </div>
  );
}

interface DroppableSlotProps {
  slotIndex: number;
  chef: RosterChef | null;
  isNew: boolean;
  canAct: boolean;
  onLayoff: (chefId: string) => void;
}

function DroppableSlot({
  slotIndex,
  chef,
  isNew,
  canAct,
  onLayoff,
}: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${slotIndex}`,
    data: { slotIndex, occupiedChefId: chef?.id ?? null },
  });
  return (
    <div
      ref={setNodeRef}
      className={`roster-phase-page__slot roster-phase-page__slot--specialty${
        isNew ? " roster-phase-page__slot--new" : ""
      }${isOver ? " roster-phase-page__slot--drop-target" : ""}`}
    >
      <div className="roster-phase-page__slot-label">
        Specialty Chef {slotIndex + 1}
      </div>
      {chef ? (
        <>
          {isNew && (
            <span
              className="roster-phase-page__new-badge"
              aria-label="Newly hired this round"
            >
              NEW
            </span>
          )}
          <ChefCard
            chef={toChefCardInput(chef)}
            mode="roster"
            canLayoff={canAct}
            onLayoff={onLayoff}
          />
        </>
      ) : (
        <div className="roster-phase-page__empty">
          {isOver ? "Drop to assign…" : "Empty slot"}
        </div>
      )}
    </div>
  );
}

/* ---------------- Page ---------------- */

export function RosterPhasePage() {
  useGamePhaseNav();
  const { gameId, playerId, teamId, currentRound, role, teamRoleAssignments, config } =
    useGame();
  const specialtyChefCap = config?.specialtyChefCap ?? 3;

  const [specialtyChefs, setSpecialtyChefs] = useState<RosterChef[]>([]);
  const [pendingRosterAction, setPendingRosterAction] = useState(false);
  const [rosterCompleted, setRosterCompleted] = useState(false);
  const [laidOffChefs, setLaidOffChefs] = useState<LaidOffChef[]>([]);
  const [pendingChefId, setPendingChefId] = useState<string | null>(null);
  const [rosterBenchChefIds, setRosterBenchChefIds] = useState<Set<string>>(new Set());
  const [chefWins, setChefWins] = useState<ChefWinnerEntry[]>([]);
  const [chefOutbid, setChefOutbid] = useState<ChefOutbidEntry[]>([]);
  const [chefAuctionResolved, setChefAuctionResolved] = useState(false);
  const auctionResultKey = teamId || playerId || null;

  useEffect(() => {
    if (!gameId || !currentRound || !auctionResultKey) {
      setChefWins([]);
      setChefOutbid([]);
      setChefAuctionResolved(false);
      return;
    }
    const roundRef = doc(
      db,
      "games",
      gameId,
      "rounds",
      `round_${currentRound}`,
    );
    const unsubscribe = onSnapshot(
      roundRef,
      (snap) => {
        if (!snap.exists()) {
          setChefWins([]);
          setChefAuctionResolved(false);
          return;
        }
        const data = snap.data() as DocumentData;
        setChefAuctionResolved(Boolean(data.chefAuctionResolvedAt));
        const results =
          (data.chefAuctionResults ?? null) as DocumentData | null;
        const entry = results?.[auctionResultKey] as DocumentData | undefined;
        if (!entry || !Array.isArray(entry.chefs)) {
          setChefWins([]);
          setChefOutbid([]);
          return;
        }
        const totalPaid = Number(entry.totalPaid) || 0;
        const floors = entry.chefs.map((c: DocumentData) =>
          typeof c.minBidFloor === "number" && c.minBidFloor > 0
            ? c.minBidFloor
            : 1,
        );
        const floorSum = floors.reduce((s: number, f: number) => s + f, 0) || 1;
        const wins: ChefWinnerEntry[] = entry.chefs
          .map((c: DocumentData, i: number): ChefWinnerEntry | null => {
            const nat = c.nationality;
            const validNat: ChefNationality | null =
              nat === "american" ||
              nat === "french" ||
              nat === "italian" ||
              nat === "japanese"
                ? nat
                : null;
            const rawGen = c.gender;
            const gender: ChefGender | null =
              rawGen === "male" || rawGen === "m"
                ? "m"
                : rawGen === "female" || rawGen === "f"
                ? "f"
                : null;
            const id = typeof c.id === "string" ? c.id : null;
            const name = typeof c.name === "string" ? c.name : null;
            if (!id || !name || !validNat || !gender) return null;
            const share = floors[i] / floorSum;
            const skillTier =
              c.skillTier === "novel" ||
              c.skillTier === "intermediate" ||
              c.skillTier === "advanced" ||
              c.skillTier === "base"
                ? (c.skillTier as ChefWinnerEntry["skillTier"])
                : undefined;
            return {
              chefId: id,
              name,
              nationality: validNat,
              gender,
              amount: Math.round(totalPaid * share),
              skillTier,
            };
          })
          .filter((c: ChefWinnerEntry | null): c is ChefWinnerEntry => c !== null);
        setChefWins(wins);

        // Parse outbid chefs from the same entry.
        const rawOutbid = Array.isArray(entry.outbidChefs) ? entry.outbidChefs : [];
        const outbidEntries: ChefOutbidEntry[] = rawOutbid
          .map((o: DocumentData): ChefOutbidEntry | null => {
            const nat = o.nationality;
            const validNat: ChefNationality | null =
              nat === "american" || nat === "french" || nat === "italian" || nat === "japanese"
                ? nat : null;
            const rawGen = o.gender;
            const gender: ChefGender | null =
              rawGen === "male" || rawGen === "m" ? "m"
              : rawGen === "female" || rawGen === "f" ? "f"
              : null;
            const id = typeof o.id === "string" ? o.id : null;
            const name = typeof o.name === "string" ? o.name : null;
            const winnerBakeryName = typeof o.winnerBakeryName === "string" ? o.winnerBakeryName : "Another team";
            if (!id || !name || !validNat || !gender) return null;
            const skillTier =
              o.skillTier === "novel" || o.skillTier === "intermediate" ||
              o.skillTier === "advanced" || o.skillTier === "base"
                ? (o.skillTier as ChefOutbidEntry["skillTier"]) : undefined;
            return { id, name, nationality: validNat, gender, skillTier, winnerBakeryName };
          })
          .filter((o: ChefOutbidEntry | null): o is ChefOutbidEntry => o !== null);
        setChefOutbid(outbidEntries);
      },
      (err) => {
        console.error("roster chef-winner listener error:", {
          gameId,
          currentRound,
          err,
        });
      },
    );
    return unsubscribe;
  }, [gameId, currentRound, auctionResultKey]);

  const [submitting, setSubmitting] = useState<"continue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perChefError, setPerChefError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!gameId || !playerId) return;
    const playerRef = doc(db, "games", gameId, "players", playerId);
    const unsubscribe = onSnapshot(
      playerRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as DocumentData;
        const raw = Array.isArray(data.specialtyChefs) ? data.specialtyChefs : [];
        const chefs = raw.map(coerceChef).filter((c): c is RosterChef => c !== null);
        setSpecialtyChefs(chefs);
        setRosterBenchChefIds(normalizeRosterBenchIds(
          data.rosterBenchChefIds,
          chefs,
          specialtyChefCap,
        ));
        setPendingRosterAction(data.pendingRosterAction === true);
        setRosterCompleted(data.rosterCompleted === true);
      },
      (err) => {
        console.error("roster player-doc listener error:", { gameId, playerId, err });
      },
    );
    return unsubscribe;
  }, [gameId, playerId, specialtyChefCap]);

  useEffect(() => {
    if (!gameId || !currentRound) {
      setLaidOffChefs([]);
      return;
    }
    const poolRef = collection(
      db,
      "games",
      gameId,
      "rounds",
      `round_${currentRound}`,
      "chefReturnPool",
    );
    const unsubscribe = onSnapshot(
      poolRef,
      (snap) => {
        const next: LaidOffChef[] = [];
        snap.docs.forEach((d) => {
          const c = coerceChef(d.data());
          if (!c) return;
          const data = d.data() as DocumentData;
          next.push({
            ...c,
            returnedByPlayerId:
              typeof data.returnedByPlayerId === "string"
                ? data.returnedByPlayerId
                : null,
          });
        });
        setLaidOffChefs(next);
      },
      (err) => {
        console.error("chefReturnPool listener error:", err);
        setLaidOffChefs([]);
      },
    );
    return unsubscribe;
  }, [gameId, currentRound]);

  const newlyWonChefIds = useMemo(
    () => new Set(chefWins.map((w) => w.chefId)),
    [chefWins],
  );

  const canAct = roleOwnsRoster(role, teamRoleAssignments);
  const ownerLabel = ownerOfRoster();

  const leftChefs = specialtyChefs
    .filter((c) => !rosterBenchChefIds.has(c.id))
    .slice(0, specialtyChefCap);
  const rightChefsFromArray = specialtyChefs.filter((c) =>
    rosterBenchChefIds.has(c.id),
  );

  const overCap = leftChefs.length > specialtyChefCap;
  const rosterFull = leftChefs.length >= specialtyChefCap;
  const continueDisabled =
    overCap || submitting !== null || !canAct || rosterCompleted;

  // Combined right panel: overflow chefs + laid-off chefs (deduped)
  const allRightChefs = useMemo(() => {
    const seen = new Set<string>(rightChefsFromArray.map((c) => c.id));
    const out: RosterChef[] = [...rightChefsFromArray];
    for (const c of laidOffChefs) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  }, [rightChefsFromArray, laidOffChefs]);

  const handleLayoffClick = async (chefId: string) => {
    if (!gameId || !canAct || pendingChefId) return;
    setError(null);
    setPendingChefId(chefId);
    try {
      const layoff = httpsCallable<
        { gameId: string; chefId: string },
        { success?: boolean }
      >(functions, "layoffChef");
      await layoff({ gameId, chefId });
    } catch (err) {
      setError(humanizeLayoffError(err));
    } finally {
      setPendingChefId(null);
    }
  };

  const handleRehireClick = async (chefId: string) => {
    if (!gameId || !canAct || pendingChefId || rosterFull) return;
    setError(null);
    setPendingChefId(chefId);
    try {
      const rehire = httpsCallable<
        { gameId: string; chefId: string },
        { ok?: boolean; rehired?: boolean }
      >(functions, "rehireChef");
      await rehire({ gameId, chefId });
    } catch (err) {
      setError(humanizeRehireError(err));
    } finally {
      setPendingChefId(null);
    }
  };

  const handleAddToRoster = async (chefId: string) => {
    if (!gameId || !canAct || pendingChefId) return;
    if (rosterFull) {
      setPerChefError((prev) => ({
        ...prev,
        [chefId]: "There are too many cooks in the kitchen!",
      }));
      return;
    }
    setPerChefError((prev) => ({ ...prev, [chefId]: "" }));
    if (rosterBenchChefIds.has(chefId)) {
      setPendingChefId(chefId);
      try {
        const promote = httpsCallable<
          { gameId: string; chefId: string },
          { ok?: boolean; promoted?: boolean }
        >(functions, "promoteRosterBenchChef");
        await promote({ gameId, chefId });
      } catch (err) {
        setError(humanizeRehireError(err));
      } finally {
        setPendingChefId(null);
      }
    } else {
      await handleRehireClick(chefId);
    }
  };

  const handleContinue = async () => {
    if (!gameId) return;
    setError(null);
    setSubmitting("continue");
    try {
      const cont = httpsCallable<
        { gameId: string },
        { rosterCompleted?: boolean }
      >(functions, "continueFromRoster");
      await cont({ gameId });
    } catch (err) {
      setError(humanizeFunctionError(err, "Could not continue. Try again."));
    } finally {
      setSubmitting(null);
    }
  };

  // dnd-kit setup. PointerSensor with a small distance threshold so
  // ChefCard's internal Lay-off button click isn't swallowed by drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleSwap = async (outChefId: string, inChefId: string) => {
    if (!gameId || !canAct || pendingChefId) return;
    setError(null);
    setPendingChefId(outChefId);
    try {
      const swap = httpsCallable<
        { gameId: string; outChefId: string; inChefId: string },
        { success?: boolean }
      >(functions, "swapSpecialtyChef");
      await swap({ gameId, outChefId, inChefId });
    } catch (err) {
      setError(humanizeLayoffError(err));
    } finally {
      setPendingChefId(null);
    }
  };

  // Drag from right → left slot. If the slot is filled, atomically swap
  // the dragged chef into that slot via `swapSpecialtyChef` (lays off
  // the slot occupant + reorders the array so the dragged chef occupies
  // the slot index). If the slot is empty, no-op — the user can drop
  // into a filled slot to displace the occupant.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;
    const overData = over.data.current as
      | { slotIndex?: number; occupiedChefId?: string | null }
      | undefined;
    const occupied = overData?.occupiedChefId;
    const draggedId = String(active.id);
    if (occupied) {
      if (occupied === draggedId) return;
      void handleSwap(occupied, draggedId);
    } else if (rosterBenchChefIds.has(draggedId) && !rosterFull) {
      void handleAddToRoster(draggedId);
    }
  };

  return (
    <PageShell className="roster-phase-page">
      <RoundHeader />

      <ChefOutbidBanner
        round={currentRound}
        outbid={chefOutbid}
        hideWhenEmpty={true}
        resolved={chefAuctionResolved}
      />

      <ChefWinnerBanner
        round={currentRound}
        winners={chefWins}
        resolved={chefAuctionResolved}
      />

      <header className="roster-phase-page__header">
        <h1 className="roster-phase-page__title">Your Kitchen Roster</h1>
        <p className="roster-phase-page__hint">
          Drag a chef from the right onto a roster slot to swap them in. The
          chef in that slot is laid off automatically.
        </p>
        <ul className="roster-phase-page__rules">
          <li>
            You can have a maximum of <strong>{specialtyChefCap}</strong>{" "}
            specialty chefs on your roster.
          </li>
          <li>
            When the timer runs out, the round ends and all chefs in the{" "}
            <strong>New Hires &amp; Excess Chefs</strong> panel are automatically dropped.
          </li>
        </ul>
      </header>

      {rosterCompleted && (
        <div
          className="roster-phase-page__submitted-banner"
          role="status"
          aria-live="polite"
        >
          <span className="roster-phase-page__submitted-banner-icon" aria-hidden="true">✓</span>
          <span className="roster-phase-page__submitted-banner-text">
            Roster locked in! Waiting for the rest of the class — your team is
            ready for round {currentRound}'s decisions.
          </span>
        </div>
      )}

      {!canAct && (
        <p className="roster-phase-page__role-gate">
          Only your {ownerLabel} teammate can lay off chefs or continue.
        </p>
      )}

      {overCap && (
        <p className="roster-phase-page__overflow-warning" role="alert">
          ⚠ You picked up an extra chef — lay one off (or drag a new chef onto
          a slot) to continue.
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="roster-phase-page__split">
          {/* LEFT — current roster */}
          <section
            className="roster-phase-page__split-side roster-phase-page__split-side--current"
            aria-label="Current roster"
          >
            <h2 className="roster-phase-page__split-title">Current Roster</h2>
            <div className="roster-phase-page__slots">
              <div className="roster-phase-page__slot roster-phase-page__slot--base">
                <div className="roster-phase-page__slot-label">Basic Chef</div>
                <div className="roster-phase-page__base-card">
                  <div className="roster-phase-page__base-portrait">👨‍🍳</div>
                  <div className="roster-phase-page__base-name">You</div>
                  <div className="roster-phase-page__base-hint">
                    Your free chef. Produces 30 units per round.
                  </div>
                </div>
              </div>

              {Array.from({ length: specialtyChefCap }, (_, i) => {
                const chef = leftChefs[i] ?? null;
                const isNew = chef ? newlyWonChefIds.has(chef.id) : false;
                return (
                  <DroppableSlot
                    key={`slot-${i}`}
                    slotIndex={i}
                    chef={chef}
                    isNew={isNew}
                    canAct={canAct}
                    onLayoff={handleLayoffClick}
                  />
                );
              })}
            </div>
          </section>

          {/* RIGHT — new hires + overflow + laid-off */}
          <section
            className="roster-phase-page__split-side roster-phase-page__split-side--available"
            aria-label="New hires and excess chefs"
          >
            <h2 className="roster-phase-page__split-title">
              New Hires & Excess Chefs
            </h2>
            {allRightChefs.length === 0 ? (
              <p className="roster-phase-page__split-empty">
                No chefs left in this section.
              </p>
            ) : (
              <p className="roster-phase-page__split-hint">
                {canAct
                  ? "Click \"Add to Roster\" to move a chef to your roster, or drag them onto a slot on the left."
                  : `Your ${ownerLabel} teammate decides who stays.`}
              </p>
            )}
            <div className="roster-phase-page__available-list">
              {allRightChefs.map((chef) => (
                <div key={chef.id}>
                  <DraggableChef
                    chef={chef}
                    isNew={newlyWonChefIds.has(chef.id)}
                    canAct={canAct}
                    onLayoff={handleLayoffClick}
                    onAddToRoster={handleAddToRoster}
                  />
                  {perChefError[chef.id] && (
                    <p className="roster-phase-page__error roster-phase-page__error--inline" role="alert">
                      {perChefError[chef.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </DndContext>

      {error && (
        <p className="roster-phase-page__error" role="alert">
          {error}
        </p>
      )}

      {pendingRosterAction && !overCap && (
        <p className="roster-phase-page__info">
          Backend flagged a pending roster action — review your chefs above.
        </p>
      )}

      <SubmissionLock
        phase="roster"
        submitted={rosterCompleted}
        hint={
          canAct
            ? overCap
              ? "Lay off a chef to unlock Continue."
              : undefined
            : "Waiting on your Operations teammate."
        }
        action={
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleContinue}
            disabled={continueDisabled}
          >
            {submitting === "continue"
              ? "Continuing…"
              : rosterCompleted
                ? "✓ Ready — locked in for next round"
                : "Continue"}
          </button>
        }
      />

    </PageShell>
  );
}

function humanizeLayoffError(err: unknown): string {
  const fnErr = err as FunctionsError | undefined;
  const code = (fnErr?.code || "").split("/").pop();
  if (code === "failed-precondition") {
    return "You can only lay off chefs during the roster phase.";
  }
  if (code === "not-found") {
    return "That chef isn't on your roster anymore. Refresh.";
  }
  return humanizeFunctionError(err, "Could not lay off chef. Try again.");
}

function humanizeRehireError(err: unknown): string {
  const fnErr = err as FunctionsError | undefined;
  const code = (fnErr?.code || "").split("/").pop();
  const message = fnErr?.message || "";
  if (code === "failed-precondition" && message.toLowerCase().includes("full")) {
    return "Your roster is full — lay off another chef before re-hiring.";
  }
  if (code === "failed-precondition") {
    return "Re-hire is only available during the roster phase, and only for chefs you laid off this round.";
  }
  return humanizeFunctionError(err, "Could not re-hire chef. Try again.");
}
