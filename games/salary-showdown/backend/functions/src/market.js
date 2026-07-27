import { makeRng } from './rng.js';
import { askPrice, contractRate, capOkWith, hypeCurve, CAP, TOTAL_ROUNDS } from './payroll.js';
import { SYNTHETIC_MIN_PID } from './synthetics.js';

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
  // Synthetic Default Role Players are NEVER signable through a callable (spec §2,
  // controller ruling 2026-07-26). They are in CATALOG only so hardship contracts
  // resolve a name, and hardship is the sole path onto a roster. Without this guard
  // an expired DRP surfaces as an expiring contract and re-signs off the hype curve
  // (its salary_per_round of '0.0' is falsy, so hypeCurve(1.0) = $2.0/round) as an
  // ORDINARY contract — cheap roster filler that also sheds the `hardship` flag and
  // becomes bargain-eligible again. Guarded here, before the roster/cap checks, so
  // every caller (market signing AND front-office re-sign) is covered at one choke
  // point; expiringPids additionally keeps them out of the re-sign list entirely.
  if (pid >= SYNTHETIC_MIN_PID) throw new Error('NOT_IN_MARKET');
  const maxYears = TOTAL_ROUNDS - round + 1;
  if (!Number.isInteger(years) || years < 1 || years > maxYears) throw new Error('BAD_YEARS');
  if (!isResign && !marketAvailable.includes(pid)) throw new Error('NOT_IN_MARKET');
  if (team.roster.some((c) => c.pid === pid && c.startRound + c.years - 1 >= round))
    throw new Error('ALREADY_SIGNED');
  const active = team.roster.filter((c) => c.startRound + c.years - 1 >= round);
  if (active.length >= 10) throw new Error('ROSTER_FULL');
  // Position feasibility (server-side roster-coverage enforcement): after this
  // signing, the open slots left under the 10-man max must still cover every unmet
  // 2G/2W/1B starting-five need, or the roster could become permanently unable to
  // field a legal lineup. Cutting can never break feasibility (a cut frees at least
  // as many slots as the deficit it adds), so guarding signings suffices; hardship
  // signings target deficits first and inherently satisfy this.
  const countsAfter = { G: 0, W: 0, B: 0 };
  for (const c of active) {
    const pos = catalogById[c.pid]?.position;
    if (pos) countsAfter[pos] += 1;
  }
  countsAfter[p.position] += 1;
  const openSlots = 10 - (active.length + 1);
  const unmet = Object.entries(LINEUP_NEED)
    .reduce((s, [pos, n]) => s + Math.max(0, n - countsAfter[pos]), 0);
  if (unmet > openSlots) throw new Error('POSITION_LOCK');
  // List price: a normal FA carries salary_per_round. An auction-class star carries
  // no list price of its own: re-signing an expiring star prices off the standard
  // hype curve (spec §13 — renewals are ordinary signings at current ask), while a
  // market signing of an UNSOLD star uses the price recorded in unsoldPrices (set
  // when he fell through the auction to the FA rotation).
  const base = Number(p.salary_per_round)
    || (isResign ? hypeCurve(Number(p.hype)) : Number(unsoldPrices[pid]))
    || 0;
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

// Legality bar unchanged (2G/2W/1B minimum + 8-man floor, hard-bounded at 10) —
// but the FILL is redesigned (spec §2, 2026-07-26): every stranded slot signs a
// synthetic $0 "Default Role Player" (synthetics.js), identical for all teams.
// No real FA is ever hardship-drafted anymore; there is nothing to farm and
// payroll displays stay at-or-under the cap. Deficit positions first, flex after;
// distinct pids per team (the same pid MAY appear on different teams).
export function runHardship({ teams, synthetics, round, catalogById }) {
  const out = [];
  for (const team of teams) {
    const { counts, total } = activeByPos(team, round, catalogById);
    const deficits = {
      G: Math.max(0, LINEUP_NEED.G - counts.G),
      W: Math.max(0, LINEUP_NEED.W - counts.W),
      B: Math.max(0, LINEUP_NEED.B - counts.B),
    };
    const need = Math.max(8 - total, deficits.G + deficits.W + deficits.B);
    const fill = Math.min(need, Math.max(0, 10 - total));   // never exceed the 10-man max
    if (fill <= 0) continue;
    // ACTIVE contracts only. The invariant this protects is "one team never holds two
    // copies of the same player AT ONCE" (validateLineup's DUPLICATE_PLAYER works off
    // activePids), and `roster` is never pruned of expired contracts. Matching on the
    // whole roster was harmless when the pool was ~150 real free agents, but the
    // synthetic pool is only 8 rows: every DRP signed in round 1 is still sitting in
    // `roster` (expired) in round 2, so a whole-roster match empties the pool from
    // round 2 onward and hardship silently stops filling — leaving a stranded team
    // with zero actives and crashing the LINEUP hook's auto-repair with BAD_TEMPLATE.
    // Re-issuing the same DRP pid in a later round is the intended behaviour.
    const owned = new Set(team.roster
      .filter((c) => c.startRound + c.years - 1 >= round).map((c) => c.pid));
    const pool = synthetics.filter((p) => !owned.has(p.pid));
    const signings = [];
    const take = (pred) => {
      const i = pool.findIndex(pred);
      if (i === -1) return false;
      const p = pool.splice(i, 1)[0];
      signings.push({ pid: p.pid, rate: 0, startRound: round,
                      years: 1, viaAuction: false, hardship: true });   // $0 by rule (spec §2)
      return true;
    };
    for (const pos of ['G', 'W', 'B'])
      for (let k = 0; k < deficits[pos] && signings.length < fill; k++) take((p) => p.position === pos);
    while (signings.length < fill) if (!take(() => true)) break;
    if (signings.length) out.push({ teamId: team.teamId, signings });
  }
  return out;
}
