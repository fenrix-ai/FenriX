import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase } from './harness';
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
