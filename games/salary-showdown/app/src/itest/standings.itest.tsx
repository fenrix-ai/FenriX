import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('standings: server rank order, viewer highlight, W/$M column', async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' }); // round 1 played
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByTestId('standings')).toBeInTheDocument(),
    { timeout: 20000 });
  // Row order must be the SERVER's rank order, verbatim.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  const names = [...screen.getByTestId('standings').querySelectorAll('tbody td.name')]
    .map((td) => td.textContent);
  expect(names).toEqual(rd.standings.map((s: { name: string }) => s.name));
  expect(screen.getByText('W / $M')).toBeInTheDocument();
  expect(screen.getByTestId('standings').querySelector('tr.sel')?.textContent).toContain('Alpha');
  // PhaseRouter must NOT yank us off this always-accessible page.
  await new Promise((r) => setTimeout(r, 1500));
  expect(screen.getByTestId('standings')).toBeInTheDocument();
}, 120000);
