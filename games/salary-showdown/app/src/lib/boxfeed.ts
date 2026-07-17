export interface BoxRow {
  round: number; game_id: string; team: string; opponent: string;
  team_score: number; opp_score: number; win: number;
  player_id: number; player_name: string; position: string; tier: string;
  mins: number; pts: number; fgm: number; fga: number; three_pm: number; three_pa: number;
  rebounds: number; assists: number; steals: number; blocks: number; turnovers: number;
  playstyle: string;
}
const NUMERIC = new Set(['round', 'team_score', 'opp_score', 'win', 'player_id', 'mins',
  'pts', 'fgm', 'fga', 'three_pm', 'three_pa', 'rebounds', 'assists', 'steals',
  'blocks', 'turnovers']);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseBoxCsv(csv: string): BoxRow[] {
  const lines = csv.split('\n').filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const row: Record<string, string | number> = {};
    header.forEach((h, i) => { row[h] = NUMERIC.has(h) ? Number(vals[i]) : vals[i]; });
    return row as unknown as BoxRow;
  });
}

// League-wide live form per player_id, ALL rostered copies pooled (the feed is
// public like real NBA stats; free agency is non-exclusive, so one pid may have
// lines on several teams — the season average pools them, one number per player).
export function seasonForm(rows: BoxRow[]) {
  const acc = new Map<number, { gp: number; pts: number; fgm: number; fga: number }>();
  for (const r of rows) {
    const a = acc.get(r.player_id) ?? { gp: 0, pts: 0, fgm: 0, fga: 0 };
    a.gp += 1; a.pts += r.pts; a.fgm += r.fgm; a.fga += r.fga;
    acc.set(r.player_id, a);
  }
  const out = new Map<number, { gp: number; ppg: number; fgPct: number }>();
  for (const [pid, a] of acc) {
    out.set(pid, { gp: a.gp, ppg: a.pts / a.gp, fgPct: a.fga > 0 ? a.fgm / a.fga : 0 });
  }
  return out;
}

export const teamRows = (rows: BoxRow[], teamName: string) =>
  rows.filter((r) => r.team === teamName);
