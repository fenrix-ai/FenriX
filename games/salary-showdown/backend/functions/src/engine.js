// The game engine: lineups -> team strength (synergy + zero-mean playstyle deltas) -> games.
//
// This is a line-for-line port of datagen/engine.py — the Python module is the reference
// implementation. Float parity to 1e-9 requires the SAME operations in the SAME order, so
// resist the urge to "clean up" the arithmetic here; match the Python, not idiomatic JS.
import hidden from './data/hidden.json' with { type: 'json' };
import params from './data/engine_params.json' with { type: 'json' };

const TIER = params.tier_weights;             // { starter, sixth, bench }
const SYN = params.synergy;
const TIW = params.ti_weights;                // { base, scoring, ... }
const DELTA = params.style_delta;             // { style: {channel: coef} }
const CONST = params.style_constants;         // { style: {scale, const} }
const PACE = params.pace;
const K = params.logistic_k;

function slots(starters, sixth, bench) {
  const out = starters.map((pid) => [pid, TIER.starter]);
  if (sixth != null) out.push([sixth, TIER.sixth]);
  for (const pid of bench.slice(0, 2)) out.push([pid, TIER.bench]);
  return out;
}

function shooters(starters) {
  return starters.filter((pid) => hidden[pid].attrs.three_pt >= SYN.shooter_3pt_skill).length;
}

function rimScore(starters, sixth) {
  let best = 0;
  for (const pid of sixth != null ? [...starters, sixth] : starters) {
    const h = hidden[pid];
    const s = h.position === 'B' ? h.attrs.defense : h.position === 'W' ? 0.6 * h.attrs.defense : 0;
    if (s > best) best = s;
  }
  return best;
}

export function componentSums(starters, sixth, bench, useDrift) {
  const S = { score: 0, three: 0, interior: 0, defense: 0, tov: 0, big_score: 0,
    guard_score: 0, big_reb: 0, reb_total: 0, play: 0, base: 0, security: 0,
    shooting: 0, stocks: 0, shooters: shooters(starters) };
  for (const [pid, w] of slots(starters, sixth, bench)) {
    const h = hidden[pid], c = h.comps;
    const d = useDrift ? (h.ti_raw ? h.ti / h.ti_raw : 1.0) : 1.0;
    const sc = (c.sv_interior + c.sv_three) * d;
    S.score += w * sc;
    S.three += w * c.sv_three * d;
    S.interior += w * c.sv_interior * d;
    S.defense += w * c.defense * d;
    S.tov += w * c.tov * d;
    S.play += w * c.play * d;
    S.security += w * c.sec_value * d;
    S.shooting += w * c.shooting;
    S.reb_total += w * c.reb_only * d;
    S.stocks += w * c.stocks * d;
    S.base += w * TIW.base;
    if (h.position === 'B') { S.big_score += w * sc; S.big_reb += w * c.reb_only * d; }
    else if (h.position === 'G') { S.guard_score += w * sc; }
  }
  return S;
}

function rawDelta(S, style) {
  let d = 0;
  for (const [key, coef] of Object.entries(DELTA[style] ?? {})) d += coef * S[key];
  if (style === '3PT Barrage' && S.shooters < 3) d += SYN.barrage_misfire;
  return d;
}

function styleDelta(S, style) {
  const p = CONST[style] ?? { scale: 1, const: 0 };
  return p.scale * rawDelta(S, style) + p.const;
}

export function teamStrength(starters, sixth, bench, style = 'Balanced', useDrift = true) {
  const S = componentSums(starters, sixth, bench, useDrift);
  let total = S.base + TIW.scoring * S.score + S.play + S.defense - S.tov + styleDelta(S, style);
  if (S.shooters < 2) total += SYN.spacing_penalty;
  else if (S.shooters >= 3) total += SYN.spacing_bonus;
  const rim = rimScore(starters, sixth);
  if (rim >= SYN.rim_elite) total += SYN.rim_bonus;
  else if (rim < SYN.rim_block_skill) total += SYN.rim_penalty;
  return total;
}

export function winProb(sa, sb, styleA = 'Balanced', styleB = 'Balanced') {
  const kEff = K * ((PACE[styleA] + PACE[styleB]) / 2);
  return 1 / (1 + Math.exp(-kEff * (sa - sb)));
}

export function pickLineup(rosterPids, metricFn) {
  const srt = [...rosterPids].sort((a, b) => metricFn(b) - metricFn(a));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of srt) {
    const pos = hidden[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = srt.filter((p) => !starters.includes(p));
  return { starters, sixth: rest[0] ?? null, bench: rest.slice(1) };
}

export function loadEngine() {
  return { componentSums, teamStrength, winProb, pickLineup, params, hidden };
}
