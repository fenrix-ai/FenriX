import type { Contract, DeadMoney, TeamDoc } from '../types/models';
import { CAP, TOTAL_ROUNDS, r01 } from './money';

export const isActive = (c: Contract, round: number) =>
  round >= c.startRound && round < c.startRound + c.years;
export const activeContracts = (team: TeamDoc, round: number) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round);
export const activePids = (team: TeamDoc, round: number) =>
  activeContracts(team, round).map((c) => c.pid);

const deadAt = (d: DeadMoney, round: number) => round >= d.startRound && round <= d.endRound;

export function payrollSplitAt(team: TeamDoc, round: number) {
  let cash = 0;
  for (const c of team.roster) if (isActive(c, round)) cash += c.rate;
  let dead = 0;
  for (const d of team.deadMoney) if (deadAt(d, round)) dead += d.rate;
  return { cash: r01(cash), dead: r01(dead) };
}
export const payrollAt = (team: TeamDoc, round: number) => {
  const { cash, dead } = payrollSplitAt(team, round);
  return r01(cash + dead);
};

// Mirror of capOkWith: the proposed contract must fit in EVERY covered round.
// A single "after signing" number is not enough (the FA mock oversimplifies) —
// surface worstRound/worstPayroll as "peak payroll $X.XM in round r".
export function capOkWith(team: TeamDoc, contract: Contract) {
  for (let i = 0; i < contract.years; i++) {
    const r = contract.startRound + i;
    if (r > TOTAL_ROUNDS) continue;
    const p = r01(payrollAt(team, r) + contract.rate);
    if (p > CAP + 1e-9) return { ok: false, worstRound: r, worstPayroll: p };
  }
  return { ok: true, worstRound: null as number | null, worstPayroll: null as number | null };
}

// Reserved pid floor for the synthetic "Default Role Player" rows hardship signs.
// SOURCE OF TRUTH: backend/functions/src/synthetics.js (SYNTHETIC_MIN_PID) — the
// backend rejects this whole range in validateSigning and strips it in payroll.js's
// expiringPids. Mirrored here so the client never renders an offer the server would
// refuse. Real datagen pids top out at 1175.
export const SYNTHETIC_MIN_PID = 9000;
export const isSynthetic = (pid: number) => pid >= SYNTHETIC_MIN_PID;

// Mirrors the backend's payroll.js expiringPids, synthetic exclusion included: a
// DRP's 1-round hardship deal expires every round, so without the filter it would
// fill the front office's "Expiring deals" list with contracts that are not
// re-signable at all.
export const expiringPids = (team: TeamDoc, round: number) =>
  team.roster
    .filter((c) => c.startRound + c.years - 1 === round - 1 && !isSynthetic(c.pid))
    .map((c) => c.pid);

// Payroll dollars committed through round R, from the append-only spendLog.
// A cut does NOT reduce this (dead money charges the same schedule) and a re-sign
// does not double-count (old and new contracts never overlap a round).
export const spendThroughRound = (spendLog: Contract[], round: number) =>
  r01(spendLog.reduce((s, c) => {
    const end = Math.min(c.startRound + c.years - 1, round);
    return s + c.rate * Math.max(0, end - c.startRound + 1);
  }, 0));
