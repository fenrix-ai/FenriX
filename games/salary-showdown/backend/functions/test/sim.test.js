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
  it('emits the 23-column feed and awards', () => {
    const csv = toCsv(out.boxRows);
    expect(csv.split('\n')[0].split(',')).toHaveLength(23);
    expect(csv.split('\n')[0]).toContain('playstyle');
    expect(out.awards.roundMvp.pid).toBeTruthy();
    expect(out.awards.bargain.perDollar).toBeGreaterThan(0);
  });
});
