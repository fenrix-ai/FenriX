import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';

describe('rng', () => {
  it('is deterministic per seed string', () => {
    const a = makeRng('game42|round3'), b = makeRng('game42|round3');
    const seqA = [a.next(), a.next(), a.normal(0, 1), a.int(1, 6)];
    const seqB = [b.next(), b.next(), b.normal(0, 1), b.int(1, 6)];
    expect(seqA).toEqual(seqB);
  });
  it('differs across seeds and stays in range', () => {
    const a = makeRng('x'), b = makeRng('y');
    expect(a.next()).not.toBe(b.next());
    for (let i = 0; i < 1000; i++) {
      const v = a.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
      const n = a.int(3, 7); expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(7);
    }
  });
  it('shuffle is a permutation', () => {
    const r = makeRng('s'); const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle([...arr]);
    expect([...out].sort((x, y) => x - y)).toEqual(arr);
  });
});
