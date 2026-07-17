import { arrangeLineup } from './arrange';
import type { CatalogPlayer } from '../types/models';

const mk = (pid: number, position: string, mins: string) =>
  [pid, { pid, position, mins_per_game: mins } as unknown as CatalogPlayer] as const;
const catalog = new Map([
  mk(1, 'G', '30'), mk(2, 'G', '28'), mk(3, 'G', '20'), mk(4, 'W', '32'),
  mk(5, 'W', '26'), mk(6, 'W', '18'), mk(7, 'B', '31'), mk(8, 'B', '22'),
]);
const active = [1, 2, 3, 4, 5, 6, 7, 8];

test('fresh arrangement: 2G/2W/1B by minutes, then sixth, then bench', () => {
  const l = arrangeLineup(active, catalog, null);
  expect(l.starters.sort()).toEqual([1, 2, 4, 5, 7]);
  expect(l.sixth).toBe(8); // highest-minutes non-starter (31→7 started; 22 next among rest order)
  expect(l.bench.sort()).toEqual([3, 6]);
  expect(l.playstyle).toBe('Balanced');
});
test('keeps legal previous starters and carries playstyle', () => {
  const prev = { starters: [3, 2, 6, 5, 8], sixth: 1, bench: [4, 7], playstyle: 'Lockdown' };
  const l = arrangeLineup(active, catalog, prev);
  expect(l.starters).toEqual([3, 2, 6, 5, 8]); // all still legal → kept verbatim
  expect(l.sixth).toBe(1);
  expect(l.playstyle).toBe('Lockdown');
});
test('drops a departed starter and backfills by minutes', () => {
  const prev = { starters: [1, 2, 4, 5, 7], sixth: 8, bench: [3, 6], playstyle: 'Balanced' };
  const nowActive = [2, 3, 4, 5, 6, 7, 8]; // pid 1 cut
  const l = arrangeLineup(nowActive, catalog, prev);
  expect(l.starters).toContain(3); // next guard by minutes fills the hole
  expect(l.starters).not.toContain(1);
});
