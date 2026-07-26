// games/salary-showdown/app/scripts/load-drill.mjs
//
// Load drill (Plan 3b T6, the class-date gate): N teams x 3 roles synthetic
// clients + 1 professor driver, run a full scripted season, measure propagation
// and callable latency, and print/emit the PASS table from the contracts.
//
//   node scripts/load-drill.mjs                  # PROD, 21 teams (63 clients)
//   node scripts/load-drill.mjs --teams 4 --dry-run   # emulators, 12 clients
//
// Run from games/salary-showdown/app/ (reuses the app's installed `firebase`).
// WEB SDK ONLY — no firebase-admin anywhere (rule: no admin SDK against prod).
// RULING (restated): every advancePhase AND setTimer call sends
// expectedPhase + expectedRound. No exceptions in this script.
// HARD INVARIANT (Plan 2 T6): listeners attach only AFTER joinGame resolves —
// the game-doc listener never recovers from permission-denied.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');   // games/salary-showdown/app/scripts -> repo root

// ---- CLI --------------------------------------------------------------------
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const DRY_RUN = process.argv.includes('--dry-run');
const TEAMS = Number(argOf('teams', '21'));
if (!Number.isInteger(TEAMS) || TEAMS < 2 || TEAMS > 21) {
  console.error('load-drill: --teams must be an integer 2..21 (21-franchise cap is a UI/runbook rule; this drill honors it too)');
  process.exit(2);
}

const SETTLE_MS = 3000;      // short classroom pacing between actions and the advance
const WATCHDOG_MS = 15000;   // per-flip staleness window
const TEAM_NAMES = Array.from({ length: TEAMS }, (_, i) => `Load ${String(i + 1).padStart(2, '0')}`);

// ---- Firebase config (prod from .env.production; dry-run = emulator suite) ---
function prodConfig() {
  let txt;
  try {
    txt = readFileSync(join(HERE, '..', '.env.production'), 'utf8');
  } catch {
    console.error('load-drill: app/.env.production not found. Prod mode requires T4 (provision + deploy) to be complete. Use --dry-run for emulators.');
    process.exit(2);
  }
  const env = {};
  for (const line of txt.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  for (const k of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID']) {
    if (!env[k]) { console.error(`load-drill: ${k} missing from app/.env.production`); process.exit(2); }
  }
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
  };
}
const CONFIG = DRY_RUN
  ? { apiKey: 'fake-api-key', projectId: 'salary-showdown-dev' }
  : prodConfig();

// ---- metrics registries -------------------------------------------------------
const callableSamples = [];        // { fn, ms, error? }
const flipTimes = new Map();       // 'round:phase' -> driver post-callable Date.now()
const flipDeliveries = new Map();  // 'round:phase' -> Map(clientName -> delivery Date.now())
const flipRows = [];               // { key, n, expected, missing, p50, p95, max }
const listenerErrors = [];         // { client, listener, code }
const deadClients = new Set();     // clients with a fired listener error callback
const staleStrikes = new Map();    // clientName -> missed-ack-window count
const roundsSizes = [];            // { round, bytes }
let snapshotDeliveries = 0;        // upper-bound read counter (collection snaps counted whole)
let catalogReads = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const fmt = (v, unit = '') => (v == null ? '—' : `${v}${unit}`);

async function until(fn, ms, what) {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await sleep(100);
  }
}

