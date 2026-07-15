export const CAP = 100.0;
export const TOTAL_ROUNDS = 5;
export const INFLATION = 1.08;
export const DISCOUNTS = { 1: 1.0, 2: 0.92, 3: 0.85, 4: 0.8, 5: 0.75 };

const r01 = (x) => Math.round(x * 10) / 10;

export const askPrice = (baseRate, round) => r01(baseRate * INFLATION ** (round - 1));
export const contractRate = (ask, years) => r01(ask * DISCOUNTS[years]);
export const minBid = (round) => r01(2.0 * INFLATION ** (round - 1));
export const hypeCurve = (hype) => 2.0 + ((hype - 1.0) / 4.0) ** 1.35 * 24.0;

export const coveredRounds = (c) =>
  Array.from({ length: c.years }, (_, i) => c.startRound + i);

export function payrollAt(team, round) {
  let total = 0;
  for (const c of team.roster)
    if (round >= c.startRound && round < c.startRound + c.years) total += c.rate;
  for (const d of team.deadMoney)
    if (round >= d.startRound && round <= d.endRound) total += d.rate;
  return r01(total);
}

export function capOkWith(team, contract, cap = CAP, totalRounds = TOTAL_ROUNDS) {
  for (const r of coveredRounds(contract)) {
    if (r > totalRounds) continue;
    const p = payrollAt(team, r) + contract.rate;
    if (p > cap + 1e-9) return { ok: false, worstRound: r, worstPayroll: r01(p) };
  }
  return { ok: true, worstRound: null, worstPayroll: null };
}

export function cutPlayer(team, pid, currentRound) {
  const c = team.roster.find((x) => x.pid === pid);
  if (!c) throw new Error(`cut: pid ${pid} not on roster`);
  const endRound = c.startRound + c.years - 1;
  const deadMoney = [...team.deadMoney];
  if (endRound >= currentRound)
    deadMoney.push({ rate: c.rate, startRound: currentRound, endRound });
  return { ...team, roster: team.roster.filter((x) => x.pid !== pid), deadMoney };
}

export function expiringPids(team, round) {
  return team.roster
    .filter((c) => c.startRound + c.years - 1 === round - 1)
    .map((c) => c.pid);
}
