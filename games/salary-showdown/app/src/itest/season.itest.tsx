import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('a joined client follows a whole season, lobby to finale', async () => {
  const seeded = await seedToPhase({ teams: ['North', 'South'], to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'E2E GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Waiting for the professor/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:FREE_AGENCY');
  await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:AUCTION');
  await waitFor(() => expect(screen.getAllByRole('spinbutton', { name: /Salary per round for/ })).toHaveLength(5),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:RESULTS');
  await waitFor(() => expect(screen.getByRole('region', { name: 'Round result' })).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'R3:FRONT_OFFICE');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Expiring decisions' })).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'FINALE');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Final Podium' }))
    .toBeInTheDocument(), { timeout: 30000 });
  const finalGame = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
  const finalRound = (await adminDb().doc(`games/${seeded.gameId}/rounds/5`).get()).data()!;
  expect(finalGame).toMatchObject({ phase: 'FINALE', round: 5 });
  expect(finalRound.standings).toHaveLength(2);
}, 300000);
