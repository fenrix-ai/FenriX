export type GamePhase =
  | "lobby"
  | `round_${number}_email`
  | `round_${number}_decide`
  | `round_${number}_bid_ad`
  | `round_${number}_bid_chef`
  | `round_${number}_roster`
  | "simulating"
  | "results_ready"
  | "game_over";

export type ChefNationality = "american" | "french" | "italian" | "japanese";
export type ChefGender = "m" | "f";
export type SkillLevel = "low" | "medium" | "high";

export interface ChefListing {
  id: string;
  nationality: ChefNationality;
  gender: ChefGender;
  name: string;
  skill: SkillLevel;
  multiplier: number;
}

export type MenuItemId =
  | "coffee"
  | "matcha"
  | "croissant"
  | "cookie"
  | "bagel"
  | "sandwich";

export type AdType = "tv" | "radio" | "newspaper" | "billboard";

export interface MenuItem {
  id: MenuItemId;
  name: string;
  unlocked: boolean;
  basePrice: number;
  quantity: number;
}

export interface PlayerDecisions {
  quantities: Record<MenuItemId, number>;
  menu: Record<MenuItemId, boolean>;
  sousChefCount: number;
  sousChefAssignments: Record<MenuItemId, string>;
  adBids: Record<AdType, number>;
  chefBids: Record<string, number>;
}

export interface RoundResult {
  round: number;
  revenue: number;
  customerCount: number;
  customerSatisfaction: number;
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
}
