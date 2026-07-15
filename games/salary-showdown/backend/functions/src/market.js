import { makeRng } from './rng.js';
import { askPrice, contractRate, capOkWith, CAP, TOTAL_ROUNDS } from './payroll.js';

const DRAW_SHARE = { first: 0.75, later: 0.45 };
// Starting-five position minimum (engine.js's pickLineup uses the same 2G/2W/1B need).
export const LINEUP_NEED = { G: 2, W: 2, B: 1 };

export function drawMarket({ gameId, round, faPool, absentCounts, extraPids = [] }) {
  const rng = makeRng(`${gameId}|market|${round}`);
  const share = round === 1 ? DRAW_SHARE.first : DRAW_SHARE.later;
  const n = Math.floor(faPool.length * share);
  const forced = faPool.filter((p) => (absentCounts[p.pid] ?? 0) >= 2).map((p) => p.pid);
  const others = rng.shuffle(faPool.filter((p) => !forced.includes(p.pid)).map((p) => p.pid));
  const available = [...new Set([...extraPids, ...forced, ...others.slice(0, Math.max(0, n - forced.length))])];
  const next = {};
  for (const p of faPool) next[p.pid] = available.includes(p.pid) ? 0 : (absentCounts[p.pid] ?? 0) + 1;
  return { available, absentCounts: next };
}

export function validateSigning({ team, pid, years, round, marketAvailable, catalogById, isResign, unsoldPrices = {} }) {
  const p = catalogById[pid];
  if (!p) throw new Error('NOT_IN_MARKET');
  const maxYears = TOTAL_ROUNDS - round + 1;
  if (!Number.isInteger(years) || years < 1 || years > maxYears) throw new Error('BAD_YEARS');
  if (!isResign && !marketAvailable.includes(pid)) throw new Error('NOT_IN_MARKET');
  if (team.roster.some((c) => c.pid === pid && c.startRound + c.years - 1 >= round))
    throw new Error('ALREADY_SIGNED');
  const active = team.roster.filter((c) => c.startRound + c.years - 1 >= round);
  if (active.length >= 10) throw new Error('ROSTER_FULL');
  // list price: normal FA carries salary_per_round; an auction-class star that went
  // unsold carries no list price of its own but may have one recorded in unsoldPrices
  // (the price it fetched on the auction floor before falling through to the market).
  const base = Number(p.salary_per_round) || Number(unsoldPrices[pid]) || 0;
  if (!base) throw new Error('NOT_IN_MARKET');
  const rate = contractRate(askPrice(base, round), years);
  const contract = { pid, rate, startRound: round, years, viaAuction: false, hardship: false };
  const cap = capOkWith(team, contract, CAP, TOTAL_ROUNDS);
  if (!cap.ok) throw new Error(`CAP_EXCEEDED:${cap.worstRound}:${cap.worstPayroll}`);
  return { contract };
}

function activeByPos(team, round, catalogById) {
  const counts = { G: 0, W: 0, B: 0 }; let total = 0;
  for (const c of team.roster) {
    if (c.startRound + c.years - 1 < round) continue;
    counts[catalogById[c.pid].position] += 1; total += 1;
  }
  return { counts, total };
}

// Depth bar is intentionally stricter than the 2G/2W/1B starting-five minimum
// (LINEUP_NEED): 3G/3W/2B on an 8-man roster guarantees a bench replacement is
// available at every position, not just exactly enough bodies for a starting five.
// Non-exclusive FA (spec §4.2): two stranded teams may each receive their own copy
// of the same cheap player; the per-team `owned` exclusion only stops a single team
// from holding two copies of one player.
export function runHardship({ teams, faPool, round, catalogById }) {
  const out = [];
  for (const team of teams) {
    const { counts, total } = activeByPos(team, round, catalogById);
    const deficits = { G: Math.max(0, 3 - counts.G), W: Math.max(0, 3 - counts.W), B: Math.max(0, 2 - counts.B) };
    let fill = Math.max(8 - total, deficits.G + deficits.W + deficits.B);
    if (fill <= 0) continue;
    const owned = new Set(team.roster.map((c) => c.pid));
    const cheap = [...faPool].filter((p) => !owned.has(p.pid))
      .sort((a, b) => +a.salary_per_round - +b.salary_per_round);
    const signings = [];
    const take = (pred) => {
      const i = cheap.findIndex(pred);
      if (i === -1) return false;
      const p = cheap.splice(i, 1)[0];
      signings.push({ pid: p.pid, rate: askPrice(+p.salary_per_round, round), startRound: round,
                      years: 1, viaAuction: false, hardship: true });   // cap-exempt by rule
      return true;
    };
    for (const pos of ['G', 'W', 'B'])
      for (let k = 0; k < deficits[pos]; k++) take((p) => p.position === pos);
    while (signings.length < fill) if (!take(() => true)) break;
    if (signings.length) out.push({ teamId: team.teamId, signings });
  }
  return out;
}
