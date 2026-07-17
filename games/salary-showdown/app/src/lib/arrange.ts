import type { CatalogPlayer, Lineup } from '../types/models';

export function arrangeLineup(
  active: number[], catalog: Map<number, CatalogPlayer>, prev: Lineup | null,
): Lineup {
  const byMins = [...active].sort(
    (a, b) => Number(catalog.get(b)!.mins_per_game) - Number(catalog.get(a)!.mins_per_game));
  const keep = (pid: number | null | undefined): pid is number =>
    pid != null && active.includes(pid);
  const need: Record<string, number> = { G: 2, W: 2, B: 1 };
  const starters: number[] = [];
  for (const pid of prev?.starters ?? []) {
    if (!keep(pid)) continue;
    const pos = catalog.get(pid)!.position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  for (const pid of byMins) {
    if (starters.includes(pid)) continue;
    const pos = catalog.get(pid)!.position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = byMins.filter((p) => !starters.includes(p));
  const sixth = keep(prev?.sixth) && !starters.includes(prev!.sixth)
    ? prev!.sixth : rest[0];
  const bench = rest.filter((p) => p !== sixth);
  return { starters, sixth, bench, playstyle: prev?.playstyle ?? 'Balanced' };
}
