import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { liveStandings } from '../lib/liveStandings';
import { presentationProgress } from '../lib/presentationProgress';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { RoundDoc, StandingsRow } from '../types/models';
import { useAuth } from './AuthContext';
import { useGame } from './GameContext';

export type RoundPresentation = {
  round: number;
  rd: RoundDoc | null;
  applied: number;
  complete: boolean;
  rows: StandingsRow[];
  revealNext: () => void;
  revealAll: () => void;
  getRound: (round: number) => Promise<RoundDoc | null>;
};

type Cache = {
  scope: string;
  values: Map<number, RoundDoc | null>;
  pending: Map<number, Promise<RoundDoc | null>>;
};

type ProgressState = {
  scope: string;
  gameId: string;
  uid: string;
  round: number;
  startedAt: number;
  manualApplied: number;
  revealAll: boolean;
};

const Ctx = createContext<RoundPresentation | null>(null);

const progressKey = (gameId: string, uid: string, round: number) =>
  `ss.round-presentation.${gameId}.${uid}.${round}`;

function loadProgress(gameId: string, uid: string, round: number, gameCount: number): ProgressState {
  const fresh = (): ProgressState => ({
    scope: `${gameId}/${uid}/${round}`,
    gameId,
    uid,
    round,
    startedAt: Date.now(),
    manualApplied: 0,
    revealAll: false,
  });
  try {
    const raw = sessionStorage.getItem(progressKey(gameId, uid, round));
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    if (parsed.gameId !== gameId || parsed.uid !== uid || parsed.round !== round) return fresh();
    const now = Date.now();
    const startedAt = typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt)
      ? Math.max(0, Math.min(now, parsed.startedAt))
      : now;
    const manualApplied = typeof parsed.manualApplied === 'number'
      && Number.isFinite(parsed.manualApplied)
      ? Math.max(0, Math.min(gameCount, Math.floor(parsed.manualApplied)))
      : 0;
    return {
      scope: `${gameId}/${uid}/${round}`,
      gameId,
      uid,
      round,
      startedAt,
      manualApplied,
      revealAll: parsed.revealAll === true,
    };
  } catch {
    return fresh();
  }
}

function remember(cache: Cache, round: number, value: RoundDoc | null) {
  cache.values.delete(round);
  cache.values.set(round, value);
  while (cache.values.size > 5) {
    const oldest = cache.values.keys().next().value as number | undefined;
    if (oldest === undefined) break;
    cache.values.delete(oldest);
  }
}

export function useRoundPresentation(): RoundPresentation {
  const value = useContext(Ctx);
  if (!value) throw new Error('useRoundPresentation must be used inside RoundPresentationProvider');
  return value;
}

