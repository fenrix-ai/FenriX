import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import players from './data/players.json' with { type: 'json' };
import hiddenData from './data/hidden.json' with { type: 'json' };
import engineParams from './data/engine_params.json' with { type: 'json' };
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
    joinCode, status: 'lobby', phase: 'LOBBY', round: 0, timerEndsAt: null, timerPausedMs: null,
    professorUid: req.auth.uid, teamCount: teamNames.length,
    standingsSeed: gameRef.id, createdAt: FieldValue.serverTimestamp(),
    config: { cap: 100.0, totalRounds: 5 },
  });
  for (const name of teamNames) {
    batch.set(gameRef.collection('teams').doc(), {
      name, wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
      roster: [], deadMoney: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
      // "We're done" STATUS FLAG (markDone below): stamped {round, phase} for the
      // professor panel's submission lights. Never a lock — gates nothing.
      doneRound: 0, donePhase: '',
      // append-only ledger of every contract ever acquired (signPlayer incl. re-signs,
      // auction wins, hardship signings) — cuts never remove an entry here, since
      // committed money is never recovered. FINALE's totalSpend/best-worst signing
      // read from this, not from the live `roster`.
      spendLog: [],
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

// Lobby discovery for clients that hold only a join code. Rules (correctly) deny
// every Firestore read to non-members, so the Landing screen cannot list teams or
// open roles on its own — joinGame demands a teamId the client has no legal way to
// learn. Read-only, lobby-safe facts only: names + which roles are taken. Anyone
// signed-in may call it (that is the point — callers are not members yet).
export const getLobby = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const joinCode = String(req.data.joinCode ?? '').toUpperCase();
  const games = await db().collection('games').where('joinCode', '==', joinCode).limit(1).get();
  if (games.empty) throw new HttpsError('not-found', 'bad join code');
  const g = games.docs[0];
  const [teams, members] = await Promise.all(
    [g.ref.collection('teams').get(), g.ref.collection('players').get()]);
  const claimed = {};
  for (const m of members.docs) {
    const d = m.data();
    (claimed[d.teamId] ??= []).push(d.role);
  }
  const { status, phase, round } = g.data();
  return {
    gameId: g.id, status, phase, round,
    teams: teams.docs.map((t) => ({
      teamId: t.id, name: t.data().name, claimedRoles: claimed[t.id] ?? [],
    })),
  };
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
// resumed advance (the `transition` marker in advancePhase below) never re-fires a
// hook that already resolved — no double auction resolution, no double hardship
// signings. Run-then-log is deliberately non-transactional: the flip-first
// advancePhase guarantees at most one live caller per transition (rivals lose the
// flip transaction race), so the only way two invocations ever reach the same key
// is a crash-adoption overlap — and every hook is additionally internally
// idempotent for exactly that case (auction `results`, sim `rounds/{r}`, reveal
// `latest`, hardship `hardshipUsed`; the market draw is seeded-deterministic). A
// hook that ran but lost its log write is re-run on resume and bails on its own
// completion marker. Missing hooks are no-ops and leave no log entry.
async function runHookOnce(gameId, key, hook, round) {
  if (!hook) return;
  const logRef = db().doc(`games/${gameId}/hooklog/${key}`);
  if ((await logRef.get()).exists) return;        // already resolved on a prior attempt
  await hook(gameId, round);
  await logRef.set({ at: FieldValue.serverTimestamp() });
}

// expectedPhase/expectedRound are optional double-click guards: when the caller
// supplies them (Plan 2's client always will), a mismatch against the live game doc
// means a prior advancePhase call already landed — e.g. two rapid clicks racing each
// other — so this call is stale and must not also fire the (now wrong) exit/entry
// hooks. Omitting them preserves old-client/test behavior exactly.
export const advancePhase = onCall(async (req) => {
  const { gameId, expectedPhase, expectedRound } = req.data;
  await assertProfessor(gameId, req.auth?.uid);
  const gameRef = db().doc(`games/${gameId}`);
  // Phase flip happens FIRST, inside a transaction — closing the phase before any
  // resolution work. Firestore serializability then guarantees: (a) a concurrent
  // advancePhase loses the transaction race and gets PHASE_MISMATCH; (b) any
  // signPlayer/cut/submit transaction that read the old phase and commits after
  // this flip is retried by the SDK and sees the closed phase. Both races die here.
  const t = await db().runTransaction(async (tx) => {
    const g = (await tx.get(gameRef)).data();
    if (g.phase === 'LOBBY') throw new HttpsError('failed-precondition', 'season not started');
    // Mismatch check BEFORE adoption, against the CURRENT (possibly already-flipped)
    // round/phase: a concurrent loser carries the stale pre-flip expectations, so it
    // deterministically lands here with PHASE_MISMATCH instead of adopting a
    // transition the live winner is still resolving. Adoption below is reachable
    // only by callers whose expectations match the post-flip state (a crash-retry:
    // the professor's client reads the live game doc, so its retry sends the NEW
    // phase) or by callers that omit expectations (old-client/test behavior).
    if ((expectedPhase != null && expectedPhase !== g.phase)
        || (expectedRound != null && expectedRound !== g.round))
      throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
    // A crashed prior call left hooks unfinished: adopt and finish them instead of
    // advancing again. Adoption is reachable by expectation-less callers (old-client/
    // test behavior) AND matching-expectation callers — quick re-click or crash-retry
    // alike. The flip commit above already updated the professor client's own
    // snapshot to the post-flip phase, so a caller whose expectations MATCH that
    // post-flip state can also adopt mid-hook-window: a quick second click sends the
    // NEW phase, passes the mismatch check above, adopts, and gets the in-flight
    // target back as a benign no-op — not only genuine crash-retries land here.
    // Overlap with a still-live caller's hooks (either adopter kind racing the winner
    // while its hooks are still running) is safe because every hook is internally
    // idempotent — auction `results`, sim `rounds/{r}`, reveal `latest`, hardship
    // `hardshipUsed`, and the market draw is seeded-deterministic (see runHookOnce
    // above). That overlap window is the accepted residual. This check stays BEFORE
    // the finished check: the final RESULTS->FINALE flip sets status: 'finished' in
    // the same transaction, so a crashed finale advance must remain adoptable by a
    // matching/expectation-less retry, not rejected as "game over".
    if (g.transition) return { resume: true, ...g.transition };
    if (g.status === 'finished') throw new HttpsError('failed-precondition', 'game over');
    const nxt = nextPhase(g.round, g.phase, g.config.totalRounds);
    const transition = { fromRound: g.round, fromPhase: g.phase,
                         toRound: nxt.round, toPhase: nxt.phase };
    const update = { round: nxt.round, phase: nxt.phase, timerEndsAt: null, timerPausedMs: null, transition };
    if (nxt.phase === 'FINALE') update.status = 'finished';
    tx.update(gameRef, update);
    return { resume: false, ...transition };
  });
  // Only one live caller reaches here per transition (rivals lost the tx race);
  // hooks resolve the phase we LEFT, then seed the phase we are IN.
  await runHookOnce(gameId, `${t.fromRound}-${t.fromPhase}`, HOOKS[t.fromPhase], t.fromRound);
  await runHookOnce(gameId, `enter-${t.toRound}-${t.toPhase}`, HOOKS[`enter:${t.toPhase}`], t.toRound);
  await gameRef.update({ transition: FieldValue.delete() });
  return { round: t.toRound, phase: t.toPhase };
});

// Timers are ADVISORY pacing only (parent spec §13): expiry never blocks a
// submission server-side — advancing is what closes a phase. This callable moves
// exactly two display fields on the game doc and nothing anywhere enforces them.
// State machine: running (timerEndsAt set, timerPausedMs null) · paused (endsAt
// null, pausedMs set) · off (both null). Every advancePhase flip nulls BOTH.
//
// Callers ALWAYS send expectedPhase + expectedRound (panel contract, same as
// advancePhase): a mismatch against the live doc means the phase advanced under
// the caller's feet, so the stale timer command must not land — PHASE_MISMATCH,
// identical semantics and null-tolerant check shape as advancePhase (game.js:166).
// Errors carry the bare code string as the message (clients match on MESSAGE):
// BAD_TIMER as invalid-argument for a bad `seconds` or unknown action, and as
// failed-precondition for a pause/resume/extend against the wrong timer state.
export const setTimer = onCall(async (req) => {
  const { gameId, action, expectedPhase, expectedRound } = req.data;
  await assertProfessor(gameId, req.auth?.uid);
  const gameRef = db().doc(`games/${gameId}`);
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(gameRef)).data();
    if ((expectedPhase != null && expectedPhase !== g.phase)
        || (expectedRound != null && expectedRound !== g.round))
      throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
    const running = g.timerEndsAt != null;
    const paused = g.timerPausedMs != null;
    let endsAt = g.timerEndsAt ?? null;      // Timestamp | null
    let pausedMs = g.timerPausedMs ?? null;  // number | null
    // Coerce at the callable boundary (same posture as signPlayer's `years`):
    // Number(undefined) and non-numeric strings become NaN, which the integer
    // range checks below reject as BAD_TIMER — no client-supplied non-number
    // ever reaches the Timestamp arithmetic.
    const seconds = Number(req.data.seconds);
    if (action === 'start') {
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
        throw new HttpsError('invalid-argument', 'BAD_TIMER');
      endsAt = Timestamp.fromMillis(Date.now() + seconds * 1000);
      pausedMs = null;
    } else if (action === 'pause') {
      if (!running) throw new HttpsError('failed-precondition', 'BAD_TIMER');
      pausedMs = Math.max(0, endsAt.toMillis() - Date.now());
      endsAt = null;
    } else if (action === 'resume') {
      if (!paused) throw new HttpsError('failed-precondition', 'BAD_TIMER');
      endsAt = Timestamp.fromMillis(Date.now() + pausedMs);
      pausedMs = null;
    } else if (action === 'extend') {
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600)
        throw new HttpsError('invalid-argument', 'BAD_TIMER');
      if (running) endsAt = Timestamp.fromMillis(endsAt.toMillis() + seconds * 1000);
      else if (paused) pausedMs = pausedMs + seconds * 1000;
      else throw new HttpsError('failed-precondition', 'BAD_TIMER');
    } else if (action === 'clear') {
      endsAt = null;   // always succeeds (post-expectation-check)
      pausedMs = null;
    } else {
      throw new HttpsError('invalid-argument', 'BAD_TIMER');
    }
    tx.update(gameRef, { timerEndsAt: endsAt, timerPausedMs: pausedMs });
    return { timerEndsAt: endsAt ? endsAt.toMillis() : null, timerPausedMs: pausedMs };
  });
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
  const { gameId, pid } = req.data;
  // Coerce at the callable boundary: a numeric-string '3' resolves deterministically
  // to the integer 3 (validateSigning's Number.isInteger check then applies to a real
  // number either way); a non-numeric or fractional payload (e.g. '3.5', NaN) becomes
  // Number.NaN / a non-integer, which validateSigning's existing BAD_YEARS guard
  // already rejects — no client-supplied non-number ever reaches contract math.
  const years = Number(req.data.years);
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
    // spendLog is append-only: a re-sign REPLACES the pid's entry in `roster` but
    // still logs a fresh acquisition here — the expired contract's own prior
    // spendLog entry (from when it was first signed) is untouched, so both the old
    // and new commitments count toward totalSpend, exactly like a real cap sheet.
    const spendLog = [...(team.spendLog ?? []), contract];
    tx.update(teamRef, { roster, spendLog });
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

// GM-only "We're done" STATUS FLAG — NEVER a lock (plan-3 design spec §4.2). It
// stamps the caller's team doc with the game's current {round, phase} so the
// professor panel's submission lights can show who considers themselves finished,
// and it gates NOTHING: signPlayer / cutRosterPlayer / every other callable stays
// fully open until the professor closes the phase. No callable may ever read
// doneRound/donePhase as a precondition. Re-pressing is a harmless idempotent
// overwrite of the same values. Transactional so the phase check and the stamp are
// one atomic unit against advancePhase's flip-first transaction (same pattern as
// submitBids/submitLineup): a press racing the flip either lands before it or is
// retried by the SDK, re-reads the closed phase, and throws PHASE_MISMATCH.
export const markDone = onCall(async (req) => {
  const { gameId } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'GM');
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (g.phase !== 'FRONT_OFFICE' && g.phase !== 'FREE_AGENCY')
      throw new HttpsError('failed-precondition', 'PHASE_MISMATCH');
    tx.update(db().doc(`games/${gameId}/teams/${teamId}`),
      { doneRound: g.round, donePhase: g.phase });
    return { ok: true };
  });
});

