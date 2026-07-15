import { describe, it, expect } from 'vitest';
import { validateLineup, autoRepair, PLAYSTYLES } from '../src/lineup.js';
import players from '../src/data/players.json' with { type: 'json' };

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const gs = players.filter((p) => p.position === 'G').slice(0, 4).map((p) => p.pid);
const ws = players.filter((p) => p.position === 'W').slice(0, 3).map((p) => p.pid);
const bs = players.filter((p) => p.position === 'B').slice(0, 2).map((p) => p.pid);
const active = [...gs.slice(0, 3), ...ws, ...bs];           // 3G 3W 2B = 8
const legal = { starters: [gs[0], gs[1], ws[0], ws[1], bs[0]], sixth: gs[2],
                bench: [ws[2], bs[1]], playstyle: 'Lockdown' };

describe('validateLineup', () => {
  it('accepts a legal lineup', () => {
    validateLineup({ lineup: legal, activePids: active, catalogById: byId });
  });
  it('rejects bad template / duplicates / foreign players / bad style', () => {
    const threeG = { ...legal, starters: [gs[0], gs[1], gs[2], ws[0], bs[0]], sixth: ws[1] };
    expect(() => validateLineup({ lineup: threeG, activePids: active, catalogById: byId })).toThrow('BAD_TEMPLATE');
    const dup = { ...legal, sixth: gs[0] };
    expect(() => validateLineup({ lineup: dup, activePids: active, catalogById: byId })).toThrow('DUPLICATE_PLAYER');
    const foreign = { ...legal, bench: [gs[3]] };
    expect(() => validateLineup({ lineup: foreign, activePids: active, catalogById: byId })).toThrow('NOT_ON_ROSTER');
    const style = { ...legal, playstyle: 'Chaos' };
    expect(() => validateLineup({ lineup: style, activePids: active, catalogById: byId })).toThrow('BAD_PLAYSTYLE');
  });
});

describe('autoRepair', () => {
  it('repairs after roster churn using public mins only, keeps playstyle', () => {
    const churned = active.filter((p) => p !== legal.starters[0]);   // lost a starting G
    const fixed = autoRepair({ prevLineup: legal, activePids: churned, catalogById: byId });
    validateLineup({ lineup: fixed, activePids: churned, catalogById: byId });
    expect(fixed.playstyle).toBe('Lockdown');
  });
  it('builds from nothing (round 1 timeout)', () => {
    const fixed = autoRepair({ prevLineup: null, activePids: active, catalogById: byId });
    validateLineup({ lineup: fixed, activePids: active, catalogById: byId });
    expect(fixed.playstyle).toBe('Balanced');
  });
});
