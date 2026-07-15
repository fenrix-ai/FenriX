import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import hiddenData from '../src/data/hidden.json' with { type: 'json' };

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('reveal', () => {
  it('does not exist before finale, exists after with hidden truths', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'A' }, 'gmA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamB, role: 'GM', displayName: 'B' }, 'gmB');
    await call(startSeason, { gameId }, 'prof');

    // Drive the game forward one advancePhase at a time until it reaches round 5's
    // RESULTS phase — the last stop before the RESULTS->FINALE transition. No GM
    // signings/bids/lineups are needed to progress: hardship autofill (FREE_AGENCY
    // exit) and lineup autoRepair (LINEUP exit) cover everything a passive team needs.
    let g = (await db.doc(`games/${gameId}`).get()).data();
    let iterations = 0;
    while (!(g.round === 5 && g.phase === 'RESULTS')) {
      await call(advancePhase, { gameId }, 'prof');
      g = (await db.doc(`games/${gameId}`).get()).data();
      iterations += 1;
      if (iterations > 40) throw new Error('safety cap exceeded — game never reached round 5 RESULTS');
    }

    const before = await db.doc(`games/${gameId}/reveal/latest`).get();
    expect(before.exists).toBe(false); // checked at round 5 RESULTS

    const finalRes = await call(advancePhase, { gameId }, 'prof'); // RESULTS(5) -> FINALE
    expect(finalRes).toEqual({ round: 5, phase: 'FINALE' });
    const finished = (await db.doc(`games/${gameId}`).get()).data();
    expect(finished.status).toBe('finished');

    const after = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
    expect(after.scatter).toHaveLength(175);
    expect(typeof after.scatter[0].ti).toBe('number');
    expect(after.winsPerDollar[0].ratio).toBeGreaterThanOrEqual(0);

    // scatter shape: hidden truth + coerced numbers + trap flag + archetype string
    for (const row of after.scatter) {
      expect(typeof row.pid).toBe('number');
      expect(typeof row.name).toBe('string');
      expect(typeof row.hype).toBe('number');
      expect(typeof row.ti).toBe('number');
      expect(row.salary === null || typeof row.salary === 'number').toBe(true);
      expect(typeof row.isTrap).toBe('boolean'); // never undefined (Firestore rejects it in set())
      expect(typeof row.archetype).toBe('string');
    }
    const trapRow = after.scatter.find((r) => ['volume_trap', 'aging_legend'].includes(r.archetype));
    expect(trapRow.isTrap).toBe(true);
    const nonTrapRow = after.scatter.find((r) => !['volume_trap', 'aging_legend'].includes(r.archetype));
    expect(nonTrapRow.isTrap).toBe(false);

    // perTeam best/worst signing present for both teams
    expect(after.perTeam).toHaveLength(2);
    for (const pt of after.perTeam) {
      expect([teamA, teamB]).toContain(pt.teamId);
    }

    // winsPerDollar covers both teams
    expect(after.winsPerDollar).toHaveLength(2);
    for (const w of after.winsPerDollar) {
      expect([teamA, teamB]).toContain(w.teamId);
      expect(typeof w.wins).toBe('number');
      expect(typeof w.totalSpend).toBe('number');
      expect(typeof w.ratio).toBe('number');
    }

    // trueWeights: narrative verbatim, no emojis, defense-visible flag set
    expect(after.trueWeights.narrative).toBe(
      'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.'
    );
    expect(after.trueWeights.defenseVisible).toBe(true);
    expect(typeof after.trueWeights.turnoverWeight).toBe('number');

    // idempotency: a second enter:FINALE-style write attempt must not clobber the doc
    const { HOOKS } = await import('../src/phases.js');
    await HOOKS['enter:FINALE'](gameId);
    const still = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
    expect(still).toEqual(after);
  });
});

