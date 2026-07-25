import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, startSeason, advancePhase, setRevealStep } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

// setRevealStep is the professor's projector remote for the FINALE reveal walk.
// Tests run IN ORDER within this describe (vitest default): the first two pin the
// pre-FINALE gate and that the FINALE flip leaves revealStep ABSENT (spec §4.3:
// setRevealStep is the field's ONLY writer; walls default a missing value via
// `?? 0`), the rest exercise the callable in the finished game.
describe('setRevealStep + revealStep field', () => {
  let gameId;

  beforeAll(async () => {
    const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
    gameId = res.gameId;
    await call(startSeason, { gameId }, 'prof');
    // Drive to round 5 RESULTS — the last stop before FINALE (reveal.test.js
    // pattern: passive teams progress on hardship autofill + lineup auto-repair).
    let g = (await db.doc(`games/${gameId}`).get()).data();
    let iterations = 0;
    while (!(g.round === 5 && g.phase === 'RESULTS')) {
      await call(advancePhase, { gameId }, 'prof');
      g = (await db.doc(`games/${gameId}`).get()).data();
      iterations += 1;
      if (iterations > 40) throw new Error('safety cap exceeded — game never reached round 5 RESULTS');
    }
  }, 120000);

  it('rejects before FINALE with PHASE_MISMATCH (failed-precondition), even with a valid step', async () => {
    await expect(call(setRevealStep, { gameId, step: 1 }, 'prof'))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('PHASE_MISMATCH') });
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ round: 5, phase: 'RESULTS' });
    expect(g.revealStep).toBeUndefined(); // field never exists before the first setRevealStep call
  });

  it('RESULTS(5) -> FINALE flip does NOT write revealStep — the field stays absent', async () => {
    const res = await call(advancePhase, { gameId, expectedPhase: 'RESULTS', expectedRound: 5 }, 'prof');
    expect(res).toEqual({ round: 5, phase: 'FINALE' });
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g).toMatchObject({ status: 'finished', round: 5, phase: 'FINALE' });
    expect(g.revealStep).toBeUndefined(); // ABSENT until the first setRevealStep call (spec §4.3)
  });

  it('is professor-only', async () => {
    await expect(call(setRevealStep, { gameId, step: 1 }, 'not-the-prof'))
      .rejects.toMatchObject({ code: 'permission-denied', message: expect.stringContaining('professor') });
    expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBeUndefined(); // rejected call must not create the field
  });

  it('rejects -1, 9, 1.5, and non-numbers with BAD_STEP (invalid-argument), leaving the doc untouched', async () => {
    for (const step of [-1, 9, 1.5, '3', NaN, null, undefined]) {
      await expect(call(setRevealStep, { gameId, step }, 'prof'))
        .rejects.toMatchObject({ code: 'invalid-argument', message: expect.stringContaining('BAD_STEP') });
    }
    const g = (await db.doc(`games/${gameId}`).get()).data();
    expect(g.revealStep).toBeUndefined(); // still absent — no valid write has happened yet
  });

  it('the first setRevealStep call creates the field with the written value; later writes visible too (0 and 8 boundaries included)', async () => {
    const res = await call(setRevealStep, { gameId, step: 3 }, 'prof');
    expect(res).toEqual({ revealStep: 3 });
    // first successful write — revealStep now exists and equals the written value
    expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(3);

    expect(await call(setRevealStep, { gameId, step: 8 }, 'prof')).toEqual({ revealStep: 8 });
    expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(8);

    expect(await call(setRevealStep, { gameId, step: 0 }, 'prof')).toEqual({ revealStep: 0 });
    expect((await db.doc(`games/${gameId}`).get()).data().revealStep).toBe(0);
  });
});