export function RoundPresentationProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const { gameId, game, membership } = useGame();
  const reduced = useReducedMotion();
  const round = game?.round ?? 0;
  const phase = game?.phase ?? 'LOBBY';
  const scope = gameId && uid ? `${gameId}/${uid}` : '';
  const listenerKey = scope && membership && round > 0 ? `${scope}/${round}` : '';
  const cacheRef = useRef<Cache>({ scope, values: new Map(), pending: new Map() });
  if (cacheRef.current.scope !== scope) {
    cacheRef.current = { scope, values: new Map(), pending: new Map() };
  }

  const [current, setCurrent] = useState<{ key: string; rd: RoundDoc | null }>({
    key: '', rd: null,
  });
  const rd = current.key === listenerKey ? current.rd : null;

  useEffect(() => {
    if (!listenerKey || !gameId) return undefined;
    let active = true;
    const unsubscribe = onSnapshot(
      doc(db, 'games', gameId, 'rounds', String(round)),
      (snapshot) => {
        if (!active) return;
        const next = snapshot.exists() ? snapshot.data() as RoundDoc : null;
        if (cacheRef.current.scope === scope) remember(cacheRef.current, round, next);
        setCurrent({ key: listenerKey, rd: next });
      },
      (error) => {
        if (!active) return;
        console.error('RoundPresentation: current round listener failed', error);
        setCurrent({ key: listenerKey, rd: null });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [gameId, listenerKey, round, scope]);

  const getRound = useCallback(async (requestedRound: number): Promise<RoundDoc | null> => {
    if (!gameId || !uid || !membership || !game || requestedRound < 1) return null;
    if (requestedRound > game.round) return null;
    if (game.phase === 'SIMULATE' && requestedRound === game.round) return null;
    if (requestedRound === game.round) return rd;

    const cache = cacheRef.current;
    if (cache.scope !== scope) return null;
    if (cache.values.has(requestedRound)) return cache.values.get(requestedRound) ?? null;
    const pending = cache.pending.get(requestedRound);
    if (pending) return pending;

    const request = getDoc(doc(db, 'games', gameId, 'rounds', String(requestedRound)))
      .then((snapshot) => {
        const value = snapshot.exists() ? snapshot.data() as RoundDoc : null;
        if (cacheRef.current.scope === scope) remember(cacheRef.current, requestedRound, value);
        return value;
      })
      .catch((error: unknown) => {
        console.error('RoundPresentation: round read failed', error);
        return null;
      })
      .finally(() => {
        if (cacheRef.current.scope === scope) cacheRef.current.pending.delete(requestedRound);
      });
    cache.pending.set(requestedRound, request);
    return request;
  }, [game, gameId, membership, rd, scope, uid]);

  const previousRound = phase !== 'SIMULATE' && phase !== 'RESULTS' && phase !== 'FINALE'
    && round > 1 ? round - 1 : 0;
  const historyKey = previousRound > 0 ? `${scope}/${previousRound}` : '';
  const [history, setHistory] = useState<{ key: string; rd: RoundDoc | null }>({
    key: '', rd: null,
  });
  useEffect(() => {
    if (!historyKey) return undefined;
    let active = true;
    void getRound(previousRound).then((value) => {
      if (active) setHistory({ key: historyKey, rd: value });
    });
    return () => { active = false; };
  }, [getRound, historyKey, previousRound]);
  const previousRd = history.key === historyKey ? history.rd : null;

  const progressScope = listenerKey;
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (phase !== 'SIMULATE' || !rd || !gameId || !uid || round < 1) return;
    setProgress((value) => value?.scope === progressScope
      ? value
      : loadProgress(gameId, uid, round, rd.games.length));
    setClock(Date.now());
  }, [gameId, phase, progressScope, rd, round, uid]);

  useEffect(() => {
    if (phase !== 'SIMULATE' || !rd || progress?.scope !== progressScope) return undefined;
    const update = () => setClock(Date.now());
    const interval = window.setInterval(update, 250);
    const onVisibility = () => { if (document.visibilityState === 'visible') update(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, progress?.scope, progressScope, rd]);

  const gameCount = rd?.games.length ?? 0;
  let applied = 0;
  if (rd && (phase === 'RESULTS' || phase === 'FINALE')) {
    applied = gameCount;
  } else if (rd && phase === 'SIMULATE' && progress?.scope === progressScope) {
    const elapsed = presentationProgress(clock - progress.startedAt, gameCount, reduced);
    applied = progress.revealAll
      ? gameCount
      : Math.max(elapsed, Math.min(gameCount, progress.manualApplied));
  }
  const complete = Boolean(rd)
    && (phase === 'RESULTS' || phase === 'FINALE' || applied >= gameCount);

  useEffect(() => {
    if (!progress || progress.scope !== progressScope) return;
    const stored = { ...progress, manualApplied: Math.max(progress.manualApplied, applied) };
    try {
      sessionStorage.setItem(
        progressKey(progress.gameId, progress.uid, progress.round),
        JSON.stringify(stored),
      );
    } catch {
      // Progress persistence is a session-local enhancement; memory state remains authoritative.
    }
  }, [applied, progress, progressScope]);

  const revealNext = useCallback(() => {
    if (phase !== 'SIMULATE' || !rd || !gameId || !uid) return;
    setProgress((value) => {
      const base = value?.scope === progressScope
        ? value
        : loadProgress(gameId, uid, round, rd.games.length);
      return {
        ...base,
        manualApplied: Math.min(rd.games.length, Math.max(base.manualApplied, applied) + 1),
      };
    });
  }, [applied, gameId, phase, progressScope, rd, round, uid]);

  const revealAll = useCallback(() => {
    if (phase !== 'SIMULATE' || !rd || !gameId || !uid) return;
    setProgress((value) => ({
      ...(value?.scope === progressScope
        ? value
        : loadProgress(gameId, uid, round, rd.games.length)),
      revealAll: true,
      manualApplied: rd.games.length,
    }));
  }, [gameId, phase, progressScope, rd, round, uid]);

  const rows = useMemo<StandingsRow[]>(() => {
    if (phase === 'SIMULATE' && rd) {
      const previousRanks = new Map(rd.standings.map((row) => [row.teamId, row.previousRank]));
      return liveStandings(rd.standings, rd.games, applied, round).map((row) => ({
        ...row,
        previousRank: previousRanks.get(row.teamId) ?? null,
      }));
    }
    if ((phase === 'RESULTS' || phase === 'FINALE') && rd) return rd.standings;
    return previousRd?.standings ?? [];
  }, [applied, phase, previousRd, rd, round]);

  const value = useMemo<RoundPresentation>(() => ({
    round,
    rd,
    applied,
    complete,
    rows,
    revealNext,
    revealAll,
    getRound,
  }), [applied, complete, getRound, rd, revealAll, revealNext, round, rows]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
