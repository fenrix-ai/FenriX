/**
 * Bakery Bash — Firestore NoSQL Schema
 *
 * This file documents the complete Firestore data model for Bakery Bash.
 * It serves as the canonical reference for collection/document structure,
 * field types, and relationships. Use this alongside the security rules and
 * Cloud Functions to implement the backend.
 *
 * Top-level collections:
 *   /games
 */

/**
 * @typedef {"lobby" | "email" | "decide" | "bid" | "simulating" | "results_ready" | "game_over"} GamePhase
 *
 * Station → Products → Machine mapping:
 *   bakery   → croissant, cookie   → oven
 *   deli     → bagel, sandwich     → slicer
 *   barista  → coffee, matcha      → espresso
 */

// ─────────────────────────────────────────────────────────────
// /games/{gameId}
// Created by professor via /api/game/create
// ─────────────────────────────────────────────────────────────
const GameDocument = {
  // Unique 6-character join code shown to players
  joinCode: "ABC123",             // string

  // Current phase of the state machine
  // Transitions: lobby → email → decide → bid → simulating → results_ready → (next round email or game_over)
  phase: "lobby",                 // GamePhase

  // Current round number (1-indexed)
  currentRound: 1,                // number (1–5)
  totalRounds: 5,                 // number

  // Server-side timestamp for when current phase ends (used by clients to sync countdown)
  phaseEndTime: null,             // Timestamp | null

  // Track submission progress so professor dashboard can show "X/Y submitted"
  submittedCount: 0,              // number
  totalPlayers: 0,                // number

  // Whether the game is paused (professor control)
  paused: false,                  // boolean

  professorId: "uid_prof",        // string — Firebase Auth UID of the professor

  createdAt: null,                // Timestamp
  startedAt: null,                // Timestamp | null
  endedAt: null,                  // Timestamp | null
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/config/{configId}  (single doc: "params")
// Stores all tunable parameters so nothing is hardcoded in Cloud Functions.
// ─────────────────────────────────────────────────────────────
const GameConfigDocument = {
  // Economy
  startingBudget: 2000,           // number ($)
  costPerStaffPerRound: 50,       // number ($)
  unitCostPerProduct: 1,          // number ($) — flat cost per unit ordered

  // Credit / overdraft mechanics are pending Game Design sign-off.
  // Until creditCostRate is finalized, backend validation should keep budgets non-negative.
  credit: {
    overdraftEnabled: false,       // boolean
    creditCostRate: null,          // number | null — Open Q #6
    chargeTiming: null,            // "immediate" | "per_round" | "game_end" | null
  },

  // Staffing cost escalation — applies per role independently
  // (bakerySousChefs, deliSousChefs, baristaSousChefs, maintenanceGuys each have their own count)
  staffingCost: {
    sousChefBaseCost: 50,          // number ($) — base cost for 1st sous chef at any station
    maintenanceBaseCost: 50,       // number ($) — base cost for 1st maintenance guy
    // Escalation multipliers: [1.0, 1.5, 2.25, 3.0, +0.75x per additional]
    escalationCurve: [1.0, 1.5, 2.25, 3.0],
  },

  // Maintenance system parameters
  maintenance: {
    operationalHoursPerRound: 8,         // number — hours café is open each round
    restoreRatePerHour: 15,              // number (%) — each maintenance guy restores +15%/hr on their assigned task
    dirtinessDropPerCustomer: 3,         // number (%) — cleanliness drops 3% per customer who enters
    machineHealthDropPerOrder: 2,        // number (%) — machine health drops 2% per order from that station
    chefDepartureThreshold: 30,          // number (%) — specialty chef leaves if satisfaction ≤ this
    chefSatisfactionDecay: {
      novel: 8,                          // number — points lost per round for Novel skill chefs
      intermediate: 14,                  // number — points lost per round for Intermediate skill chefs
      advanced: 20,                      // number — points lost per round for Advanced skill chefs
    },
    machineHealthMultipliers: {
      optimal:   1.00,                   // health >= 71%
      worn:      0.85,                   // health 41–70% → −15% throughput
      degraded:  0.65,                   // health 11–40% → −35% throughput
      broken:    0.50,                   // health 0–10%  → −50% throughput
    },
  },

  // Revenue regression coefficients
  revenueModel: {
    base: 500,
    staffCoefficient: 30,
    priceCoefficient: -15,
    adSpendCoefficient: 0.8,
    numProductsCoefficient: 50,
    noiseMin: -100,
    noiseMax: 100,
  },

  // Ad auction bonus values ($/round added to revenue if player wins that ad slot)
  adBonuses: {
    TV: 200,
    Billboard: 150,
    Radio: 100,
    Newspaper: 75,
  },

  // Chef auction: skill level (0–100) won maps to a revenue bonus
  // bonus = chefSkill * chefBonusPerPoint
  chefBonusPerPoint: 2,           // number

  // Customer pool = customerPoolMultiplier × numPlayers
  customerPoolMultiplier: 100,

  // Attractiveness weights (used for proportional customer allocation)
  attractivenessWeights: {
    priceWeight: 100,             // (1 / avg_price) * priceWeight
    staffWeight: 5,               // staff_count * staffWeight
    adSpendWeight: 0.3,           // ad_spend * adSpendWeight
    numProductsWeight: 10,        // num_products * numProductsWeight
  },

  // Phase durations (seconds)
  phaseDurations: {
    email: 60,
    decide: 300,                  // 5 minutes
    bid: 120,                     // 2 minutes (2 × 60s auctions)
    simulate: 30,
    results: 60,
  },
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/players/{playerId}
// One document per player. Created on join.
// ─────────────────────────────────────────────────────────────
const PlayerDocument = {
  uid: "firebase_auth_uid",       // string — Firebase Auth UID (anonymous)
  displayName: "The Rolling Scone", // string — bakery name chosen on join
  joinedAt: null,                 // Timestamp

  // Live financial state
  budgetCurrent: 2000,            // number ($) — updated after each round
  creditBalance: 0,               // number ($) — amount currently financed through overdraft/credit
  cumulativeRevenue: 0,           // number ($) — sum of all round revenues (for leaderboard)

  // Maintenance state — persists between rounds, updated by simulation Cloud Function
  cleanliness_pct: 100,           // number (0–100) — store cleanliness; drops 3% per customer
  oven_health_pct: 100,           // number (0–100) — Bakery Station machine; drops 2% per Croissant/Cookie order
  slicer_health_pct: 100,         // number (0–100) — Deli machine; drops 2% per Bagel/Sandwich order
  espresso_health_pct: 100,       // number (0–100) — Barista Station machine; drops 2% per Coffee/Matcha order

  // Per-specialty-chef satisfaction scores (keyed by chefId, set on acquisition)
  // Decays each round by skill level; chef leaves voluntarily if score ≤ 30
  chefSatisfactionScores: {},     // Record<chefId: string, score: number (0–100)>

  // Current round's working draft (live editable state before submit)
  // On submit, backend snapshots this into /decisions/{roundId} as the immutable historical record
  pendingDecision: {
    submitted: false,             // boolean
    submittedAt: null,            // Timestamp | null

    // Station-based sous chef counts (replaces flat staffCount)
    staffCounts: {
      bakerySousChefs: 0,         // number — sous chefs assigned to Bakery Station (Croissant, Cookie)
      deliSousChefs: 0,           // number — sous chefs assigned to Deli (Bagel, Sandwich)
      baristaSousChefs: 0,        // number — sous chefs assigned to Barista Station (Coffee, Matcha)
      maintenanceGuys: 0,         // number — maintenance staff
    },

    // Task assignment per maintenance guy (array length must equal maintenanceGuys count)
    // Values: "clean" | "repair_oven" | "repair_slicer" | "repair_espresso"
    maintenanceTasks: [],         // string[]

    adSpend: 0,                   // number ($)

    // Active menu items (true = on menu this round)
    menu: {
      croissant: true,
      cookie: true,
      bagel: true,
      sandwich: false,
      coffee: false,
      matcha: false,
    },

    // Per-product quantity ordered (units)
    quantities: {
      croissant: 0,
      cookie: 0,
      bagel: 0,
      sandwich: 0,
      coffee: 0,
      matcha: 0,
    },
  },

  // Auction bids for current round (written client-side, validated server-side)
  pendingBids: {
    // Ad auction: player bids on one ad type
    adBid: {
      adType: "TV",               // "TV" | "Billboard" | "Radio" | "Newspaper" | null
      amount: 0,                  // number ($)
    },

    // Chef auction: player bids a skill level (0–100) + dollar amount
    chefBid: {
      skillLevel: 0,              // number (0–100) — desired skill tier
      amount: 0,                  // number ($)
    },
  },

  // Results from the most recently completed round (denormalized for fast display)
  lastRoundResult: {
    round: 0,
    revenue: 0,
    customerCount: 0,
    customerSatisfaction: 0,
    chefSatisfactionScore: 0,
    headchefSkill: 0,
    adTypeWon: null,
    // Chefs whose personal satisfaction dropped to ≤30% and left voluntarily this round
    chefDepartures: [],           // string[] — array of chef display names
    productsSold: {
      croissant: 0,
      cookie: 0,
      bagel: 0,
      sandwich: 0,
      coffee: 0,
      matcha: 0,
    },
  },
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/players/{playerId}/decisions/{roundId}
// Immutable historical snapshot of the player's submitted decision for a round.
// roundId = "round_1", "round_2", … "round_5"
// ─────────────────────────────────────────────────────────────
const DecisionDocument = {
  round: 1,                       // number
  submittedAt: null,              // Timestamp

  // Station-based sous chef counts
  staffCounts: {
    bakerySousChefs: 0,           // number
    deliSousChefs: 0,             // number
    baristaSousChefs: 0,          // number
    maintenanceGuys: 0,           // number
  },

  // Task assignment per maintenance guy
  maintenanceTasks: [],           // string[] — "clean" | "repair_oven" | "repair_slicer" | "repair_espresso"

  adSpend: 0,                     // number ($)

  menu: {
    croissant: true,
    cookie: true,
    bagel: true,
    sandwich: false,
    coffee: false,
    matcha: false,
  },

  quantities: {
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    coffee: 0,
    matcha: 0,
  },

  adBid: {
    adType: null,                 // string | null
    amount: 0,
  },

  chefBid: {
    skillLevel: 0,
    amount: 0,
  },

  // Derived server-side
  numProducts: 3,                 // number — count of active menu items
  staffingCost: 0,                // number ($) — sum of escalating costs for all staff roles
  creditCost: 0,                  // number ($) — loan shark interest if applicable
  totalCosts: 0,                  // number ($) — staffing + inventory + credit costs
  budgetBefore: 2000,             // number ($) — snapshot before deductions
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/players/{playerId}/rounds/{roundId}
// Simulation output written by Cloud Function after each round.
// roundId = "round_1", "round_2", … "round_5"
// ─────────────────────────────────────────────────────────────
const RoundResultDocument = {
  round: 1,                       // number

  // Revenue engine outputs
  revenue: 0,                     // number ($)
  customerCount: 0,               // number
  customerSatisfaction: 0,        // number (0–100)
  headchefSkill: 0,               // number (0–100) — skill of won chef (or 0)

  // Auction outcomes
  adTypeWon: null,                // "TV" | "Billboard" | "Radio" | "Newspaper" | null
  adBonus: 0,                     // number ($) — bonus revenue from ad win
  chefBonus: 0,                   // number ($) — bonus revenue from chef skill

  // Per-product units sold
  productsSold: {
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    coffee: 0,
    matcha: 0,
  },

  // Maintenance state at end of round (after decay + restoration applied)
  cleanliness_pct: 100,           // number (0–100)
  oven_health_pct: 100,           // number (0–100)
  slicer_health_pct: 100,         // number (0–100)
  espresso_health_pct: 100,       // number (0–100)

  // Chef satisfaction scores at end of round + departure events
  chefSatisfactionScore: 0,       // number (0–100) — kitchen-wide score (throughput multiplier)
  chefDepartures: [],             // string[] — names of specialty chefs who left this round

  // Inputs echoed back for CSV export / auditing
  avgPrice: 0,

  menu: {
    croissant: true,
    cookie: true,
    bagel: true,
    sandwich: false,
    coffee: false,
    matcha: false,
  },
  quantitySubmitted: {
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    coffee: 0,
    matcha: 0,
  },

  // Station-based staff counts echoed back
  staffCounts: {
    bakerySousChefs: 0,
    deliSousChefs: 0,
    baristaSousChefs: 0,
    maintenanceGuys: 0,
  },
  maintenanceTasks: [],           // string[]

  adSpend: 0,
  numProducts: 0,

  // Budget ledger
  revenueGross: 0,
  staffingCost: 0,
  creditCost: 0,
  creditBalanceBefore: 0,
  creditBalanceAfter: 0,
  totalCosts: 0,
  budgetBefore: 0,
  budgetAfter: 0,

  computedAt: null,               // Timestamp
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/rounds/{roundId}
// Aggregate round document written by Cloud Function.
// roundId = "round_1" … "round_5"
// Used by professor dashboard for class-wide analytics.
// ─────────────────────────────────────────────────────────────
const AggregateRoundDocument = {
  round: 1,                       // number

  // Auction winners (sealed-bid, first-price: highest bid wins, pays their bid)
  auctionResults: {
    ads: {
      TV: { winnerId: null, winningBid: 0 },
      Billboard: { winnerId: null, winningBid: 0 },
      Radio: { winnerId: null, winningBid: 0 },
      Newspaper: { winnerId: null, winningBid: 0 },
    },
    chef: {
      winnerId: null,
      winningBid: 0,
      skillLevel: 0,
    },
  },

  // Class-wide stats for professor view
  classStats: {
    avgRevenue: 0,
    maxRevenue: 0,
    minRevenue: 0,
    avgCustomerCount: 0,
    totalCustomerPool: 0,
  },

  completedAt: null,              // Timestamp
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/leaderboard/current
// Rewritten by Cloud Function at the end of each round.
// ─────────────────────────────────────────────────────────────
const LeaderboardDocument = {
  // Array sorted by cumulativeRevenue descending
  rankings: [
    {
      rank: 1,                    // number
      playerId: "uid_abc",        // string
      displayName: "The Rolling Scone", // string
      cumulativeRevenue: 0,       // number ($)
      lastRoundRevenue: 0,        // number ($)
      rankChange: 0,              // number — positive = moved up, negative = moved down
    },
  ],

  updatedAt: null,                // Timestamp
  round: 1,                       // number — which round this snapshot reflects
};

// ─────────────────────────────────────────────────────────────
// /games/{gameId}/csvRows/{playerId}/rounds/{roundId}
// Append-only array of row objects for CSV export.
// Matches the 17-column schema from the game design spec exactly.
// Written by Cloud Function after each simulation.
// ─────────────────────────────────────────────────────────────
const CsvRowsDocument = {
  playerId: "uid_abc",
  round: 1,                          // number — round number
  row: {
    day: 1,                          // number — round number
    revenue: 0,                      // number ($) — net revenue (after loan shark deduction if applicable)
    num_products: 3,                 // number
    avg_price: 5.0,                  // number ($)

    // Station-based sous chef counts (replaces flat staff_count)
    bakery_sous_chef_count: 0,       // number — Bakery Station (Croissant, Cookie)
    deli_sous_chef_count: 0,         // number — Deli (Bagel, Sandwich)
    barista_sous_chef_count: 0,      // number — Barista Station (Coffee, Matcha)
    maintenance_guy_count: 0,        // number — Maintenance staff

    ad_spend: 0,                     // number ($)
    customer_count: 0,               // number
    customer_satisfaction: 0,        // number (0–100)
    chef_satisfaction_score: 0,      // number (0–100) — kitchen-wide throughput multiplier score
    headchef_skill: 0,               // number (0–100)

    // Maintenance state (averages across the round)
    avg_cleanliness_pct: 0,          // number (0–100)
    avg_machine_health_pct: 0,       // number (0–100) — average of oven, slicer, espresso health

    // Units sold per product
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    coffee: 0,
    matcha: 0,

    ad_type: "none",                 // string — ad type won this round, or "none"
  },
};

// ─────────────────────────────────────────────────────────────
// COLLECTION HIERARCHY SUMMARY
// ─────────────────────────────────────────────────────────────
//
// /games/{gameId}                          ← GameDocument
// /games/{gameId}/config/params            ← GameConfigDocument
// /games/{gameId}/players/{playerId}       ← PlayerDocument
// /games/{gameId}/players/{playerId}/decisions/{roundId}  ← DecisionDocument
// /games/{gameId}/players/{playerId}/rounds/{roundId}     ← RoundResultDocument
// /games/{gameId}/rounds/{roundId}         ← AggregateRoundDocument
// /games/{gameId}/leaderboard/current      ← LeaderboardDocument
// /games/{gameId}/csvRows/{playerId}/rounds/{roundId}  ← CsvRowsDocument
//
// ─────────────────────────────────────────────────────────────
// FIRESTORE SECURITY RULES (reference)
// ─────────────────────────────────────────────────────────────
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//
//     // Players can read game state but not write it directly
//     match /games/{gameId} {
//       allow read: if request.auth != null;
//       allow write: if false; // Cloud Functions only
//     }
//
//     // Config is read-only for all authenticated users
//     match /games/{gameId}/config/{doc} {
//       allow read: if request.auth != null;
//       allow write: if false;
//     }
//
//     // Players can read their own player document, but backend owns financial/result fields
//     match /games/{gameId}/players/{playerId} {
//       allow read: if request.auth.uid == playerId;
//       allow write: if request.auth.uid == playerId
//         && request.resource.data.diff(resource.data).changedKeys().hasOnly(["displayName", "pendingDecision", "pendingBids"]);
//
//       match /decisions/{roundId} {
//         allow read: if request.auth.uid == playerId;
//         allow write: if request.auth.uid == playerId;
//       }
//
//       match /rounds/{roundId} {
//         allow read: if request.auth.uid == playerId;
//         allow write: if false; // Cloud Functions only
//       }
//     }
//
//     // Leaderboard and aggregate rounds are readable by all players
//     match /games/{gameId}/leaderboard/{leaderboardId} {
//       allow read: if request.auth != null;
//       allow write: if false;
//     }
//
//     match /games/{gameId}/rounds/{roundId} {
//       allow read: if request.auth != null;
//       allow write: if false;
//     }
//
//     // CSV rows readable only by the owning player (one doc per round)
//     match /games/{gameId}/csvRows/{playerId}/rounds/{roundId} {
//       allow read: if request.auth.uid == playerId;
//       allow write: if false;
//     }
//   }
// }
//
// ─────────────────────────────────────────────────────────────

module.exports = {
  GameDocument,
  GameConfigDocument,
  PlayerDocument,
  DecisionDocument,
  RoundResultDocument,
  AggregateRoundDocument,
  LeaderboardDocument,
  CsvRowsDocument,
};
