import { describe, it, expect } from 'vitest';
import { SYNTHETICS, SYNTHETIC_MIN_PID, SYNTHETIC_HIDDEN } from '../src/synthetics.js';
import { runHardship, validateSigning } from '../src/market.js';
import { expiringPids } from '../src/payroll.js';
import params from '../src/data/engine_params.json' with { type: 'json' };

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

  // The two synergy gates are what make a DRP structurally weak rather than merely
  // low-rated, so pin them as INEQUALITIES against engine_params.json — if either
  // gate is ever retuned past the DRP's rating, a Default Role Player silently
  // starts earning the spacing/rim bonus and this fails loudly.
  it('sits below both synergy gates (read from engine_params, not hardcoded)', () => {
    const h = SYNTHETIC_HIDDEN[SYNTHETICS[0].pid];
    expect(h.attrs.three_pt).toBeLessThan(params.synergy.shooter_3pt_skill);
    expect(h.attrs.defense).toBeLessThan(params.synergy.rim_block_skill);
    expect(params.synergy.rim_block_skill).toBeLessThanOrEqual(params.synergy.rim_elite);
  });

  // Reviewer finding (2026-07-26): a real player's public card is a noisy observation
  // of the same expectation the engine simulates from, so card/expected ratios across
  // the real 175 cluster near 1.0. A hand-written card put the DRP at 0.417 — it
  // understated the player the sim would actually produce. The card is now generated
  // from the exp block; this pins that it stays generated.
  it('publishes a card that matches the engine expectation it is generated from', () => {
    const card = SYNTHETICS[0];
    const e = SYNTHETIC_HIDDEN[card.pid].exp;
    // the invariant: every per-game card field IS its exp counterpart at card
    // precision (1dp), and every rate field at 3dp. toBeCloseTo(x, 1) == |diff| < 0.05,
    // which is exactly what rounding to one decimal place can move a value.
    expect(Number(card.mins_per_game)).toBeCloseTo(e.mins, 1);
    expect(Number(card.pts_per_game)).toBeCloseTo(e.pts, 1);
    expect(Number(card.fg_attempts_per_game)).toBeCloseTo(e.fga, 1);
    expect(Number(card.rebounds_per_game)).toBeCloseTo(e.rebounds, 1);
    expect(Number(card.assists_per_game)).toBeCloseTo(e.assists, 1);
    expect(Number(card.steals_per_game)).toBeCloseTo(e.steals, 1);
    expect(Number(card.blocks_per_game)).toBeCloseTo(e.blocks, 1);
    expect(Number(card.turnovers_per_game)).toBeCloseTo(e.turnovers, 1);
    expect(Number(card.fg_pct)).toBeCloseTo(e.fg_pct, 3);
    expect(Number(card.three_pt_pct)).toBeCloseTo(e.three_pt_pct, 3);
    expect(Number(card.ft_pct)).toBeCloseTo(e.ft_pct, 3);
    // and the reviewer's own metric: the card/expected ratio on fg_attempts must sit
    // inside the span the real 175 occupy ([0.753, 1.174]). The hand-written card
    // scored 0.417 here, well outside it.
    const ratio = Number(card.fg_attempts_per_game) / e.fga;
    expect(ratio).toBeGreaterThan(0.753);
    expect(ratio).toBeLessThan(1.174);
    // prev_* mirrors current: a DRP has no season-over-season arc
    expect(card.prev_pts_per_game).toBe(card.pts_per_game);
    expect(card.prev_mins_per_game).toBe(card.mins_per_game);
    expect(card.prev_fg_pct).toBe(card.fg_pct);
  });

  // Controller ruling 2026-07-26: hardship is the ONLY path onto a roster.
  it('is never signable through validateSigning, and never offered as an expiring deal', () => {
    const CATALOG = { ...CAT };
    for (const p of SYNTHETICS) {
      expect(() => validateSigning({
        team: { roster: [], deadMoney: [] }, pid: p.pid, years: 1, round: 2,
        marketAvailable: [p.pid], catalogById: CATALOG, isResign: false,
      })).toThrow('NOT_IN_MARKET');
      // the front-office re-sign path is the one that actually reached this before
      expect(() => validateSigning({
        team: { roster: [], deadMoney: [] }, pid: p.pid, years: 4, round: 2,
        marketAvailable: [], catalogById: CATALOG, isResign: true,
      })).toThrow('NOT_IN_MARKET');
    }
    // and a just-expired DRP is not even offered: a round-1 hardship deal alongside a
    // real contract that expired the same round leaves only the real pid on the list.
    const team = { roster: [
      { pid: 9001, rate: 0, startRound: 1, years: 1, viaAuction: false, hardship: true },
      { pid: 1001, rate: 5, startRound: 1, years: 1, viaAuction: false, hardship: false },
    ] };
    expect(expiringPids(team, 2)).toEqual([1001]);
  });
});
