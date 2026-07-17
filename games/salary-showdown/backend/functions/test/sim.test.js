import { describe, it, expect } from 'vitest';
import { simulateRound, toCsv } from '../src/sim.js';
import { autoRepair } from '../src/lineup.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const fa = players.filter((p) => !p.auction_round);
function mkTeam(id, offset) {
  const g = fa.filter((p) => p.position === 'G').slice(offset, offset + 3);
  const w = fa.filter((p) => p.position === 'W').slice(offset, offset + 3);
  const b = fa.filter((p) => p.position === 'B').slice(offset, offset + 2);
  const roster = [...g, ...w, ...b].map((p) => ({ pid: p.pid, rate: 5, startRound: 1, years: 5 }));
  const lineup = autoRepair({ prevLineup: null, activePids: roster.map((c) => c.pid), catalogById: byId });
  return { teamId: id, name: id, lineup, roster, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0 };
}
const teams = [mkTeam('t1', 0), mkTeam('t2', 3), mkTeam('t3', 6), mkTeam('t4', 9)];

describe('simulateRound', () => {
  const out = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
  it('plays a full round robin with consistent scores', () => {
    expect(out.games).toHaveLength(6);          // C(4,2)
    for (const g of out.games) {
      expect(g.homeScore).not.toBe(g.awayScore);
      const rows = out.boxRows.filter((r) => r.game_id === g.game_id && r.team === g.home);
      const pts = rows.reduce((s, r) => s + r.pts, 0);
      expect(pts).toBe(g.homeScore);            // box sums to score
      for (const r of rows) {
        expect(r.pts).toBeGreaterThanOrEqual(2 * (r.fgm - r.three_pm) + 3 * r.three_pm);
        expect(r.fgm).toBeLessThanOrEqual(r.fga);
        expect(r.three_pm).toBeLessThanOrEqual(r.three_pa);
      }
    }
  });
  it('is deterministic', () => {
    const again = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
    expect(again.games).toEqual(out.games);
  });
  it('produces standings with total wins = total games', () => {
    const wins = out.standings.reduce((s, t) => s + t.wins, 0);
    expect(wins).toBe(6);
    expect(out.standings[0].rank).toBe(1);
  });
  it('keeps the seeded tiebreakCoin value on each stored standings row (audit trail, not stripped)', () => {
    for (const row of out.standings) expect(typeof row.tiebreakCoin).toBe('number');
    // deterministic: re-running with the same seed reproduces the same coin values
    const again = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
    expect(again.standings.map((r) => r.tiebreakCoin)).toEqual(out.standings.map((r) => r.tiebreakCoin));
  });
  it('emits the 23-column feed and awards', () => {
    const csv = toCsv(out.boxRows);
    expect(csv.split('\n')[0].split(',')).toHaveLength(23);
    expect(csv.split('\n')[0]).toContain('playstyle');
    expect(out.awards.roundMvp.pid).toBeTruthy();
    expect(out.awards.bargain.perDollar).toBeGreaterThan(0);
  });
  it('every team-game box sums to exactly 240 minutes', () => {
    for (const g of out.games) {
      for (const side of [g.home, g.away]) {
        const mins = out.boxRows
          .filter((r) => r.game_id === g.game_id && r.team === side)
          .reduce((s, r) => s + r.mins, 0);
        expect(mins).toBe(240);
      }
    }
  });
});