// Spend accounting / dead-money hall of shame: cutting a contract must not make its
// committed money disappear from the finale numbers, and the dead-money entry it
// leaves behind must be traceable back to which player was cut.
describe('reveal: spend accounting survives a cut (dead-money hall of shame)', () => {
  it('totalSpend (from spendLog) still counts a cut contract\'s full rate*years, and deadMoney carries pid', async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    const gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    const [teamA] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'A' }, 'gmA');
    await call(startSeason, { gameId }, 'prof');

    // Sign a multi-round contract, then cut it in the SAME round while it still has
    // real remaining guaranteed money — a genuine mid-contract cut, not a natural expiry.
    const market = (await db.doc(`games/${gameId}/market/1`).get()).data();
    const pid = market.available[0];
    const { contract } = await call(signPlayer, { gameId, pid, years: 3 }, 'gmA');
    expect(contract.years).toBe(3);
    const { deadMoney } = await call(cutRosterPlayer, { gameId, pid }, 'gmA');
    expect(deadMoney.some((d) => d.pid === pid)).toBe(true); // deadMoney entries carry pid
    // Cut removes it from the live roster immediately (checked right here, NOT after
    // driving to FINALE below — FA is non-exclusive and this pid is no longer
    // "owned" post-cut, so a LATER round's hardship autofill could legitimately
    // re-sign this same team its own fresh copy of it before the game ends; that
    // would be correct game behavior, not something this test should forbid).
    const justAfterCut = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(justAfterCut.roster.some((c) => c.pid === pid)).toBe(false);

    // Drive to round 5 FINALE purely via advancePhase (hardship + auto-repair carry
    // both teams the rest of the way, exactly like the passive-team test above).
    let g = (await db.doc(`games/${gameId}`).get()).data();
    let iterations = 0;
    while (g.phase !== 'FINALE') {
      await call(advancePhase, { gameId }, 'prof');
      g = (await db.doc(`games/${gameId}`).get()).data();
      iterations += 1;
      if (iterations > 40) throw new Error('safety cap exceeded — game never reached FINALE');
    }

    const teamADoc = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    // the cut contract's own spendLog entry is still present (append-only ledger),
    // regardless of anything hardship did with this pid in a later round.
    const cutEntry = teamADoc.spendLog.find((c) => c.pid === pid);
    expect(cutEntry).toMatchObject({ pid, rate: contract.rate, years: 3 });

    const expectedSpend = Math.round(
      teamADoc.spendLog.reduce((s, c) => s + c.rate * c.years, 0) * 10) / 10;
    // sanity: the cut contract's full committed money is a real, non-trivial slice of
    // the team's total spend, so this test would actually fail if totalSpend silently
    // dropped it (e.g. by reverting to a roster-only computation).
    expect(contract.rate * contract.years).toBeGreaterThan(0);

    const reveal = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
    const wpd = reveal.winsPerDollar.find((w) => w.teamId === teamA);
    expect(wpd.totalSpend).toBe(expectedSpend);
    expect(wpd.totalSpend).toBeGreaterThanOrEqual(Math.round(contract.rate * contract.years * 10) / 10);

    // perTeam best/worst signing iterates spendLog too (not roster), so the cut pid
    // is a real candidate — replicate game.js's exact fold over spendLog and confirm
    // the published best/worst match it, which only holds if spendLog (not roster,
    // which no longer contains the cut pid) is really what's being iterated.
    const vals = teamADoc.spendLog.map((c) => ({
      pid: c.pid, valuePerDollar: Math.round((hiddenData[c.pid].ti / Math.max(2, c.rate)) * 100) / 100 }));
    vals.sort((a, b) => b.valuePerDollar - a.valuePerDollar);
    const pt = reveal.perTeam.find((p) => p.teamId === teamA);
    expect(pt.bestSigning).toEqual(vals[0]);
    expect(pt.worstSigning).toEqual(vals.at(-1));
    expect(vals.map((v) => v.pid)).toContain(pid); // the cut pid is in the eligible pool at all
  });
});
