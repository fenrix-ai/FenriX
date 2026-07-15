import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import players from './data/players.json' with { type: 'json' };
import { nextPhase, HOOKS } from './phases.js';
import { drawMarket, validateSigning, runHardship } from './market.js';
import { cutPlayer, expiringPids, hypeCurve } from './payroll.js';
import { validateBids, resolveAuction } from './auction.js';
import { validateLineup, autoRepair } from './lineup.js';
import { simulateRound, toCsv } from './sim.js';

const ROLES = ['GM', 'Scout', 'Coach'];
const db = () => getFirestore();

const CATALOG = Object.fromEntries(players.map((p) => [p.pid, p]));
const FA_POOL = players.filter((p) => !p.auction_round);

export async function assertProfessor(gameId, uid) {
  const g = await db().doc(`games/${gameId}`).get();
  if (!g.exists) throw new HttpsError('not-found', 'game not found');
  if (g.data().professorUid !== uid) throw new HttpsError('permission-denied', 'professor only');
  return g.data();
}

export const createGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const teamNames = req.data.teamNames ?? [];
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
  const gameRef = db().collection('games').doc();
  const joinCode = gameRef.id.slice(0, 6).toUpperCase();
  const batch = db().batch();
  batch.set(gameRef, {
    joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null,
    professorUid: req.auth.uid, teamCount: teamNames.length,
    standingsSeed: gameRef.id, createdAt: FieldValue.serverTimestamp(),
    config: { cap: 100.0, totalRounds: 5 },
  });
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
    });
  }
  await batch.commit();
  // catalog seed: batched in chunks of 400 (batch limit 500)
  for (let i = 0; i < players.length; i += 400) {
    const b = db().batch();
    for (const p of players.slice(i, i + 400))
      b.set(gameRef.collection('catalog').doc(String(p.pid)), p);
    await b.commit();
  }
  return { gameId: gameRef.id, joinCode };
});

export const joinGame = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const { joinCode, teamId, role, displayName } = req.data;
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'bad role');
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const gameRef = games.docs[0].ref;
  return db().runTransaction(async (tx) => {
    const team = await tx.get(gameRef.collection('teams').doc(teamId));
    if (!team.exists) throw new HttpsError('not-found', 'team not found');
    const taken = await tx.get(gameRef.collection('players')
      .where('teamId', '==', teamId).where('role', '==', role));
    if (!taken.empty && taken.docs[0].id !== req.auth.uid)
      throw new HttpsError('already-exists', `${role} role already taken on that team`);
    tx.set(gameRef.collection('players').doc(req.auth.uid),
      { teamId, role, displayName: String(displayName).slice(0, 24) });
    return { gameId: gameRef.id, teamId, role };
  });
});

export const startSeason = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
  // round-1 market draw (75% of the FA catalog, seeded, identical for all teams;
  // non-exclusive per spec §4.2 — the draw is a shared catalog of signable copies).
  const d = drawMarket({ gameId, round: 1, faPool: FA_POOL, absentCounts: {}, extraPids: [] });
  const batch = db().batch();
  batch.set(db().doc(`games/${gameId}/market/1`),
    { available: d.available, absentCounts: d.absentCounts, unsoldPrices: {} });
  batch.update(db().doc(`games/${gameId}`), { status: 'active', round: 1, phase: 'FREE_AGENCY' });
  await batch.commit();
  return { phase: 'FREE_AGENCY' };
});

// Idempotency guard: each hook firing is recorded in games/{gameId}/hooklog so a
// professor retry after a mid-advance failure (entry hook or final update threw,
// game doc still shows the old phase) never re-fires a hook that already resolved
// — no double auction resolution, no double hardship signings. Missing hooks are
// no-ops and leave no log entry.
async function runHookOnce(gameId, key, hook, round) {
  if (!hook) return;
  const logRef = db().doc(`games/${gameId}/hooklog/${key}`);
  if ((await logRef.get()).exists) return;        // already resolved on a prior attempt
  await hook(gameId, round);
  await logRef.set({ at: FieldValue.serverTimestamp() });
}

