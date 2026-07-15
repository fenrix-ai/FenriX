import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'salary-showdown-dev',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
                 host: 'localhost', port: 8180 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('games/g1').set({ status: 'active', phase: 'FREE_AGENCY', round: 1, professorUid: 'prof1' });
    await db.doc('games/g1/players/alice').set({ teamId: 't1', role: 'GM', displayName: 'A' });
    await db.doc('games/g1/players/bob').set({ teamId: 't2', role: 'Scout', displayName: 'B' });
    await db.doc('games/g1/teams/t1').set({ name: 'Alpha', wins: 0 });
    await db.doc('games/g1/teams/t1/private/auction').set({ bids: {} });
    await db.doc('games/g1/teams/t2/private/auction').set({ bids: {} });
    await db.doc('games/g1/reveal/latest').set({ secret: true });
    await db.doc('games/g1/hooklog/1-FREE_AGENCY').set({ at: new Date() });
    await db.doc('games/g1/unsold/1004').set({ price: 20.0 });
    // g2: a finished game, for the POSITIVE reveal-gate direction (kept separate
    // from g1 so the blocked-direction test stays valid regardless of test order).
    await db.doc('games/g2').set({ status: 'finished', phase: 'FINALE', round: 5 });
    await db.doc('games/g2/players/alice').set({ teamId: 't1', role: 'GM', displayName: 'A' });
    await db.doc('games/g2/reveal/latest').set({ secret: true });
  });
});
afterAll(async () => { await env.cleanup(); });

describe('firestore rules', () => {
  it('member reads game + teams, cannot write them', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1').get());
    await assertSucceeds(db.doc('games/g1/teams/t1').get());
    await assertFails(db.doc('games/g1/teams/t1').set({ wins: 99 }));
    await assertFails(db.doc('games/g1').update({ phase: 'RESULTS' }));
  });
  it('own private bids readable, others blocked', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1/teams/t1/private/auction').get());
    await assertFails(db.doc('games/g1/teams/t2/private/auction').get());
  });
  it('reveal blocked while game active; unauthenticated blocked everywhere', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(db.doc('games/g1/reveal/latest').get());
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc('games/g1').get());
  });
  it('user can update only own displayName', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g1/players/alice').update({ displayName: 'Al' }));
    await assertFails(db.doc('games/g1/players/alice').update({ role: 'Coach' }));
    await assertFails(db.doc('games/g1/players/bob').update({ displayName: 'X' }));
  });
  it('reveal readable by member once game is finished (positive gate)', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(db.doc('games/g2/reveal/latest').get());
  });
  it('hooklog is server-only: members can neither read nor write it', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(db.doc('games/g1/hooklog/1-FREE_AGENCY').get());
    await assertFails(db.doc('games/g1/hooklog/1-AUCTION').set({ at: new Date() }));
  });
  it('unsold is server-only: members can neither read nor write it', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(db.doc('games/g1/unsold/1004').get());
    await assertFails(db.doc('games/g1/unsold/1009').set({ price: 15.0 }));
  });
  it('authenticated user cannot create own membership doc directly', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(db.doc('games/g1/players/mallory').set({ teamId: 't1', role: 'GM', displayName: 'M' }));
  });
  it('the professor (non-member uid that created the game) reads game doc, a team doc, a private bid doc, and reveal pre-finish', async () => {
    const db = env.authenticatedContext('prof1').firestore();
    // prof1 has no games/g1/players/{uid} doc — isMember(g1) is false for them; only
    // isProfessor(g1) (professorUid == prof1) can be granting these reads.
    await assertSucceeds(db.doc('games/g1').get());
    await assertSucceeds(db.doc('games/g1/teams/t1').get());
    await assertSucceeds(db.doc('games/g1/teams/t2/private/auction').get()); // NOT their own team
    // g1.status is 'active' (not finished) — the professor bypasses the finished gate.
    await assertSucceeds(db.doc('games/g1/reveal/latest').get());
    // professors get no extra WRITE access — everything stays callable-only.
    await assertFails(db.doc('games/g1/teams/t1').set({ wins: 99 }));
    await assertFails(db.doc('games/g1').update({ phase: 'RESULTS' }));
  });
  it('a random authenticated non-member is still denied everywhere, professor grant or not', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(db.doc('games/g1').get());
    await assertFails(db.doc('games/g1/teams/t1').get());
    await assertFails(db.doc('games/g1/teams/t1/private/auction').get());
    await assertFails(db.doc('games/g1/reveal/latest').get());
    await assertFails(db.doc('games/g1/hooklog/1-FREE_AGENCY').get());
    await assertFails(db.doc('games/g1/unsold/1004').get());
  });
});
