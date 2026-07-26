#!/usr/bin/env node
// Prod smoke test for Salary Showdown — WEB SDK ONLY (no firebase-admin; this
// plan handles no service accounts). Run FROM games/salary-showdown/app so the
// app's installed `firebase` package resolves:
//
//   node scripts/prod-smoke.mjs
//
// Config: parsed from ../.env.production (VITE_FIREBASE_API_KEY /
// _AUTH_DOMAIN / _PROJECT_ID); a process env var of the same name overrides.
//
// What it does (against LIVE prod): 4 anonymous clients (professor + GM +
// Scout + Coach, each its own named initializeApp instance — the web SDK in
// Node shares one auth per app instance, so per-participant apps mirror
// src/itest/harness.ts newClient, minus emulator connects, plus the us-west1
// region pin), prof createGame -> getLobby -> 3 joins on one team ->
// startSeason -> round 1 played for real (FA cheapest-fit x8, auction min bid,
// lineup auto-repair, SIMULATE, RESULTS) -> standings-shape + previousRank:null
// asserts on rounds/1 -> setTimer start/pause/clear round-trip -> rounds 2..5
// driven on SERVER DEFAULTS alone (no submissions: the FREE_AGENCY exit hook
// hardship-signs short rosters and the LINEUP exit auto-repairs, exactly like
// harness driveTo past round 1) -> FINALE, asserting game.status ===
// 'finished' and a MEMBER-readable reveal/latest whose trueWeights.engine
// carries all 7 weights. expectedPhase + expectedRound on EVERY
// advancePhase/setTimer call (hard rule, same as the panel). Prints PASS/FAIL
// per check; exits nonzero on any FAIL.
//
// RUNTIME: ~2-4 minutes against prod. A full 5-round season is ~40 callable
// round-trips and the enter:SIMULATE hook does real work every round.
//
// CLEANUP NOTE: the finished test game is LEFT IN PLACE in prod (plus 4
// anonymous auth users). Deleting requires the Firebase console — this plan
// ships no admin credentials. The script prints the gameId/joinCode so you
// can find it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';

// ---------- config: .env.production, env vars win ----------
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.production');
const parsed = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"#\n]*?)"?\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) parsed[m[1]] = m[2];
  }
}
const cfg = (k) => process.env[k] ?? parsed[k];
const firebaseConfig = {
  apiKey: cfg('VITE_FIREBASE_API_KEY'),
  authDomain: cfg('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: cfg('VITE_FIREBASE_PROJECT_ID'),
};
for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) {
    console.error(`FAIL config — missing ${k}: set VITE_FIREBASE_* env vars or create ${envPath} (T4 writes it)`);
    process.exit(1);
  }
}
console.log(`prod-smoke against project ${firebaseConfig.projectId}`);

