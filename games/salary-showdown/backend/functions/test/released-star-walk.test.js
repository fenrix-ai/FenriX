import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import players from '../src/data/players.json' with { type: 'json' };
import { hypeCurve } from '../src/payroll.js';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitBids, signPlayer, cutRosterPlayer } =
  await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

const byId = Object.fromEntries(players.map((p) => [p.pid, p]));
const wave1 = players.filter((p) => +p.auction_round === 1).map((p) => p.pid);
const r01 = (x) => Math.round(x * 10) / 10;
const listPrice = (pid) => r01(hypeCurve(+byId[pid].hype));

// Task H-C (spec §5/§13): a star's contract ending (expiration-and-decline, or a
// straight cut) must return him to the FA rotation as an unsold-style exclusive
// claim — not vanish. HOOKS['enter:FREE_AGENCY']'s released-star sweep is what
// makes this happen; these tests drive the real phase machine (advancePhase,
// submitBids, signPlayer, cutRosterPlayer) rather than hand-seeding the sweep's
// output, so a regression in the sweep's wiring — not just its math — would fail
// these tests too.
describe('released auction stars walk back into the FA rotation (spec H-C)', () => {
  describe('1. expired-and-not-re-signed star walks', () => {
    let gameId, teamOwner, teamOther, starPid, gmOther, gmOwner;

    beforeAll(async () => {
      const res = await call(createGame, { teamNames: ['Owner', 'Other'] }, 'profH1');
      gameId = res.gameId;
      const teams = await db.collection(`games/${gameId}/teams`).get();
      [teamOwner, teamOther] = teams.docs.map((d) => d.id);
      gmOwner = 'gmOwnerH1';
      gmOther = 'gmOtherH1';
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOwner, role: 'Scout', displayName: 'ScoutOwner' }, 'scoutOwnerH1');
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOwner, role: 'GM', displayName: 'GmOwner' }, gmOwner);
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOther, role: 'GM', displayName: 'GmOther' }, gmOther);
      await call(startSeason, { gameId }, 'profH1');

      // FREE_AGENCY(1) -> AUCTION(1): hardship fills both teams to the >=8, 2G/2W/1B floor.
      await call(advancePhase, { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'profH1');

      starPid = wave1[0];
      // Only bidder: teamOwner's Scout wins the star outright with a 1-year bid.
      await call(submitBids, { gameId, bids: { [starPid]: { rate: 5.0, years: 1 } } }, 'scoutOwnerH1');

      // AUCTION(1) -> LINEUP(1): resolves the sealed bid, awards the star to teamOwner.
      await call(advancePhase, { gameId, expectedPhase: 'AUCTION', expectedRound: 1 }, 'profH1');
      const owner1 = (await db.doc(`games/${gameId}/teams/${teamOwner}`).get()).data();
      expect(owner1.roster.find((c) => c.pid === starPid)).toMatchObject(
        { pid: starPid, rate: 5.0, years: 1, startRound: 1, viaAuction: true });

      // LINEUP(1) -> SIMULATE(1) -> RESULTS(1) -> FRONT_OFFICE(2): both teams' null
      // lineups auto-repair, the round sims, the league rolls into round 2.
      await call(advancePhase, { gameId, expectedPhase: 'LINEUP', expectedRound: 1 }, 'profH1');
      await call(advancePhase, { gameId, expectedPhase: 'SIMULATE', expectedRound: 1 }, 'profH1');
      await call(advancePhase, { gameId, expectedPhase: 'RESULTS', expectedRound: 1 }, 'profH1');

      // In round-2 FRONT_OFFICE, the star is expiring (expiringPids) and eligible for
      // re-sign — deliberately skip it so he walks.
      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 2, phase: 'FRONT_OFFICE' });

      // FRONT_OFFICE(2) -> FREE_AGENCY(2): fires the released-star sweep under test.
      await call(advancePhase, { gameId, expectedPhase: 'FRONT_OFFICE', expectedRound: 2 }, 'profH1');
    });

    it('market/2 carries the expired star as an unsold claim at the standard hype-curve price, and available includes him', async () => {
      const market2 = (await db.doc(`games/${gameId}/market/2`).get()).data();
      expect(market2.unsoldPrices[starPid]).toBe(listPrice(starPid));
      expect(market2.available).toContain(starPid);
      const unsoldDoc = (await db.doc(`games/${gameId}/unsold/${starPid}`).get()).data();
      expect(unsoldDoc).toEqual({ price: listPrice(starPid) });
    });

    it('the other team can now sign him fresh, consuming the claim; any repeat sign attempt this round hits STAR_TAKEN', async () => {
      const { contract } = await call(signPlayer, { gameId, pid: starPid, years: 1 }, gmOther);
      expect(contract.pid).toBe(starPid);
      const other = (await db.doc(`games/${gameId}/teams/${teamOther}`).get()).data();
      expect(other.roster.some((c) => c.pid === starPid)).toBe(true);
      expect((await db.doc(`games/${gameId}/unsold/${starPid}`).get()).exists).toBe(false); // claim consumed

      // signPlayer's exclusive-claim gate (market.unsoldPrices[pid] != null -> the
      // unsold/{pid} doc must still exist) runs unconditionally, before the ordinary
      // ALREADY_SIGNED check — so even the team that just claimed him gets STAR_TAKEN
      // on a repeat attempt this round, exactly like the original unsold-star path
      // (market-flow.test.js's "first signer takes the star" case).
      await expect(call(signPlayer, { gameId, pid: starPid, years: 1 }, gmOther))
        .rejects.toThrow('STAR_TAKEN');

      // The original owner — whose contract on this pid is long expired and thus no
      // longer "active" — is never blocked by that stale history (no phantom
      // ALREADY_SIGNED tied to a contract that's no longer active). He's blocked for
      // the same reason as any other rival: the exclusive claim is gone.
      await expect(call(signPlayer, { gameId, pid: starPid, years: 1 }, gmOwner))
        .rejects.toThrow('STAR_TAKEN');
    });
  });

  describe('2. cut star walks (dead money stays with the cutting team)', () => {
    let gameId, teamOwner, starPid, gmOwner;

    beforeAll(async () => {
      const res = await call(createGame, { teamNames: ['Cutter', 'Bystander'] }, 'profH2');
      gameId = res.gameId;
      const teams = await db.collection(`games/${gameId}/teams`).get();
      [teamOwner] = teams.docs.map((d) => d.id);
      gmOwner = 'gmOwnerH2';
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOwner, role: 'Scout', displayName: 'ScoutCutter' }, 'scoutOwnerH2');
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOwner, role: 'GM', displayName: 'GmCutter' }, gmOwner);
      await call(startSeason, { gameId }, 'profH2');

      await call(advancePhase, { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'profH2');

      starPid = wave1[1];
      // Multi-year bid: covers rounds 1-3.
      await call(submitBids, { gameId, bids: { [starPid]: { rate: 5.0, years: 3 } } }, 'scoutOwnerH2');
      await call(advancePhase, { gameId, expectedPhase: 'AUCTION', expectedRound: 1 }, 'profH2');
      const owner1 = (await db.doc(`games/${gameId}/teams/${teamOwner}`).get()).data();
      expect(owner1.roster.find((c) => c.pid === starPid)).toMatchObject(
        { pid: starPid, rate: 5.0, years: 3, startRound: 1, viaAuction: true });

      await call(advancePhase, { gameId, expectedPhase: 'LINEUP', expectedRound: 1 }, 'profH2');
      await call(advancePhase, { gameId, expectedPhase: 'SIMULATE', expectedRound: 1 }, 'profH2');
      await call(advancePhase, { gameId, expectedPhase: 'RESULTS', expectedRound: 1 }, 'profH2');

      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 2, phase: 'FRONT_OFFICE' });

      // The GM cuts the still-under-contract star in round-2 FRONT_OFFICE — same-round
      // cut, before FREE_AGENCY(2) even opens.
      const { deadMoney } = await call(cutRosterPlayer, { gameId, pid: starPid }, gmOwner);
      expect(deadMoney).toContainEqual({ pid: starPid, rate: 5.0, startRound: 2, endRound: 3 });

      await call(advancePhase, { gameId, expectedPhase: 'FRONT_OFFICE', expectedRound: 2 }, 'profH2');
    });

    it('the cut star reappears in market/2 as an unsold claim, and the cutting team still carries the dead money', async () => {
      const market2 = (await db.doc(`games/${gameId}/market/2`).get()).data();
      expect(market2.unsoldPrices[starPid]).toBe(listPrice(starPid));
      expect(market2.available).toContain(starPid);
      const unsoldDoc = (await db.doc(`games/${gameId}/unsold/${starPid}`).get()).data();
      expect(unsoldDoc).toEqual({ price: listPrice(starPid) });

      const owner2 = (await db.doc(`games/${gameId}/teams/${teamOwner}`).get()).data();
      expect(owner2.roster.some((c) => c.pid === starPid)).toBe(false); // cut removes the roster entry
      expect(owner2.deadMoney).toContainEqual({ pid: starPid, rate: 5.0, startRound: 2, endRound: 3 });
    });
  });

  describe('3. no false re-entry for a still-active auction star', () => {
    let gameId, starPid;

    beforeAll(async () => {
      const res = await call(createGame, { teamNames: ['Keeper', 'Rival'] }, 'profH3');
      gameId = res.gameId;
      const teams = await db.collection(`games/${gameId}/teams`).get();
      const [teamOwner] = teams.docs.map((d) => d.id);
      await call(joinGame, { joinCode: res.joinCode, teamId: teamOwner, role: 'Scout', displayName: 'ScoutKeeper' }, 'scoutOwnerH3');
      await call(startSeason, { gameId }, 'profH3');

      await call(advancePhase, { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 }, 'profH3');

      starPid = wave1[2];
      // Multi-year bid covering rounds 1-3: still active in round 2, nowhere near expiry.
      await call(submitBids, { gameId, bids: { [starPid]: { rate: 5.0, years: 3 } } }, 'scoutOwnerH3');
      await call(advancePhase, { gameId, expectedPhase: 'AUCTION', expectedRound: 1 }, 'profH3');
      await call(advancePhase, { gameId, expectedPhase: 'LINEUP', expectedRound: 1 }, 'profH3');
      await call(advancePhase, { gameId, expectedPhase: 'SIMULATE', expectedRound: 1 }, 'profH3');
      await call(advancePhase, { gameId, expectedPhase: 'RESULTS', expectedRound: 1 }, 'profH3');

      const g = (await db.doc(`games/${gameId}`).get()).data();
      expect(g).toMatchObject({ round: 2, phase: 'FRONT_OFFICE' });
      await call(advancePhase, { gameId, expectedPhase: 'FRONT_OFFICE', expectedRound: 2 }, 'profH3');
    });

    it('a star still under an active multi-year contract never appears in unsoldPrices/available after the sweep', async () => {
      const market2 = (await db.doc(`games/${gameId}/market/2`).get()).data();
      expect(market2.unsoldPrices[starPid]).toBeUndefined();
      expect(market2.available).not.toContain(starPid);
      expect((await db.doc(`games/${gameId}/unsold/${starPid}`).get()).exists).toBe(false);
    });
  });
});
