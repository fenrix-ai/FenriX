import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { db, functions } from "../lib/firebase";
import { useGame } from "../contexts/GameContext";
import { useGamePhaseNav } from "../hooks/useGamePhaseNav";
import { PageShell } from "../components/ui/PageShell";
import { RoundHeader } from "../components/game/RoundHeader";
import { ChefCard } from "../components/game/ChefCard";
import { SubmissionLock } from "../components/game/SubmissionLock";
import {
  parseGamePhase,
  toChefCardInput,
  roleOwnsRoster,
  ownerOfRoster,
  type ChefPoolEntry,
} from "../types/game";
import { humanizeFunctionError } from "../lib/errors";

/**
 * FE-09 — `/game/roster` phase page.
 *
 * After the chef auction resolves, each player sees the chefs they won
 * (and already had) as a roster. If they ended up with more than the
 * `specialtyChefCap` (default 3), they must lay one off before they can
 * click Continue — the backend enforces the cap in
 * `continueFromRoster`, but we also gate the button client-side for
 * immediate feedback.
 *
 * Role-gated: only `operations` or `solo` can click Lay off / Continue
 * (matches backend `assertRoleAllowed` in `layoffChef` + `continueFromRoster`).
 * The design proposal says Finance owns this, but the shipped backend
 * enforces Operations; we follow the backend.
 */

/** Chef doc as stored on `players/{uid}.specialtyChefs`. Same shape as pool. */
type RosterChef = ChefPoolEntry;

interface LayoffTarget {
  id: string;
  name: string;
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
    tier === "low" || tier === "medium" || tier === "high";
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

const SPECIALTY_CAP = 3;

export function RosterPhasePage() {
  useGamePhaseNav();
  const { gameId, playerId, currentRound, phase, role, phaseEndsAtMs } = useGame();
  const navigate = useNavigate();

  const [specialtyChefs, setSpecialtyChefs] = useState<RosterChef[]>([]);
  const [pendingRosterAction, setPendingRosterAction] = useState(false);
  const [rosterCompleted, setRosterCompleted] = useState(false);

  const [layoffTarget, setLayoffTarget] = useState<LayoffTarget | null>(null);
  const [submitting, setSubmitting] = useState<"layoff" | "continue" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Drag-and-drop kept-set: chef IDs the player wants to keep on their roster.
  // Initialized from the player's current specialtyChefs (everything kept by
  // default), capped at SPECIALTY_CAP — overflow chefs start in the right
  // "available" zone so the player must explicitly drag them into the kitchen.
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());

  // KR-1: countdown timer
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // KR-5: track which chef IDs were won this round
  const [newlyWonChefIds, setNewlyWonChefIds] = useState<Set<string>>(new Set());

