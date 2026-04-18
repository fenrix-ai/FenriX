export type GamePhase =
  | "lobby"
  | "email"
  | "decide"
  | "bid"
  | "simulating"
  | "results_ready"
  | "game_over";

export type MenuItemId =
  | "croissant"
  | "cookie"
  | "bagel"
  | "sandwich"
  | "coffee"
  | "matcha";

export type StationId = "bakery" | "deli" | "barista";

export type MaintenanceTask =
  | "clean"
  | "repair_oven"
  | "repair_slicer"
  | "repair_espresso";

export type AdType = "tv" | "radio" | "newspaper" | "billboard";

export interface MenuItem {
  id: MenuItemId;
  name: string;
  unlocked: boolean;
  basePrice: number;
  quantity: number;
}

export interface StaffCounts {
  bakerySousChefs: number;
  deliSousChefs: number;
  baristaSousChefs: number;
  maintenanceGuys: number;
}

export interface MaintenanceBars {
  cleanliness: number;
  ovenHealth: number;
  slicerHealth: number;
  espressoHealth: number;
}

export interface PlayerDecisions {
  quantities: Record<MenuItemId, number>;
  staffCounts: StaffCounts;
  maintenanceTasks: MaintenanceTask[];
  adBids: Record<AdType, number>;
  chefBids: Record<string, number>;
}

export interface RoundResult {
  round: number;
  revenue: number;
  customerCount: number;
  customerSatisfaction: number;
  chefSatisfactionScore: number;
  maintenanceBars: MaintenanceBars;
  chefDepartures: string[];
  auctionResults: {
    adWon: AdType | null;
    chefWon: string | null;
  };
}

export interface Player {
  id: string;
  name: string;
  bakeryName: string;
  budget: number;
  cumulativeRevenue: number;
}

export interface GameState {
  gameId: string | null;
  gameCode: string | null;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
  player: Player | null;
  players: Player[];
  roundResults: RoundResult[];
  timeRemaining: number | null;
  maintenanceBars: MaintenanceBars;
  chefSatisfactionScores: Record<string, number>;
}
