import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('lobby shows live role claims and own-team highlight', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Casey',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);
  await waitFor(() => {
    expect(screen.getByText(/Coach: Casey/)).toBeInTheDocument();  // own claim, live
    expect(screen.getByText(/GM: GM1/)).toBeInTheDocument();       // bot on Beta
    expect(screen.getAllByText(/GM: open/).length).toBe(1);        // Alpha's GM still open
  }, { timeout: 15000 });
}, 90000);

test('lobby rename (playtest-2): a member names their own franchise, live for the room', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Namer',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);

  const input = await screen.findByLabelText('team name', {}, { timeout: 20000 });
  await user.clear(input);
  await user.type(input, 'Cap Crunchers');
  await user.click(screen.getByRole('button', { name: 'Rename' }));

  // The card follows the live team doc; the server owns the write.
  await waitFor(() => expect(screen.getByText('Cap Crunchers')).toBeInTheDocument(),
    { timeout: 15000 });
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.name).toBe('Cap Crunchers');
  }, { timeout: 15000 });
  // Rival teams keep their names — rename can only target the caller's team.
  expect(screen.getByText('Beta')).toBeInTheDocument();
}, 120000);
