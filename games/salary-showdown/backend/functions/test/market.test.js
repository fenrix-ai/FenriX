import { describe, it, expect } from 'vitest';
import { drawMarket, validateSigning, runHardship } from '../src/market.js';
import players from '../src/data/players.json' with { type: 'json' };
import { askPrice, contractRate, hypeCurve } from '../src/payroll.js';
import { SYNTHETICS, SYNTHETIC_MIN_PID } from '../src/synthetics.js';

const fa = players.filter((p) => !p.auction_round);
const auctionClass = players.filter((p) => p.auction_round);
const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const zeroAbsent = Object.fromEntries(fa.map((p) => [p.pid, 0]));
const byPos = {
  G: fa.filter((p) => p.position === 'G'),
  W: fa.filter((p) => p.position === 'W'),
  B: fa.filter((p) => p.position === 'B'),
};
const contractsFor = (list, opts = {}) =>
  list.map((p) => ({ pid: p.pid, rate: 2, startRound: 1, years: 5, ...opts }));

describe('drawMarket', () => {
  it('round 1 draws 75%, later rounds 45%, deterministically', () => {
    const d1 = drawMarket({ gameId: 'g', round: 1, faPool: fa, absentCounts: zeroAbsent, extraPids: [] });
    expect(d1.available.length).toBe(Math.floor(fa.length * 0.75));
    const again = drawMarket({ gameId: 'g', round: 1, faPool: fa, absentCounts: zeroAbsent, extraPids: [] });
    expect(again.available).toEqual(d1.available);
    const d2 = drawMarket({ gameId: 'g', round: 2, faPool: fa, absentCounts: d1.absentCounts, extraPids: [] });
    expect(d2.available.length).toBeGreaterThanOrEqual(Math.floor(fa.length * 0.45));
  });
  it('forces players absent two consecutive rounds back in', () => {
    let absent = { ...zeroAbsent };
    const missing = [];
    for (let r = 1; r <= 4; r++) {
      const d = drawMarket({ gameId: 'g2', round: r, faPool: fa, absentCounts: absent, extraPids: [] });
      absent = d.absentCounts;
      for (const [pid, n] of Object.entries(absent)) if (n > 2) missing.push(pid);
    }
    expect(missing).toEqual([]);   // nobody is ever absent 3 rounds running
  });
  it('always includes extraPids (unsold auction stars) regardless of the random draw', () => {
    const star = auctionClass[0];
    const d = drawMarket({ gameId: 'g3', round: 2, faPool: fa, absentCounts: zeroAbsent, extraPids: [star.pid] });
    expect(d.available).toContain(star.pid);
  });
});

