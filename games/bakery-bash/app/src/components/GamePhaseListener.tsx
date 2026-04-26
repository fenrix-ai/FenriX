import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useGame, useGameDispatch } from "../contexts/GameContext";
import { useGameListener } from "../hooks/useGameListener";
import { db, functions } from "../lib/firebase";
import { parseGamePhase } from "../types/game";

const GRACE_SECONDS = 5;
const FREEZE_SECONDS = 10;

// A24-I08: only show the "last chance to submit" banner + freeze overlay
// during phases where students actually have something to submit. Email,
// simulating, results_ready, lobby, and game_over don't need the overlay.
const SUBMISSION_PHASE_BASES = new Set(["bid_ad", "bid_chef", "roster", "decide"]);

/**
 * App-level listener that stays mounted regardless of route.
 *
 * Phase-change navigation: navigates when Firestore phase changes. If a
 * change arrives while the grace/freeze window is active, navigation is
 * deferred until the window ends. The window is derived directly from
 * phaseEndsAtMs so there's no race between the timer callbacks and incoming
 * Firestore snapshots.
 *
 * Timer-expiry sequence (student view):
 *   0–5 s  → orange banner, inputs still live ("Last chance — 5s")
 *   5–15 s → full-screen blocking overlay ("Locked — advancing in 10…")
 *   15 s   → overlay clears; professor's auto-advance fires via ProfessorPage
 */
