import type { GameResult, StandingsRow } from '../types/models';

// Live standings for the Simulate wall (playtest-2 item 4): rounds/{r} is
// server-final before the wall mounts (§3a gate), so this is pure client
// playback — reconstruct the ROUND-START base by subtracting every game's
// contribution from the stored final rows, then re-apply games one at a time
// in flood order. Facts only: rank, record, movement.
export interface LiveRow {
  teamId: string; name: string; wins: number; losses: number;
  pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
  delta: number | null;   // baseRank - rank (positive = climbed since round start); null in round 1
  movedNow: boolean;      // rank changed when the latest applied game landed
}

// Rank chain copied from backend sim.js (sim.js:160-161) — wins desc, pointDiff
// desc, pointsFor desc, then tiebreakCoin ASCENDING (the seeded per-round coin).
// Matching it exactly makes the fully-applied table agree with the stored
// standings the RESULTS shuffle later replays (unit-pinned below, and
// property-pinned against a real round doc in bigscreen.itest).
type Tally = Omit<LiveRow, 'rank' | 'delta' | 'movedNow'>;
const byRank = (a: Tally, b: Tally) =>
  b.wins - a.wins || b.pointDiff - a.pointDiff
  || b.pointsFor - a.pointsFor || a.tiebreakCoin - b.tiebreakCoin;

function rankOf(rows: Tally[]): Map<string, number> {
  return new Map([...rows].sort(byRank).map((r, i) => [r.teamId, i + 1]));
}

function apply(rows: Map<string, Tally>, g: GameResult, sign: 1 | -1): void {
  const home = rows.get(g.home); const away = rows.get(g.away);
  if (!home || !away) return; // defensive: unknown teamId contributes nothing
  const homeWon = g.homeScore > g.awayScore;
  home.wins += sign * (homeWon ? 1 : 0);
  home.losses += sign * (homeWon ? 0 : 1);
  home.pointDiff += sign * (g.homeScore - g.awayScore);
  home.pointsFor += sign * g.homeScore;
  away.wins += sign * (homeWon ? 0 : 1);
  away.losses += sign * (homeWon ? 1 : 0);
  away.pointDiff += sign * (g.awayScore - g.homeScore);
  away.pointsFor += sign * g.awayScore;
}

export function liveStandings(
  final: StandingsRow[], games: GameResult[], applied: number, round: number,
): LiveRow[] {
  const tally = new Map<string, Tally>(final.map((r) => [r.teamId, {
    teamId: r.teamId, name: r.name, wins: r.wins, losses: r.losses,
    pointDiff: r.pointDiff, pointsFor: r.pointsFor, tiebreakCoin: r.tiebreakCoin,
  }]));
  for (const g of games) apply(tally, g, -1);          // final -> round-start base
  const baseRank = rankOf([...tally.values()]);
  const n = Math.max(0, Math.min(applied, games.length));
  // Math.max(0, n - 1) guards n=0: games.slice(0, -1) is NOT an empty slice
  // (negative end means "all but the last element"), so an unclamped n - 1
  // would wrongly replay game[0] into the base tally below.
  for (const g of games.slice(0, Math.max(0, n - 1))) apply(tally, g, 1);
  const prevRank = rankOf([...tally.values()]);        // state before the latest game
  if (n > 0) apply(tally, games[n - 1], 1);
  const rows = [...tally.values()].sort(byRank);
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    delta: round === 1 ? null : (baseRank.get(r.teamId) ?? i + 1) - (i + 1),
    movedNow: n > 0 && (prevRank.get(r.teamId) ?? i + 1) !== i + 1,
  }));
}
