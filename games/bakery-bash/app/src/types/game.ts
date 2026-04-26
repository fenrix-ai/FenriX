export type GamePhase = "lobby" | "closing_hours" | "auction" | "open_for_business" | "results" | "game_over";

export type MenuItemId =
  | "croissant"
  | "cookie"
  | "bagel"
  | "sandwich"
  | "latte"
  | "matcha-latte";

export type AdType = "TV" | "Billboard" | "Radio" | "Newspaper";

export interface PendingDecision {
  submitted: boolean;
  submittedAt: number | null;
  staffCount: number;
  adSpend: number;
  menu: Record<string, boolean>;
  productPrices: Record<string, number>;
  quantities: Record<string, number>;
}

export interface PendingBids {
  adBid: {
    adType: string | null;
    amount: number;
  };
  chefBid: {
    skillLevel: number;
    amount: number;
  };
}

export interface LastRoundResult {
  round: number;
  revenue: number;
  customerCount: number;
  customerSatisfaction: number;
  headchefSkill: number;
  adTypeWon: string | null;
  productsSold: Record<string, number>;
}

export interface Player {
  id: string;
  uid: string;
  name: string;
  displayName: string;
  joinedAt: number | null;
  budgetCurrent: number;
  creditBalance: number;
  cumulativeRevenue: number;
  pendingDecision: PendingDecision;
  pendingBids: PendingBids;
  lastRoundResult: LastRoundResult;
}

export interface GameConfig {
  startingBudget: number;
  costPerStaffPerRound: number;
  unitCostPerProduct: number;
  revenueModel: {
    base: number;
    staffCoefficient: number;
    priceCoefficient: number;
    adSpendCoefficient: number;
    numProductsCoefficient: number;
    noiseMin: number;
    noiseMax: number;
  };
  adBonuses: Record<string, number>;
  chefBonusPerPoint: number;
  customerPoolMultiplier: number;
  phaseDurations: Record<string, number>;
}

export interface RoundResult {
  roundId: string;
  round: number;
  simulationStatus: string;
  auctionResults: Record<string, unknown>;
  classStats: Record<string, unknown>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  cumulativeRevenue: number;
  lastRoundRevenue: number;
  rankChange: number;
}

export interface GameState {
  gameId: string | null;
  gameCode: string | null;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
  config: GameConfig | null;
  player: Player | null;
  players: Player[];
  rounds: RoundResult[];
  phaseEndTime: number | null;
}