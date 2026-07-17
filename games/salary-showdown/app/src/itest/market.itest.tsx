import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('draft night: analyst table, sign drawer, non-exclusive row persists, ALREADY_SIGNED', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);

  // Round-1 draw = 75% of the 150-player FA pool = 112 rows in "In market tonight".
  await waitFor(() => expect(screen.getByText('In market tonight (112)')).toBeInTheDocument(),
    { timeout: 20000 });
  // The two decoder columns the mock omitted are present.
  expect(screen.getByText('STL')).toBeInTheDocument();
  expect(screen.getByText('BLK')).toBeInTheDocument();

  // Open the drawer on a known cheap player: search by a name from the market.
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const target = (market.available as number[])
    .map((pid) => byPid[pid])
    .filter((p) => p.salary_per_round !== '')
    .sort((a, b) => Number(a.salary_per_round) - Number(b.salary_per_round))[0];
  await user.type(screen.getByLabelText('search players'), target.name);
  await user.click(screen.getByText(target.name));
  // Round 1 ask = CSV base exactly (assert on the drawer's text, not getByText —
  // the string spans nested elements and would match multiple ancestors).
  await waitFor(() => expect(document.querySelector('.drawer')!.textContent)
    .toContain(`asks $${Number(target.salary_per_round).toFixed(1)}M/rd tonight`));

  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByTestId('sign-note'))
    .toHaveTextContent('He remains available to every team.'), { timeout: 15000 });
  // NON-EXCLUSIVE: the row is still in the table after signing (scope to the
  // table — the open drawer repeats the same name and getByText would ambiguate).
  expect(document.querySelector('table')!.textContent).toContain(target.name);

  // Signing the same copy again trips ALREADY_SIGNED, mapped to student copy.
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('He is already under contract with your team.'), { timeout: 15000 });
}, 120000);
