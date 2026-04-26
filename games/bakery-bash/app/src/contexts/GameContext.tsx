import { createContext, useContext, useReducer, useEffect, type ReactNode, type Dispatch } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import type { GameState, GamePhase, Player, RoundResult } from "../types/game";
import { db } from "../lib/firebase";

const defaultConfig = {
  startingBudget: 2000,
  costPerStaffPerRound: 50,
  unitCostPerProduct: 1,
  phaseDurations: {
    lobby: 0,
    closing_hours: 180,
    auction: 90,
    open_for_business: 30,
    results: 60,
    game_over: 0,
  },
  revenueModel: {
    base: 500,
    staffCoefficient: 30,
    priceCoefficient: -15,
    adSpendCoefficient: 0.8,
    numProductsCoefficient: 50,
  },
  adBonuses: { TV: 200, Billboard: 150, Radio: 100, Newspaper: 75 },
  chefBonusPerPoint: 5,
  customerPoolMultiplier: 100,
};

const defaultState: GameState = {
  gameId: null,
  gameCode: null,
  phase: "loading",
  currentRound: 1,
  totalRounds: 5,
  config: defaultConfig,
  player: null,
  players: [],
  rounds: [],
  phaseEndTime: null,
};

type GameAction =
  | { type: "SET_GAME"; payload: Partial<GameState> }
  | { type: "SET_PLAYER"; payload: Player }
  | { type: "SET_PLAYERS"; payload: Player[] }
  | { type: "SET_ROUNDS"; payload: RoundResult[] }
  | { type: "RESET" };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_GAME":
      return { ...state, ...action.payload };
    case "SET_PLAYER":
      return { ...state, player: action.payload };
    case "SET_PLAYERS":
      return { ...state, players: action.payload };
    case "SET_ROUNDS":
      return { ...state, rounds: action.payload };
    case "RESET":
      return defaultState;
    default:
      return state;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGameDispatch(): Dispatch<GameAction> {
  return useContext(GameDispatchContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame(): GameState {
  return useContext(GameContext);
}

interface GameContextValue extends GameState {
  dispatch: Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue>({
  ...defaultState,
  dispatch: () => null,
});

GameContext.displayName = "GameContext";

const GameDispatchContext = createContext<Dispatch<GameAction>>(() => null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, defaultState);

  useEffect(() => {
    const stored = localStorage.getItem("bakeryGameState");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.gameId) {
          dispatch({ type: "SET_GAME", payload: parsed });
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (state.gameId) {
      localStorage.setItem("bakeryGameState", JSON.stringify({
        gameId: state.gameId,
        gameCode: state.gameCode,
        playerId: state.player?.id,
      }));
    }
  }, [state.gameId, state.gameCode, state.player?.id]);

  const gameRef = state.gameId ? doc(db, "games", state.gameId) : null;
  const playerRef =
    state.gameId && state.player ? doc(db, "games", state.gameId, "players", state.player.id) : null;
  const roundsRef = state.gameId ? collection(db, "games", state.gameId, "rounds") : null;

  useEffect(() => {
    if (!gameRef) return;
    const unsub = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      dispatch({
        type: "SET_GAME",
        payload: {
          phase: data.phase as GamePhase,
          currentRound: data.currentRound,
          totalRounds: data.totalRounds,
          config: data.config || defaultConfig,
          phaseEndTime: data.phaseEndTime?.toMillis?.() || null,
        },
      });
    });
    return () => unsub();
  }, [gameRef]);

  useEffect(() => {
    if (!playerRef) return;
    const unsub = onSnapshot(playerRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      dispatch({
        type: "SET_PLAYER",
        payload: {
          id: snap.id,
          uid: data.uid || snap.id,
          displayName: data.displayName || "Unknown",
          budgetCurrent: data.budgetCurrent ?? 2000,
          creditBalance: data.creditBalance ?? 0,
          cumulativeRevenue: data.cumulativeRevenue ?? 0,
          pendingDecision: data.pendingDecision || defaultState.player?.pendingDecision || {
            submitted: false,
            submittedAt: null,
            staffCount: 3,
            adSpend: 0,
            menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: false, matchaLatte: false },
            productPrices: {},
            quantities: {},
          },
          pendingBids: data.pendingBids || {
            adBid: { adType: null, amount: 0 },
            chefBid: { skillLevel: 0, amount: 0 },
          },
          lastRoundResult: data.lastRoundResult || {
            round: 0, revenue: 0, customerCount: 0, customerSatisfaction: 0,
            headchefSkill: 0, adTypeWon: null,
            productsSold: {},
          },
        },
      });
    });
    return () => unsub();
  }, [playerRef]);

  useEffect(() => {
    if (!gameRef) return;
    const unsub = onSnapshot(collection(db, "games", state.gameId!, "players"), (snap) => {
      dispatch({
        type: "SET_PLAYERS",
        payload: snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            uid: data.uid || d.id,
            displayName: data.displayName || "Unknown",
            budgetCurrent: data.budgetCurrent ?? 2000,
            creditBalance: data.creditBalance ?? 0,
            cumulativeRevenue: data.cumulativeRevenue ?? 0,
            pendingDecision: data.pendingDecision || {
              submitted: false,
              submittedAt: null,
              staffCount: 3,
              adSpend: 0,
              menu: { croissant: true, cookie: true, bagel: true, sandwich: false, latte: false, matchaLatte: false },
              productPrices: {},
              quantities: {},
            },
            pendingBids: data.pendingBids || {
              adBid: { adType: null, amount: 0 },
              chefBid: { skillLevel: 0, amount: 0 },
            },
            lastRoundResult: data.lastRoundResult || {
              round: 0, revenue: 0, customerCount: 0, customerSatisfaction: 0,
              headchefSkill: 0, adTypeWon: null,
              productsSold: {},
            },
          };
        }),
      });
    });
    return () => unsub();
  }, [gameRef, state.gameId]);

  useEffect(() => {
    if (!roundsRef) return;
    const unsub = onSnapshot(roundsRef, (snap) => {
      dispatch({
        type: "SET_ROUNDS",
        payload: snap.docs.map((d) => {
          const data = d.data();
          return {
            roundId: d.id,
            round: data.round || 0,
            simulationStatus: data.simulationStatus || "pending",
            auctionResults: data.auctionResults || {},
            classStats: data.classStats || {},
          };
        }),
      });
    });
    return () => unsub();
  }, [roundsRef]);

  return (
    <GameContext.Provider value={{ ...state, dispatch }}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}