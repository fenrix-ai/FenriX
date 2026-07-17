// Seed a demo Salary Showdown game on the emulator suite, via the REAL callables.
// Reads (teamIds, market, phase) go through firebase-admin because the Firestore
// rules deny client reads pre-membership — admin bypasses rules; dev-harness only.
// RULING (restated from Global Constraints): every advancePhase call sends
// expectedPhase + expectedRound. PHASE_MISMATCH means "already advanced": refetch.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(
  join(HERE, '../../backend/functions/src/data/players.json'), 'utf8'));
const byPid = Object.fromEntries(CATALOG.map((p) => [p.pid, p]));

admin.initializeApp({ projectId: 'salary-showdown-dev' });
const adb = admin.firestore();

// ---- CLI ------------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const target = arg('to', 'R1:FREE_AGENCY');           // e.g. R3:FRONT_OFFICE | FINALE
const fill = arg('fill', 'others');                    // others | all
const nTeams = Number(arg('teams', '4'));
const TEAM_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].slice(0, nTeams);

// ---- one emulator-authed client per persona --------------------------------
async function newClient(name) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'salary-showdown-dev' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5101);
  const cred = await signInAnonymously(auth);
  const call = (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data);
  return { uid: cred.user.uid, call };
}

// ---- money + lineup mirrors (kept local: the script must not import src/) ---
const r01 = (x) => Math.round(x * 10) / 10;
const minBid = (round) => r01(2.0 * 1.08 ** (round - 1));
const activePids = (team, round) =>
  team.roster.filter((c) => c.startRound + c.years - 1 >= round).map((c) => c.pid);

function arrangeLineup(pids) {
  // Minutes-desc greedy 2G/2W/1B, matching the backend's autoRepair ordering.
  const sorted = [...pids].sort(
    (a, b) => Number(byPid[b].mins_per_game) - Number(byPid[a].mins_per_game));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of sorted) {
    const pos = byPid[pid].position;
    if (need[pos] > 0) { starters.push(pid); need[pos] -= 1; }
  }
  const rest = sorted.filter((p) => !starters.includes(p));
  return { starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' };
}

// ---- phase actions for bot-staffed teams ------------------------------------
// Round-1 signing order interleaves positions (G,W,B,G,W,B,G,W) cheapest-first —
// RULING: this can never trip POSITION_LOCK, because the 2G/2W/1B floor is covered
// within the first three signings (same strategy as the backend smoke test).
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];

async function actFreeAgency(gameId, round, bots) {
  if (round !== 1) return; // bots build once on draft night; hardship covers the rest
  const market = (await adb.doc(`games/${gameId}/market/1`).get()).data();
  for (const bot of bots) {
    const pool = { G: [], W: [], B: [] };
    for (const pid of market.available) pool[byPid[pid].position].push(byPid[pid]);
    for (const pos of ['G', 'W', 'B'])
      pool[pos].sort((a, b) => Number(a.salary_per_round) - Number(b.salary_per_round));
    const used = new Set();
    let i = 0;
    for (const pos of SIGN_ORDER) {
      const p = pool[pos].find((x) => !used.has(x.pid));
      used.add(p.pid);
      const years = (i % 4) + 1; // mixed lengths → expiring-panel and cut material later
      await bot.gm.call('signPlayer', { gameId, pid: p.pid, years });
      i += 1;
    }
  }
}

async function actAuction(gameId, round, bots) {
  const wave = (await adb.doc(`games/${gameId}/auctions/${round}`).get()).data();
  for (const [i, bot] of bots.entries()) {
    const pid = wave.stars[i % wave.stars.length];
    // ALWAYS an object — never null (Global Constraints ruling).
    await bot.scout.call('submitBids',
      { gameId, bids: { [pid]: { rate: minBid(round), years: 1 } } });
  }
}

async function actLineup(gameId, round, bots) {
  for (const bot of bots) {
    const team = (await adb.doc(`games/${gameId}/teams/${bot.teamId}`).get()).data();
    await bot.coach.call('submitLineup',
      { gameId, lineup: arrangeLineup(activePids(team, round)) });
  }
}

// ---- main -------------------------------------------------------------------
const [, tgtRoundS, tgtPhase] = target === 'FINALE'
  ? [null, '5', 'FINALE'] : target.match(/^R([1-5]):([A-Z_]+)$/) ?? [];
if (!tgtPhase) { console.error(`bad --to: ${target}`); process.exit(1); }
const tgtRound = Number(tgtRoundS);

const prof = await newClient('prof');
const { gameId, joinCode } = await prof.call('createGame', { teamNames: TEAM_NAMES });
const teamsSnap = await adb.collection(`games/${gameId}/teams`).get();
const teamIds = TEAM_NAMES.map(
  (n) => teamsSnap.docs.find((d) => d.data().name === n).id);

const botTeamIdx = fill === 'all' ? teamIds.map((_, i) => i)
  : teamIds.map((_, i) => i).slice(1);
const bots = [];
for (const i of botTeamIdx) {
  const [gm, scout, coach] = await Promise.all(
    ['GM', 'Scout', 'Coach'].map((_, k) => newClient(`t${i}-${k}`)));
  await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM ${TEAM_NAMES[i]}` });
  await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `Scout ${TEAM_NAMES[i]}` });
  await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `Coach ${TEAM_NAMES[i]}` });
  bots.push({ teamId: teamIds[i], gm, scout, coach });
}

await prof.call('startSeason', { gameId });

let g = (await adb.doc(`games/${gameId}`).get()).data();
let guard = 0;
while (!(g.phase === tgtPhase && (tgtPhase === 'FINALE' || g.round === tgtRound))) {
  if (g.phase === 'FREE_AGENCY') await actFreeAgency(gameId, g.round, bots);
  if (g.phase === 'AUCTION') await actAuction(gameId, g.round, bots);
  if (g.phase === 'LINEUP') await actLineup(gameId, g.round, bots);
  await prof.call('advancePhase',
    { gameId, expectedPhase: g.phase, expectedRound: g.round });
  g = (await adb.doc(`games/${gameId}`).get()).data();
  guard += 1;
  if (guard > 40) throw new Error(`never reached ${target}; stuck at R${g.round}:${g.phase}`);
  console.log(`  -> R${g.round}:${g.phase}`);
}

writeFileSync(join(HERE, '../.demo-game.json'), JSON.stringify({ gameId, joinCode }, null, 2));
const open = fill === 'all' ? 'none' : `Team "${TEAM_NAMES[0]}": GM, Scout, Coach`;
console.log([
  '', `Seeded game at R${g.round}:${g.phase}`, `  gameId:   ${gameId}`,
  `  joinCode: ${joinCode}`, `  open seats: ${open}`,
  `  join at:  http://localhost:5176/`, '',
].join('\n'));
process.exit(0);
