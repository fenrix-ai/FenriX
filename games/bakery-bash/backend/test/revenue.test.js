/**
 * Pins the gaussianNoise seed contract that the multi-day simulation
 * (P2) relies on: same seed → same noise; different day in seed → different
 * noise; clamps respected.
 */

const assert = require('node:assert/strict');
const { gaussianNoise } = require('../functions/modules/revenue');

describe('gaussianNoise', () => {
  it('produces identical noise for the same seed', () => {
    const a = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const b = gaussianNoise(-2, 2, 'game:1:0:player_a');
    assert.equal(a, b, 'same seed must produce same noise');
  });

  it('produces different noise when only day differs', () => {
    const day0 = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const day1 = gaussianNoise(-2, 2, 'game:1:1:player_a');
    assert.notEqual(day0, day1, 'changing day must change noise');
  });

  it('produces different noise when only player differs', () => {
    const a = gaussianNoise(-2, 2, 'game:1:0:player_a');
    const b = gaussianNoise(-2, 2, 'game:1:0:player_b');
    assert.notEqual(a, b, 'changing player must change noise');
  });

  it('respects min/max clamps across many seeds', () => {
    for (let d = 0; d < 200; d += 1) {
      const v = gaussianNoise(-2, 2, `game:1:${d}:player_a`);
      assert.ok(v >= -2 && v <= 2, `value ${v} out of range`);
    }
  });
});
