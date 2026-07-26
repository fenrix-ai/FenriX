import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, newClient, seedToPhase, type Client, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';
import type { RevealDoc } from '../types/models';

// FinalePage is the TEAM client's scrollable debrief: podium + all four charts
// + own-team best/worst, reading reveal/latest through the member listener.
// THE FINALE IS THE SANCTIONED REVEAL — valuePerDollar renders here on purpose.
test('finale: joined GM sees podium, four SVG charts, own signings, narrative', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);

  // Alpha (team 0) has no bot, so the harness never signs for it — give it two
  // contracts (one cheap Guard, one pricey Wing) so the reveal's perTeam entry
  // has non-null, distinct best/worst signings. Free agency is NON-EXCLUSIVE:
  // bots signing the same players is fine. Two signings cannot trip
  // POSITION_LOCK (unmet 2G/2W/1B needs stay far below the open slots).
  await driveTo(seeded, 'R1:FREE_AGENCY');
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const priced = (market.available as number[])
    .map((pid) => ({ pid, pos: byPid[pid].position as string, sal: byPid[pid].salary_per_round as string }))
    .filter((p) => p.sal !== '');
  const bySal = (pos: string) => priced.filter((p) => p.pos === pos)
    .sort((a, b) => Number(a.sal) - Number(b.sal));
  await httpsCallable(functions, 'signPlayer')(
    { gameId: seeded.gameId, pid: bySal('G')[0].pid, years: 1 });
  await httpsCallable(functions, 'signPlayer')(
    { gameId: seeded.gameId, pid: bySal('W').at(-1)!.pid, years: 1 });

  await driveTo(seeded, 'FINALE');
  const rev = (await adminDb().doc(`games/${seeded.gameId}/reveal/latest`).get())
    .data() as unknown as RevealDoc;
  const mine = rev.perTeam.find((t) => t.teamId === seeded.teamIds[0])!;
  expect(mine.bestSigning).toBeTruthy();
  expect(mine.worstSigning).toBeTruthy();
  const nameOf = new Map(rev.scatter.map((p) => [p.pid, p.name]));

  render(<MemoryRouter initialEntries={['/game/conclusion']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Final Podium' }))
    .toBeInTheDocument(), { timeout: 30000 });

  // One hand-rolled SVG per chart, each with its own testid.
  for (const id of ['chart-scatter-ti', 'chart-weights-compare',
    'chart-wins-per-dollar', 'chart-best-worst']) {
    expect(screen.getByTestId(id).tagName.toLowerCase()).toBe('svg');
  }

  // Own-team best/worst section: player names AND the sanctioned valuePerDollar.
  const yours = screen.getByTestId('your-signings');
  expect(yours).toHaveTextContent(String(nameOf.get(mine.bestSigning!.pid)));
  expect(yours).toHaveTextContent(mine.bestSigning!.valuePerDollar.toFixed(2));
  expect(yours).toHaveTextContent(String(nameOf.get(mine.worstSigning!.pid)));
  expect(yours).toHaveTextContent(mine.worstSigning!.valuePerDollar.toFixed(2));

  // The narrative string from trueWeights, verbatim from the wire.
  expect(screen.getByTestId('narrative')).toHaveTextContent(rev.trueWeights.narrative);
}, 300000);

// T13 — FinaleWall (projector) + RevealStepper (panel). The rendered
// surfaces read via ProfessorProvider and call setRevealStep through the
// default app, so the DEFAULT app's anonymous user must BE the professor
// (contracts: the itest client that calls createGame IS the professor; the
// professor has NO players/{uid} membership doc — joinGame is never called
// for it). The prof shim satisfies the harness Client shape so driveTo()
// works unchanged (it always sends expectedPhase + expectedRound to
// advancePhase — RULING unchanged).
async function seedProfFinale(names: string[]): Promise<Seeded> {
  const cred = await signInAnonymously(auth);
  const { gameId, joinCode } = (await httpsCallable(functions, 'createGame')({
    teamNames: names })).data as { gameId: string; joinCode: string };
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const prof: Client = {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: async () => {},
  };
  const bots: Seeded['bots'] = [];
  for (const [i, teamId] of teamIds.entries()) {
    const gm = await newClient(`fgm${i}`);
    const scout = await newClient(`fsc${i}`);
    const coach = await newClient(`fco${i}`);
    await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId, gm, scout, coach });
  }
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };
  await driveTo(seeded, 'FINALE');
  return seeded;
}

describe('T13: finale wall + reveal stepper', () => {
  let seeded: Seeded;
  beforeAll(async () => {
    seeded = await seedProfFinale(['Alpha', 'Beta']);
    // Earlier tests in this file join the default user into THEIR game and
    // set sessionStorage 'ss.gameId'; with it set, GameContext wakes up and
    // PhaseRouter would yank /professor and /bigscreen to /game/conclusion.
    // Clear it so GameProvider stays dormant on the new surfaces.
    sessionStorage.removeItem('ss.gameId');
    localStorage.setItem('ss.profGameId', seeded.gameId);
  }, 600000);

  test('panel stepper: › advances revealStep 0→1 via setRevealStep', async () => {
    render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
    // revealStep is absent until the first setRevealStep call (T3); the
    // stepper's `?? 0` default still shows step 1 of 5.
    await waitFor(() => expect(screen.getByTestId('reveal-step-name'))
      .toHaveTextContent('1 of 5 · Podium'), { timeout: 20000 });
    expect(screen.getByRole('button', { name: 'previous step' })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'next step' }));
    await waitFor(async () => {
      const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
      expect(g.revealStep).toBe(1);
    }, { timeout: 15000 });
    await waitFor(() => expect(screen.getByTestId('reveal-step-name'))
      .toHaveTextContent('2 of 5 · Hype vs Reality'), { timeout: 15000 });
  }, 120000);

  test('wall: renders the revealStep chart; podium at 0; clamps 8 to the last step', async () => {
    // revealStep is 1 after the stepper test above → the wall opens on the
    // hype-vs-TrueImpact scatter, not the podium.
    render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('finale-scatter')).toBeInTheDocument(),
      { timeout: 20000 });
    expect(screen.queryByTestId('finale-podium')).toBeNull();

    // Harness professor steps back to 0 → podium = top three of the FINAL
    // standings (rounds/5 — game.round is 5 at FINALE).
    await seeded.prof.call('setRevealStep', { gameId: seeded.gameId, step: 0 });
    await waitFor(() => expect(screen.getByTestId('finale-podium')).toBeInTheDocument(),
      { timeout: 15000 });
    expect(screen.getByTestId('finale-step-title')).toHaveTextContent('Podium');
    const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/5`).get()).data()!;
    const first = rd.standings.find((r: { rank: number }) => r.rank === 1)!;
    expect(screen.getByTestId('finale-podium')).toHaveTextContent(first.name);

    // Server accepts 0..8; the wall clamps to its 5 steps → 8 parks on the
    // last chart, never a blank wall.
    await seeded.prof.call('setRevealStep', { gameId: seeded.gameId, step: 8 });
    await waitFor(() => expect(screen.getByTestId('finale-bestworst')).toBeInTheDocument(),
      { timeout: 15000 });
    expect(screen.getByTestId('finale-step-title')).toHaveTextContent('Best & worst signings');
  }, 120000);
});
