import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('a joined client follows a whole season, lobby to finale', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'E2E GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Waiting for the professor/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:FREE_AGENCY');
  await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:AUCTION');
  await waitFor(() => expect(screen.getAllByLabelText(/salary for /)).toHaveLength(5),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:RESULTS');
  await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'R3:FRONT_OFFICE');
  await waitFor(() => expect(screen.getByText('Expiring deals')).toBeInTheDocument(),
    { timeout: 30000 });

  await driveTo(seeded, 'FINALE');
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Finale (Plan 3)'),
    { timeout: 30000 });
}, 300000);
