export type Phase = 'LOBBY' | 'FRONT_OFFICE' | 'FREE_AGENCY' | 'AUCTION' | 'LINEUP'
  | 'SIMULATE' | 'RESULTS' | 'FINALE';
export type Role = 'GM' | 'Scout' | 'Coach';
export type Position = 'G' | 'W' | 'B';

export interface Contract {
  pid: number; rate: number; startRound: number; years: number;
  viaAuction: boolean; hardship: boolean;
}
export interface DeadMoney { pid: number; rate: number; startRound: number; endRound: number }
export interface Lineup { starters: number[]; sixth: number; bench: number[]; playstyle: string }

export interface TeamDoc {
  name: string; wins: number; losses: number; pointDiff: number; pointsFor: number;
  roster: Contract[]; deadMoney: DeadMoney[]; spendLog: Contract[];
  lineup: Lineup | null; lineupLockedRound: number; hardshipUsed: number[];
}
export interface GameDoc {
  joinCode: string; status: 'lobby' | 'active' | 'finished'; phase: Phase; round: number;
  timerEndsAt: { toMillis(): number } | null; teamCount: number;
  config: { cap: number; totalRounds: number }; professorUid: string;
}
// The 26 players.csv columns arrive as strings (catalog docs mirror the CSV); pid is a number.
export interface CatalogPlayer {
  pid: number; player_id: string; name: string; position: Position; age: string;
  years_pro: string; hype: string; salary_per_round: string; auction_round: string;
  personality: string; scout_grade: string; social_media_followers: string;
  games_played: string; mins_per_game: string; pts_per_game: string;
  fg_attempts_per_game: string; fg_pct: string; three_pt_pct: string; ft_pct: string;
  rebounds_per_game: string; assists_per_game: string; steals_per_game: string;
  blocks_per_game: string; turnovers_per_game: string;
  prev_pts_per_game: string; prev_fg_pct: string; prev_mins_per_game: string;
}
export interface MarketDoc {
  available: number[]; absentCounts: Record<string, number>;
  unsoldPrices: Record<string, number>;
}
export interface AuctionDoc {
  stars: number[];
  results?: { pid: number; teamId: string | null; rate: number | null;
    years: number | null; guaranteed: number | null }[];
}
export interface GameResult {
  game_id: string; home: string; away: string; homeScore: number; awayScore: number;
}
export interface Awards {
  roundMvp: { pid: number; teamId: string; line: string };
  topScorer: { pid: number; teamId: string; pts: number };
  // bargain.perDollar exists on the wire but is NEVER rendered (spec §11: the award
  // shows the raw stat line + salary, not a computed stats-per-dollar figure).
  bargain: { pid: number; teamId: string; perDollar: number } | null;
}
export interface StandingsRow {
  teamId: string; name: string; wins: number; losses: number;
  pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
}
export interface RoundDoc {
  games: GameResult[]; awards: Awards; boxCsv: string; standings: StandingsRow[];
}

// Verbatim strings — spec §4.4. Never abbreviate, never re-word.
export const PLAYSTYLES = ['Balanced', 'Run & Gun', '3PT Barrage', 'Inside Attack', 'Lockdown'] as const;
export type Playstyle = (typeof PLAYSTYLES)[number];
export const PLAYSTYLE_BLURBS: Record<Playstyle, string> = {
  Balanced: 'Play your normal game.',
  'Run & Gun': 'Play fast. More shots.',
  '3PT Barrage': 'Shoot more threes.',
  'Inside Attack': 'Feed your Big.',
  Lockdown: 'Slow it down. Defend.',
};