// Scout-only. teamId comes from the caller's own membership doc, never from the
// payload — a Scout has no way to address another team's private bid doc, so this
// endpoint cannot be used to bid on another team's behalf.
export const submitBids = onCall(async (req) => {
  const { gameId, bids } = req.data;
  const { teamId } = await memberWithRole(gameId, req.auth?.uid, 'Scout');
  // Transactional so the phase check and the bid write are one atomic unit against
  // advancePhase's flip-first transaction: a last-second submit either commits
  // BEFORE the flip (and is visible to the closing hook) or is retried by the SDK,
  // re-reads the closed phase, and throws — never "accepted" yet invisible.
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (g.phase !== 'AUCTION') throw new HttpsError('failed-precondition', 'auction is closed');
    const wave = (await tx.get(db().doc(`games/${gameId}/auctions/${g.round}`))).data();
    try { validateBids({ bids, round: g.round, starPids: wave?.stars ?? [] }); }
    catch (e) { throw new HttpsError('invalid-argument', e.message); }
    // A full overwrite (not merge): resubmitting replaces the whole bid set, so a
    // Scout can freely revise before the professor closes the phase. Once AUCTION's
    // exit hook has read this doc there is no further write path back into it.
    tx.set(db().doc(`games/${gameId}/teams/${teamId}/private/auction`), { bids, round: g.round });
    return { accepted: Object.keys(bids).length };
  });
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
  // Transactional for the same reason as submitBids: the phase check and the
  // lineup write are atomic against advancePhase's flip — a last-second submit
  // either lands before the flip (visible to the LINEUP exit hook) or retries,
  // sees the closed phase, and throws the mapped error.
  return db().runTransaction(async (tx) => {
    const g = (await tx.get(db().doc(`games/${gameId}`))).data();
    if (g.phase !== 'LINEUP') throw new HttpsError('failed-precondition', 'lineups are locked');
    const teamRef = db().doc(`games/${gameId}/teams/${teamId}`);
    const team = (await tx.get(teamRef)).data();
    try { validateLineup({ lineup, activePids: activePidsOf(team, g.round), catalogById: CATALOG }); }
    catch (e) { throw new HttpsError('invalid-argument', e.message); }
    // Persist ONLY the known shape — a validated lineup still might carry extra
    // client-supplied keys (validateLineup destructures what it needs and never
    // objects to siblings), so strip anything beyond {starters, sixth, bench, playstyle}
    // before it lands in the public team doc.
    const { starters, sixth, bench, playstyle } = lineup;
    tx.update(teamRef, { lineup: { starters, sixth, bench, playstyle }, lineupLockedRound: g.round });
    return { ok: true };
  });
});

