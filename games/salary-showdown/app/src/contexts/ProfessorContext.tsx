import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type {
  AuctionDoc, GameDoc, Phase, PlayerSeat, RevealDoc, RoundDoc, TeamDoc,
} from '../types/models';

// Data layer for /professor and /bigscreen (design spec §3.1). Deliberately NOT
// GameContext: that provider is membership-gated by design, and the professor
// has NO players/{uid} membership doc — never create one. Every read here rides
// the professor rule right (games/{id}.professorUid == auth.uid), which covers
// everything under the game including other teams' private/auction docs.
// Every listener passes an error callback that logs via console.error — never
// a silent no-op (§3a lesson).
interface ProfessorCtx {
  gameId: string | null;
  setGameId(id: string | null): void;      // persists localStorage 'ss.profGameId'
  game: GameDoc | null;                    // transition-GATED (see game-doc effect)
  settling: boolean;                       // raw doc has transition != null
  // UNGATED round/phase straight off the doc; null when no doc. Sole consumer
  // today: AdvanceControl's stuck-advance resolve, whose expectations MUST be
  // raw — the ONE sanctioned exception to the gated-expectations rule (see
  // the inline note there). Everything else keeps reading `game`.
  raw: { round: number; phase: Phase } | null;
  teams: Map<string, TeamDoc>;
  players: Map<string, PlayerSeat>;        // key = uid
  round: RoundDoc | null;                  // rounds/{contextRound} (see contextRound memo)
  contextRound: number | null;             // the round `round` mirrors; null while none complete
  auctionWave: AuctionDoc | null;          // auctions/{game.round}
  bidsSubmitted: Set<string>;              // teamIds with private/auction.round === game.round
  reveal: RevealDoc | null;                // only fetched when phase === 'FINALE'
  call<T = unknown>(name: string, data: unknown): Promise<T>;
}

const Ctx = createContext<ProfessorCtx>(null as unknown as ProfessorCtx);
export const useProfessor = () => useContext(Ctx);