  // KR-1: tick every second
  useEffect(() => {
    if (!phaseEndsAtMs) { setSecondsLeft(null); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((phaseEndsAtMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseEndsAtMs]);

  // KR-5: subscribe to round doc for chef auction results
  useEffect(() => {
    if (!gameId || !currentRound) return;
    const roundRef = doc(db, "games", gameId, "rounds", `round_${currentRound}`);
    const unsubscribe = onSnapshot(roundRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DocumentData;
      const results = data.chefAuctionResults || {};
      const myResult = playerId ? results[playerId] : null;
      const ids = new Set<string>(
        Array.isArray(myResult?.chefs)
          ? myResult.chefs.map((c: { id?: string }) => c.id).filter(Boolean)
          : [],
      );
      setNewlyWonChefIds(ids);
    });
    return unsubscribe;
  }, [gameId, currentRound, playerId]);

  // Subscribe to this player's doc for their specialty roster.
  useEffect(() => {
    if (!gameId || !playerId) return;
    const playerRef = doc(db, "games", gameId, "players", playerId);
    const unsubscribe = onSnapshot(
      playerRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as DocumentData;
        const raw = Array.isArray(data.specialtyChefs) ? data.specialtyChefs : [];
        setSpecialtyChefs(raw.map(coerceChef).filter((c): c is RosterChef => c !== null));
        setPendingRosterAction(data.pendingRosterAction === true);
        setRosterCompleted(data.rosterCompleted === true);
      },
      (err) => {
        console.error("roster player-doc listener error:", { gameId, playerId, err });
      },
    );
    return unsubscribe;
  }, [gameId, playerId]);

  // Auto-route as phase changes. Roster → simulating/results_ready → /game.
  useEffect(() => {
    if (!gameId || !phase) return;
    const parsed = parseGamePhase(phase, currentRound);
    if (parsed.base === "decide") navigate("/game/decide");
    else if (parsed.base === "email") navigate("/game/email");
    else if (parsed.base === "bid_ad" || parsed.base === "bid_chef")
      navigate("/auction");
    else if (parsed.base === "simulating" || parsed.base === "results_ready")
      navigate("/game");
    else if (parsed.base === "game_over") navigate("/game/conclusion");
  }, [phase, currentRound, navigate]);

  // Initialize / reconcile the kept-set whenever the player's roster changes.
  // Default: keep all returning chefs (within cap); newly won chefs land on
  // the right "available" zone. If we already have data in `keptIds`, prune
  // to the current chef list so deleted IDs don't linger.
  useEffect(() => {
    setKeptIds((prev) => {
      const valid = new Set(specialtyChefs.map((c) => c.id));
      // First-time init: all returning chefs are kept by default.
      if (prev.size === 0 && specialtyChefs.length > 0) {
        const init = new Set<string>();
        for (const chef of specialtyChefs) {
          if (!newlyWonChefIds.has(chef.id) && init.size < SPECIALTY_CAP) {
            init.add(chef.id);
          }
        }
        return init;
      }
      // Reconcile: drop IDs no longer on the roster.
      const next = new Set<string>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next;
    });
  }, [specialtyChefs, newlyWonChefIds]);

  // Split chefs into kitchen (left) vs available/overflow (right) based on
  // the kept-set the player has assembled via drag-and-drop.
  const { kitchenChefs, availableChefs } = useMemo(() => {
    const kitchen: RosterChef[] = [];
    const available: RosterChef[] = [];
    for (const chef of specialtyChefs) {
      if (keptIds.has(chef.id)) kitchen.push(chef);
      else available.push(chef);
    }
    return { kitchenChefs: kitchen, availableChefs: available };
  }, [specialtyChefs, keptIds]);

  const canAct = roleOwnsRoster(role);
  const ownerLabel = ownerOfRoster();
  const kitchenOverCap = kitchenChefs.length > SPECIALTY_CAP;
  // Block continue if the kitchen is over cap, or if there are still
  // unassigned chefs on the right and the kitchen has slots free
  // (player must explicitly drag them in or accept the layoff).
  const continueDisabled =
    kitchenOverCap || submitting !== null || !canAct || rosterCompleted;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canAct) return;
    const chefId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    setKeptIds((prev) => {
      const next = new Set(prev);
      if (overId === "kitchen") {
        // Only allow add if kitchen has space.
        if (next.size < SPECIALTY_CAP) next.add(chefId);
      } else if (overId === "available") {
        next.delete(chefId);
      }
      return next;
    });
  };

  const handleLayoffClick = (chefId: string) => {
    const target = specialtyChefs.find((c) => c.id === chefId);
    if (!target) return;
    setLayoffTarget({ id: target.id, name: target.name });
  };

  const handleLayoffConfirm = async () => {
    if (!layoffTarget || !gameId) return;
    setError(null);
    setSubmitting("layoff");
    try {
      const layoff = httpsCallable<
        { gameId: string; chefId: string },
        { success?: boolean }
      >(functions, "layoffChef");
      await layoff({ gameId, chefId: layoffTarget.id });
      setLayoffTarget(null);
    } catch (err) {
      setError(humanizeLayoffError(err));
    } finally {
      setSubmitting(null);
    }
  };

  const handleContinue = async () => {
    if (!gameId) return;
    setError(null);
    setSubmitting("continue");
    try {
      // Lay off any chefs the player chose not to keep (i.e. anything
      // currently in the right "available" zone).
      const toLayoff = availableChefs.map((c) => c.id);
      if (toLayoff.length > 0) {
        const layoff = httpsCallable<
          { gameId: string; chefId: string },
          { success?: boolean }
        >(functions, "layoffChef");
        for (const chefId of toLayoff) {
          await layoff({ gameId, chefId });
        }
      }
      const cont = httpsCallable<
        { gameId: string },
        { rosterCompleted?: boolean }
      >(functions, "continueFromRoster");
      await cont({ gameId });
      // Phase transition takes care of navigation.
    } catch (err) {
      setError(humanizeFunctionError(err, "Could not continue. Try again."));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <PageShell className="roster-phase-page">
      <RoundHeader />

      <header className="roster-phase-page__header">
        <div className="roster-phase-page__header-row">
          <h1 className="roster-phase-page__title">Your Kitchen Roster</h1>
          {secondsLeft !== null && (
            <div
              className={`roster-phase-page__timer${secondsLeft <= 30 ? " roster-phase-page__timer--urgent" : ""}`}
              aria-live="polite"
            >
              {secondsLeft > 0 ? `${secondsLeft}s` : "Time's up"}
            </div>
          )}
        </div>
        <p className="roster-phase-page__hint">
          Keep up to <strong>{SPECIALTY_CAP}</strong> specialty chefs. Lay one
          off if you ended up with more — or wait for the timer and any extras
          will be automatically released.
        </p>
      </header>

      {!canAct && (
        <p className="roster-phase-page__role-gate">
          Only your {ownerLabel} teammate can lay off chefs or continue.
        </p>
      )}

      {kitchenOverCap && (
        <p className="roster-phase-page__overflow-warning" role="alert">
          ⚠ Your kitchen has more than {SPECIALTY_CAP} chefs — drag one back to
          the right to continue.
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="roster-phase-page__split">
          <RosterDropZone
            id="kitchen"
            title="Your Kitchen"
            subtitle={`${kitchenChefs.length} / ${SPECIALTY_CAP}`}
            empty="Drag chefs here to keep them on staff."
            chefs={kitchenChefs}
            isNewMap={newlyWonChefIds}
            canAct={canAct}
            onLayoff={handleLayoffClick}
          />
          <RosterDropZone
            id="available"
            title="Available Chefs"
            subtitle={
              availableChefs.length === 0
                ? "All assigned"
                : `${availableChefs.length} not on staff`
            }
            empty="No chefs to assign."
            chefs={availableChefs}
            isNewMap={newlyWonChefIds}
            canAct={canAct}
            onLayoff={handleLayoffClick}
            variant="available"
          />
        </div>
      </DndContext>

      {error && (
        <p className="roster-phase-page__error" role="alert">
          {error}
        </p>
      )}

      {pendingRosterAction && !kitchenOverCap && (
        <p className="roster-phase-page__info">
          Backend flagged a pending roster action — review your chefs above.
        </p>
      )}

      <SubmissionLock
        phase="roster"
        submitted={rosterCompleted}
        hint={
          canAct
            ? kitchenOverCap
              ? "Drag a chef back to Available to unlock Continue."
              : availableChefs.length > 0
                ? `Continue will lay off ${availableChefs.length} chef${availableChefs.length === 1 ? "" : "s"} on the right.`
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
                ? "✓ Submitted"
                : "Continue"}
          </button>
        }
      />

      {layoffTarget && (
        <div
          className="roster-phase-page__modal"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="roster-phase-page__modal-backdrop"
            aria-hidden="true"
          />
          <div className="roster-phase-page__modal-card">
            <h3 className="roster-phase-page__modal-title">Lay off a chef?</h3>
            <p className="roster-phase-page__modal-body">
              <strong>{layoffTarget.name}</strong> will leave your kitchen and
              rejoin the auction pool for the next round. This can't be undone.
            </p>
            <div className="roster-phase-page__modal-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setLayoffTarget(null)}
                disabled={submitting === "layoff"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleLayoffConfirm}
                disabled={submitting === "layoff"}
              >
                {submitting === "layoff" ? "Laying off…" : "Lay off"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

/**
 * Drop zone wrapper. Renders a panel containing draggable chef cards.
 * `id` is the stable droppable id used in `handleDragEnd` ("kitchen" | "available").
 */
function RosterDropZone(props: {
  id: "kitchen" | "available";
  title: string;
  subtitle: string;
  empty: string;
  chefs: RosterChef[];
  isNewMap: Set<string>;
  canAct: boolean;
  onLayoff: (id: string) => void;
  variant?: "available";
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      className={[
        "roster-phase-page__panel",
        `roster-phase-page__panel--${props.id}`,
        props.variant ? `roster-phase-page__panel--${props.variant}` : "",
        isOver ? "roster-phase-page__panel--over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="roster-phase-page__panel-header">
        <h2 className="roster-phase-page__panel-title">{props.title}</h2>
        <span className="roster-phase-page__panel-subtitle">
          {props.subtitle}
        </span>
      </div>

      {props.chefs.length === 0 ? (
        <p className="roster-phase-page__panel-empty">{props.empty}</p>
      ) : (
        <div className="roster-phase-page__panel-grid">
          {props.chefs.map((chef) => (
            <DraggableChef
              key={chef.id}
              chef={chef}
              isNew={props.isNewMap.has(chef.id)}
              canAct={props.canAct}
              onLayoff={props.onLayoff}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single chef card wrapped with @dnd-kit useDraggable. Adds a yellow
 * pixelated "NEW" badge in the top-left when the chef was won this round.
 */
function DraggableChef(props: {
  chef: RosterChef;
  isNew: boolean;
  canAct: boolean;
  onLayoff: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: props.chef.id, disabled: !props.canAct });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    cursor: props.canAct ? "grab" : "default",
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`roster-phase-page__draggable${isDragging ? " roster-phase-page__draggable--dragging" : ""}`}
    >
      {props.isNew && (
        <span className="roster-phase-page__new-badge" aria-label="Newly hired">
          NEW
        </span>
      )}
      <ChefCard
        chef={toChefCardInput(props.chef)}
        mode="roster"
        canLayoff={props.canAct}
        onLayoff={props.onLayoff}
      />
    </div>
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
