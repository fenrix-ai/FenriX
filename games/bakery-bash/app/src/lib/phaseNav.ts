/**
 * Shared scheduler for phase-driven page navigation.
 *
 * Background: the backend is the source of truth for the current game phase,
 * and five different places in the app reacted to phase changes by calling
 * `navigate()` immediately. That made the page yank from under players the
 * instant the professor advanced the game — they'd lose context on what
 * just happened and (if they were mid-input) the click that was about to
 * land.
 *
 * This module centralizes the "navigate to X because the phase changed"
 * intent into a single pending timer with a visible countdown banner.
 * - Call `schedulePhaseNav(navigate, target)` from any listener that
 *   wants to route the user on a phase change.
 * - A global `PhaseTransitionBanner` subscribes to the pending-state and
 *   renders the countdown ("Phase advanced — moving in Ns…"). It owns
 *   the actual `navigate()` call when the timer expires.
 * - Scheduling a second target cancels the first (same timer slot).
 * - Scheduling the path the user is already on is a no-op.
 *
 * We intentionally keep this as a plain module (not a React context): the
 * scheduler has to be callable from hooks and effects that live under
 * different subtrees, and the state is trivially small.
 */
import type { NavigateFunction } from "react-router-dom";

export const PHASE_NAV_DELAY_MS = 7_000;

/**
 * Paths where we should NOT bounce the user even if the phase changes.
 * Professor panel and leaderboard are passive / admin views — scheduling
 * a nav from them would fight the person monitoring the game.
 *
 * `/team` is intentionally NOT in this list: during lobby we DO want to
 * carry players forward when the professor starts the game. Players who
 * open the team panel mid-game can still stay put via the banner's
 * "Stay here" button — that's strictly better than a silent allowlist.
 */
const NAV_ALLOWLIST_PREFIXES = ["/professor", "/leaderboard"];

export type PhaseNavState =
  | { kind: "idle" }
  | {
      kind: "pending";
      target: string;
      /** ms-since-epoch when the pending navigation will fire. */
      firesAt: number;
    };

type Listener = (state: PhaseNavState) => void;

let state: PhaseNavState = { kind: "idle" };
let timer: number | null = null;
let pendingNavigate: NavigateFunction | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(state);
}

function clearTimer(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  pendingNavigate = null;
}

/**
 * Schedule a delayed navigation in response to a backend phase change.
 * Returns true if a new navigation was actually scheduled (useful for
 * callers that want to log / gate follow-up work).
 */
export function schedulePhaseNav(
  navigate: NavigateFunction,
  target: string,
  currentPath: string,
): boolean {
  // Already there? Nothing to do — this also prevents the snapshot
  // listener from re-scheduling the same nav on every Firestore tick.
  if (currentPath === target) {
    if (state.kind === "pending" && state.target === target) return false;
    cancelPhaseNav();
    return false;
  }

  // Respect user-initiated visits to allowlisted pages. The professor
  // panel, team room, and leaderboard are all places a student might
  // intentionally open during the round.
  if (NAV_ALLOWLIST_PREFIXES.some((p) => currentPath.startsWith(p))) {
    return false;
  }

  // Same target already queued? Keep the existing timer — we don't want
  // to reset the countdown every time the game doc re-emits.
  if (state.kind === "pending" && state.target === target) return false;

  clearTimer();
  pendingNavigate = navigate;
  const firesAt = Date.now() + PHASE_NAV_DELAY_MS;
  state = { kind: "pending", target, firesAt };
  emit();

  timer = window.setTimeout(() => {
    const nav = pendingNavigate;
    const pendingTarget = state.kind === "pending" ? state.target : null;
    state = { kind: "idle" };
    timer = null;
    pendingNavigate = null;
    emit();
    if (nav && pendingTarget) nav(pendingTarget);
  }, PHASE_NAV_DELAY_MS);
  return true;
}

/**
 * Force-cancel any pending navigation. Used when:
 *   - the user lands on the target path themselves
 *   - the phase reverts to one where no navigation is needed (e.g. pause)
 */
export function cancelPhaseNav(): void {
  if (state.kind === "idle") return;
  clearTimer();
  state = { kind: "idle" };
  emit();
}

/**
 * Fire the pending navigation immediately, skipping the remaining delay.
 * Wired to the banner's "Skip" button so impatient players don't have to
 * wait out the full 7-second grace window.
 */
export function flushPhaseNav(): void {
  if (state.kind !== "pending") return;
  const nav = pendingNavigate;
  const target = state.target;
  clearTimer();
  state = { kind: "idle" };
  emit();
  if (nav) nav(target);
}

export function subscribePhaseNav(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getPhaseNavState(): PhaseNavState {
  return state;
}
