import { computeShuffleSteps } from './shuffle';
import type { StandingsRow } from '../types/models';

// Real-shaped rows. sim.js stores standings already sorted by rank 1..N, but the
// function must not depend on input order — tests deliberately scramble it.
const row = (teamId: string, rank: number, previousRank: number | null,
  wins = 0, losses = 0): StandingsRow => ({
  teamId, name: `Team ${teamId}`, wins, losses,
  pointDiff: 0, pointsFor: 0, tiebreakCoin: 0.5, rank, previousRank,
});

test('reveal order: rank N first, rank 1 last, regardless of input order', () => {
  const steps = computeShuffleSteps(
    [row('b', 2, 1), row('d', 4, 3), row('a', 1, 2), row('c', 3, 4)]);
  expect(steps.map((s) => s.rank)).toEqual([4, 3, 2, 1]);
  expect(steps.map((s) => s.teamId)).toEqual(['d', 'c', 'b', 'a']);
});

test('delta = previousRank - rank: positive climbs, negative falls, zero holds', () => {
  const steps = computeShuffleSteps([
    row('a', 1, 3), // was 3rd, now 1st: climbed 2
    row('b', 2, 1), // was 1st, now 2nd: fell 1
    row('c', 3, 2), // was 2nd, now 3rd: fell 1
    row('d', 4, 4), // held
  ]);
  const byTeam = Object.fromEntries(steps.map((s) => [s.teamId, s]));
  expect(byTeam.a.delta).toBe(2);
  expect(byTeam.b.delta).toBe(-1);
  expect(byTeam.c.delta).toBe(-1);
  expect(byTeam.d.delta).toBe(0);
});

test('round 1: previousRank null -> previousRank and delta both null (NEW)', () => {
  const steps = computeShuffleSteps(
    ['a', 'b', 'c', 'd'].map((t, i) => row(t, i + 1, null)));
  for (const s of steps) {
    expect(s.previousRank).toBeNull();
    expect(s.delta).toBeNull();
  }
  // A round doc simulated before backend T4 shipped lacks the key entirely —
  // treated exactly like null.
  const legacy = { ...row('x', 1, null) } as Record<string, unknown>;
  delete legacy.previousRank;
  const [s] = computeShuffleSteps([legacy as unknown as StandingsRow]);
  expect(s.previousRank).toBeNull();
  expect(s.delta).toBeNull();
});

test('shroud is true for ranks 1-3 only — the last three reveal steps', () => {
  const steps = computeShuffleSteps(
    ['a', 'b', 'c', 'd'].map((t, i) => row(t, i + 1, i + 1)));
  expect(steps.map((s) => s.shroud)).toEqual([false, true, true, true]);
});

test('21-team shape: 21 steps, bottom-up, exactly three shrouded, fields carried', () => {
  const input: StandingsRow[] = [];
  for (let r = 1; r <= 21; r += 1) input.push(row(`t${r}`, r, 22 - r, 21 - r, r - 1));
  input.reverse(); // scramble: input order must not matter
  const steps = computeShuffleSteps(input);
  expect(steps).toHaveLength(21);
  expect(steps[0].rank).toBe(21);
  expect(steps[20].rank).toBe(1);
  expect(steps.filter((s) => s.shroud).map((s) => s.rank)).toEqual([3, 2, 1]);
  const t5 = steps.find((s) => s.teamId === 't5')!;
  expect(t5.delta).toBe(12); // previousRank 17 - rank 5
  expect(t5.previousRank).toBe(17);
  expect(t5.wins).toBe(16);
  expect(t5.losses).toBe(4);
  expect(t5.name).toBe('Team t5');
});
