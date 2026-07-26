// Pure data -> geometry transforms for the four Finale charts. No React, no DOM:
// everything here is unit-testable arithmetic consumed by the SVG components in
// src/components/charts/ (team laptop debrief, Task 12) and the projector's
// FinaleWall (Task 13).
//
// THE FINALE IS THE SANCTIONED REVEAL (parent spec section 11.14): value-per-
// dollar, wins-per-dollar, trap/bargain labels, and the weights comparison are
// exactly what these transforms exist to compute. The "facts, never conclusions"
// rule and the "bargain award never renders perDollar" rule govern IN-GAME team
// screens (the Results page), not the Finale.
import type { RevealDoc } from '../types/models';

export interface Frame {
  w: number; h: number; padL: number; padR: number; padT: number; padB: number;
}

// Linear-interpolation quantile (numpy's default estimator) — the same one
// datagen's harness.py check2_bargains uses, so the app-side bargain cluster
// reproduces datagen's "check 2" definition exactly.
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const idx = (a.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, a.length - 1);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}
export const median = (xs: number[]): number => quantile(xs, 0.5);

export type ScatterClass = 'trap' | 'bargain' | 'normal';

// The two trap archetypes in backend/functions/src/data/hidden.json — the same
// pair enter:FINALE uses to set isTrap (game.js:574). isTrap is the server
// truth; the archetype strings are a belt-and-suspenders fallback.
const TRAP_ARCHETYPES = ['volume_trap', 'aging_legend'];

// Bargain = datagen harness.py check2_bargains, verbatim in spirit: bottom-half
// salary AND top-quartile TrueImpact. ('elite_defender' is the bargain
// cluster's backbone by pool construction — datagen config.py — but the cluster
// is DEFINED by price vs TrueImpact, not by archetype name.) A null salary
// (auction-class star: no list price) can never be a bargain. Trap wins when a
// row qualifies as both.
export function classifyScatter(rows: RevealDoc['scatter']): Map<number, ScatterClass> {
  const priced = rows.filter((r) => r.salary !== null).map((r) => r.salary as number);
  const salaryMed = median(priced);
  const tiQ3 = quantile(rows.map((r) => r.ti), 0.75);
  const out = new Map<number, ScatterClass>();
  for (const r of rows) {
    if (r.isTrap || TRAP_ARCHETYPES.includes(r.archetype)) out.set(r.pid, 'trap');
    else if (r.salary !== null && r.salary < salaryMed && r.ti >= tiQ3) out.set(r.pid, 'bargain');
    else out.set(r.pid, 'normal');
  }
  return out;
}

const fmtNum = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

export interface Tick { pos: number; label: string }
export interface ScatterPoint {
  pid: number; name: string; hype: number; ti: number; salary: number | null;
  cls: ScatterClass; x: number; y: number;
}
export interface ScatterGeometry {
  points: ScatterPoint[]; xTicks: Tick[]; yTicks: Tick[]; xMax: number; yMax: number;
}

// x = hype on [0, max(10, data max)]; y = TrueImpact on [0, ceil(data max)].
// Null-salary rows (auction stars) are plotted like everyone else — salary only
// matters for bargain classing.
export function scatterGeometry(rows: RevealDoc['scatter'], f: Frame): ScatterGeometry {
  const x0 = f.padL, x1 = f.w - f.padR, y0 = f.padT, y1 = f.h - f.padB;
  const xMax = Math.max(10, ...rows.map((r) => r.hype));
  const yMax = Math.max(1, Math.ceil(Math.max(0, ...rows.map((r) => r.ti))));
  const cls = classifyScatter(rows);
  const points = rows.map((r) => ({
    pid: r.pid, name: r.name, hype: r.hype, ti: r.ti, salary: r.salary,
    cls: cls.get(r.pid) as ScatterClass,
    x: x0 + (r.hype / xMax) * (x1 - x0),
    y: y1 - (r.ti / yMax) * (y1 - y0),
  }));
  const xTicks: Tick[] = [];
  for (let v = 0; v <= xMax; v += 2) {
    xTicks.push({ pos: x0 + (v / xMax) * (x1 - x0), label: String(v) });
  }
  const yTicks: Tick[] = [0, yMax / 2, yMax].map((v) => ({
    pos: y1 - (v / yMax) * (y1 - y0), label: fmtNum(v),
  }));
  return { points, xTicks, yTicks, xMax, yMax };
}

export interface WeightBar {
  key: string; label: string; value: number; valueLabel: string;
  x: number; y: number; w: number; h: number; neg: boolean; note?: string;
}
export interface WeightsGroup {
  title: string; unitLabel: string; boxX: number; zeroX: number; bars: WeightBar[];
}
export interface WeightsGeometry {
  engine: WeightsGroup; regression: WeightsGroup; caption: string;
}

const GUTTER = 36;
const LABEL_W = 96;
const signed = (v: number): string => `${v >= 0 ? '+' : ''}${fmtNum(v)}`;

interface WeightRowIn { key: string; label: string; value: number; valueLabel: string; note?: string }

function groupBars(rows: WeightRowIn[], boxX: number, groupW: number, f: Frame):
  { zeroX: number; bars: WeightBar[] } {
  const span = groupW - LABEL_W;
  const zeroX = boxX + LABEL_W + span / 2;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  const rowH = (f.h - f.padT - f.padB) / rows.length;
  const barH = rowH * 0.6;
  const bars = rows.map((r, i) => {
    const w = (Math.abs(r.value) / maxAbs) * (span / 2);
    const neg = r.value < 0;
    return {
      ...r, neg, w, h: barH,
      x: neg ? zeroX - w : zeroX,
      y: f.padT + i * rowH + (rowH - barH) / 2,
    };
  });
  return { zeroX, bars };
}

