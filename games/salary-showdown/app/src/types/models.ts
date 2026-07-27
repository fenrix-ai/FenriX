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
  // markDone status flag (backend T2; init 0/'' in createGame). A status light,
  // NEVER a lock — signing/cutting stays open until the phase closes. Staleness
  // is implicit in the (doneRound, donePhase) pair; nothing ever clears it.
  doneRound: number; donePhase: string;
}
// Present on the game doc only while an advancePhase's hooks are resolving: the
// flip-first transaction writes it alongside the new round/phase, and the same
// call deletes it once both hooks land (backend SCHEMA.md). While it is present,
// the destination phase's data (auctions/{r}, market/{r}, rounds/{r}) may not
// exist yet — GameContext therefore keeps presenting fromRound/fromPhase until
// the marker clears.
export interface TransitionMarker {
  fromRound: number; fromPhase: Phase; toRound: number; toPhase: Phase;
}
export interface GameDoc {
  joinCode: string; status: 'lobby' | 'active' | 'finished'; phase: Phase; round: number;
  timerEndsAt: { toMillis(): number } | null; teamCount: number;
  // Timer state trio (backend setTimer, T1): running = endsAt set + pausedMs null ·
  // paused = endsAt null + pausedMs set · off = both null. Timers are advisory
  // pacing only (parent spec §13): expiry never blocks a submission server-side.
  timerPausedMs: number | null;
  // Written ONLY by the professor's setRevealStep callable — the FINALE flip does
  // NOT initialize it (spec §4.3), so it is absent on every game until the first
  // step. Readers default with `revealStep ?? 0` (podium).
  revealStep?: number;
  config: { cap: number; totalRounds: number }; professorUid: string;
  transition?: TransitionMarker;
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
// teams/{teamId}/private/auction — written by submitBids (bids, round) and, since
// playtest-polish T1, merged by auction resolution with would-have-won skip
// feedback (team-private; rendered only on the own team's Results screen).
export interface PrivateAuctionDoc {
  bids?: Record<string, { rate: number; years: number }>;
  round?: number;
  skippedRound?: number;
  skipped?: { pid: number; reason: 'cap' | 'roster' }[];
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
  // Last round's rank for this team, stamped by enter:SIMULATE (T4); null in
  // round 1 (and on the wire only for rounds simulated after T4 ships).
  previousRank: number | null;
}
export interface RoundDoc {
  games: GameResult[]; awards: Awards; boxCsv: string; standings: StandingsRow[];
}

// A claimed seat: one games/{id}/players/{uid} membership doc (professor panel +
// bigscreen lobby wall read the whole collection; team clients only read their own).
export interface PlayerSeat { teamId: string; role: Role; displayName: string }

// games/{id}/reveal/latest — written ONLY by the enter:FINALE hook. THE FINALE IS
// THE SANCTIONED REVEAL (parent spec §11.14): value-per-dollar, wins-per-dollar,
// trap labels and weights live here on purpose. In-game team screens still never
// render perDollar-style numbers.
export interface RevealDoc {
  scatter: { pid: number; name: string; hype: number; salary: number | null;
    ti: number; isTrap: boolean; archetype: string }[];
  // bestSigning/worstSigning stay nullable — verified against the actual
  // enter:FINALE writer (game.js: `bestSigning: vals[0] ?? null` over
  // `team.spendLog ?? []`): a team that never signed anyone gets null.
  perTeam: { teamId: string;
    bestSigning: { pid: number; valuePerDollar: number } | null;
    worstSigning: { pid: number; valuePerDollar: number } | null }[];
  winsPerDollar: { teamId: string; wins: number; totalSpend: number; ratio: number }[];
  trueWeights: { narrative: string; defenseVisible: boolean; turnoverWeight: number;
    engine: { base: number; scoring: number; playmaking: number; steal: number;
      block: number; rebound: number; turnover: number };
    regression: { winsR2: number; turnoverCoef: number; turnoverP: string;
      payrollT: number; hypeT: number } };
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
