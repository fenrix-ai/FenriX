import { makeRng } from './rng.js';
import { minBid, capOkWith, CAP, TOTAL_ROUNDS } from './payroll.js';

export function validateBids({ bids, round, starPids }) {
  const maxYears = TOTAL_ROUNDS - round + 1;
  for (const [pidStr, b] of Object.entries(bids ?? {})) {
    const pid = Number(pidStr);
    if (!starPids.includes(pid)) throw new Error('NOT_IN_WAVE');
    // Shape guard: a malformed per-star bid entry (null, or anything not a plain
    // object) must fail as a named, catchable error before any property read — not
    // throw a raw TypeError (e.g. "Cannot read properties of null (reading 'rate')")
    // that submitBids would surface as an uncontrolled 500 instead of invalid-argument.
    if (typeof b !== 'object' || b === null) throw new Error('BAD_SHAPE');
    // Client-supplied numerics are untrusted: coerce before validating so a NaN/string
    // payload fails a named check instead of poisoning downstream arithmetic (a NaN
    // guaranteed-money sort key, e.g., silently breaks resolveAuction's priority order).
    const rate = Number(b.rate);
    const years = Number(b.years);
    if (!Number.isFinite(rate)) throw new Error('BAD_RATE');
    if (!Number.isInteger(years) || years < 1 || years > maxYears) throw new Error('BAD_YEARS');
    if (rate < minBid(round) - 1e-9) throw new Error('MIN_BID');
    if (Math.abs(rate * 10 - Math.round(rate * 10)) > 1e-6) throw new Error('BID_STEP');
  }
}

// Contract: resolveAuction({ bids, starPids, teams, round, seed, catalogById }).
// `starPids` is tonight's FULL wave (every pid with auction_round === round), not
// merely the pids that received a bid — unsold = starPids - sold, so an un-bid star
// still resolves to { teamId: null } instead of vanishing from the results. Also
// returns `skips`: one entry per bid passed over for roster/cap reasons AT A MOMENT
// WHEN ITS STAR WAS STILL UNSOLD (i.e. the bid the affected team believes won) — the
// team-private "would-have-won" Results note (spec §1.2).
export function resolveAuction({ bids, starPids, teams, round, seed, catalogById }) {
  const rng = makeRng(`${seed}|auction|${round}`);
  const teamsAfter = teams.map((t) => ({ ...t, roster: [...t.roster], spendLog: [...(t.spendLog ?? [])] }));
  const byTeam = Object.fromEntries(teamsAfter.map((t) => [t.teamId, t]));
  const expanded = bids.map((b) => ({ ...b, guaranteed: Math.round(b.rate * b.years * 10) / 10,
                                      tiebreak: rng.next() }));
  // Global priority order across every bid on every star: highest guaranteed money
  // first, seeded-rng tiebreak second. Iterating in this single sorted order (rather
  // than resolving star-by-star) is what makes a skipped winning bid fall through to
  // the NEXT-highest bid for that SAME star instead of the star going unsold — the
  // loop simply keeps walking until it finds a bid for that pid it can legally award.
  expanded.sort((a, b) => b.guaranteed - a.guaranteed || a.tiebreak - b.tiebreak);
  const sold = new Set();
  const awards = [];
  const skips = [];
  for (const bid of expanded) {
    if (sold.has(bid.pid)) continue;
    const team = byTeam[bid.teamId];
    if (!team) continue; // defensive: bid referencing an unknown team
    const active = team.roster.filter((c) => c.startRound + c.years - 1 >= round);
    // A skip is only "you would have won" when this star is still unsold at this
    // point in the global priority walk — that is precisely the bid the affected
    // team believes won. Recorded for the team-private Results note (spec §1.2);
    // the PUBLIC results never carry these, so sealed-bid privacy holds.
    if (active.length >= 10) { skips.push({ pid: bid.pid, teamId: bid.teamId, reason: 'roster' }); continue; }
    // NOTE: POSITION_LOCK (the 2G/2W/1B feasibility guard) does NOT apply to auction
    // wins. That guard is an FA-signing rule (market.js::validateSigning) protecting
    // a team from painting itself into a corner on ordinary market moves; auction
    // stars are exclusive prizes awarded purely on guaranteed money, cap, and roster
    // room. A team may legally win a star that leaves it position-infeasible.
    const contract = { pid: bid.pid, rate: bid.rate, startRound: round, years: bid.years,
                       viaAuction: true, hardship: false };
    if (!capOkWith(team, contract, CAP, TOTAL_ROUNDS).ok) {
      skips.push({ pid: bid.pid, teamId: bid.teamId, reason: 'cap' });
      continue;
    }
    team.roster.push(contract);
    team.spendLog.push(contract);   // append-only acquisition ledger (Task: dead-money hall of shame)
    sold.add(bid.pid);
    awards.push({ pid: bid.pid, teamId: bid.teamId, rate: bid.rate, years: bid.years,
                  guaranteed: bid.guaranteed });
  }
  for (const pid of starPids) if (!sold.has(pid))
    awards.push({ pid, teamId: null, rate: null, years: null, guaranteed: null });
  return { awards, teamsAfter, skips };
}
