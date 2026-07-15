import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase } = await import('../src/game.js');
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
    expect(typeof after.trueWeights.tovPerGame).toBe('number');

    // idempotency: a second enter:FINALE-style write attempt must not clobber the doc
    const { HOOKS } = await import('../src/phases.js');
    await HOOKS['enter:FINALE'](gameId);
    const still = (await db.doc(`games/${gameId}/reveal/latest`).get()).data();
    expect(still).toEqual(after);
  });
});
