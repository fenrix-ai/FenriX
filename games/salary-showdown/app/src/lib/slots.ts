import type { CatalogPlayer, Lineup } from '../types/models';

export type SlotId = 'g1' | 'g2' | 'w1' | 'w2' | 'b1' | 'sixth' | 'bench1' | 'bench2' | 'depth';
export interface Slots {
  g1: number | null; g2: number | null; w1: number | null; w2: number | null;
  b1: number | null; sixth: number | null; bench1: number | null; bench2: number | null;
  depth: number[];
}
const COURT: Record<string, 'G' | 'W' | 'B'> = { g1: 'G', g2: 'G', w1: 'W', w2: 'W', b1: 'B' };

export function fromLineup(l: Lineup, catalog: Map<number, CatalogPlayer>): Slots {
  const s: Slots = { g1: null, g2: null, w1: null, w2: null, b1: null,
    sixth: l.sixth ?? null, bench1: l.bench[0] ?? null, bench2: l.bench[1] ?? null,
    depth: l.bench.slice(2) };
  for (const pid of l.starters) {
    const pos = catalog.get(pid)!.position;
    if (pos === 'G') { if (s.g1 == null) s.g1 = pid; else s.g2 = pid; }
    else if (pos === 'W') { if (s.w1 == null) s.w1 = pid; else s.w2 = pid; }
    else s.b1 = pid;
  }
  return s;
}

// Submit shape: bench = [active1, active2, ...inactive depth] — ORDER IS THE RULE:
// only bench[0..1] play (engine/sim slice(0,2)); depth players get no minutes.
export function toLineup(s: Slots, playstyle: string): Lineup {
  return {
    starters: [s.g1!, s.g2!, s.w1!, s.w2!, s.b1!],
    sixth: s.sixth!,
    bench: [s.bench1, s.bench2, ...s.depth].filter((p): p is number => p != null),
    playstyle,
  };
}

export const isComplete = (s: Slots) =>
  [s.g1, s.g2, s.w1, s.w2, s.b1, s.sixth].every((p) => p != null);

function findSlot(s: Slots, pid: number): SlotId | null {
  for (const k of ['g1', 'g2', 'w1', 'w2', 'b1', 'sixth', 'bench1', 'bench2'] as const) {
    if (s[k] === pid) return k;
  }
  return s.depth.includes(pid) ? 'depth' : null;
}

// Move pid into target; the displaced occupant (if any) swaps back to pid's old
// slot. Position-illegal court drops return null (UI ignores the drop).
export function place(
  s: Slots, pid: number, target: SlotId, catalog: Map<number, CatalogPlayer>,
): Slots | null {
  if (target in COURT && catalog.get(pid)!.position !== COURT[target]) return null;
  const from = findSlot(s, pid);
  if (from === target) return s;
  const next: Slots = { ...s, depth: [...s.depth] };
  const displaced = target === 'depth' ? null : next[target];
  if (displaced != null && from != null && from in COURT
      && catalog.get(displaced)!.position !== COURT[from]) return null; // swap-back must be legal too
  // remove pid from its old home
  if (from === 'depth') next.depth = next.depth.filter((p) => p !== pid);
  else if (from != null) next[from] = null;
  // place pid
  if (target === 'depth') next.depth.push(pid);
  else next[target] = pid;
  // rehome the displaced occupant
  if (displaced != null) {
    if (from == null || from === 'depth') next.depth.push(displaced);
    else next[from] = displaced;
  }
  return next;
}
