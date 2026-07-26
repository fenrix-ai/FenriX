import {
  bestWorstRows, classifyScatter, median, quantile, scatterGeometry,
  weightsGeometry, winsPerDollarGeometry, type Frame,
} from './revealCharts';
import type { RevealDoc } from '../types/models';

// Fixture builder. Archetype strings are the REAL values from
// backend/functions/src/data/hidden.json (10 archetypes: efficient_star,
// volume_trap, two_way_wing, elite_defender, floor_general, sharpshooter,
// rim_protector, aging_legend, young_riser, journeyman).
const row = (o: Partial<RevealDoc['scatter'][number]>): RevealDoc['scatter'][number] => ({
  pid: 0, name: 'P', hype: 5, salary: 10, ti: 5, isTrap: false, archetype: 'journeyman', ...o,
});
// Priced salaries [20, 4, 18] -> median 18. All ti [8, 9, 2, 9] -> q75 = 9.
const ROWS: RevealDoc['scatter'] = [
  row({ pid: 1, name: 'Pricey', hype: 10, ti: 8, salary: 20, archetype: 'efficient_star' }),
  row({ pid: 2, name: 'Cheap', hype: 2, ti: 9, salary: 4, archetype: 'elite_defender' }),
  row({ pid: 3, name: 'Empty', hype: 9, ti: 2, salary: 18, isTrap: true, archetype: 'volume_trap' }),
  row({ pid: 4, name: 'Star', hype: 6, ti: 9, salary: null, archetype: 'efficient_star' }),
];
const FS: Frame = { w: 700, h: 400, padL: 50, padR: 10, padT: 10, padB: 40 };

test('quantile: linear interpolation (numpy default, matches datagen harness)', () => {
  expect(quantile([8, 9, 2, 9], 0.75)).toBe(9);        // idx 2.25 on [2,8,9,9]
  expect(quantile([1, 10], 0.75)).toBeCloseTo(7.75);   // 1 + 0.75 * 9
  expect(quantile([5], 0.75)).toBe(5);
  expect(Number.isNaN(quantile([], 0.5))).toBe(true);
});

test('median: odd and even counts', () => {
  expect(median([4, 18, 20])).toBe(18);
  expect(median([2, 10])).toBe(6);
});

test('classifyScatter: trap from the server flag, bargain from price vs TrueImpact', () => {
  const cls = classifyScatter(ROWS);
  expect(cls.get(3)).toBe('trap');      // isTrap: true
  expect(cls.get(2)).toBe('bargain');   // 4 < 18 (bottom-half salary) AND 9 >= 9 (top-quartile ti)
  expect(cls.get(1)).toBe('normal');    // 20 is not below the median salary
});

test('classifyScatter: null-salary rows are never bargains', () => {
  // pid 4 has top-quartile ti (9 >= 9) but no list price (auction-class star).
  expect(classifyScatter(ROWS).get(4)).toBe('normal');
});

test('classifyScatter: trap wins when a trap also sits in the bargain box', () => {
  const rows = [
    row({ pid: 5, isTrap: true, archetype: 'aging_legend', salary: 2, ti: 10 }),
    row({ pid: 6, salary: 10, ti: 1 }),
  ];
  // salary 2 < median 6 and ti 10 >= q75 7.75 -> would be a bargain, but trap wins.
  expect(classifyScatter(rows).get(5)).toBe('trap');
});

test('classifyScatter: archetype fallback marks trap archetypes even if the flag is unset', () => {
  const rows = [row({ pid: 7, isTrap: false, archetype: 'aging_legend' }), row({ pid: 8 })];
  expect(classifyScatter(rows).get(7)).toBe('trap');
  expect(classifyScatter(rows).get(8)).toBe('normal');
});

