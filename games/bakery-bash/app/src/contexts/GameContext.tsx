import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type {
  GameState,
  GamePhase,
  Player,
  RoundResult,
  MaintenanceBars,
} from "../types/game";

const initialMaintenanceBars: MaintenanceBars = {
  cleanliness: 100,
  ovenHealth: 100,
  slicerHealth: 100,
  espressoHealth: 100,
};

const initialState: GameState = {
  gameId: null,
  gameCode: null,
  phase: "lobby",
  currentRound: 0,
  totalRounds: 5,
  player: null,
  players: [],
  roundResults: [],
  timeRemaining: null,
  maintenanceBars: initialMaintenanceBars,
  chefSatisfactionScores: {},
};

type GameAction =
  | { type: "JOIN_GAME"; payload: { gameId: string; gameCode: string; player: Player } }
  | { type: "SET_PHASE"; payload: GamePhase }
  | { type: "SET_PLAYERS"; payload: Player[] }
  | { type: "ADVANCE_ROUND" }
  | { type: "ADD_RESULT"; payload: RoundResult }
  | { type: "SET_TIMER"; payload: number | null }
  | { type: "UPDATE_PLAYER"; payload: Partial<Player> }
  | { type: "SET_MAINTENANCE_BARS"; payload: MaintenanceBars }
  | { type: "SET_CHEF_SATISFACTION"; payload: Record<string, number> }
  | { type: "RESET" };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "JOIN_GAME":
      return {
        ...state,
        gameId: action.payload.gameId,
        gameCode: action.payload.gameCode,
        player: action.payload.player,
        phase: "lobby",
      };

    case "SET_PHASE":
      return { ...state, phase: action.payload };

    case "SET_PLAYERS":
      return { ...state, players: action.payload };

    case "ADVANCE_ROUND":
      return {
        ...state,
        currentRound: state.currentRound + 1,
        phase: "decide",
      };

    case "ADD_RESULT":
      return {
        ...state,
        roundResults: [...state.roundResults, action.payload],
        maintenanceBars: action.payload.maintenanceBars,
      };

    case "SET_TIMER":
      return { ...state, timeRemaining: action.payload };

    case "UPDATE_PLAYER":
      return {
        ...state,
        player: state.player ? { ...state.player, ...action.payload } : null,
      };

    case "SET_MAINTENANCE_BARS":
      return { ...state, maintenanceBars: action.payload };

    case "SET_CHEF_SATISFACTION":
      return { ...state, chefSatisfactionScores: action.payload };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

const GameContext = createContext<GameState>(initialState);
const GameDispatchContext = createContext<Dispatch<GameAction>>(() => {});

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

export function useGameDispatch() {
  return useContext(GameDispatchContext);
}
