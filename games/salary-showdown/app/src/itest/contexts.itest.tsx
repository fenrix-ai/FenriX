import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('membership + phase router: joined client lands on /lobby, follows startSeason', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  // The app under test has its own anonymous uid — join Team 1 AS that uid, and it must
  // be established (and membership created) BEFORE <App/> mounts: the game doc listener
  // attaches at mount, security rules require membership to read it, and Firestore
  // terminates a listener on permission-denied rather than retrying once membership
  // shows up later. AuthProvider only calls signInAnonymously on its own mount, so the
  // test must sign in directly here rather than passively wait for App to do it.
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Lobby'),
    { timeout: 15000 });
  await seeded.prof.call('startSeason', { gameId: seeded.gameId });
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Free Agency'),
    { timeout: 15000 });
}, 90000);
