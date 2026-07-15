import { describe, it, expect } from 'vitest';
import { loadEngine } from '../src/engine.js';
import fixture from './fixtures/engine_parity.json' with { type: 'json' };

const eng = loadEngine();

describe('engine parity vs Python reference', () => {
  it('reproduces all 200 team strengths to 1e-9', () => {
    for (const c of fixture.cases) {
      const s = eng.teamStrength(c.starters, c.sixth, c.bench, c.style, true);
      expect(Math.abs(s - c.strength)).toBeLessThan(1e-9);
    }
  });
  it('reproduces win probabilities to 1e-12', () => {
    for (const w of fixture.winprobs) {
      const a = fixture.cases[w.i], b = fixture.cases[w.j];
      const p = eng.winProb(a.strength, b.strength, a.style, b.style);
      expect(Math.abs(p - w.p)).toBeLessThan(1e-12);
    }
  });
  it('reproduces greedy lineup picks', () => {
    for (const lp of fixture.lineup_picks) {
      const { starters, sixth } = eng.pickLineup(lp.roster, (pid) => eng.hidden[pid].ti);
      expect(starters).toEqual(lp.starters);
      expect(sixth).toEqual(lp.sixth);
    }
  });
});
