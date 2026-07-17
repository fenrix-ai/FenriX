import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('auction: five cards, min-bid gate, exposure meter, revisable overwrite', async () => {
  const seeded = await seedToPhase({ to: 'R1:AUCTION' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'IT Scout',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/auction']}><App /></MemoryRouter>);

  const wave = (await adminDb().doc(`games/${seeded.gameId}/auctions/1`).get()).data()!;
  expect(wave.stars).toHaveLength(5);
  await waitFor(() => {
    expect(screen.getAllByLabelText(/salary for /)).toHaveLength(5); // FIVE cards, not the mock's four
  }, { timeout: 20000 });

  const inputs = screen.getAllByLabelText(/salary for /);
  await user.type(inputs[0], '1.5'); // below the $2.0M round-1 minimum
  expect(await screen.findByText('Minimum tonight is $2.0M.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeDisabled();

  // Off-step bids surface the exact copy and disable Lock in (never silent coercion).
  await user.clear(inputs[0]);
  await user.type(inputs[0], '2.35');
  expect(await screen.findByText('Bids move in $0.1M steps.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeDisabled();

  await user.clear(inputs[0]);
  await user.type(inputs[0], '8.0');
  const card0 = inputs[0].closest('.card')!;
  await user.click(Array.from(card0.querySelectorAll('button')).find((b) => b.textContent === '3')!);
  expect(card0.textContent).toContain('= $24.0M gtd');

  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]]).toEqual({ rate: 8.0, years: 3 });
  }, { timeout: 15000 });

  // Revise: overwrite the whole set with a different rate on the same star.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '9.5');
  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]].rate).toBe(9.5);
  }, { timeout: 15000 });
}, 120000);