export function ProfessorProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [gameId, setGameIdState] = useState<string | null>(
    () => localStorage.getItem('ss.profGameId'));
  const [game, setGame] = useState<GameDoc | null>(null);
  const [settling, setSettling] = useState(false);
  const [raw, setRaw] = useState<{ round: number; phase: Phase } | null>(null);
  const [teams, setTeams] = useState<Map<string, TeamDoc>>(new Map());
  const [players, setPlayers] = useState<Map<string, PlayerSeat>>(new Map());
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [auctionWave, setAuctionWave] = useState<AuctionDoc | null>(null);
  const [bidsSubmitted, setBidsSubmitted] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState<RevealDoc | null>(null);

  // localStorage, not sessionStorage: the professor's session survives browser
  // restarts and is independent of the team client's ss.gameId story (spec §3.1).
  const setGameId = useCallback((id: string | null) => {
    if (id) localStorage.setItem('ss.profGameId', id);
    else localStorage.removeItem('ss.profGameId');
    setGameIdState(id);
  }, []);

  useEffect(() => { // game doc: gated view + raw settling flag
    if (!gameId || !uid) { setGame(null); setSettling(false); setRaw(null); return; }
    return onSnapshot(doc(db, 'games', gameId),
      (s) => {
        if (!s.exists()) { setGame(null); setSettling(false); setRaw(null); return; }
        const d = s.data() as GameDoc;
        // §3a transition gate — same mapping as GameContext.tsx:37-56. The
        // flip-first advance publishes the new round/phase BEFORE the enter
        // hook has created that phase's data (auctions/{r}, market/{r},
        // rounds/{r}). Until the marker clears, keep presenting the phase we
        // are LEAVING — its data is fully materialised. `settling` exposes the
        // raw marker so the panel can show "advancing…" and disable controls.
        setGame(d.transition
          ? { ...d, round: d.transition.fromRound, phase: d.transition.fromPhase }
          : d);
        setSettling(d.transition != null);
        setRaw({ round: d.round, phase: d.phase });
      },
      (e) => console.error('[professor] games/{id} listener', e));
  }, [gameId, uid]);

  useEffect(() => { // all team docs (public state + doneRound/donePhase lights)
    if (!gameId || !uid) { setTeams(new Map()); return; }
    return onSnapshot(collection(db, 'games', gameId, 'teams'),
      (snap) => {
        const m = new Map<string, TeamDoc>();
        snap.forEach((d) => m.set(d.id, d.data() as TeamDoc));
        setTeams(m);
      },
      (e) => console.error('[professor] teams listener', e));
  }, [gameId, uid]);

  useEffect(() => { // players collection: who claimed which seat (lobby walls)
    if (!gameId || !uid) { setPlayers(new Map()); return; }
    return onSnapshot(collection(db, 'games', gameId, 'players'),
      (snap) => {
        const m = new Map<string, PlayerSeat>();
        snap.forEach((d) => m.set(d.id, d.data() as PlayerSeat));
        setPlayers(m);
      },
      (e) => console.error('[professor] players listener', e));
  }, [gameId, uid]);

  // Which rounds/{r} doc gives useful context (3b T1 sourcing fix, spec §5.6):
  // rounds/{r} is only written by the enter:SIMULATE hook, so during round
  // r's DECISION phases it does not exist yet — the last completed round is
  // r-1. SIMULATE/RESULTS/FINALE read the current round (materialised before
  // the gated phase renders — §3a gate). SimulateFlood, StandingsShuffle and
  // FinaleWall consume `round` in exactly those phases, so for them
  // contextRound === game.round and their behavior is UNCHANGED — do not
  // "simplify" them onto contextRound-aware logic. `game` here is the GATED
  // view, so during settling this keeps showing the leaving phase's context.
  const contextRound = useMemo(() => {
    if (!game) return null;
    if (game.phase === 'SIMULATE' || game.phase === 'RESULTS' || game.phase === 'FINALE') {
      return game.round >= 1 ? game.round : null;
    }
    if (game.phase === 'LOBBY') return null;
    return game.round - 1 >= 1 ? game.round - 1 : null; // FO / FA / AUCTION / LINEUP
  }, [game]);

  useEffect(() => { // context round doc (see contextRound memo above)
    if (!gameId || !uid || contextRound == null) { setRound(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'rounds', String(contextRound)),
      (s) => setRound(s.exists() ? (s.data() as RoundDoc) : null),
      (e) => console.error('[professor] rounds listener', e));
  }, [gameId, uid, contextRound]);

  useEffect(() => { // current auction wave
    const r = game?.round ?? 0;
    if (!gameId || !uid || r < 1) { setAuctionWave(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'auctions', String(r)),
      (s) => setAuctionWave(s.exists() ? (s.data() as AuctionDoc) : null),
      (e) => console.error('[professor] auctions listener', e));
  }, [gameId, uid, game?.round]);

  // Per-team private/auction PRESENCE -> the auction submitted-lights. The
  // professor may read these docs (RULES POLICY: they run the room), but only
  // `.round` is consulted — bid CONTENTS are never surfaced anywhere.
  // <=21 teams => <=21 listeners on this one privileged client (spec §3.1).
  const teamIdsKey = useMemo(() => [...teams.keys()].sort().join('\n'), [teams]);
  useEffect(() => {
    const r = game?.round ?? 0;
    const tids = teamIdsKey === '' ? [] : teamIdsKey.split('\n');
    if (!gameId || !uid || r < 1 || tids.length === 0) {
      setBidsSubmitted(new Set());
      return;
    }
    setBidsSubmitted(new Set()); // round changed: all lights start dark
    const unsubs = tids.map((tid) => onSnapshot(
      doc(db, 'games', gameId, 'teams', tid, 'private', 'auction'),
      (s) => {
        const on = s.exists() && (s.data() as { round?: number }).round === r;
        setBidsSubmitted((prev) => {
          if (prev.has(tid) === on) return prev;
          const next = new Set(prev);
          if (on) next.add(tid);
          else next.delete(tid);
          return next;
        });
      },
      (e) => console.error('[professor] private/auction listener', tid, e)));
    return () => { unsubs.forEach((u) => u()); };
  }, [gameId, uid, teamIdsKey, game?.round]);

  useEffect(() => { // finale payload — professor-readable even pre-finished
    if (!gameId || !uid || game?.phase !== 'FINALE') { setReveal(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'reveal', 'latest'),
      (s) => setReveal(s.exists() ? (s.data() as RevealDoc) : null),
      (e) => console.error('[professor] reveal listener', e));
  }, [gameId, uid, game?.phase]);

  const call = useCallback(async <T,>(name: string, data: unknown): Promise<T> => {
    const res = await httpsCallable(functions, name)(data);
    return res.data as T;
  }, []);

  const value = useMemo(() => ({
    gameId, setGameId, game, settling, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call,
  }), [gameId, setGameId, game, settling, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
