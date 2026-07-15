import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };
import { validateLineup } from '../src/lineup.js';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitLineup } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));

// Builds a legal { starters[5], sixth, bench[] } (2G/2W/1B, all remaining actives on
// the bench in the given roster order) out of a team's live roster pids.
function legalLineupFrom(activePids, playstyle) {
  const byPos = { G: [], W: [], B: [] };
  for (const pid of activePids) byPos[byId[pid].position].push(pid);
  const starters = [byPos.G[0], byPos.G[1], byPos.W[0], byPos.W[1], byPos.B[0]];
  const rest = activePids.filter((pid) => !starters.includes(pid));
  return { starters, sixth: rest[0], bench: rest.slice(1), playstyle };
}

describe('lineup flow (submission, Coach-only, auto-repair on LINEUP exit)', () => {
  let gameId, teamA, teamB;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    gameId = res.gameId;
    const teams = await db.collection(`games/${gameId}/teams`).get();
    [teamA, teamB] = teams.docs.map((d) => d.id);
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Coach', displayName: 'CoachA' }, 'coachA');
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'GmA' }, 'gmA');
    await call(startSeason, { gameId }, 'prof');
    await call(advancePhase, { gameId }, 'prof'); // FREE_AGENCY(1) -> AUCTION(1): hardship fills both teams to >=8
    await call(advancePhase, { gameId }, 'prof'); // AUCTION(1) -> LINEUP(1): no bids submitted, everything unsold
  });

  it('Coach submits a legal lineup: accepted, roster doc updated, lineupLockedRound set', async () => {
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const activePids = team.roster.map((c) => c.pid); // all signed this round, so all active
    const lineup = legalLineupFrom(activePids, 'Lockdown');
    validateLineup({ lineup, activePids, catalogById: byId }); // sanity: the fixture itself is legal

    const res = await call(submitLineup, { gameId, lineup }, 'coachA');
    expect(res).toEqual({ ok: true });

    const after = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(after.lineup).toEqual(lineup);
    expect(after.lineupLockedRound).toBe(1);
  });

  it('rejects a non-Coach role', async () => {
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const lineup = legalLineupFrom(team.roster.map((c) => c.pid), 'Balanced');
    await expect(call(submitLineup, { gameId, lineup }, 'gmA')).rejects.toThrow(/Coach only/i);
  });

  it('rejects a malformed lineup shape through the callable with invalid-argument, not a raw 500', async () => {
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const lineup = legalLineupFrom(team.roster.map((c) => c.pid), 'Balanced');
    const malformed = { ...lineup, starters: 'not-an-array' }; // would crash a naive [...starters] spread
    await expect(call(submitLineup, { gameId, lineup: malformed }, 'coachA')).rejects.toThrow('BAD_SHAPE');
    await expect(call(submitLineup, { gameId, lineup: malformed }, 'coachA'))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('persists ONLY {starters, sixth, bench, playstyle}, stripping any extra client-supplied keys', async () => {
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const lineup = legalLineupFrom(team.roster.map((c) => c.pid), 'Run & Gun');
    const withExtras = { ...lineup, hacked: true, note: 'not part of the schema' };

    const res = await call(submitLineup, { gameId, lineup: withExtras }, 'coachA');
    expect(res).toEqual({ ok: true });

    const after = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(after.lineup).toEqual(lineup); // exactly the four known fields, nothing extra
    expect(Object.keys(after.lineup).sort()).toEqual(['bench', 'playstyle', 'sixth', 'starters']);
  });
  it('rejects an illegal template through the callable (invalid-argument BAD_TEMPLATE)', async () => {
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const lineup = legalLineupFrom(team.roster.map((c) => c.pid), 'Balanced');
    // break the 2G/2W/1B template deterministically: swap the sixth man with any
    // starter of a DIFFERENT position (one always exists — starters cover all three
    // positions). Set membership is unchanged, so only BAD_TEMPLATE can fire.
    const spare = lineup.sixth;
    const victim = lineup.starters.find((pid) => byId[pid].position !== byId[spare].position);
    const bad = {
      ...lineup,
      starters: lineup.starters.map((pid) => (pid === victim ? spare : pid)),
      sixth: victim,
    };
    await expect(call(submitLineup, { gameId, lineup: bad }, 'coachA')).rejects.toThrow('BAD_TEMPLATE');
    await expect(call(submitLineup, { gameId, lineup: bad }, 'coachA'))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('advancing out of LINEUP leaves the Coach-submitted lineup untouched and auto-repairs teamB, which never submitted', async () => {
    const submittedA = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data().lineup;
    const teamBBefore = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(teamBBefore.lineup).toBeNull(); // teamB's Coach seat was never even filled

    const res = await call(advancePhase, { gameId }, 'prof'); // LINEUP(1) -> SIMULATE(1): fires HOOKS.LINEUP
    expect(res).toEqual({ round: 1, phase: 'SIMULATE' });

    const teamAAfter = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(teamAAfter.lineup).toEqual(submittedA); // untouched — validateLineup passed, autoRepair never ran
    expect(teamAAfter.lineupLockedRound).toBe(1);

    const teamBAfter = (await db.doc(`games/${gameId}/teams/${teamB}`).get()).data();
    expect(teamBAfter.lineup).not.toBeNull();
    expect(teamBAfter.lineupLockedRound).toBe(1);
    const activeB = teamBAfter.roster.map((c) => c.pid);
    validateLineup({ lineup: teamBAfter.lineup, activePids: activeB, catalogById: byId }); // repaired lineup is legal
  });

  it('rejects submitLineup outside the LINEUP phase (failed-precondition)', async () => {
    // the previous test advanced the game to SIMULATE(1) — even a perfectly legal
    // resubmission from the Coach must now bounce off the phase gate.
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    await expect(call(submitLineup, { gameId, lineup: team.lineup }, 'coachA'))
      .rejects.toThrow(/lineups are locked/i);
    await expect(call(submitLineup, { gameId, lineup: team.lineup }, 'coachA'))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