// -------- phase hooks

// Conscious post-flip seeding window: clients see FREE_AGENCY the instant the flip
// commits, before this hook writes market/{round} — a signPlayer that lands in that
// sub-second gap fails validation cleanly against the not-yet-written doc, and the
// UI simply renders its null-market state until the write lands; self-healing by
// design, same as the enter:FINALE gate-window below.
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
  // Released stars walk back into the rotation (spec §5/§13: an expired-and-declined
  // or cut star "walks and joins the rotation"). Any auction star from an already-held
  // wave with no active contract on any team and no existing unsold claim gets a fresh
  // claim token at the standard hype-curve list price — the same exclusive-claim
  // machinery unsold stars use (signPlayer tx.get+delete, STAR_TAKEN for the loser).
  // Idempotent: re-running recomputes the same set and set() writes the same price.
  const teamsSnap = await db().collection(`games/${gameId}/teams`).get();
  const activePids = new Set();
  for (const t of teamsSnap.docs) {
    for (const c of t.data().roster) {
      if (c.startRound + c.years - 1 >= round) activePids.add(c.pid);
    }
  }
  for (const p of players) {
    if (!p.auction_round || +p.auction_round >= round) continue; // wave not held yet
    if (activePids.has(p.pid)) continue;                          // still under contract
    if (unsoldPrices[p.pid] != null) continue;                    // claim already exists
    const price = Math.round(hypeCurve(+p.hype) * 10) / 10;
    await db().doc(`games/${gameId}/unsold/${p.pid}`).set({ price });
    unsoldPids.push(p.pid);
    unsoldPrices[p.pid] = price;
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
        // f.signings entries already match the spendLog contract shape
        // ({pid, rate, years, startRound, viaAuction, hardship}) — log them verbatim.
        spendLog: [...(cur.spendLog ?? []), ...f.signings],
        hardshipUsed: [...(cur.hardshipUsed ?? []), round],
      });
    });
  }
};

