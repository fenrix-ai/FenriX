import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { CatalogPlayer, GameDoc, MarketDoc, TeamDoc } from '../types/models';

interface Membership { teamId: string; role: string; displayName: string }
interface GameCtx {
  gameId: string | null; setGameId: (id: string | null) => void;
  game: GameDoc | null; membership: Membership | null; team: TeamDoc | null;
  teams: Map<string, TeamDoc>; catalog: Map<number, CatalogPlayer>;
  market: MarketDoc | null;
  call: <T = unknown>(name: string, data: unknown) => Promise<T>;
}
const Ctx = createContext<GameCtx>(null as unknown as GameCtx);
export const useGame = () => useContext(Ctx);

export function GameProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [gameId, setGameIdState] = useState<string | null>(
    () => sessionStorage.getItem('ss.gameId'));
  const [game, setGame] = useState<GameDoc | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [teams, setTeams] = useState<Map<string, TeamDoc>>(new Map());
  const [catalog, setCatalog] = useState<Map<number, CatalogPlayer>>(new Map());
  const [market, setMarket] = useState<MarketDoc | null>(null);

  const setGameId = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem('ss.gameId', id);
    else sessionStorage.removeItem('ss.gameId');
    setGameIdState(id);
  }, []);

  useEffect(() => { // game doc
    if (!gameId) { setGame(null); return; }
    return onSnapshot(doc(db, 'games', gameId),
      (s) => setGame(s.exists() ? (s.data() as GameDoc) : null),
      () => setGame(null)); // permission error pre-membership: stay null, Landing owns the flow
  }, [gameId]);

  useEffect(() => { // own membership doc
    if (!gameId || !uid) { setMembership(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'players', uid),
      (s) => setMembership(s.exists() ? (s.data() as Membership) : null),
      () => setMembership(null));
  }, [gameId, uid]);

  useEffect(() => { // all team docs (public to members) — Lobby, Standings, Results need them
    if (!gameId || !membership) { setTeams(new Map()); return; }
    return onSnapshot(collection(db, 'games', gameId, 'teams'), (snap) => {
      const m = new Map<string, TeamDoc>();
      snap.forEach((d) => m.set(d.id, d.data() as TeamDoc));
      setTeams(m);
    });
  }, [gameId, membership]);

  useEffect(() => { // catalog: 175 static docs — fetch once per game
    if (!gameId || !membership) { setCatalog(new Map()); return; }
    void getDocs(collection(db, 'games', gameId, 'catalog')).then((snap) => {
      const m = new Map<number, CatalogPlayer>();
      snap.forEach((d) => m.set(Number(d.id), d.data() as CatalogPlayer));
      setCatalog(m);
    });
  }, [gameId, membership]);

  useEffect(() => { // this round's market doc
    const round = game?.round ?? 0;
    if (!gameId || !membership || round < 1) { setMarket(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'market', String(round)),
      (s) => setMarket(s.exists() ? (s.data() as MarketDoc) : null));
  }, [gameId, membership, game?.round]);

  const call = useCallback(async <T,>(name: string, data: unknown): Promise<T> => {
    const res = await httpsCallable(functions, name)(data);
    return res.data as T;
  }, []);

  const team = membership ? teams.get(membership.teamId) ?? null : null;
  const value = useMemo(() => ({
    gameId, setGameId, game, membership, team, teams, catalog, market, call,
  }), [gameId, setGameId, game, membership, team, teams, catalog, market, call]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
