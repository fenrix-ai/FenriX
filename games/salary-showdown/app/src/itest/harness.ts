// Integration-test harness. Reads via firebase-admin (rules deny client reads
// pre-membership; admin bypasses — emulator only). Actions via the REAL callables.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';

import admin from 'firebase-admin';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

if (admin.apps.length === 0) admin.initializeApp({ projectId: 'salary-showdown-dev' });
export const adminDb = () => admin.firestore();

let n = 0;
export async function newClient(name: string) {
  const app = initializeApp(
    { apiKey: 'fake-api-key', projectId: 'salary-showdown-dev' }, `${name}-${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5101);
  const cred = await signInAnonymously(auth);
  return {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(fns, fn)(data).then((r) => r.data as T),
    dispose: () => deleteApp(app),
  };
}
export type Client = Awaited<ReturnType<typeof newClient>>;

const r01 = (x: number) => Math.round(x * 10) / 10;
const minBid = (round: number) => r01(2.0 * 1.08 ** (round - 1));
const SIGN_ORDER = ['G', 'W', 'B', 'G', 'W', 'B', 'G', 'W'];

export interface Seeded {
  gameId: string; joinCode: string; teamIds: string[]; prof: Client;
  bots: { teamId: string; gm: Client; scout: Client; coach: Client }[];
}

// Drives a game to `to` (e.g. 'R1:FREE_AGENCY', 'R3:FRONT_OFFICE', 'FINALE') with
// bots on every team except index 0 (fill: 'others') or on all (fill: 'all').
// RULING (restated): advancePhase always carries expectedPhase + expectedRound.
export async function seedToPhase(opts: {
  teams?: string[]; fill?: 'others' | 'all'; to: string;
}): Promise<Seeded> {
  const names = opts.teams ?? ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const prof = await newClient('prof');
  const { gameId, joinCode } =
    await prof.call<{ gameId: string; joinCode: string }>('createGame', { teamNames: names });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const idx = opts.fill === 'all' ? teamIds.map((_, i) => i) : teamIds.map((_, i) => i).slice(1);

  const bots: Seeded['bots'] = [];
  for (const i of idx) {
    const gm = await newClient(`gm${i}`), scout = await newClient(`sc${i}`),
      coach = await newClient(`co${i}`);
    await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId: teamIds[i], gm, scout, coach });
  }
  if (opts.to === 'LOBBY') return { gameId, joinCode, teamIds, prof, bots };

  await prof.call('startSeason', { gameId });
  const [, rS, ph] = opts.to === 'FINALE'
    ? [null, '5', 'FINALE'] : /^R([1-5]):([A-Z_]+)$/.exec(opts.to)!;
  let g = (await adminDb().doc(`games/${gameId}`).get()).data()!;
  let guard = 0;
  while (!(g.phase === ph && (ph === 'FINALE' || g.round === Number(rS)))) {
    if (g.phase === 'FREE_AGENCY' && g.round === 1) {
      const market = (await adminDb().doc(`games/${gameId}/market/1`).get()).data()!;
      const cat = await adminDb().collection(`games/${gameId}/catalog`).get();
      const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
      for (const bot of bots) {
        const pool: Record<string, { pid: number; sal: number }[]> = { G: [], W: [], B: [] };
        for (const pid of market.available as number[]) {
          const p = byPid[pid];
          if (p.salary_per_round !== '') {
            pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
          }
        }
        for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
        const used = new Set<number>();
        let i = 0;
        for (const pos of SIGN_ORDER) { // interleaved → can never trip POSITION_LOCK
          const p = pool[pos].find((x) => !used.has(x.pid))!;
          used.add(p.pid);
          await bot.gm.call('signPlayer', { gameId, pid: p.pid, years: (i % 4) + 1 });
          i += 1;
        }
      }
    }
    if (g.phase === 'AUCTION') {
      const wave = (await adminDb().doc(`games/${gameId}/auctions/${g.round}`).get()).data()!;
      for (const [i, bot] of bots.entries()) {
        await bot.scout.call('submitBids', { gameId, bids: {
          [wave.stars[i % wave.stars.length]]: { rate: minBid(g.round), years: 1 } } });
      }
    }
    // LINEUP: submit nothing — the exit hook's auto-repair carries every team
    // (proven by the backend smoke test); bots only need rosters and bids.
    await prof.call('advancePhase',
      { gameId, expectedPhase: g.phase, expectedRound: g.round });
    g = (await adminDb().doc(`games/${gameId}`).get()).data()!;
    if (++guard > 40) throw new Error(`stuck at R${g.round}:${g.phase}`);
  }
  return { gameId, joinCode, teamIds, prof, bots };
}