// ---- clients ------------------------------------------------------------------
let appN = 0;
async function newClient(name) {
  const app = initializeApp(CONFIG, `${name}-${appN++}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Region pinned per contracts T3; connectFunctionsEmulator below overrides the
  // origin in dry-run, so the region arg is inert there — prod-only effect.
  const fns = getFunctions(app, 'us-west1');
  if (DRY_RUN) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8180);
    connectFunctionsEmulator(fns, '127.0.0.1', 5101);
  }
  const cred = await signInAnonymously(auth);
  const call = async (fn, data) => {
    const t0 = Date.now();
    try {
      const r = await httpsCallable(fns, fn)(data);
      callableSamples.push({ fn, ms: Date.now() - t0 });
      return r.data;
    } catch (e) {
      callableSamples.push({ fn, ms: Date.now() - t0, error: String(e?.code ?? e) });
      throw e;
    }
  };
  return {
    name, uid: cred.user.uid, db, call,
    // mutable per-client state maintained by the listener set:
    gameKey: null, round: 0, phase: 'LOBBY',
    catalog: null, market: null,
    marketRound: null, unsubMarket: null, roundsRound: null, unsubRounds: null,
  };
}

function noteListenerError(c, listener, e) {
  listenerErrors.push({ client: c.name, listener, code: String(e?.code ?? e) });
  deadClients.add(c.name); // any permanently-lost listener would strand a student: count as death
}

function recordFlipDelivery(name, key, t) {
  let m = flipDeliveries.get(key);
  if (!m) { m = new Map(); flipDeliveries.set(key, m); }
  if (!m.has(name)) m.set(name, t);
}

// Dynamic listeners, mirroring the real client: market/{round} keyed on the mapped
// round (GameContext), rounds/{r} only while mapped phase is SIMULATE/RESULTS/FINALE
// (useRoundDoc consumers).
function syncDynamic(c, gameId, round, phase) {
  if (round >= 1 && c.marketRound !== round) {
    if (c.unsubMarket) c.unsubMarket();
    c.marketRound = round;
    c.unsubMarket = onSnapshot(doc(c.db, 'games', gameId, 'market', String(round)),
      (s) => { snapshotDeliveries += 1; c.market = s.exists() ? s.data() : null; },
      (e) => noteListenerError(c, `market/${round}`, e));
  }
  const want = (phase === 'SIMULATE' || phase === 'RESULTS' || phase === 'FINALE') ? round : null;
  if (c.roundsRound !== want) {
    if (c.unsubRounds) { c.unsubRounds(); c.unsubRounds = null; }
    c.roundsRound = want;
    if (want != null) {
      c.unsubRounds = onSnapshot(doc(c.db, 'games', gameId, 'rounds', String(want)),
        () => { snapshotDeliveries += 1; },
        (e) => noteListenerError(c, `rounds/${want}`, e));
    }
  }
}

// The full real-client-mirroring listener set. ONLY call after joinGame resolved.
function attachListeners(c, gameId) {
  let lastKey = null;
  onSnapshot(doc(c.db, 'games', gameId),
    (s) => {
      snapshotDeliveries += 1;
      if (!s.exists()) return;
      const d = s.data();
      // EXACT GameContext transition gate: while the flip-first marker is set,
      // keep presenting the phase we are LEAVING. The flip is only "delivered"
      // to a student when the marker clears — that is the timestamp we take.
      const eff = d.transition
        ? { round: d.transition.fromRound, phase: d.transition.fromPhase }
        : { round: d.round, phase: d.phase };
      const key = `${eff.round}:${eff.phase}`;
      c.round = eff.round; c.phase = eff.phase; c.gameKey = key;
      if (key !== lastKey) { lastKey = key; recordFlipDelivery(c.name, key, Date.now()); }
      syncDynamic(c, gameId, eff.round, eff.phase);
    },
    (e) => noteListenerError(c, 'game', e));
  onSnapshot(doc(c.db, 'games', gameId, 'players', c.uid),
    () => { snapshotDeliveries += 1; },
    (e) => noteListenerError(c, 'membership', e));
  onSnapshot(collection(c.db, 'games', gameId, 'teams'),
    (s) => { snapshotDeliveries += s.size; },
    (e) => noteListenerError(c, 'teams', e));
  void getDocs(collection(c.db, 'games', gameId, 'catalog')).then((snap) => {
    catalogReads += snap.size;
    const m = new Map();
    snap.forEach((d) => m.set(Number(d.id), d.data()));
    c.catalog = m;
  }).catch((e) => noteListenerError(c, 'catalog', e));
}

// ---- harness-mirrored season actions -------------------------------------------
const r01 = (x) => Math.round(x * 10) / 10;
const minBid = (round) => r01(2.0 * 1.08 ** (round - 1));
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];

async function signAllForTeam(bot, gameId) {
  // FA is NON-EXCLUSIVE (standing rule): 21 teams signing the same cheapest pid
  // concurrently is the intended contention pattern, not an error.
  await until(() => bot.gm.catalog, 20000, `${bot.gm.name} catalog`);
  const marketSnap = await getDoc(doc(bot.gm.db, 'games', gameId, 'market', '1'));
  const market = marketSnap.data();
  const pool = { G: [], W: [], B: [] };
  for (const pid of market.available) {
    const p = bot.gm.catalog.get(pid);
    if (p.salary_per_round !== '') pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
  }
  for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
  const used = new Set();
  let i = 0;
  for (const pos of SIGN_ORDER) { // interleaved -> can never trip POSITION_LOCK
    const p = pool[pos].find((x) => !used.has(x.pid));
    used.add(p.pid);
    await bot.gm.call('signPlayer', { gameId, pid: p.pid, years: (i % 4) + 1 });
    i += 1;
  }
}

async function scoutBids(bots, gameId, round) {
  await Promise.all(bots.map(async (bot, i) => {
    const wave = (await getDoc(doc(bot.scout.db, 'games', gameId, 'auctions', String(round)))).data();
    await bot.scout.call('submitBids', { gameId, bids: {
      [wave.stars[i % wave.stars.length]]: { rate: minBid(round), years: 1 } } });
  }));
}

// ---- flip ack collection ---------------------------------------------------------
const metricClients = []; // the 63 bots (driver excluded)

async function waitForFlipAcks(key) {
  const tFlip = flipTimes.get(key);
  const expected = metricClients.filter((c) => !deadClients.has(c.name));
  const deadline = Date.now() + WATCHDOG_MS;
  let m = flipDeliveries.get(key) ?? new Map();
  while (Date.now() < deadline) {
    m = flipDeliveries.get(key) ?? new Map();
    if (expected.every((c) => m.has(c.name))) break;
    await sleep(250);
  }
  m = flipDeliveries.get(key) ?? new Map();
  const missing = expected.filter((c) => !m.has(c.name)).map((c) => c.name);
  for (const nm of missing) staleStrikes.set(nm, (staleStrikes.get(nm) ?? 0) + 1);
  // Deliveries may beat the callable's HTTP response (marker-clear commits before
  // advancePhase returns) — clamp negatives to 0.
  const lats = expected.filter((c) => m.has(c.name))
    .map((c) => Math.max(0, m.get(c.name) - tFlip));
  const row = { key, n: lats.length, expected: expected.length, missing: missing.length,
    p50: pct(lats, 50), p95: pct(lats, 95), max: lats.length ? Math.max(...lats) : null };
  flipRows.push(row);
  console.log(`[flip ${key}] acks ${row.n}/${row.expected}`
    + (row.n ? `  p50=${row.p50}ms p95=${row.p95}ms max=${row.max}ms` : '')
    + (row.missing ? `  MISSING@${WATCHDOG_MS / 1000}s: ${missing.join(',')}` : ''));
}

// ---- main -----------------------------------------------------------------------
async function main() {
  console.log(`Salary Showdown load drill — ${DRY_RUN ? 'DRY-RUN (emulators)' : `PROD (${CONFIG.projectId})`}`
    + ` — ${TEAMS} teams (${TEAMS * 3} clients + driver)`);
  if (!DRY_RUN) console.log('NOTE: creates a throwaway game in prod; residue is acceptable (no admin cleanup — no admin SDK against prod).');

  const driver = await newClient('driver'); // the professor
  const { gameId, joinCode } = await driver.call('createGame', { teamNames: TEAM_NAMES });
  console.log(`createGame OK  gameId=${gameId}  joinCode=${joinCode}`);

  // Professor reads the teams collection under rules (isProfessor) — no admin.
  const teamsSnap = await getDocs(collection(driver.db, 'games', gameId, 'teams'));
  const teamIds = TEAM_NAMES.map(
    (nm) => teamsSnap.docs.find((d) => d.data().name === nm).id);

  const bots = [];
  for (let i = 0; i < TEAMS; i++) {
    const tag = `t${String(i + 1).padStart(2, '0')}`;
    const [gm, scout, coach] = await Promise.all(
      [newClient(`${tag}-gm`), newClient(`${tag}-scout`), newClient(`${tag}-coach`)]);
    await Promise.all([
      gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i + 1}` }),
      scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `S${i + 1}` }),
      coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `C${i + 1}` }),
    ]);
    // HARD INVARIANT: attach only now — joinGame has resolved for all three.
    for (const c of [gm, scout, coach]) { attachListeners(c, gameId); metricClients.push(c); }
    bots.push({ teamId: teamIds[i], gm, scout, coach });
  }
  console.log(`join: ${TEAMS} teams x 3 roles — ${metricClients.length} clients joined, listeners attached`);

  await driver.call('startSeason', { gameId });
  flipTimes.set('1:FREE_AGENCY', Date.now());
  console.log('startSeason -> R1:FREE_AGENCY');

  let g = { round: 1, phase: 'FREE_AGENCY' };
  let guard = 0;
  for (;;) {
    const key = `${g.round}:${g.phase}`;
    await waitForFlipAcks(key);
    if (g.phase === 'FINALE') break;

    if (['FRONT_OFFICE', 'FREE_AGENCY', 'AUCTION', 'LINEUP'].includes(g.phase)) {
      // Advisory timer for realism (RULING restated: timers never gate anything,
      // and expectations ride on every setTimer call).
      await driver.call('setTimer',
        { gameId, action: 'start', seconds: 30, expectedPhase: g.phase, expectedRound: g.round });
    }
    if (g.phase === 'FREE_AGENCY' && g.round === 1) {
      await Promise.all(bots.map((bot) => signAllForTeam(bot, gameId)));
      console.log(`FA: ${TEAMS} teams x 8 signings done`);
    }
    if (g.phase === 'FRONT_OFFICE' || g.phase === 'FREE_AGENCY') {
      await Promise.all(bots.map((bot) => bot.gm.call('markDone', { gameId })));
    }
    if (g.phase === 'AUCTION') await scoutBids(bots, gameId, g.round);
    // LINEUP: nothing — the exit hook's auto-repair carries every team (as prod does).
    if (g.phase === 'RESULTS') {
      const rd = await getDoc(doc(driver.db, 'games', gameId, 'rounds', String(g.round)));
      roundsSizes.push({ round: g.round, bytes: JSON.stringify(rd.data()).length });
    }

    await sleep(SETTLE_MS);
    const res = await driver.call('advancePhase',
      { gameId, expectedPhase: g.phase, expectedRound: g.round });
    flipTimes.set(`${res.round}:${res.phase}`, Date.now());
    g = { round: res.round, phase: res.phase };
    if (++guard > 60) throw new Error(`stuck at R${g.round}:${g.phase}`);
  }

  // Final staleness sweep: any client not showing 5:FINALE is permanently stale -> death.
  const finalStale = metricClients
    .filter((c) => c.gameKey !== '5:FINALE').map((c) => c.name);
  const deaths = new Set([...deadClients, ...finalStale]);

  // ---- aggregate ---------------------------------------------------------------
  const byFn = new Map();
  for (const s of callableSamples) {
    const e = byFn.get(s.fn) ?? { ms: [], errors: 0 };
    if (s.error) e.errors += 1; else e.ms.push(s.ms);
    byFn.set(s.fn, e);
  }
  const measuredFlips = flipRows.filter((r) => r.p95 != null);
  const worstFlipP95 = measuredFlips.length ? Math.max(...measuredFlips.map((r) => r.p95)) : null;
  const worstFlip = measuredFlips.find((r) => r.p95 === worstFlipP95) ?? null;
  const worstCallP95 = Math.max(0, ...[...byFn.values()]
    .filter((e) => e.ms.length).map((e) => pct(e.ms, 95)));
  const maxRounds = roundsSizes.length ? Math.max(...roundsSizes.map((r) => r.bytes)) : null;

  const criteria = [
    { name: 'p95 flip propagation (worst flip)', threshold: '< 3000 ms',
      measured: fmt(worstFlipP95, ' ms'), pass: worstFlipP95 != null && worstFlipP95 < 3000 },
    { name: 'listener deaths', threshold: '= 0',
      measured: String(deaths.size), pass: deaths.size === 0 },
    { name: 'callable p95 (worst callable)', threshold: '< 5000 ms',
      measured: fmt(worstCallP95, ' ms'), pass: worstCallP95 < 5000 },
    { name: `rounds/{r} max size${TEAMS < 21 ? ' (informational below 21 teams)' : ''}`,
      threshold: '< 700000 B', measured: fmt(maxRounds, ' B'),
      pass: maxRounds != null && maxRounds < 700000 },
  ];
  const PASS = criteria.every((c) => c.pass);

  const reads = snapshotDeliveries + catalogReads; // upper bound
  const costLine = `${callableSamples.length} function invocations + ~${reads} Firestore reads (upper bound; `
    + `collection snapshots counted whole). Ballpark: reads ~$${(reads / 100000 * 0.06).toFixed(2)} `
    + `+ invocations ~$${(callableSamples.length / 1e6 * 0.40).toFixed(2)} — locked expectation: `
    + `class session + load drill each < $1 of overage; idle $0.`;

  // ---- stdout tables -------------------------------------------------------------
  console.log('\n--- PASS criteria ---');
  for (const c of criteria) {
    console.log(`${c.name.padEnd(48)} ${c.threshold.padEnd(12)} measured ${c.measured.padEnd(12)} ${c.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`RESULT: ${PASS ? 'PASS' : 'FAIL'}`);
  console.log(`cost: ${costLine}`);

  // ---- markdown report -------------------------------------------------------------
  const date = new Date().toISOString().slice(0, 10);
  const outDir = join(REPO, 'docs', 'superpowers', 'loadtests');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${date}-load-drill${DRY_RUN ? '-dryrun' : ''}.md`);
  const md = [
    `# Salary Showdown load drill — ${date}`,
    '',
    `- Mode: ${DRY_RUN ? 'DRY-RUN (emulator suite)' : `PROD (project ${CONFIG.projectId}, functions us-west1)`}`,
    `- Teams: ${TEAMS} (${TEAMS * 3} synthetic clients + 1 driver) · gameId ${gameId} · joinCode ${joinCode}`,
    `- Listener set per client: game doc, own membership, teams collection, market/{round}, rounds/{r} in SIMULATE/RESULTS/FINALE, one-time catalog fetch`,
    '',
    '## Per-flip game-doc propagation (ms, transition-gated delivery vs driver post-callable)',
    '', '| Flip | acks | p50 | p95 | max | missed@15s |', '|---|---|---|---|---|---|',
    ...flipRows.map((r) => `| ${r.key} | ${r.n}/${r.expected} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} | ${r.missing} |`),
    '', `Worst overall: p95 ${fmt(worstFlipP95, ' ms')}${worstFlip ? ` at flip ${worstFlip.key}` : ''}.`,
    '',
    '## Callable latency (ms)',
    '', '| Callable | calls | p50 | p95 | errors |', '|---|---|---|---|---|',
    ...[...byFn.entries()].map(([fn, e]) =>
      `| ${fn} | ${e.ms.length + e.errors} | ${fmt(pct(e.ms, 50))} | ${fmt(pct(e.ms, 95))} | ${e.errors} |`),
    '',
    '## Listener health',
    '', `- Error callbacks fired: ${listenerErrors.length}`
      + (listenerErrors.length ? ` — ${listenerErrors.map((x) => `${x.client}:${x.listener}(${x.code})`).join(', ')}` : ''),
    `- Stale-window strikes (missed a 15 s ack window): ${[...staleStrikes.entries()].map(([k, v]) => `${k}x${v}`).join(', ') || 'none'}`,
    `- Deaths (errors + permanently stale at season end): ${deaths.size}${deaths.size ? ` — ${[...deaths].join(', ')}` : ''}`,
    '',
    '## rounds/{r} serialized size',
    '', '| Round | bytes |', '|---|---|',
    ...roundsSizes.map((r) => `| ${r.round} | ${r.bytes} |`),
    '', ...(TEAMS < 21 ? ['Size row is informational below 21 teams; the 700 KB bar is binding at 21.'] : []),
    '',
    '## PASS criteria',
    '', '| Criterion | Threshold | Measured | Verdict |', '|---|---|---|---|',
    ...criteria.map((c) => `| ${c.name} | ${c.threshold} | ${c.measured} | ${c.pass ? 'PASS' : 'FAIL'} |`),
    '', `**RESULT: ${PASS ? 'PASS' : 'FAIL'}**`,
    '',
    '## Cost note',
    '', costLine,
    '',
  ].join('\n');
  writeFileSync(outPath, md);
  console.log(`report: ${outPath}`);

  // 64 live Firestore instances hold sockets open; a script exits explicitly.
  process.exit(PASS ? 0 : 1);
}

process.on('unhandledRejection', (e) => { console.error('unhandledRejection:', e); process.exit(2); });
main().catch((e) => { console.error('load-drill failed:', e); process.exit(2); });
