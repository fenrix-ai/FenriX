// Spec §7.1 binding note: live box-score team aggregates must scale the same way
// history.py's team-stat aggregation does, so students can benchmark a live feed
// against league_history.csv fingerprints (the designed §9.7 analysis path).
//
// history.py (datagen/history.py:153-167) computes, per team-game:
//   agg(key) = sum(p.exp[key] * tier_weight for p, tier_weight in slots)
//   pts_per_game = 1.25 * agg('pts') * pace * noise   (same shape for turnovers, etc.)
// with tier_weight from datagen/config.py TIER_WEIGHTS = {starter: 1.0, sixth: 0.6,
// bench: 0.35} (engine_params.json mirrors this as params.tier_weights). So the
// analytic per-slot factor is `1.25 * pace * tier_weight`, applied to each active
// slot's expected stat, summed over the 8 active slots (5 starters + sixth + 2 bench).
//
// This test pins teamBox() in src/sim.js to that same factor. It MUST fail against
// the old minutes-ratio scaling (mf = clamp(mins / e.mins, 0.5, 1.6)), which produced
// effective slot factors of ~1.48 / 1.12 / 0.73 for starter/sixth/bench — 18-67% off
// the binding 1.25 / 0.75 / 0.4375 — and pushed team totals (e.g. turnovers) well
// outside the ±8% analytic band used below.
import { describe, it, expect } from 'vitest';
import { teamBox } from '../src/sim.js';
import { loadEngine } from '../src/engine.js';
import { autoRepair } from '../src/lineup.js';
import { makeRng } from '../src/rng.js';
import players from '../src/data/players.json' with { type: 'json' };

const { hidden, params } = loadEngine();
const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const fa = players.filter((p) => !p.auction_round);

// Fixed 8-man lineup built from real roster data (same construction sim.test.js uses).
const g = fa.filter((p) => p.position === 'G').slice(0, 3);
const w = fa.filter((p) => p.position === 'W').slice(0, 3);
const b = fa.filter((p) => p.position === 'B').slice(0, 2);
const activePids = [...g, ...w, ...b].map((p) => p.pid);
const lineup = autoRepair({ prevLineup: null, activePids, catalogById: byId });

// Mirror sim.js's playerSlots(): 5 starters + sixth + bench[0..1] = 8 active slots.
const activeSlots = [
  ...lineup.starters.map((pid) => [pid, 'starter']),
  [lineup.sixth, 'sixth'],
  ...lineup.bench.slice(0, 2).map((pid) => [pid, 'bench']),
];
expect(activeSlots).toHaveLength(8);

const pace = params.pace.Balanced; // 1.0 — isolates the tier-weight factor from pace

function analyticTarget(statKey) {
  return 1.25 * pace * activeSlots.reduce(
    (s, [pid, tier]) => s + hidden[pid].exp[statKey] * params.tier_weights[tier], 0);
}

describe('teamBox scaling matches history.py aggregation model (spec §7.1)', () => {
  const N = 300;
  const ptsSamples = [];
  const tovSamples = [];
  for (let i = 0; i < N; i++) {
    const rng = makeRng(`teambox-scaling-test|${i}`);
    const box = teamBox(rng, lineup, pace);
    expect(box).toHaveLength(8);
    ptsSamples.push(box.reduce((s, r) => s + r.pts, 0));
    tovSamples.push(box.reduce((s, r) => s + r.turnovers, 0));
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('mean simulated team points matches 1.25 * pace * sum(tier_weight * e.pts) within +/-8%', () => {
    const target = analyticTarget('pts');
    const observed = mean(ptsSamples);
    expect(Math.abs(observed - target) / target).toBeLessThan(0.08);
  });

  it('mean simulated team turnovers matches 1.25 * pace * sum(tier_weight * e.turnovers) within +/-8%', () => {
    const target = analyticTarget('turnovers');
    const observed = mean(tovSamples);
    expect(Math.abs(observed - target) / target).toBeLessThan(0.08);
  });
});