export const advancePhase = onCall(async (req) => {
  const { gameId } = req.data;
  const g = await assertProfessor(gameId, req.auth?.uid);
  if (g.status === 'finished') throw new HttpsError('failed-precondition', 'game over');
  // resolve the phase we are LEAVING
  await runHookOnce(gameId, `${g.round}-${g.phase}`, HOOKS[g.phase], g.round);
  const nxt = nextPhase(g.round, g.phase, g.config.totalRounds);
  const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null };
  if (nxt.phase === 'FINALE') update.status = 'finished';
  // e.g. market draw on FREE_AGENCY entry
  await runHookOnce(gameId, `enter-${nxt.round}-${nxt.phase}`, HOOKS[`enter:${nxt.phase}`], nxt.round);
  await db().doc(`games/${gameId}`).update(update);
  return nxt;
});

async function memberWithRole(gameId, uid, role) {
  if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
  const m = await db().doc(`games/${gameId}/players/${uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not in this game');
  if (m.data().role !== role) throw new HttpsError('permission-denied', `${role} only`);
  return m.data();
}

// Free agency is NON-EXCLUSIVE (spec §4.2): the FA pool is a shared catalog — any
// number of teams may sign their own independent copy of the same player, and
// signing never removes a pid from market/{round}.available. Only AUCTION stars are
// exclusive. The transaction still matters within a single team: read/validate/write
// on the team doc is atomic, so a GM double-submitting the same pid re-reads the
// freshest roster and trips ALREADY_SIGNED instead of stacking two copies.
export const signPlayer = onCall(async (req) => {
  const { gameId, pid, years } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    const isResign = g.phase === 'FRONT_OFFICE';
    if (!isResign && g.phase !== 'FREE_AGENCY')
      throw new HttpsError('failed-precondition', 'market is closed');
    const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
    const marketRef = db().doc(`games/${gameId}/market/${g.round}`);
    const team = (await tx.get(teamRef)).data();
    // re-signs never touch the market doc: an expiring pid re-ups off the books,
    // whether or not it happens to also be in this round's drawn market.
    const market = isResign ? null : (await tx.get(marketRef)).data();
    // Unsold auction stars are EXCLUSIVE (spec §4.2: auction stars are the only
    // exclusive players). The star's unsold/{pid} doc is the claim token: it is
    // read and deleted inside this transaction, so the first signer takes him, a
    // same-phase rival loses the transaction race (STAR_TAKEN), and the next
    // enter:FREE_AGENCY draw — which reads the unsold collection — no longer
    // includes him.
    let unsoldRef = null;
    if (!isResign && market?.unsoldPrices?.[pid] != null) {
      unsoldRef = db().doc(`games/${gameId}/unsold/${pid}`);
      if (!(await tx.get(unsoldRef)).exists)
        throw new HttpsError('failed-precondition', 'STAR_TAKEN');
    }
    if (isResign && !expiringPids(team, g.round).includes(pid))
      throw new HttpsError('failed-precondition', 'only expiring contracts re-sign here');
    let contract;
    try {
      ({ contract } = validateSigning({
        team, pid, years, round: g.round,
        marketAvailable: market?.available ?? [], catalogById: CATALOG, isResign,
        unsoldPrices: market?.unsoldPrices ?? {},
      }));
    } catch (e) { throw new HttpsError('failed-precondition', e.message); }
    const roster = team.roster.filter((c) => c.pid !== pid).concat(contract);
    tx.update(teamRef, { roster });
    if (unsoldRef) tx.delete(unsoldRef);   // claim the exclusive star
    return { contract };
  });
});

export const cutRosterPlayer = onCall(async (req) => {
  const { gameId, pid } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (!['FRONT_OFFICE', 'FREE_AGENCY'].includes(g.phase))
      throw new HttpsError('failed-precondition', 'cuts happen in front office or free agency');
    const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
    const team = (await tx.get(teamRef)).data();
    let after;
    try { after = cutPlayer(team, pid, g.round); }
    catch (e) { throw new HttpsError('failed-precondition', e.message); }
    tx.update(teamRef, { roster: after.roster, deadMoney: after.deadMoney });
    return { deadMoney: after.deadMoney };
  });
});

// Scout-only. teamId comes from the caller's own membership doc, never from the
// payload — a Scout has no way to address another team's private bid doc, so this
// endpoint cannot be used to bid on another team's behalf.
export const submitBids = onCall(async (req) => {
  const { gameId, bids } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'Scout');
  const g = (await db().doc(`games/${gameId}`).get()).data();
  if (g.phase !== 'AUCTION') throw new HttpsError('failed-precondition', 'auction is closed');
  const wave = (await db().doc(`games/${gameId}/auctions/${g.round}`).get()).data();
  try { validateBids({ bids, round: g.round, starPids: wave?.stars ?? [] }); }
  catch (e) { throw new HttpsError('invalid-argument', e.message); }
  // A full overwrite (not merge): resubmitting replaces the whole bid set, so a
  // Scout can freely revise before the professor closes the phase. Once AUCTION's
  // exit hook has read this doc there is no further write path back into it.
  await db().doc(`games/${gameId}/teams/${teamId}/private/auction`).set({ bids, round: g.round });
  return { accepted: Object.keys(bids).length };
});

const activePidsOf = (team, round) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round).map((c) => c.pid);

// Coach-only. Validated server-side against the CURRENT roster (activePidsOf at the
// game's live round) so a stale client can never lock in a lineup that no longer
// matches the roster (auction wins / hardship signings since the lineup was drafted).
// Resubmitting overwrites in full — same free-revision pattern as submitBids — until
// the professor closes LINEUP, at which point the exit hook below takes over.
export const submitLineup = onCall(async (req) => {
  const { gameId, lineup } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'Coach');
  const g = (await db().doc(`games/${gameId}`).get()).data();
  if (g.phase !== 'LINEUP') throw new HttpsError('failed-precondition', 'lineups are locked');
  const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
  const team = (await teamRef.get()).data();
  try { validateLineup({ lineup, activePids: activePidsOf(team, g.round), catalogById: CATALOG }); }
  catch (e) { throw new HttpsError('invalid-argument', e.message); }
  await teamRef.update({ lineup, lineupLockedRound: g.round });
  return { ok: true };
});

// -------- phase hooks

HOOKS['enter:FREE_AGENCY'] = async (gameId, round) => {
  if (round === 1) return; // startSeason already drew round 1
  const prev = (await db().doc(`games/${gameId}/market/${round - 1}`).get()).data();
  // unsold auction stars: written by the auction-resolution hook (Task 10) into
  // games/{gameId}/unsold/{pid} = { price }. They're always forced back into the
  // market with that price as their list price until someone signs them.
  const unsoldSnap = await db().collection(`games/${gameId}/unsold`).get();
  const unsoldPrices = {};
  const unsoldPids = [];
  for (const doc of unsoldSnap.docs) {
    const pid = Number(doc.id);
    unsoldPids.push(pid);
    unsoldPrices[pid] = doc.data().price;
  }
  // Non-exclusive FA (spec §4.2): the draw always runs over the FULL catalog —
  // players under contract to some team still appear (other teams may sign their
  // own copies). A team re-upping its own still-active copy is what ALREADY_SIGNED
  // blocks at signing time; the draw itself never filters by contract status.
  const d = drawMarket({ gameId, round, faPool: FA_POOL,
    absentCounts: prev?.absentCounts ?? {}, extraPids: unsoldPids });
  await db().doc(`games/${gameId}/market/${round}`)
    .set({ available: d.available, absentCounts: d.absentCounts, unsoldPrices });
};

HOOKS['FREE_AGENCY'] = async (gameId, round) => {   // exit hook: hardship
  const teamsSnap = await db().collection(`games/${gameId}/teams`).get();
  // Internally idempotent even though runHookOnce already guards re-entry per the
  // brief's own idempotency-log mechanism: skip any team whose hardshipUsed already
  // records this round, both before computing fixes (so a second invocation doesn't
  // even consider an already-fixed team) and again inside each write's transaction
  // (so a true concurrent double-invocation can't double-apply).
  const teams = teamsSnap.docs
    .map((t) => ({ teamId: t.id, ...t.data() }))
    .filter((t) => !(t.hardshipUsed ?? []).includes(round));
  // Non-exclusive FA (spec §4.2): the full catalog is the hardship pool too — two
  // stranded teams may each receive their own copy of the same cheap player.
  // runHardship's per-team `owned` exclusion still stops a single team from holding
  // two copies of one player.
  const fixes = runHardship({ teams, faPool: FA_POOL, round, catalogById: CATALOG });
  for (const f of fixes) {
    const ref = db().doc(`games/${gameId}/teams/${f.teamId}`);
    await db().runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if ((cur.hardshipUsed ?? []).includes(round)) return;
      tx.update(ref, {
        roster: [...cur.roster, ...f.signings],
        hardshipUsed: [...(cur.hardshipUsed ?? []), round],
      });
    });
  }
};

HOOKS['enter:AUCTION'] = async (gameId, round) => {
  const stars = players.filter((p) => +p.auction_round === round).map((p) => p.pid);
  await db().doc(`games/${gameId}/auctions/${round}`).set({ stars });
};

HOOKS['AUCTION'] = async (gameId, round) => {   // exit hook: resolve sealed bids
  const auctionRef = db().doc(`games/${gameId}/auctions/${round}`);
  const wave = (await auctionRef.get()).data();
  // Internally idempotent beyond runHookOnce's log: a retry that lost the hooklog
  // write (hook body ran, but the log write itself failed) must not re-resolve —
  // that would re-push contracts onto rosters a second time and re-create unsold
  // claim tokens that a team may have already claimed via signPlayer in the
  // meantime. `results` on the auctions/{round} doc is this hook's own completion
  // marker, checked before any writes happen.
  if (wave?.results) return;
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const bids = [];
  for (const t of teams) {
    const priv = await db().doc(`games/${gameId}/teams/${t.teamId}/private/auction`).get();
    if (!priv.exists || priv.data().round !== round) continue;
    for (const [pid, b] of Object.entries(priv.data().bids ?? {}))
      bids.push({ teamId: t.teamId, pid: Number(pid), rate: b.rate, years: b.years });
  }
  const { awards, teamsAfter } = resolveAuction({ bids, starPids: wave.stars, teams,
    round, seed: gameId, catalogById: CATALOG });
  const batch = db().batch();
  for (const t of teamsAfter)
    batch.update(db().doc(`games/${gameId}/teams/${t.teamId}`), { roster: t.roster });
  batch.update(auctionRef, { results: awards });
  // Unsold stars fall through to next round's FA rotation. enter:FREE_AGENCY (above)
  // reads games/{gameId}/unsold/{pid} = { price } to build unsoldPrices/extraPids —
  // field name confirmed against that reader (doc.data().price), not the `listBase`
  // name from the original draft. signPlayer's transaction treats this doc as the
  // exclusive star's claim token (tx.get + tx.delete on a successful signing).
  for (const a of awards.filter((x) => !x.teamId)) {
    const star = CATALOG[a.pid];
    batch.set(db().doc(`games/${gameId}/unsold/${a.pid}`),
      { price: Math.round(hypeCurve(+star.hype) * 10) / 10 });
  }
  await batch.commit();
};

// exit: repair every non-submitted (or now-illegal) lineup.
// Internally idempotent WITHOUT an extra lineupLockedRound guard: a lineup that
// already validates against the current activePids is left completely untouched —
// autoRepair is only ever called in the catch branch, i.e. only when validateLineup
// threw. So a re-invocation (e.g. a retry that lost the hooklog write) on a team
// whose lineup already passed validation just re-validates the SAME object again,
// re-writes the SAME lineup + lineupLockedRound, and changes nothing. The risk case
// — autoRepair silently reordering an already-legal lineup's bench (it rebuilds
// `rest` sorted by public mins_per_game desc, not the coach's submitted order) —
// never triggers here because autoRepair only runs on lineups that failed to validate.
//
// Why autoRepair can always succeed here — the position-floor invariant chain: by the
// time LINEUP exits, every team's active roster holds >=8 players covering >=2G/2W/1B,
// because (1) cuts are phase-restricted to FRONT_OFFICE/FREE_AGENCY (cutRosterPlayer),
// so nothing is removed between FREE_AGENCY exit and here; (2) validateSigning's
// POSITION_LOCK guard (market.js) keeps ordinary signings from ever locking a roster
// out of covering the 2G/2W/1B starting-five need under the 10-man max; (3) the
// FREE_AGENCY exit hook's runHardship closes the 2G/2W/1B + >=8 floor from the full
// FA_POOL for any team still short; and (4) auction resolution (HOOKS['AUCTION']) is
// strictly additive — it only pushes contracts onto rosters, never removes them.
// That chain spans four files, so defense-in-depth below: the repaired lineup is
// re-validated before it is written, and a failure crashes the hook loudly at the
// source instead of silently persisting broken data into SIMULATE.
HOOKS['LINEUP'] = async (gameId, round) => {
  const teams = await db().collection(`games/${gameId}/teams`).get();
  for (const t of teams.docs) {
    const team = t.data();
    const active = activePidsOf(team, round);
    let lineup = team.lineup;
    try { validateLineup({ lineup, activePids: active, catalogById: CATALOG }); }
    catch {
      lineup = autoRepair({ prevLineup: team.lineup, activePids: active, catalogById: CATALOG });
      try { validateLineup({ lineup, activePids: active, catalogById: CATALOG }); }
      catch (e) {
        throw new Error(`lineup auto-repair produced an illegal lineup (${e.message}) for team ${t.id} round ${round} — position-floor invariant violated upstream`);
      }
    }
    await t.ref.update({ lineup, lineupLockedRound: round });
  }
};

// enter: simulate the round-robin, persist the round doc (games/awards/standings/CSV),
// and roll each team's record forward.
// Internally idempotent beyond runHookOnce's log: games/{gameId}/rounds/{round} is
// this hook's own completion marker, checked before any writes happen — the same
// pattern as HOOKS['AUCTION']'s `wave?.results` guard. A retry that lost the hooklog
// write (hook body ran, but the log write itself failed) must not re-simulate: the
// per-game rng seed is fixed by gameId+round+teamId pair, so a re-run would recompute
// byte-identical games/box scores, but the team-doc write is an incremental += on
// wins/losses/pointDiff/pointsFor, not an overwrite — a second run would double-count
// every team's record. The rounds/{round} doc existing is proof those team-doc
// updates already landed once.
HOOKS['enter:SIMULATE'] = async (gameId, round) => {
  const roundRef = db().doc(`games/${gameId}/rounds/${round}`);
  if ((await roundRef.get()).exists) return;
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const teams = teamDocs.docs.map((t) => ({ teamId: t.id, ...t.data() }));
  const out = simulateRound({ gameId, round, teams, catalogById: CATALOG });
  const batch = db().batch();
  for (const s of out.standings) {
    batch.update(db().doc(`games/${gameId}/teams/${s.teamId}`),
      { wins: s.wins, losses: s.losses, pointDiff: s.pointDiff, pointsFor: s.pointsFor });
  }
  batch.set(roundRef, {
    games: out.games, awards: out.awards, standings: out.standings,
    boxCsv: toCsv(out.boxRows),
  });
  await batch.commit();
};