// minimal RFC4180 field parser (quotes, doubled quotes, commas inside quotes)
function parseCsvLine(line) {
  const fields = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

describe('toCsv escaping', () => {
  it('escapes commas and quotes RFC4180-style and round-trips', () => {
    const out = simulateRound({ gameId: 'g', round: 1, teams, catalogById: byId });
    const row = { ...out.boxRows[0], team: 'Smith, "Jones" & Co.' }; // professor-supplied team names are free text
    const csv = toCsv([row]);
    const [header, line] = csv.split('\n');
    expect(header.split(',')).toHaveLength(23);
    expect(line).toContain('"Smith, ""Jones"" & Co."'); // quoted, internal quotes doubled
    const fields = parseCsvLine(line);
    expect(fields).toHaveLength(23);                    // comma inside the name didn't split the row
    expect(fields[2]).toBe('Smith, "Jones" & Co.');     // team is FEED_COLS[2]; exact round-trip
  });
});

// Free agency is non-exclusive (spec §4.2/§7.2): two teams may roster independent
// copies of the same pid, and round awards are computed over rostered copies — each
// copy's bargain math must see only its own team's rows. Construct two teams whose
// G and W slices overlap by one pid each (offsets 0 and 2), at different contract
// rates, so naive player_id-keyed aggregation (pooling both copies' rows into one
// sum) is detectably different from the correct per-copy aggregation.
describe('bargain award is per rostered copy (non-exclusive FA)', () => {
  const gs = (r) => r.pts + 1.2 * r.rebounds + 1.5 * r.assists + 3 * r.steals
                  + 3 * r.blocks - 2.5 * r.turnovers;
  function mkTeamRated(id, offset, rate, overrides = {}) {
    const g = fa.filter((p) => p.position === 'G').slice(offset, offset + 3);
    const w = fa.filter((p) => p.position === 'W').slice(offset, offset + 3);
    const b = fa.filter((p) => p.position === 'B').slice(offset, offset + 2);
    const roster = [...g, ...w, ...b]
      .map((p) => ({ pid: p.pid, rate: overrides[p.pid] ?? rate, startRound: 1, years: 5 }));
    const lineup = autoRepair({ prevLineup: null, activePids: roster.map((c) => c.pid), catalogById: byId });
    return { teamId: id, name: id, lineup, roster, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0 };
  }
  // Discrimination-canary tuning (load-bearing — do not flatten back to uniform
  // per-team rates). With offsets 0/2, pids 1005 (G) and 1012 (W) are the shared
  // copies; pid 1017 (x1's B) is unshared and has the single highest raw gamescore
  // of any row this fixture produces. Box-score gamescores are independent of
  // `rate` (rate only feeds the bargain denominator), so at a team-uniform rate the
  // naive (pid-pooled) and per-copy argmax always coincide on pid 1017 regardless of
  // scale — a regression of sim.js's byCopy keying to naive pid-pooling would go
  // undetected. To force the two folds apart: give shared pid 1005 a minimal rate
  // (2) on team x1 only, and give the true best-unshared candidate 1017 a low but
  // distinct rate (3); every other roster slot keeps a high rate (20) so its
  // perDollar is negligible. That makes naive perDollar(x1,1005) — which divides
  // BOTH copies' pooled gamescore by x1's tiny rate — the largest value in the whole
  // fold, while per-copy perDollar(x1,1005) — x1's own rows only — falls below
  // per-copy perDollar(x1,1017). So naive's argmax is the SHARED pid 1005, but the
  // true per-copy argmax is the UNSHARED pid 1017: the folds provably disagree, and
  // any accidental pool-by-pid regression flips the computed award (see canary
  // below).
  const pair = [
    mkTeamRated('x1', 0, 20, { 1005: 2, 1017: 3 }),
    mkTeamRated('x2', 2, 20, {}),
  ];
  const shared = pair[0].roster.map((c) => c.pid)
    .filter((pid) => pair[1].roster.some((c) => c.pid === pid));
  const out2 = simulateRound({ gameId: 'g2', round: 1, teams: pair, catalogById: byId });

  // replicate sim.js's bargain fold exactly (same iteration order, same
  // compare-unrounded-vs-rounded behavior), parameterized by aggregation key.
  // Returns both the argmax ("best") and the full per-(team,pid) perDollar map
  // ("all"), keyed the same way as the caller's keyOf.
  function foldBargain(keyOf) {
    const sums = {};
    for (const r of out2.boxRows) {
      const k = keyOf(r.teamId, r.player_id);
      sums[k] = (sums[k] ?? 0) + gs(r);
    }
    let best = null;
    const all = {};
    for (const t of pair) for (const c of t.roster) {
      const k = keyOf(t.teamId, c.pid);
      const s = sums[k]; if (s == null) continue;
      const pd = Math.round((s / Math.max(2, c.rate)) * 100) / 100;
      all[`${t.teamId}|${c.pid}`] = pd;
      if (!best || pd > best.perDollar) best = { pid: c.pid, teamId: t.teamId, perDollar: pd };
    }
    return { best, all };
  }

  it('both copies of a shared pid play and generate independent rows', () => {
    expect(shared.length).toBeGreaterThan(0);
    for (const pid of shared) {
      expect(out2.boxRows.some((r) => r.player_id === pid && r.teamId === 'x1')).toBe(true);
      expect(out2.boxRows.some((r) => r.player_id === pid && r.teamId === 'x2')).toBe(true);
    }
  });
  it("each copy's perDollar uses only its own team's rows, never the other copy's", () => {
    const perCopy = foldBargain((tid, pid) => `${tid}|${pid}`);
    const naive = foldBargain((_tid, pid) => `${pid}`);
    // Structural check, per shared pid: naive keying pools BOTH teams' box rows into
    // one sum (a shared pid's naive numerator is always >= its true per-copy
    // numerator, since it additionally includes the other copy's rows), so every
    // shared pid's naive perDollar must exceed its correct per-copy perDollar. This
    // holds by construction regardless of which player ends up the overall argmax,
    // so — on its own — it is a tautology that never exercises sim.js's award
    // computation. Harmless to keep, but the canary below is what actually proves
    // the byCopy keying, by forcing the two folds' argmaxes to provably diverge.
    expect(shared.length).toBeGreaterThan(0);
    for (const pid of shared) {
      for (const teamId of ['x1', 'x2']) {
        expect(naive.all[`${teamId}|${pid}`]).toBeGreaterThan(perCopy.all[`${teamId}|${pid}`]);
      }
    }
    // Discrimination canary: the fixture's rate tuning (see mkTeamRated call above)
    // makes the naive (pid-pooled) argmax land on the SHARED pid 1005 — inflated by
    // pooling x2's rows into x1's minimal-rate denominator — while the true per-copy
    // argmax is the UNSHARED pid 1017. These must differ; if sim.js's byCopy keying
    // ever regressed to pooling by player_id alone, its computed award would match
    // naive.best instead of perCopy.best and this assertion would fail.
    expect(shared).toContain(naive.best.pid);
    expect(naive.best.pid).not.toEqual(perCopy.best.pid);
    // Load-bearing: with the canary above proving the two folds diverge, this proves
    // sim.js actually keys its award computation by (teamId, pid), not by pooled pid.
    expect(out2.awards.bargain).toEqual(perCopy.best);
  });
});