describe('validateSigning', () => {
  const cheap = fa.reduce((a, b) => (+a.salary_per_round < +b.salary_per_round ? a : b));
  const baseTeam = { roster: [], deadMoney: [] };
  it('prices with inflation and discount', () => {
    const { contract } = validateSigning({
      team: baseTeam, pid: cheap.pid, years: 3, round: 2,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false });
    expect(contract.rate).toBe(contractRate(askPrice(+cheap.salary_per_round, 2), 3));
    expect(contract.startRound).toBe(2);
  });
  it('rejects out-of-market, full roster, over-cap, bad years', () => {
    expect(() => validateSigning({ team: baseTeam, pid: cheap.pid, years: 1, round: 2,
      marketAvailable: [], catalogById: byId, isResign: false })).toThrow('NOT_IN_MARKET');
    const full = { roster: Array.from({ length: 10 }, (_, i) => ({ pid: 9000 + i, rate: 2, startRound: 1, years: 5 })), deadMoney: [] };
    expect(() => validateSigning({ team: full, pid: cheap.pid, years: 1, round: 1,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('ROSTER_FULL');
    const broke = { roster: [{ pid: 1, rate: 99.5, startRound: 1, years: 5 }], deadMoney: [] };
    expect(() => validateSigning({ team: broke, pid: cheap.pid, years: 1, round: 1,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('CAP_EXCEEDED');
    expect(() => validateSigning({ team: baseTeam, pid: cheap.pid, years: 3, round: 4,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('BAD_YEARS');
  });
  it('rejects signing a pid already active on the team roster (no double-sign)', () => {
    const already = { roster: [{ pid: cheap.pid, rate: 2, startRound: 1, years: 3 }], deadMoney: [] };
    expect(() => validateSigning({ team: already, pid: cheap.pid, years: 1, round: 2,
      marketAvailable: [cheap.pid], catalogById: byId, isResign: false })).toThrow('ALREADY_SIGNED');
  });
  it('an isResign signing does not require the pid to be in marketAvailable', () => {
    const { contract } = validateSigning({
      team: baseTeam, pid: cheap.pid, years: 1, round: 2,
      marketAvailable: [], catalogById: byId, isResign: true });
    expect(contract.pid).toBe(cheap.pid);
  });
  it('prices unsold auction stars from unsoldPrices when they carry no list price', () => {
    const star = auctionClass[0];
    const unsoldPrices = { [star.pid]: 20.0 };
    const { contract } = validateSigning({
      team: baseTeam, pid: star.pid, years: 2, round: 2,
      marketAvailable: [star.pid], catalogById: byId, isResign: false, unsoldPrices });
    expect(contract.rate).toBe(contractRate(askPrice(20.0, 2), 2));
  });
  it('still rejects an auction-class player with no recorded unsold price', () => {
    const star = auctionClass[1];
    expect(() => validateSigning({
      team: baseTeam, pid: star.pid, years: 1, round: 2,
      marketAvailable: [star.pid], catalogById: byId, isResign: false })).toThrow('NOT_IN_MARKET');
  });
  it('re-signs an expiring auction star at the hype-curve price (spec §13)', () => {
    const star = auctionClass[0];
    // expired contract (covered round 1 only) -> isResign at round 2, no list price
    const team = { roster: [{ pid: star.pid, rate: 12.0, startRound: 1, years: 1 }], deadMoney: [] };
    const { contract } = validateSigning({
      team, pid: star.pid, years: 2, round: 2,
      marketAvailable: [], catalogById: byId, isResign: true });
    expect(contract.rate).toBe(contractRate(askPrice(hypeCurve(Number(star.hype)), 2), 2));
  });
  it('rejects a signing that makes 2G/2W/1B coverage impossible within 10 slots (POSITION_LOCK)', () => {
    // 9 Guards + a 10th Guard: 0 slots would remain for the needed 2W + 1B.
    const nineGuards = { roster: contractsFor(byPos.G.slice(0, 9)), deadMoney: [] };
    const tenth = byPos.G[9].pid;
    expect(() => validateSigning({ team: nineGuards, pid: tenth, years: 1, round: 1,
      marketAvailable: [tenth], catalogById: byId, isResign: false })).toThrow('POSITION_LOCK');
  });
  it('allows a 7th Wing on 6 Wings (still feasible), rejects the 8th', () => {
    const sixWings = { roster: contractsFor(byPos.W.slice(0, 6)), deadMoney: [] };
    const seventh = byPos.W[6].pid;
    const { contract } = validateSigning({ team: sixWings, pid: seventh, years: 1, round: 1,
      marketAvailable: [seventh], catalogById: byId, isResign: false });
    expect(contract.pid).toBe(seventh);   // 7 W + 3 open slots exactly covers 2G+1B
    const sevenWings = { roster: contractsFor(byPos.W.slice(0, 7)), deadMoney: [] };
    const eighth = byPos.W[7].pid;
    expect(() => validateSigning({ team: sevenWings, pid: eighth, years: 1, round: 1,
      marketAvailable: [eighth], catalogById: byId, isResign: false })).toThrow('POSITION_LOCK');
  });
});

// The fill is synthetic "Default Role Player" rows now (spec §2, 2026-07-26), never
// real free agents — so the catalog these tests resolve positions against must carry
// the synthetics too, exactly like game.js's CATALOG does.
const byIdAll = { ...byId, ...Object.fromEntries(SYNTHETICS.map((p) => [p.pid, p])) };

describe('runHardship', () => {
  it('fills a stranded team to a legal 8 with $0 synthetic 1-round deals', () => {
    const stranded = { teamId: 't1', roster: [], deadMoney: [{ rate: 99.0, startRound: 2, endRound: 5 }] };
    const [fix] = runHardship({ teams: [stranded], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll });
    expect(fix.signings.length).toBe(8);
    const pos = fix.signings.map((c) => byIdAll[c.pid].position);
    expect(pos.filter((x) => x === 'G').length).toBeGreaterThanOrEqual(2);   // LINEUP_NEED legality
    expect(pos.filter((x) => x === 'W').length).toBeGreaterThanOrEqual(2);
    expect(pos.filter((x) => x === 'B').length).toBeGreaterThanOrEqual(1);
    expect(fix.signings.every((c) => c.years === 1 && c.hardship)).toBe(true);
    // no real FA is ever hardship-drafted, and the deals cost nothing against the cap
    expect(fix.signings.every((c) => c.pid > SYNTHETIC_MIN_PID && c.rate === 0)).toBe(true);
    expect(fix.signings.every((c) => byIdAll[c.pid].name === 'Default Role Player')).toBe(true);
  });
  it('leaves healthy teams alone', () => {
    // legality bar: >=2 G, >=2 W, >=1 B active and >=8 total (LINEUP_NEED + floor);
    // build the fixture from position-filtered FA lists so it is genuinely legal
    // rather than accidentally legal.
    const legalPids = [...byPos.G.slice(0, 3), ...byPos.W.slice(0, 3), ...byPos.B.slice(0, 2)].map((p) => p.pid);
    expect(legalPids.length).toBe(8);
    const ok = { teamId: 't2', roster: legalPids.map((pid) => ({ pid, rate: 3, startRound: 2, years: 2 })), deadMoney: [] };
    const res = runHardship({ teams: [ok], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll });
    expect(res).toEqual([]);
  });
  it('repairs a position-skewed roster to 2G/2W/1B legality within the 10-man bound', () => {
    const sixWings = { teamId: 't3',
      roster: contractsFor(byPos.W.slice(0, 6), { startRound: 2, years: 2 }), deadMoney: [] };
    const [fix] = runHardship({ teams: [sixWings], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll });
    expect(fix.signings.length).toBe(3);   // 2 G + 1 B — deficits, not the roster floor, drive the fill
    expect(fix.signings.map((c) => byIdAll[c.pid].position).sort()).toEqual(['B', 'G', 'G']);
  });
  it('hard-stops at 10 actives even when position deficits remain', () => {
    const nineWings = { teamId: 't4',
      roster: contractsFor(byPos.W.slice(0, 9), { startRound: 2, years: 2 }), deadMoney: [] };
    const [fix] = runHardship({ teams: [nineWings], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll });
    expect(fix.signings.length).toBe(1);   // needs 2G+1B but only 1 slot under the max
    expect(byIdAll[fix.signings[0].pid].position).toBe('G');   // bound spent on the first deficit
    const tenWings = { teamId: 't5',
      roster: contractsFor(byPos.W.slice(0, 10), { startRound: 2, years: 2 }), deadMoney: [] };
    expect(runHardship({ teams: [tenWings], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll })).toEqual([]);
  });
  it('hands two identically stranded teams the same synthetic pids (non-exclusive, spec §4.2)', () => {
    const stranded1 = { teamId: 't1', roster: [], deadMoney: [] };
    const stranded2 = { teamId: 't2', roster: [], deadMoney: [] };
    const fixes = runHardship({ teams: [stranded1, stranded2], synthetics: SYNTHETICS, round: 2, catalogById: byIdAll });
    expect(fixes.length).toBe(2);
    // identical needs against one shared synthetic pool -> identical picks; each team
    // gets its own independent copy of the same Default Role Players.
    expect(fixes[1].signings.map((c) => c.pid)).toEqual(fixes[0].signings.map((c) => c.pid));
  });
  it('re-issues the same synthetic pids in a later round once the 1-year deals expire', () => {
    // regression pin: `owned` must match ACTIVE contracts only. `roster` is never
    // pruned of expired contracts, and the synthetic pool is just 8 rows — matching
    // the whole roster empties the pool from round 2 on and silently stops filling.
    const r1 = runHardship({ teams: [{ teamId: 't', roster: [] }], synthetics: SYNTHETICS,
      round: 1, catalogById: byIdAll })[0].signings;
    expect(r1).toHaveLength(8);
    const r2 = runHardship({ teams: [{ teamId: 't', roster: r1 }], synthetics: SYNTHETICS,
      round: 2, catalogById: byIdAll })[0].signings;
    expect(r2).toHaveLength(8);
    expect(r2.map((c) => c.pid)).toEqual(r1.map((c) => c.pid));
    expect(r2.every((c) => c.startRound === 2)).toBe(true);
  });
});