// HARD RULE (contracts): the two sides have DIFFERENT units — engine weights
// are TrueImpact points per stat unit; the regression side is R2/coefficient/
// t-statistics recovered from league_history.csv. Each group is normalized to
// ITS OWN max absolute value, drawn around its own zero line. The two sides
// NEVER share an axis.
export function weightsGeometry(tw: RevealDoc['trueWeights'], f: Frame): WeightsGeometry {
  const inner = f.w - f.padL - f.padR;
  const groupW = (inner - GUTTER) / 2;
  const e = tw.engine, r = tw.regression;
  // The engine SUBTRACTS its turnover weight inside the TrueImpact formula
  // (engine_params.json ti_weights); presenting it signed makes both panels
  // tell the same ball-security story.
  const engineRows: WeightRowIn[] = [
    { key: 'base', label: 'Base', value: e.base, valueLabel: signed(e.base) },
    { key: 'scoring', label: 'Scoring', value: e.scoring, valueLabel: signed(e.scoring) },
    { key: 'playmaking', label: 'Playmaking', value: e.playmaking, valueLabel: signed(e.playmaking) },
    { key: 'steal', label: 'Steals', value: e.steal, valueLabel: signed(e.steal) },
    { key: 'block', label: 'Blocks', value: e.block, valueLabel: signed(e.block) },
    { key: 'rebound', label: 'Rebounds', value: e.rebound, valueLabel: signed(e.rebound) },
    { key: 'turnover', label: 'Turnovers', value: -e.turnover, valueLabel: signed(-e.turnover) },
  ];
  const regressionRows: WeightRowIn[] = [
    { key: 'winsR2', label: 'R² (model fit)', value: r.winsR2, valueLabel: r.winsR2.toFixed(2) },
    { key: 'turnoverCoef', label: 'Turnovers (coef)', value: r.turnoverCoef,
      valueLabel: r.turnoverCoef.toFixed(2), note: `p ${r.turnoverP}` },
    { key: 'payrollT', label: 'Payroll (t)', value: r.payrollT, valueLabel: r.payrollT.toFixed(2) },
    { key: 'hypeT', label: 'Hype (t)', value: r.hypeT, valueLabel: r.hypeT.toFixed(2) },
  ];
  const eBox = f.padL;
  const rBox = f.padL + groupW + GUTTER;
  return {
    engine: {
      title: 'Engine weights',
      unitLabel: 'TrueImpact points per unit of stat',
      boxX: eBox, ...groupBars(engineRows, eBox, groupW, f),
    },
    regression: {
      title: 'Class regression',
      unitLabel: 'league_history.csv estimates — R², coefficient, t-statistics',
      boxX: rBox, ...groupBars(regressionRows, rBox, groupW, f),
    },
    caption: 'Each side is scaled to its own units — the two panels never share an axis.',
  };
}

export interface WpdBar {
  teamId: string; name: string; ratio: number; ratioLabel: string; detail: string;
  x: number; y: number; w: number; h: number;
}

const WPD_LABEL_W = 150;

// Sorted bars, best ratio first (ties broken by team name for determinism).
// totalSpend counts every contract ever signed — committed money is never
// recovered (enter:FINALE computes it over spendLog; that is the game's lesson).
export function winsPerDollarGeometry(rows: RevealDoc['winsPerDollar'],
  names: Map<string, string>, f: Frame): WpdBar[] {
  const nameOf = (id: string) => names.get(id) ?? id;
  const sorted = [...rows].sort((a, b) =>
    b.ratio - a.ratio || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
  const span = f.w - f.padL - f.padR - WPD_LABEL_W;
  const maxRatio = Math.max(...sorted.map((r) => r.ratio), 1e-9);
  const rowH = (f.h - f.padT - f.padB) / Math.max(1, sorted.length);
  const barH = rowH * 0.5;
  return sorted.map((r, i) => ({
    teamId: r.teamId, name: nameOf(r.teamId), ratio: r.ratio,
    ratioLabel: r.ratio.toFixed(3),
    detail: `${r.wins} W · $${r.totalSpend.toFixed(1)}M committed`,
    x: f.padL + WPD_LABEL_W,
    y: f.padT + i * rowH + (rowH - barH) / 2,
    w: (r.ratio / maxRatio) * span,
    h: barH,
  }));
}

export interface BestWorstRow {
  teamId: string; team: string;
  best: { pid: number; name: string; vpd: string } | null;
  worst: { pid: number; name: string; vpd: string } | null;
}

// Display rows for the best/worst-signing chart. `order` (usually final
// standings rank order) wins; teams absent from it sink to the bottom; name
// order breaks all remaining ties. valuePerDollar is server-rounded to 2dp
// already; toFixed(2) only stabilizes the string.
export function bestWorstRows(perTeam: RevealDoc['perTeam'],
  teamNames: Map<string, string>, playerNames: Map<number, string>,
  order?: string[]): BestWorstRow[] {
  const pos = (id: string) => {
    const i = order ? order.indexOf(id) : -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sig = (s: { pid: number; valuePerDollar: number } | null) => (s === null ? null : {
    pid: s.pid, name: playerNames.get(s.pid) ?? String(s.pid),
    vpd: s.valuePerDollar.toFixed(2),
  });
  return [...perTeam]
    .map((t) => ({
      teamId: t.teamId, team: teamNames.get(t.teamId) ?? t.teamId,
      best: sig(t.bestSigning), worst: sig(t.worstSigning),
    }))
    .sort((a, b) => pos(a.teamId) - pos(b.teamId) || a.team.localeCompare(b.team));
}