// Conscious post-flip seeding window: clients see AUCTION the instant the flip
// commits, before this hook writes auctions/{round} — a submitBids that lands in
// that sub-second gap fails validation cleanly against the not-yet-written doc, and
// the UI simply renders its null-auction state until the write lands; self-healing
// by design, same as the enter:FINALE gate-window below.
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
    // Defense in depth: submitBids already runs these through validateBids (which
    // itself coerces + rejects non-finite/non-integer numerics) before persisting the
    // private bid doc, but coerce again here so resolveAuction's sort/cap arithmetic
    // never sees a raw client-controlled string even if that doc were ever written
    // some other way.
    for (const [pid, b] of Object.entries(priv.data().bids ?? {}))
      bids.push({ teamId: t.teamId, pid: Number(pid), rate: Number(b.rate), years: Number(b.years) });
  }
  const { awards, teamsAfter } = resolveAuction({ bids, starPids: wave.stars, teams,
    round, seed: gameId, catalogById: CATALOG });
  const batch = db().batch();
  for (const t of teamsAfter)
    batch.update(db().doc(`games/${gameId}/teams/${t.teamId}`), { roster: t.roster, spendLog: t.spendLog });
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

// enter: publish the Reveal payload — the ONLY moment hidden truth (ti, archetype,
// isTrap) leaves the server. Written exclusively here, never earlier; the rules
// (Task 6) also gate reads on status == 'finished', which the flip-first
// advancePhase now sets BEFORE this hook resolves — the gate opens onto a
// not-yet-written doc (a harmless empty read for the brief hook window), and the
// hidden truth itself is only ever written after the gate is already legitimately
// open, so there is still no leak window in either direction.
// Internally idempotent beyond runHookOnce's log (brief's explicit requirement,
// mirroring HOOKS['AUCTION']'s `wave?.results` / HOOKS['enter:SIMULATE']'s
// `roundRef.get()).exists` pattern): reveal/latest existing is this hook's own
// completion marker, checked before any reads/writes.
HOOKS['enter:FINALE'] = async (gameId) => {
  const revealRef = db().doc(`games/${gameId}/reveal/latest`);
  if ((await revealRef.get()).exists) return;
  const teamDocs = await db().collection(`games/${gameId}/teams`).get();
  const scatter = players.map((p) => ({
    pid: p.pid, name: p.name, hype: Number(p.hype),
    salary: p.salary_per_round === '' ? null : Number(p.salary_per_round),
    ti: hiddenData[p.pid].ti,
    // plain boolean — never `|| undefined`. Firestore's admin SDK rejects
    // undefined field values in set() by default (ignoreUndefinedProperties is
    // not configured anywhere in this project), so the ~8-of-10 non-trap
    // archetypes would otherwise crash this write outright.
    isTrap: ['volume_trap', 'aging_legend'].includes(hiddenData[p.pid].archetype ?? ''),
    archetype: hiddenData[p.pid].archetype,
  }));
  const perTeam = [], winsPerDollar = [];
  for (const t of teamDocs.docs) {
    const team = t.data();
    // spendLog, not roster: roster only holds contracts still active/uncut, so a cut
    // or naturally-expired signing would silently drop out of both best/worst-signing
    // contention and totalSpend. spendLog is the append-only ledger of EVERY contract
    // ever acquired, so a bad cut signing stays eligible for "worst", and totalSpend
    // counts the full committed rate*years of every contract — including one that was
    // later cut — because that money is never recovered. That is the game's lesson.
    const spendLog = team.spendLog ?? [];
    const vals = spendLog.map((c) => ({
      pid: c.pid, valuePerDollar: Math.round((hiddenData[c.pid].ti / Math.max(2, c.rate)) * 100) / 100 }));
    vals.sort((a, b) => b.valuePerDollar - a.valuePerDollar);
    perTeam.push({ teamId: t.id, bestSigning: vals[0] ?? null, worstSigning: vals.at(-1) ?? null });
    const spend = spendLog.reduce((s, c) => s + c.rate * c.years, 0);
    winsPerDollar.push({ teamId: t.id, wins: team.wins, totalSpend: Math.round(spend * 10) / 10,
      ratio: Math.round((team.wins / Math.max(1, spend)) * 1000) / 1000 });
  }
  await revealRef.set({
    scatter, perTeam, winsPerDollar,
    trueWeights: {
      narrative: 'Wins came from efficiency, ball security, and defense. Payroll and hype predicted nothing.',
      // the engine's actual turnover weight (ti_weights.turnover, engine_params.json)
      // — what the students' own league_history.csv regression is being checked
      // against. Documented in the Produces interface; the brief's Step 3 code
      // sample omitted it, so this is filled from the same params engine.js already
      // treats as the single source of truth for the TrueImpact formula.
      turnoverWeight: engineParams.ti_weights.turnover,
      defenseVisible: true,
    },
  });
};