test('scatterGeometry: plots every row including null salary, exact scaling', () => {
  const g = scatterGeometry(ROWS, FS);
  expect(g.points).toHaveLength(4);                 // null-salary row IS plotted
  expect(g.xMax).toBe(10);
  expect(g.yMax).toBe(9);                           // ceil(max ti 9)
  const pricey = g.points.find((p) => p.pid === 1)!;
  expect(pricey.x).toBeCloseTo(690, 5);             // 50 + (10/10) * 640
  expect(pricey.y).toBeCloseTo(360 - (8 / 9) * 350, 5);
  const cheap = g.points.find((p) => p.pid === 2)!;
  expect(cheap.x).toBeCloseTo(178, 5);              // 50 + (2/10) * 640
  expect(cheap.y).toBeCloseTo(10, 5);               // ti 9 of 9 -> top of plot
  expect(cheap.cls).toBe('bargain');
});

test('scatterGeometry: ticks span the domain', () => {
  const g = scatterGeometry(ROWS, FS);
  expect(g.xTicks.map((t) => t.label)).toEqual(['0', '2', '4', '6', '8', '10']);
  expect(g.xTicks[0].pos).toBeCloseTo(50, 5);
  expect(g.xTicks.at(-1)!.pos).toBeCloseTo(690, 5);
  expect(g.yTicks.map((t) => t.label)).toEqual(['0', '4.5', '9']);
  expect(g.yTicks.map((t) => Math.round(t.pos))).toEqual([360, 185, 10]);
});

test('scatterGeometry: empty input yields empty points and sane domains', () => {
  const g = scatterGeometry([], FS);
  expect(g.points).toEqual([]);
  expect(g.xMax).toBe(10);
  expect(g.yMax).toBe(1);
});

// T5 contract values (reveal_weights.json shape; regression numbers approximate
// the seed-310 harness output: R2 0.70, turnover coef -3.84, payroll t -0.03, hype t 1.37).
const TW: RevealDoc['trueWeights'] = {
  narrative: 'n', defenseVisible: true, turnoverWeight: 1.5,
  engine: { base: 6.0, scoring: 1.6, playmaking: 0.55, steal: 1.05, block: 1.0, rebound: 0.25, turnover: 1.5 },
  regression: { winsR2: 0.7, turnoverCoef: -3.84, turnoverP: '<0.001', payrollT: -0.03, hypeT: 1.37 },
};
const FW: Frame = { w: 700, h: 400, padL: 10, padR: 10, padT: 30, padB: 30 };
// inner 680, gutter 36 -> groupW 322; labelW 96 -> span 226, half-span 113.

test('weightsGeometry: two side-by-side groups, each normalized to ITS OWN max — never a shared axis', () => {
  const g = weightsGeometry(TW, FW);
  expect(g.engine.boxX).toBe(10);
  expect(g.regression.boxX).toBe(368);              // 10 + 322 + 36
  expect(g.engine.zeroX).toBe(219);                 // 10 + 96 + 113
  expect(g.regression.zeroX).toBe(577);             // 368 + 96 + 113
  // Engine normalizes to |6|: base fills the half-span exactly.
  const base = g.engine.bars.find((b) => b.key === 'base')!;
  expect(base.w).toBeCloseTo(113, 5);
  expect(base.neg).toBe(false);
  expect(base.x).toBe(219);
  expect(base.valueLabel).toBe('+6');
  // Regression normalizes to |-3.84|: the turnover coefficient fills ITS half-span.
  const tov = g.regression.bars.find((b) => b.key === 'turnoverCoef')!;
  expect(tov.w).toBeCloseTo(113, 5);
  expect(tov.neg).toBe(true);
  // Same |fraction of group max| would give a DIFFERENT width on a shared axis:
  // 0.7 (R2) is tiny next to 6 but sizeable next to 3.84.
  const r2 = g.regression.bars.find((b) => b.key === 'winsR2')!;
  expect(r2.w).toBeCloseTo((0.7 / 3.84) * 113, 3);
  expect(g.caption).toContain('never share an axis');
});

test('weightsGeometry: engine turnover is presented as a penalty (negative)', () => {
  const g = weightsGeometry(TW, FW);
  const t = g.engine.bars.find((b) => b.key === 'turnover')!;
  expect(t.value).toBe(-1.5);                       // engine SUBTRACTS this weight
  expect(t.neg).toBe(true);
  expect(t.w).toBeCloseTo((1.5 / 6) * 113, 5);
  expect(t.x).toBeCloseTo(219 - (1.5 / 6) * 113, 5);
  expect(t.valueLabel).toBe('-1.5');
});

