import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('lobby shows live role claims and own-team highlight', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Casey',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);
  await waitFor(() => {
    expect(screen.getByText(/Coach: Casey/)).toBeInTheDocument();  // own claim, live
    expect(screen.getByText(/GM: GM1/)).toBeInTheDocument();       // bot on Beta
    expect(screen.getAllByText(/GM: open/).length).toBe(1);        // Alpha's GM still open
  }, { timeout: 15000 });
}, 90000);
