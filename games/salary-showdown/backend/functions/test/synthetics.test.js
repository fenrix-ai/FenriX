import { describe, it, expect } from 'vitest';
import { SYNTHETICS, SYNTHETIC_MIN_PID, SYNTHETIC_HIDDEN } from '../src/synthetics.js';
import { runHardship } from '../src/market.js';

const CAT = Object.fromEntries(SYNTHETICS.map((p) => [p.pid, p]));
const mk = (teamId, roster = []) => ({ teamId, roster });
const c = (pid, pos) => ({ pid, rate: 5, startRound: 1, years: 5, viaAuction: false, hardship: false, _pos: pos });
const catWith = (roster) => ({ ...CAT,
  ...Object.fromEntries(roster.map((r) => [r.pid, { pid: r.pid, position: r._pos }])) });

describe('Default Role Player hardship (playtest-polish T2)', () => {
  it('an empty roster fills to 8 with DISTINCT synthetic pids covering 2G/2W/1B, all $0 x 1yr hardship', () => {
    const team = mk('t1');
    const out = runHardship({ teams: [team], synthetics: SYNTHETICS, round: 3, catalogById: CAT });
    const s = out[0].signings;
    expect(s).toHaveLength(8);
    expect(new Set(s.map((x) => x.pid)).size).toBe(8);
    for (const x of s) {
      expect(x.pid).toBeGreaterThan(SYNTHETIC_MIN_PID);
      expect(x).toMatchObject({ rate: 0, years: 1, startRound: 3, viaAuction: false, hardship: true });
    }
    const pos = s.map((x) => CAT[x.pid].position);
    expect(pos.filter((p) => p === 'G').length).toBeGreaterThanOrEqual(2);
    expect(pos.filter((p) => p === 'W').length).toBeGreaterThanOrEqual(2);
    expect(pos.filter((p) => p === 'B').length).toBeGreaterThanOrEqual(1);
  });

  it('a position-deficit-only team gets exactly the deficit, position-matched', () => {
    const roster = [c(1, 'G'), c(2, 'G'), c(3, 'W'), c(4, 'W'), c(5, 'W'), c(6, 'W'), c(7, 'G'), c(8, 'G')]; // 8 active, 0 B
    const team = mk('t2', roster);
    const out = runHardship({ teams: [team], synthetics: SYNTHETICS, round: 2, catalogById: catWith(roster) });
    expect(out[0].signings).toHaveLength(1);
    expect(CAT[out[0].signings[0].pid].position).toBe('B');
  });

  it('a legal team gets nothing; the 10-man max still bounds the fill', () => {
    const legal = [c(1,'G'), c(2,'G'), c(3,'W'), c(4,'W'), c(5,'B'), c(6,'G'), c(7,'W'), c(8,'B')];
    expect(runHardship({ teams: [mk('ok', legal)], synthetics: SYNTHETICS, round: 2,
      catalogById: catWith(legal) })).toHaveLength(0);
    const nine = [c(1,'G'), c(2,'G'), c(3,'G'), c(4,'G'), c(5,'G'), c(6,'G'), c(7,'G'), c(8,'G'), c(9,'G')]; // 9 active, no W/B
    const out = runHardship({ teams: [mk('cap', nine)], synthetics: SYNTHETICS, round: 2,
      catalogById: catWith(nine) });
    expect(out[0].signings).toHaveLength(1); // 10-man max: one slot left despite 3 unmet needs
  });

  it('two stranded teams may receive the SAME synthetic pid (non-exclusive across teams)', () => {
    const out = runHardship({ teams: [mk('a'), mk('b')], synthetics: SYNTHETICS, round: 1, catalogById: CAT });
    expect(out[0].signings.map((x) => x.pid)).toEqual(out[1].signings.map((x) => x.pid));
  });

  // Shape pin (controller ruling 2026-07-26): the engine resolves strength and box
  // scores from hidden.json, not the catalog, so a synthetic missing any of these
  // keys crashes teamStrength/teamBox mid-simulation. Pin the whole surface here so
  // that failure can never reach the sim again.
  it('SYNTHETIC_HIDDEN covers every synthetic pid with the full engine-read surface', () => {
    const COMPS = ['sv_interior', 'sv_three', 'play', 'defense', 'tov', 'reb_only',
                   'sec_value', 'shooting', 'stocks'];
    const EXP = ['fga', 'fga3_share', 'fg_pct', 'three_pt_pct', 'rebounds', 'assists',
                 'steals', 'blocks', 'turnovers'];
    expect(Object.keys(SYNTHETIC_HIDDEN)).toHaveLength(SYNTHETICS.length);
    for (const p of SYNTHETICS) {
      const h = SYNTHETIC_HIDDEN[p.pid];
      expect(h, `missing hidden entry for pid ${p.pid}`).toBeDefined();
      // position mirrors the catalog label: engine.js keys rimScore and the
      // big/guard scoring channels off hidden position, sim.js stamps box rows off
      // the catalog — a mismatch would desync them.
      expect(h.position).toBe(p.position);
      expect(Number.isFinite(h.ti)).toBe(true);
      expect(Number.isFinite(h.ti_raw)).toBe(true);
      expect(Number.isFinite(h.attrs?.three_pt)).toBe(true);
      expect(Number.isFinite(h.attrs?.defense)).toBe(true);
      for (const k of COMPS) expect(Number.isFinite(h.comps?.[k]), `comps.${k} on ${p.pid}`).toBe(true);
      for (const k of EXP) expect(Number.isFinite(h.exp?.[k]), `exp.${k} on ${p.pid}`).toBe(true);
    }
    // every pid shares ONE stat block (Dylan: "they all have the same stats")
    const blocks = new Set(SYNTHETICS.map((p) => JSON.stringify(
      { ...SYNTHETIC_HIDDEN[p.pid], position: null })));
    expect(blocks.size).toBe(1);
  });
});