// ---------- check plumbing ----------
let passes = 0;
let failures = 0;
function pass(name, detail = '') {
  passes += 1;
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  failures += 1;
  console.error(`FAIL ${name} — ${detail}`);
}
// Flow steps are sequential and dependent: a failed check aborts the rest.
class Abort extends Error {}
async function check(name, fn) {
  try {
    const detail = await fn();
    pass(name, typeof detail === 'string' ? detail : '');
  } catch (e) {
    fail(name, e?.message ?? String(e));
    throw new Abort();
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- clients: harness.ts newClient minus emulator connects ----------
const apps = [];
let n = 0;
async function newClient(name) {
  const app = initializeApp(firebaseConfig, `${name}-${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  const fns = getFunctions(app, 'us-west1'); // T3 pins the prod region
  const cred = await signInAnonymously(auth);
  return {
    uid: cred.user.uid,
    app,
    call: (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data),
  };
}

// ---------- the flow ----------
const r01 = (x) => Math.round(x * 10) / 10;
const minBid = (round) => r01(2.0 * 1.08 ** (round - 1)); // harness.ts minBid
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W']; // harness.ts

let prof, gm, scout, coach, gameId, joinCode, teamAId, profDb, gmDb;

async function run() {
  await check('anonymous auth x4 (prof, GM, Scout, Coach)', async () => {
    prof = await newClient('prof');
    gm = await newClient('gm');
    scout = await newClient('scout');
    coach = await newClient('coach');
    profDb = getFirestore(prof.app);
    // A second Firestore client on the GM's app: the professor bypasses the
    // reveal read gate in rules, so the finale check below must read as a
    // plain MEMBER to prove what students will actually see.
    gmDb = getFirestore(gm.app);
    const uids = [prof.uid, gm.uid, scout.uid, coach.uid];
    assert(uids.every((u) => typeof u === 'string' && u.length > 0), 'missing uid');
    assert(new Set(uids).size === 4, 'uids not distinct — named-app isolation broken');
    return '4 distinct uids';
  });

  await check('createGame', async () => {
    const res = await prof.call('createGame', { teamNames: ['Smoke A', 'Smoke B'] });
    gameId = res.gameId;
    joinCode = res.joinCode;
    assert(typeof gameId === 'string' && gameId.length > 0, 'no gameId');
    assert(/^[A-Z0-9]{6}$/.test(joinCode), `bad joinCode ${joinCode}`);
    return `gameId=${gameId} joinCode=${joinCode}`;
  });

  await check('getLobby (pre-join)', async () => {
    const lobby = await gm.call('getLobby', { joinCode });
    assert(lobby.gameId === gameId, 'lobby gameId mismatch');
    assert(lobby.status === 'lobby' && lobby.phase === 'LOBBY' && lobby.round === 0,
      `expected lobby/LOBBY/0, got ${lobby.status}/${lobby.phase}/${lobby.round}`);
    assert(lobby.teams.length === 2, `expected 2 teams, got ${lobby.teams.length}`);
    const teamA = lobby.teams.find((t) => t.name === 'Smoke A');
    assert(teamA, 'Smoke A missing from lobby');
    assert(teamA.claimedRoles.length === 0, 'roles claimed before any join');
    teamAId = teamA.teamId;
    return `teamAId=${teamAId}`;
  });

  await check('joinGame x3 (GM/Scout/Coach on Smoke A)', async () => {
    await gm.call('joinGame', { joinCode, teamId: teamAId, role: 'GM', displayName: 'Smoke GM' });
    await scout.call('joinGame', { joinCode, teamId: teamAId, role: 'Scout', displayName: 'Smoke Scout' });
    await coach.call('joinGame', { joinCode, teamId: teamAId, role: 'Coach', displayName: 'Smoke Coach' });
    const lobby = await gm.call('getLobby', { joinCode });
    const claimed = lobby.teams.find((t) => t.teamId === teamAId).claimedRoles.slice().sort();
    assert(JSON.stringify(claimed) === JSON.stringify(['Coach', 'GM', 'Scout']),
      `claimedRoles=${JSON.stringify(claimed)}`);
    return 'all 3 seats claimed';
  });

  await check('startSeason -> R1:FREE_AGENCY', async () => {
    const res = await prof.call('startSeason', { gameId });
    assert(res.phase === 'FREE_AGENCY', `startSeason returned ${res.phase}`);
    const g = (await getDoc(doc(profDb, `games/${gameId}`))).data();
    assert(g.status === 'active' && g.phase === 'FREE_AGENCY' && g.round === 1,
      `game doc ${g.status}/${g.phase}/${g.round}`);
    // T4-review closure: callables bypass rules (Admin SDK), so this is the
    // one place the MEMBER read branch of firestore.rules for games/{id} is
    // proven client-side — the read every student screen depends on.
    const gMember = (await getDoc(doc(gmDb, `games/${gameId}`))).data();
    assert(gMember && gMember.phase === 'FREE_AGENCY',
      `member read of game doc failed or stale: ${JSON.stringify(gMember && gMember.phase)}`);
    return 'game doc active/FREE_AGENCY/1 (prof + member reads)';
  });

  await check('FA signings x8 (cheapest-fit, harness driveTo algorithm)', async () => {
    // Reads via the PROF client's web-SDK Firestore (rules: isProfessor reads
    // catalog + market). The harness used adminDb() here — prod has no admin.
    const market = (await getDoc(doc(profDb, `games/${gameId}/market/1`))).data();
    const cat = await getDocs(collection(profDb, `games/${gameId}/catalog`));
    const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
    const pool = { G: [], W: [], B: [] };
    for (const pid of market.available) {
      const p = byPid[pid];
      if (p.salary_per_round !== '') {
        pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
      }
    }
    for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
    const used = new Set();
    let i = 0;
    for (const pos of SIGN_ORDER) { // interleaved -> can never trip POSITION_LOCK
      const p = pool[pos].find((x) => !used.has(x.pid));
      assert(p, `market pool exhausted for position ${pos}`);
      used.add(p.pid);
      await gm.call('signPlayer', { gameId, pid: p.pid, years: (i % 4) + 1 });
      i += 1;
    }
    const team = (await getDoc(doc(profDb, `games/${gameId}/teams/${teamAId}`))).data();
    assert(team.roster.length === 8, `roster has ${team.roster.length}, expected 8`);
    return 'Smoke A roster = 8';
  });

  // HARD RULE (restated): every advancePhase call carries expectedPhase +
  // expectedRound. No exceptions in this script.
  await check('advancePhase FREE_AGENCY -> AUCTION', async () => {
    const res = await prof.call('advancePhase',
      { gameId, expectedPhase: 'FREE_AGENCY', expectedRound: 1 });
    assert(res.phase === 'AUCTION' && res.round === 1, `got R${res.round}:${res.phase}`);
  });

  await check('submitBids (min bid on wave star)', async () => {
    const wave = (await getDoc(doc(profDb, `games/${gameId}/auctions/1`))).data();
    assert(Array.isArray(wave.stars) && wave.stars.length > 0, 'no auction stars');
    await scout.call('submitBids', {
      gameId, bids: { [wave.stars[0]]: { rate: minBid(1), years: 1 } },
    });
    return `bid ${minBid(1)} on star ${wave.stars[0]}`;
  });

  await check('advancePhase AUCTION -> LINEUP', async () => {
    const res = await prof.call('advancePhase',
      { gameId, expectedPhase: 'AUCTION', expectedRound: 1 });
    assert(res.phase === 'LINEUP' && res.round === 1, `got R${res.round}:${res.phase}`);
  });

  // LINEUP: submit nothing — the exit hook's auto-repair carries every team
  // (same as harness driveTo).
  await check('advancePhase LINEUP -> SIMULATE', async () => {
    const res = await prof.call('advancePhase',
      { gameId, expectedPhase: 'LINEUP', expectedRound: 1 });
    assert(res.phase === 'SIMULATE' && res.round === 1, `got R${res.round}:${res.phase}`);
  });

  await check('rounds/1 standings shape + previousRank null', async () => {
    const rd = (await getDoc(doc(profDb, `games/${gameId}/rounds/1`))).data();
    assert(rd, 'rounds/1 missing after SIMULATE entry');
    assert(Array.isArray(rd.standings) && rd.standings.length === 2,
      `standings length ${rd.standings?.length}, expected 2`);
    const ranks = rd.standings.map((s) => s.rank).slice().sort();
    assert(JSON.stringify(ranks) === '[1,2]', `ranks ${JSON.stringify(ranks)}`);
    for (const s of rd.standings) {
      for (const f of ['teamId', 'rank', 'wins', 'losses', 'pointDiff', 'pointsFor']) {
        assert(s[f] !== undefined, `standings row missing ${f}`);
      }
      assert(s.previousRank === null, `previousRank=${JSON.stringify(s.previousRank)}, expected null in round 1`);
    }
    assert(Array.isArray(rd.games) && rd.games.length > 0, 'rounds/1.games empty');
    assert(typeof rd.boxCsv === 'string' && rd.boxCsv.length > 0, 'rounds/1.boxCsv missing');
    return '2 rows, all fields, previousRank null';
  });

  await check('advancePhase SIMULATE -> RESULTS (full round complete)', async () => {
    const res = await prof.call('advancePhase',
      { gameId, expectedPhase: 'SIMULATE', expectedRound: 1 });
    assert(res.phase === 'RESULTS' && res.round === 1, `got R${res.round}:${res.phase}`);
  });

  // HARD RULE (restated): setTimer also carries expectedPhase + expectedRound.
  await check('setTimer start(60) -> pause -> clear round-trip', async () => {
    const started = await prof.call('setTimer',
      { gameId, action: 'start', seconds: 60, expectedPhase: 'RESULTS', expectedRound: 1 });
    assert(typeof started.timerEndsAt === 'number' && started.timerEndsAt > Date.now(),
      `start: timerEndsAt=${started.timerEndsAt}`);
    assert(started.timerPausedMs === null, `start: timerPausedMs=${started.timerPausedMs}`);
    const paused = await prof.call('setTimer',
      { gameId, action: 'pause', expectedPhase: 'RESULTS', expectedRound: 1 });
    assert(paused.timerEndsAt === null, `pause: timerEndsAt=${paused.timerEndsAt}`);
    assert(typeof paused.timerPausedMs === 'number'
      && paused.timerPausedMs > 0 && paused.timerPausedMs <= 60000,
      `pause: timerPausedMs=${paused.timerPausedMs}`);
    const cleared = await prof.call('setTimer',
      { gameId, action: 'clear', expectedPhase: 'RESULTS', expectedRound: 1 });
    assert(cleared.timerEndsAt === null && cleared.timerPausedMs === null,
      `clear: ${JSON.stringify(cleared)}`);
    return `paused with ${paused.timerPausedMs}ms remaining`;
  });

  // Rounds 2..5 on SERVER DEFAULTS ONLY — no signings, no bids, no lineups.
  // That is the real classroom worst case (a table that submits nothing) and
  // it is exactly what harness driveTo does past round 1: the FREE_AGENCY
  // exit hook hardship-signs a short roster and the LINEUP exit hook
  // auto-repairs, so every round still simulates. Expectations stay on every
  // call (hard rule) — they are the only thing keeping a double-advance from
  // silently skipping a phase here.
  const IN_ROUND = ['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP', 'SIMULATE', 'RESULTS'];
  for (let r = 2; r <= 5; r += 1) {
    await check(`round ${r} on server defaults (R${r - 1}:RESULTS -> R${r}:RESULTS)`, async () => {
      const opened = await prof.call('advancePhase',
        { gameId, expectedPhase: 'RESULTS', expectedRound: r - 1 });
      assert(opened.phase === 'FRONT_OFFICE' && opened.round === r,
        `opening round ${r}: got R${opened.round}:${opened.phase}`);
      for (let i = 0; i < IN_ROUND.length - 1; i += 1) {
        const res = await prof.call('advancePhase',
          { gameId, expectedPhase: IN_ROUND[i], expectedRound: r });
        assert(res.phase === IN_ROUND[i + 1] && res.round === r,
          `R${r} ${IN_ROUND[i]} -> ${IN_ROUND[i + 1]}: got R${res.round}:${res.phase}`);
      }
      const rd = (await getDoc(doc(profDb, `games/${gameId}/rounds/${r}`))).data();
      assert(rd, `rounds/${r} missing after SIMULATE entry`);
      assert(Array.isArray(rd.standings) && rd.standings.length === 2,
        `rounds/${r} standings length ${rd.standings?.length}, expected 2`);
      // From round 2 on, previousRank carries last round's table (round 1 is
      // the only round where it is null — asserted above).
      for (const s of rd.standings) {
        assert(typeof s.previousRank === 'number',
          `rounds/${r} previousRank=${JSON.stringify(s.previousRank)}, expected a number`);
      }
      return `rounds/${r} written, previousRank carried`;
    });
  }

  await check('advancePhase R5:RESULTS -> FINALE (season over, status finished)', async () => {
    const res = await prof.call('advancePhase',
      { gameId, expectedPhase: 'RESULTS', expectedRound: 5 });
    assert(res.phase === 'FINALE' && res.round === 5, `got R${res.round}:${res.phase}`);
    const g = (await getDoc(doc(profDb, `games/${gameId}`))).data();
    assert(g.status === 'finished', `game.status=${g.status}, expected finished`);
    assert(g.phase === 'FINALE' && g.round === 5,
      `game doc R${g.round}:${g.phase}, expected R5:FINALE`);
    return 'game doc finished/FINALE/5';
  });

  await check('reveal/latest readable by a MEMBER — trueWeights.engine has 7 keys', async () => {
    // Read with the GM's client, not the professor's: rules let the professor
    // read reveal/* at any time, but a MEMBER only once status == 'finished'.
    // This check therefore proves the enter:FINALE hook's write AND the gate
    // that opens it to students.
    const rv = (await getDoc(doc(gmDb, `games/${gameId}/reveal/latest`))).data();
    assert(rv, 'reveal/latest missing or unreadable by a member after FINALE');
    const engine = rv.trueWeights?.engine;
    assert(engine && typeof engine === 'object', 'trueWeights.engine missing');
    const keys = Object.keys(engine).sort();
    assert(keys.length === 7,
      `trueWeights.engine has ${keys.length} keys (${keys.join(',')}), expected 7`);
    assert(Array.isArray(rv.scatter) && rv.scatter.length > 0, 'reveal.scatter empty');
    assert(Array.isArray(rv.winsPerDollar) && rv.winsPerDollar.length === 2,
      `winsPerDollar length ${rv.winsPerDollar?.length}, expected 2`);
    return `engine weights: ${keys.join(', ')}`;
  });
}

let aborted = false;
try {
  await run();
} catch (e) {
  if (!(e instanceof Abort)) fail('unexpected error', e?.stack ?? String(e));
  aborted = true;
}

console.log('---');
if (gameId) {
  console.log(`CLEANUP NOTE: test game LEFT IN PLACE (finished, at FINALE) — gameId=${gameId} joinCode=${joinCode}.`);
  console.log('Deleting it (and the 4 anonymous auth users) requires the Firebase console;');
  console.log('this plan ships no admin credentials. It is inert and costs nothing while idle.');
}
console.log(`${passes} passed, ${failures} failed${aborted ? ' (aborted at first failure)' : ''}`);
for (const app of apps) await deleteApp(app).catch(() => {});
process.exit(failures > 0 ? 1 : 0); // explicit: open Firestore channels would otherwise hang Node
