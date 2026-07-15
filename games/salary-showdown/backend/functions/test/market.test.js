import { describe, it, expect } from 'vitest';
import { drawMarket, validateSigning, runHardship } from '../src/market.js';
import players from '../src/data/players.json' with { type: 'json' };
import { askPrice, contractRate } from '../src/payroll.js';

const fa = players.filter((p) => !p.auction_round);
const auctionClass = players.filter((p) => p.auction_round);
const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const zeroAbsent = Object.fromEntries(fa.map((p) => [p.pid, 0]));

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
});

describe('runHardship', () => {
  it('fills a stranded team to a legal 8 with cap-exempt 1-round deals', () => {
    const stranded = { teamId: 't1', roster: [], deadMoney: [{ rate: 99.0, startRound: 2, endRound: 5 }] };
    const [fix] = runHardship({ teams: [stranded], faPool: fa, round: 2, catalogById: byId });
    expect(fix.signings.length).toBe(8);
    const pos = fix.signings.map((c) => byId[c.pid].position).sort().join('');
    expect(pos.match(/G/g).length).toBeGreaterThanOrEqual(3);
    expect(pos.match(/B/g).length).toBeGreaterThanOrEqual(2);
    expect(fix.signings.every((c) => c.years === 1 && c.hardship)).toBe(true);
  });
  it('leaves healthy teams alone', () => {
    // runHardship's own depth bar is >=3 G, >=3 W, >=2 B active (stricter than the
    // 2G/2W/1B starting-five minimum from engine.js's pickLineup) — build a roster
    // from position-filtered FA lists that clears exactly that bar, so this fixture
    // is genuinely legal rather than accidentally legal.
    const byPos = {
      G: fa.filter((p) => p.position === 'G'),
      W: fa.filter((p) => p.position === 'W'),
      B: fa.filter((p) => p.position === 'B'),
    };
    const legalPids = [...byPos.G.slice(0, 3), ...byPos.W.slice(0, 3), ...byPos.B.slice(0, 2)].map((p) => p.pid);
    expect(legalPids.length).toBe(8);
    const ok = { teamId: 't2', roster: legalPids.map((pid) => ({ pid, rate: 3, startRound: 2, years: 2 })), deadMoney: [] };
    const res = runHardship({ teams: [ok], faPool: fa, round: 2, catalogById: byId });
    expect(res).toEqual([]);
  });
  it('hands two identically stranded teams copies of the same players (non-exclusive FA, spec §4.2)', () => {
    const stranded1 = { teamId: 't1', roster: [], deadMoney: [] };
    const stranded2 = { teamId: 't2', roster: [], deadMoney: [] };
    const fixes = runHardship({ teams: [stranded1, stranded2], faPool: fa, round: 2, catalogById: byId });
    expect(fixes.length).toBe(2);
    // identical needs against the shared catalog -> identical cheapest-legal picks;
    // each team gets its own independent copy of the same players.
    expect(fixes[1].signings.map((c) => c.pid)).toEqual(fixes[0].signings.map((c) => c.pid));
  });
});
