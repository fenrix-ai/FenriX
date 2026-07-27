import { describe, it, expect } from 'vitest';
import { validateBids, resolveAuction } from '../src/auction.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const wave1 = players.filter((p) => +p.auction_round === 1).map((p) => p.pid);
const mkTeam = (id, roster = []) => ({ teamId: id, roster, deadMoney: [] });

describe('validateBids', () => {
  it('enforces min bid, step, years, wave membership', () => {
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 1.5, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('MIN_BID');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 5.05, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('BID_STEP');
    expect(() => validateBids({ bids: { 999999: { rate: 5, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('NOT_IN_WAVE');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 5, years: 6 } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_YEARS');
    validateBids({ bids: { [wave1[0]]: { rate: 5.0, years: 3 } }, round: 1, starPids: wave1 });
  });

  // NaN/type-injection hardening: client-supplied bid numerics are coerced with
  // Number() before validation, so a non-finite rate fails a named check instead of
  // poisoning resolveAuction's sort/cap arithmetic downstream (a NaN guaranteed-money
  // sort key would silently scramble priority order).
  it('rejects a non-finite rate (NaN, or a non-numeric string) with BAD_RATE', () => {
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: NaN, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_RATE');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 'not-a-number', years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_RATE');
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: undefined, years: 2 } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_RATE');
  });
  it('coerces a numeric-string rate and validates it normally instead of crashing', () => {
    // '5.0' -> Number('5.0') = 5.0, a legal round-1 bid (minBid(1) = 2.0, on-step).
    validateBids({ bids: { [wave1[0]]: { rate: '5.0', years: 2 } }, round: 1, starPids: wave1 });
  });
  it("coerces a string years value ('3') deterministically to the integer 3", () => {
    validateBids({ bids: { [wave1[0]]: { rate: 5.0, years: '3' } }, round: 1, starPids: wave1 });
    // a fractional numeric string is still a non-integer once coerced -> BAD_YEARS
    expect(() => validateBids({ bids: { [wave1[0]]: { rate: 5.0, years: '3.5' } }, round: 1, starPids: wave1 }))
      .toThrow('BAD_YEARS');
  });
  // Shape guard: a malformed per-star bid entry (null, or anything else you can't
  // read .rate/.years off) must fail as a named, catchable error — not throw a raw
  // TypeError ("Cannot read properties of null (reading 'rate')") that submitBids
  // would surface as an uncontrolled 500 instead of invalid-argument.
  it('rejects a null per-star bid entry with BAD_SHAPE instead of crashing', () => {
    expect(() => validateBids({ bids: { [wave1[0]]: null }, round: 1, starPids: wave1 }))
      .toThrow('BAD_SHAPE');
  });
});

describe('resolveAuction', () => {
  it('highest guaranteed money wins; loser pays nothing', () => {
    const bids = [
      { teamId: 'a', pid: wave1[0], rate: 8.0, years: 3 },   // 24 gtd
      { teamId: 'b', pid: wave1[0], rate: 11.5, years: 1 },  // 11.5 gtd
    ];
    const { awards, teamsAfter } = resolveAuction({ bids, starPids: wave1,
      teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 's', catalogById: byId });
    expect(awards[0]).toMatchObject({ pid: wave1[0], teamId: 'a', guaranteed: 24 });
    expect(teamsAfter.find((t) => t.teamId === 'a').roster).toHaveLength(1);
    expect(teamsAfter.find((t) => t.teamId === 'b').roster).toHaveLength(0);
    // spendLog (append-only acquisition ledger): the winning contract is logged
    // alongside the roster push; the losing team's spendLog stays empty.
    expect(teamsAfter.find((t) => t.teamId === 'a').spendLog).toEqual([
      { pid: wave1[0], rate: 8.0, startRound: 1, years: 3, viaAuction: true, hardship: false },
    ]);
    expect(teamsAfter.find((t) => t.teamId === 'b').spendLog).toEqual([]);
  });
  it('skips winners who fail cap or roster and falls to next bid', () => {
    const broke = mkTeam('a', [{ pid: 1, rate: 95.0, startRound: 1, years: 5 }]);
    const bids = [
      { teamId: 'a', pid: wave1[1], rate: 20.0, years: 2 },  // 40 gtd but over cap
      { teamId: 'b', pid: wave1[1], rate: 3.0, years: 2 },   // 6 gtd, legal
    ];
    const { awards } = resolveAuction({ bids, starPids: wave1, teams: [broke, mkTeam('b')],
      round: 1, seed: 's', catalogById: byId });
    expect(awards.find((a) => a.pid === wave1[1]).teamId).toBe('b');
  });
  it('unsold stars resolve to teamId null; ties are deterministic per seed', () => {
    const bids = [
      { teamId: 'a', pid: wave1[2], rate: 6.0, years: 2 },
      { teamId: 'b', pid: wave1[2], rate: 4.0, years: 3 },   // both 12 gtd — tie
    ];
    const r1 = resolveAuction({ bids, starPids: wave1, teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 'z', catalogById: byId });
    const r2 = resolveAuction({ bids, starPids: wave1, teams: [mkTeam('a'), mkTeam('b')], round: 1, seed: 'z', catalogById: byId });
    expect(r1.awards).toEqual(r2.awards);
    const unsoldPid = wave1[3];
    expect(r1.awards.find((a) => a.pid === unsoldPid)).toMatchObject({ pid: unsoldPid, teamId: null });
  });
});

// Playtest-polish Task 1: resolveAuction also reports which bids were passed over
// for roster/cap reasons AT A MOMENT WHEN THEIR STAR WAS STILL UNSOLD (i.e. the bid
// that believed it won) — the team-private "Results" note (spec §1.2). Fixtures use
// the file's own mkTeam helper (deadMoney: []) rather than a bare {teamId, roster}
// object, since capOkWith -> payrollAt iterates team.deadMoney directly.
describe('resolveAuction skip records (playtest-polish T1)', () => {
  const catalogById = {};
  const full = Array.from({ length: 10 }, (_, i) => ({ pid: 500 + i, rate: 1, startRound: 1, years: 5, viaAuction: false, hardship: false }));

  it('records a cap skip AND the fall-through winner for the same star', () => {
    const rich = mkTeam('rich');
    const poor = mkTeam('poor', [{ pid: 600, rate: 99.0, startRound: 1, years: 5, viaAuction: false, hardship: false }]);
    const bids = [
      { pid: 1, teamId: 'poor', rate: 30.0, years: 2 },   // highest guaranteed — cap-blocked
      { pid: 1, teamId: 'rich', rate: 5.0, years: 1 },    // falls through, wins
    ];
    const { awards, skips } = resolveAuction({ bids, starPids: [1], teams: [rich, poor],
      round: 1, seed: 's', catalogById });
    expect(skips).toEqual([{ pid: 1, teamId: 'poor', reason: 'cap' }]);
    expect(awards.find((a) => a.pid === 1)).toMatchObject({ teamId: 'rich', rate: 5.0, years: 1 });
  });

  it('records a roster skip; an already-sold star produces NO skip record', () => {
    const fullTeam = mkTeam('full', full);
    const other = mkTeam('other');
    const bids = [
      { pid: 2, teamId: 'full', rate: 20.0, years: 1 },   // roster skip (would have won)
      { pid: 2, teamId: 'other', rate: 10.0, years: 1 },  // wins
    ];
    const { skips } = resolveAuction({ bids, starPids: [2], teams: [fullTeam, other],
      round: 1, seed: 's', catalogById });
    expect(skips).toEqual([{ pid: 2, teamId: 'full', reason: 'roster' }]);
  });

  it('clean resolution yields empty skips; un-bid stars yield no skips', () => {
    const a = mkTeam('a');
    const { skips, awards } = resolveAuction({ bids: [{ pid: 3, teamId: 'a', rate: 4.0, years: 1 }],
      starPids: [3, 4], teams: [a], round: 1, seed: 's', catalogById });
    expect(skips).toEqual([]);
    expect(awards.find((x) => x.pid === 4)).toMatchObject({ teamId: null });
  });
});
