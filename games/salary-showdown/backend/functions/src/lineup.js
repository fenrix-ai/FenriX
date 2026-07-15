export const PLAYSTYLES = ['Balanced', 'Run & Gun', '3PT Barrage', 'Inside Attack', 'Lockdown'];
const TEMPLATE = { G: 2, W: 2, B: 1 };

export function validateLineup({ lineup, activePids, catalogById }) {
  const { starters, sixth, bench, playstyle } = lineup;
  if (!PLAYSTYLES.includes(playstyle)) throw new Error('BAD_PLAYSTYLE');
  const all = [...starters, sixth, ...bench].filter((p) => p != null);
  if (new Set(all).size !== all.length) throw new Error('DUPLICATE_PLAYER');
  for (const pid of all) if (!activePids.includes(pid)) throw new Error('NOT_ON_ROSTER');
  if (all.length !== activePids.length) throw new Error('NOT_ON_ROSTER'); // everyone assigned
  if (starters.length !== 5 || sixth == null) throw new Error('BAD_TEMPLATE');
  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of starters) counts[catalogById[pid].position] += 1;
  if (counts.G !== TEMPLATE.G || counts.W !== TEMPLATE.W || counts.B !== TEMPLATE.B)
    throw new Error('BAD_TEMPLATE');
}

export function autoRepair({ prevLineup, activePids, catalogById }) {
  const byMins = [...activePids].sort(
    (a, b) => +catalogById[b].mins_per_game - +catalogById[a].mins_per_game);
  const keep = (pid) => pid != null && activePids.includes(pid);
  const need = { ...TEMPLATE };
  const starters = [];
  for (const pid of prevLineup?.starters ?? []) {
    if (!keep(pid)) continue;
    const pos = catalogById[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  for (const pid of byMins) {
    if (starters.includes(pid)) continue;
    const pos = catalogById[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = byMins.filter((p) => !starters.includes(p));
  let sixth = keep(prevLineup?.sixth) && !starters.includes(prevLineup.sixth)
    ? prevLineup.sixth : rest[0];
  const bench = rest.filter((p) => p !== sixth);
  return { starters, sixth, bench, playstyle: prevLineup?.playstyle ?? 'Balanced' };
}
