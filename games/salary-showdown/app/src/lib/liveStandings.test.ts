import { liveStandings } from './liveStandings';
import type { GameResult, StandingsRow } from '../types/models';

// Hand-built round: 3 teams, 2 games this round.
//   base (start of round): A 2-0 (+10, 100pf) · B 1-1 (+2, 90pf) · C 0-2 (-12, 80pf)
//   g1: B beats A 60-50  → A 2-1 (0, 150pf) · B 2-1 (+12, 150pf)
//   g2: C beats A 55-40  → A 2-2 (-15, 190pf) · C 1-2 (+3, 135pf)
// final: B 2-1 (+12) rank 1 · A 2-2 (-15) rank 2 · C 1-2 (+3) rank 3
//   (A over C on wins; B over A on pointDiff)
const FINAL: StandingsRow[] = [
  { teamId: 'B', name: 'Beta', wins: 2, losses: 1, pointDiff: 12, pointsFor: 150,
    tiebreakCoin: 0.2, rank: 1, previousRank: 2 },
  { teamId: 'A', name: 'Alpha', wins: 2, losses: 2, pointDiff: -15, pointsFor: 190,
    tiebreakCoin: 0.5, rank: 2, previousRank: 1 },
  { teamId: 'C', name: 'Gamma', wins: 1, losses: 2, pointDiff: 3, pointsFor: 135,
    tiebreakCoin: 0.9, rank: 3, previousRank: 3 },
];
const GAMES: GameResult[] = [
  { game_id: 'g1', home: 'B', away: 'A', homeScore: 60, awayScore: 50 },
  { game_id: 'g2', home: 'C', away: 'A', homeScore: 55, awayScore: 40 },
];

test('applied=0 reconstructs the round-start base by subtracting every game', () => {
  const rows = liveStandings(FINAL, GAMES, 0, 3);
  const a = rows.find((r) => r.teamId === 'A')!;
  expect([a.wins, a.losses, a.pointDiff, a.pointsFor]).toEqual([2, 0, 10, 100]);
  expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']); // base ranks
  expect(rows.every((r) => r.delta === 0)).toBe(true);        // nothing moved yet
});

test('mid-flood: one applied game re-ranks live', () => {
  const rows = liveStandings(FINAL, GAMES, 1, 3);
  // after g1: A 2-1 (0) · B 2-1 (+12) · C 0-2 (-12) → B, A, C
  expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
  const b = rows.find((r) => r.teamId === 'B')!;
  expect(b.delta).toBe(1);        // climbed from base rank 2 to 1
  expect(b.movedNow).toBe(true);  // moved on THIS game
});

test('fully applied matches the stored final ranks exactly (comparator parity)', () => {
  const rows = liveStandings(FINAL, GAMES, GAMES.length, 3);
  for (const r of rows) {
    expect(r.rank).toBe(FINAL.find((f) => f.teamId === r.teamId)!.rank);
  }
  expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
});

test('round 1 has no meaningful base rank — delta is null', () => {
  const rows = liveStandings(FINAL, GAMES, 1, 1);
  expect(rows.every((r) => r.delta === null)).toBe(true);
});

test('ties fall through the full chain to tiebreakCoin ascending', () => {
  // Two teams identical on wins/pointDiff/pointsFor — coin decides, ASC.
  // Fixture is declared Y-then-X, the reverse of the expected X-then-Y
  // output: a stable sort leaves an unordered/no-op comparator's input
  // order intact, so only a comparator that actually applies the ascending
  // coin tiebreak can produce the expectation below.
  const final: StandingsRow[] = [
    { teamId: 'Y', name: 'Y', wins: 1, losses: 1, pointDiff: 0, pointsFor: 100,
      tiebreakCoin: 0.7, rank: 2, previousRank: null },
    { teamId: 'X', name: 'X', wins: 1, losses: 1, pointDiff: 0, pointsFor: 100,
      tiebreakCoin: 0.1, rank: 1, previousRank: null },
  ];
  const rows = liveStandings(final, [], 0, 2);
  expect(rows.map((r) => r.teamId)).toEqual(['X', 'Y']);
});
