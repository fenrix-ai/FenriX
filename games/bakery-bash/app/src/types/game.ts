export type GamePhase =
  | "lobby"
  | "email"
  | "decide"
  | "bid"
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

export type AuctionTab = "chefs" | "ads";

export type MenuItemId =
  | "croissant"
  | "cookie"
  | "bagel"
  | "sandwich"
  | "latte"
  | "matcha-latte";

// Backend-aligned product key (used in Firestore writes).
// Matches /games/{gameId}/players/{playerId}.pendingDecision.{menu,productPrices,quantities}.
export type ProductKey =
  | "croissant"
  | "cookie"
  | "bagel"
  | "sandwich"
  | "latte"
  | "matchaLatte";

export type AdType = "tv" | "radio" | "newspaper" | "billboard";

// Backend-aligned ad type (capitalized) used in Firestore writes.
export type AdTypeBackend = "TV" | "Radio" | "Newspaper" | "Billboard";

export interface MenuItem {
  id: MenuItemId;
  name: string;
  unlocked: boolean;
  basePrice: number;
  quantity: number;
}

export interface PlayerDecisions {
  quantities: Record<MenuItemId, number>;
  staffCount: number;
  adBids: Record<AdType, number>;
  chefBids: Record<string, number>;
}

// Backend-shaped pending decision draft. Mirrors PlayerDocument.pendingDecision
// in backend/firestore-schema.js so we can write it directly to Firestore.
export interface PendingDecisionDraft {
  staffCount: number;
  adSpend: number;
  menu: Record<ProductKey, boolean>;
  productPrices: Record<ProductKey, number>;
  quantities: Record<ProductKey, number>;
}

// Backend-shaped pending bids draft. Mirrors PlayerDocument.pendingBids
// in backend/firestore-schema.js so we can write it directly to Firestore.
export interface PendingBidsDraft {
  adBid: {
    adType: AdTypeBackend | null;
    amount: number;
  };
  chefBid: {
    skillLevel: number;
    amount: number;
  };
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

// Subset of /games/{gameId}/config/params we currently consume on the client.
export interface GameConfigParams {
  costPerStaffPerRound: number;
  unitCostPerProduct: number;
  startingBudget: number;
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
  auctionTab: AuctionTab;
  config: GameConfigParams | null;
  pendingDecision: PendingDecisionDraft;
  pendingBids: PendingBidsDraft;
}