export function GamePhaseListener() {
  const { gameId, playerId, phase, phaseEndsAtMs } = useGame();
  const dispatch = useGameDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Refs so the freeze-end callback always reads the latest values without
  // being listed as effect dependencies (avoids re-arming the timer on every
  // phase or playerId change).
  const playerIdRef = useRef(playerId);
  const professorUidRef = useRef<string | null>(null);
  const gameIdRef = useRef(gameId);
  const phaseNameRef = useRef<string | null>(null);
  useEffect(() => { playerIdRef.current = playerId; });
  useEffect(() => { gameIdRef.current = gameId; });

  // FE-5 — centralize the app-wide Firestore listeners. Mounting this hook
  // inside `GamePhaseListener` (which itself renders at the root of the
  // router in `App.tsx`) means the listeners follow the lifecycle of the
  // session — they attach when the game id is known and tear down on
  // lobby/conclusion unmounts. `GamePage` still wires a few page-scoped
  // listeners (roster → ad-winner banner, etc.) because those are only
  // relevant during the decide phase.
  useGameListener(gameId, playerId);

  const navigateRef = useRef(navigate);
  const pathnameRef = useRef(location.pathname);
  /**
   * Mirrors phaseEndsAtMs from context. Updated after every render so that
   * the onSnapshot callback always reads the value that was current BEFORE
   * the snapshot (i.e. the previous phase's timer), not the new one being
   * dispatched in the same callback tick.
   */
  const phaseEndsAtMsRef = useRef<number | null>(phaseEndsAtMs);

  type Stage = "grace" | "freeze" | null;
  const [stage, setStage] = useState<Stage>(null);
  const [countdown, setCountdown] = useState(0);

  const t1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t3Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Deferred phase-change navigation; cleared on unmount or when superseded
  // by a fresh snapshot so we don't navigate the user after they've left.
  const deferredNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync after every render.
  useEffect(() => {
    navigateRef.current = navigate;
    pathnameRef.current = location.pathname;
    phaseEndsAtMsRef.current = phaseEndsAtMs;
  });

  // V5 fix (Apr 25): if a tab is sitting on a phase-scoped route (e.g.
  // `/game/roster`, `/auction`, `/game`) but has no `gameId` in context,
  // the page silently renders empty: useGameListener returns early on
  // `!gameId`, so no listener attaches, no navigation fires, and the
  // tab stays on a stale (but cached-looking) UI forever. This happens
  // when a dev-mode tab is closed and reopened — sessionStorage is wiped
  // so the persisted game session is gone — but the URL still says we
  // were mid-game. Detect that orphan state and bounce to the landing
  // page so the player can rejoin.
  useEffect(() => {
    if (gameId) return;
    const path = location.pathname;
    const phaseScopedRoutes = [
      "/team",
      "/lobby",
      "/game",
      "/auction",
      "/leaderboard",
    ];
    const isOnPhaseRoute = phaseScopedRoutes.some(
      (r) => path === r || path.startsWith(`${r}/`),
    );
    if (isOnPhaseRoute) {
      navigate("/", { replace: true });
    }
  }, [gameId, location.pathname, navigate]);

  // ── Phase-change navigation ────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    const unsubscribe = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DocumentData;
      const phase = data.phase;
      const round =
        typeof data.currentRound === "number"
          ? data.currentRound
          : typeof data.round === "number"
          ? data.round
          : null;
      const ends = data.phaseEndsAt;

      if (typeof phase === "string") {
        dispatch({ type: "SET_PHASE", payload: phase });
        phaseNameRef.current = phase;
      }
      // Track professor uid so the freeze-end handler can fire the auto-advance
      // when this browser belongs to the professor (mirrors ProfessorPage logic
      // but runs globally so the professor doesn't have to stay on /professor).
      const profUid = typeof data.professorUid === "string"
        ? data.professorUid
        : typeof data.professorId === "string"
          ? data.professorId
          : null;
      professorUidRef.current = profUid;
      if (round !== null) dispatch({ type: "SET_ROUND", payload: round });
      if (ends && typeof ends.toMillis === "function") {
        dispatch({ type: "SET_PHASE_ENDS_AT", payload: ends.toMillis() });
      } else if (ends === null || ends === undefined) {
        dispatch({ type: "SET_PHASE_ENDS_AT", payload: null });
      }

      if (typeof phase !== "string" || phase === "lobby") return;
      if (pathnameRef.current.startsWith("/professor")) return;

      const base = parseGamePhase(phase).base;
      let target: string;
      if (base === "bid_ad" || base === "bid_chef") target = "/auction";
      else if (base === "email") target = "/game/email";
      else if (base === "roster") target = "/game/roster";
      else if (base === "game_over") target = "/game/conclusion";
      else target = "/game";

      if (pathnameRef.current === target) return;

      // V4 fix (Apr 25): always navigate immediately on phase change.
      // The previous deferred-nav code held the navigation back if the
      // *old* phase's grace+freeze window was still open, but
      // `phaseEndsAtMsRef` lagged behind by one render and was tracking
      // the old phase's expiry — so when the professor manually advanced
      // out of `roster` mid-freeze, players sat on the (now-expired)
      // roster screen for up to 15 seconds before navigating. The freeze
      // overlay's job is to lock *inputs* during the gap; navigation
      // should track Firestore directly.
      if (deferredNavRef.current) {
        clearTimeout(deferredNavRef.current);
        deferredNavRef.current = null;
      }
      navigateRef.current(target);
    }, (err) => {
      console.error("games/{gameId} phase listener error:", { gameId, err });
    });
    return () => {
      unsubscribe();
      if (deferredNavRef.current) {
        clearTimeout(deferredNavRef.current);
        deferredNavRef.current = null;
      }
    };
  }, [gameId, dispatch]);

  // ── Timer-expiry sequence ──────────────────────────────────────────────────
  //
  // Stage transitions (grace → freeze → cleared) are driven by setTimeouts,
  // but the *displayed* countdown is derived each tick from the absolute
  // `phaseEndsAtMs` timestamp (A24-I06) so a backgrounded tab never drifts
  // out of sync with the RoundHeader clock. Both widgets now read the same
  // absolute time and converge on 0 at the same instant.
  const clearAll = () => {
    [t1Ref, t2Ref, t3Ref].forEach(r => {
      if (r.current) { clearTimeout(r.current); r.current = null; }
    });
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setStage(null);
    setCountdown(0);
  };

  const startTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    const compute = () => {
      const ends = phaseEndsAtMsRef.current;
      if (ends === null) return 0;
      const msPastEnd = Date.now() - ends;
      // During grace (first GRACE_SECONDS after phaseEndsAtMs), count down
      // GRACE_SECONDS → 0. During freeze (next FREEZE_SECONDS), count down
      // FREEZE_SECONDS → 0. Clamped to [0, window].
      if (msPastEnd < GRACE_SECONDS * 1000) {
        return Math.max(
          0,
          Math.ceil((GRACE_SECONDS * 1000 - msPastEnd) / 1000),
        );
      }
      const freezeMs = msPastEnd - GRACE_SECONDS * 1000;
      return Math.max(
        0,
        Math.ceil((FREEZE_SECONDS * 1000 - freezeMs) / 1000),
      );
    };
    setCountdown(compute());
    tickRef.current = setInterval(() => {
      setCountdown(compute());
    }, 250);
  };

  useEffect(() => {
    clearAll();
    if (!phaseEndsAtMs || !gameId) return;

    // A24-I08 — only arm the overlay on phases where students can submit.
    // Use the current `phase` from context (not the ref) so a phase flip
    // re-runs this effect and tears down any in-flight overlay immediately.
    const base = parseGamePhase(phase).base;
    if (!SUBMISSION_PHASE_BASES.has(base)) return;

    const msUntilExpiry = phaseEndsAtMs - Date.now();
    if (msUntilExpiry < -30_000) return;

    t1Ref.current = setTimeout(() => {
      setStage("grace");
      startTick();

      t2Ref.current = setTimeout(() => {
        setStage("freeze");
        startTick();

        t3Ref.current = setTimeout(() => {
          if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
          setStage(null);
          setCountdown(0);
          // If this browser is the professor's, fire the auto-advance here so
          // the phase advances even when the professor isn't on /professor.
          // The backend CRIT-02 guard (expectedFromPhase) prevents doubles when
          // ProfessorPage's own timer also fires.
          const gid = gameIdRef.current;
          const pid = playerIdRef.current;
          const profUid = professorUidRef.current;
          const expectedFromPhase = phaseNameRef.current ?? undefined;
          if (gid && pid && profUid && pid === profUid) {
            void httpsCallable(functions, "advanceGamePhase")({
              gameId: gid,
              expectedFromPhase,
            }).catch(() => { /* CRIT-02 rejection is expected and safe */ });
          }
        }, FREEZE_SECONDS * 1000);
      }, GRACE_SECONDS * 1000);
    }, Math.max(0, msUntilExpiry));

    return clearAll;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseEndsAtMs, gameId, phase]);

  // A24-I04 / A24-I08 — non-submission phases (email, simulating,
  // results_ready) still need the professor's browser to auto-advance
  // when the phase timer expires. The submission-phase effect above owns
  // the grace+freeze overlay; this one fires at phaseEndsAtMs + 0 (no
  // overlay, no grace window) so phases like the round-1 email don't
  // stall waiting for a manual click when the professor has navigated
  // away from /professor.
  useEffect(() => {
    if (!phaseEndsAtMs || !gameId) return;
    const base = parseGamePhase(phase).base;
    if (SUBMISSION_PHASE_BASES.has(base)) return;
    if (base === "lobby" || base === "game_over") return;
    const msUntilExpiry = phaseEndsAtMs - Date.now();
    if (msUntilExpiry < -30_000) return;
    const t = setTimeout(() => {
      const gid = gameIdRef.current;
      const pid = playerIdRef.current;
      const profUid = professorUidRef.current;
      const expectedFromPhase = phaseNameRef.current ?? undefined;
      if (gid && pid && profUid && pid === profUid) {
        void httpsCallable(functions, "advanceGamePhase")({
          gameId: gid,
          expectedFromPhase,
        }).catch(() => { /* CRIT-02 rejection is expected and safe */ });
      }
    }, Math.max(0, msUntilExpiry));
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseEndsAtMs, gameId, phase]);

  // V4 fix (Apr 25): the "Last chance to submit — Xs" banner during the
  // grace window was redundant with the RoundHeader timer that's already
  // visible, *and* it appeared as a separate countdown that didn't visibly
  // line up with the header clock. Render nothing during grace; only the
  // hard freeze overlay still appears (it's the actual input lock).
  if (stage === null || stage === "grace") return null;
  // A24-I08 — final render gate, belt-and-suspenders with the useEffect
  // gate above. Covers the window where a phase flips from submission to
  // non-submission while `stage` is still set.
  if (!SUBMISSION_PHASE_BASES.has(parseGamePhase(phase).base)) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: "1.25rem",
        padding: "2.5rem 3.5rem",
        textAlign: "center",
        boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
      }}>
        <p style={{ margin: 0, fontSize: "1.1rem", color: "#555", fontWeight: 500 }}>
          Locked — advancing in
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "4rem", fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>
          {countdown}
        </p>
      </div>
    </div>
  );
}
