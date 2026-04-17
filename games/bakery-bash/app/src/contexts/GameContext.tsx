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
  AuctionTab,
  GameConfigParams,
  PendingDecisionDraft,
  PendingBidsDraft,
} from "../types/game";

const DEFAULT_PENDING_DECISION: PendingDecisionDraft = {
  staffCount: 3,
  adSpend: 0,
  menu: {
    croissant: true,
    cookie: true,
    bagel: true,
    sandwich: false,
    latte: false,
    matchaLatte: false,
  },
  productPrices: {
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    latte: 0,
    matchaLatte: 0,
  },
  quantities: {
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    latte: 0,
    matchaLatte: 0,
  },
};

const DEFAULT_PENDING_BIDS: PendingBidsDraft = {
  adBid: { adType: null, amount: 0 },
  chefBid: { skillLevel: 0, amount: 0 },
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
  auctionTab: "chefs",
  config: null,
  pendingDecision: DEFAULT_PENDING_DECISION,
  pendingBids: DEFAULT_PENDING_BIDS,
};

type GameAction =
  | { type: "JOIN_GAME"; payload: { gameId: string; gameCode: string; player: Player } }
  | { type: "SET_PHASE"; payload: GamePhase }
  | { type: "SET_PLAYERS"; payload: Player[] }
  | { type: "ADVANCE_ROUND" }
  | { type: "SET_ROUND"; payload: number }
  | { type: "ADD_RESULT"; payload: RoundResult }
  | { type: "SET_TIMER"; payload: number | null }
  | { type: "UPDATE_PLAYER"; payload: Partial<Player> }
  | { type: "SET_AUCTION_TAB"; payload: AuctionTab }
  | { type: "SET_CONFIG"; payload: GameConfigParams }
  | { type: "UPDATE_PENDING_DECISION"; payload: Partial<PendingDecisionDraft> }
  | { type: "UPDATE_PENDING_BIDS"; payload: Partial<PendingBidsDraft> }
  | { type: "RESET_PENDING" }
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

    case "SET_ROUND":
      return { ...state, currentRound: action.payload };

    case "ADD_RESULT":
      return {
        ...state,
        roundResults: [...state.roundResults, action.payload],
      };

    case "SET_TIMER":
      return { ...state, timeRemaining: action.payload };

    case "UPDATE_PLAYER":
      return {
        ...state,
        player: state.player ? { ...state.player, ...action.payload } : null,
      };

    case "SET_AUCTION_TAB":
      return { ...state, auctionTab: action.payload };

    case "SET_CONFIG":
      return { ...state, config: action.payload };

    case "UPDATE_PENDING_DECISION":
      return {
        ...state,
        pendingDecision: { ...state.pendingDecision, ...action.payload },
      };

    case "UPDATE_PENDING_BIDS":
      return {
        ...state,
        pendingBids: { ...state.pendingBids, ...action.payload },
      };

    case "RESET_PENDING":
      return {
        ...state,
        pendingDecision: DEFAULT_PENDING_DECISION,
        pendingBids: DEFAULT_PENDING_BIDS,
      };

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
