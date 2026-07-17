import { fromLineup, isComplete, place, toLineup, type Slots } from './slots';
import type { CatalogPlayer } from '../types/models';

const mk = (pid: number, position: string) =>
  [pid, { pid, position } as unknown as CatalogPlayer] as const;
const catalog = new Map([
  mk(1, 'G'), mk(2, 'G'), mk(3, 'G'), mk(4, 'W'), mk(5, 'W'),
  mk(6, 'W'), mk(7, 'B'), mk(8, 'B'), mk(9, 'G'),
]);
const base: Slots = { g1: 1, g2: 2, w1: 4, w2: 5, b1: 7, sixth: 8,
  bench1: 3, bench2: 6, depth: [9] };

test('toLineup: bench order encodes active-bench-then-depth', () => {
  const l = toLineup(base, 'Lockdown');
  expect(l.starters).toEqual([1, 2, 4, 5, 7]);
  expect(l.bench).toEqual([3, 6, 9]); // 3 & 6 play; 9 is inactive depth
  expect(l.playstyle).toBe('Lockdown');
});
test('place: position-illegal court drop is rejected', () => {
  expect(place(base, 4, 'g1', catalog)).toBeNull(); // Wing into a Guard slot
});
test('place: legal swap moves the displaced player back', () => {
  const next = place(base, 3, 'g1', catalog)!; // bench guard into g1
  expect(next.g1).toBe(3);
  expect(next.bench1).toBe(1); // displaced starter takes the vacated bench slot
});
test('place: depth promotion and demotion', () => {
  const up = place(base, 9, 'bench1', catalog)!;
  expect(up.bench1).toBe(9);
  expect(up.depth).toEqual([3]); // displaced bench1 lands in depth
  expect(isComplete(up)).toBe(true);
});
test('fromLineup round-trips a server lineup', () => {
  const s = fromLineup({ starters: [1, 2, 4, 5, 7], sixth: 8, bench: [3, 6, 9],
    playstyle: 'Balanced' }, catalog);
  expect(s).toEqual(base);
});
