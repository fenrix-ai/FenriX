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