test('weightsGeometry: labels, p-value note, and DIFFERENT unit labels per side', () => {
  const g = weightsGeometry(TW, FW);
  expect(g.engine.bars.map((b) => b.key)).toEqual(
    ['base', 'scoring', 'playmaking', 'steal', 'block', 'rebound', 'turnover']);
  expect(g.regression.bars.map((b) => b.key)).toEqual(
    ['winsR2', 'turnoverCoef', 'payrollT', 'hypeT']);
  expect(g.regression.bars[1].note).toBe('p <0.001');   // turnoverP is the STRING '<0.001'
  expect(g.regression.bars[0].valueLabel).toBe('0.70');
  expect(g.regression.bars[2].valueLabel).toBe('-0.03');
  expect(g.engine.unitLabel).not.toBe(g.regression.unitLabel);
  expect(g.engine.unitLabel).toContain('TrueImpact points');
  expect(g.regression.unitLabel).toContain('league_history.csv');
});

test('winsPerDollarGeometry: sorted desc with name tiebreak, proportional widths', () => {
  const names = new Map([['t1', 'Alpha'], ['t2', 'Beta'], ['t3', 'Gamma']]);
  const rows: RevealDoc['winsPerDollar'] = [
    { teamId: 't1', wins: 6, totalSpend: 120, ratio: 0.05 },
    { teamId: 't3', wins: 9, totalSpend: 100, ratio: 0.09 },
    { teamId: 't2', wins: 9, totalSpend: 100, ratio: 0.09 },
  ];
  const f: Frame = { w: 700, h: 300, padL: 10, padR: 10, padT: 10, padB: 10 };
  const bars = winsPerDollarGeometry(rows, names, f);
  expect(bars.map((b) => b.name)).toEqual(['Beta', 'Gamma', 'Alpha']); // tie broken by name
  expect(bars[0].w).toBeCloseTo(530, 5);            // span = 700 - 20 - 150 (label gutter)
  expect(bars[2].w).toBeCloseTo((0.05 / 0.09) * 530, 3);
  expect(bars[0].x).toBe(160);                      // padL + label gutter
  expect(bars[0].ratioLabel).toBe('0.090');
  expect(bars[0].detail).toBe('9 W · $100.0M committed');
});

test('winsPerDollarGeometry: all-zero ratios yield zero-width bars, no NaN', () => {
  const f: Frame = { w: 700, h: 300, padL: 10, padR: 10, padT: 10, padB: 10 };
  const bars = winsPerDollarGeometry(
    [{ teamId: 't1', wins: 0, totalSpend: 0, ratio: 0 }], new Map([['t1', 'Alpha']]), f);
  expect(bars[0].w).toBe(0);
  expect(Number.isFinite(bars[0].w)).toBe(true);
});

test('bestWorstRows: rank order, player-name fallback, null signings preserved', () => {
  const perTeam: RevealDoc['perTeam'] = [
    { teamId: 't2', bestSigning: { pid: 7, valuePerDollar: 1.5 },
      worstSigning: { pid: 8, valuePerDollar: 0.2 } },
    { teamId: 't1', bestSigning: null, worstSigning: null },
  ];
  const rows = bestWorstRows(perTeam, new Map([['t1', 'Alpha'], ['t2', 'Beta']]),
    new Map([[7, 'Seven']]), ['t1', 't2']);
  expect(rows.map((r) => r.team)).toEqual(['Alpha', 'Beta']);   // order array wins
  expect(rows[0].best).toBeNull();
  expect(rows[0].worst).toBeNull();
  expect(rows[1].best).toEqual({ pid: 7, name: 'Seven', vpd: '1.50' });
  expect(rows[1].worst).toEqual({ pid: 8, name: '8', vpd: '0.20' }); // pid string fallback
  // No order array -> alphabetical by team name.
  const alpha = bestWorstRows(perTeam, new Map([['t1', 'Zed'], ['t2', 'Beta']]), new Map());
  expect(alpha.map((r) => r.team)).toEqual(['Beta', 'Zed']);
});
