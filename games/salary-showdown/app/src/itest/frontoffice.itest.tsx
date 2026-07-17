import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('front office: expiring re-sign, then a mid-contract cut with dead money', async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  // Alpha had no GM in round 1 → hardship signed 8 one-round deals → all expiring now.
  await waitFor(() => expect(screen.getByText('0 of 8 decided')).toBeInTheDocument(),
    { timeout: 20000 });

  // Re-sign the first expiring player on a 2-round deal.
  const firstCard = screen.getAllByRole('button', { name: 'Re-sign' })[0].closest('.card')!;
  const select = within(firstCard as HTMLElement).getByRole('combobox');
  await user.selectOptions(select, '2');
  await user.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Re-sign' }));
  await waitFor(() => expect(screen.getByText('1 of 8 decided')).toBeInTheDocument(),
    { timeout: 15000 });

  // Cut him — a genuine mid-contract cut (2-round deal, cut in its first round).
  await user.click(screen.getByRole('button', { name: 'Cut' }));
  expect(screen.getByRole('dialog').textContent).toContain('dead money');
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.deadMoney).toHaveLength(1);
    expect(t.deadMoney[0].endRound).toBe(3);
  }, { timeout: 15000 });
}, 120000);
