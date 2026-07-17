import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { newClient, seedToPhase } from './harness';
import { auth } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('landing: code → team list with taken seats → claim → lobby', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' }); // bots on Beta/Gamma/Delta
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  await user.type(screen.getByLabelText('join code'), seeded.joinCode);
  await user.type(screen.getByLabelText('display name'), 'Dana');
  await user.click(screen.getByRole('button', { name: 'Find game' }));

  await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument(), { timeout: 15000 });
  // Beta is fully staffed by bots — its three seats all read "taken".
  const betaCard = screen.getByText('Beta').closest('.card')!;
  expect(betaCard.textContent).toContain('GM · taken');
  // Alpha is open — claim GM and land in the lobby via PhaseRouter.
  const alphaCard = screen.getByText('Alpha').closest('.card')!;
  await user.click(Array.from(alphaCard.querySelectorAll('button'))
    .find((b) => b.textContent === 'GM')!);
  await waitFor(() => expect(screen.getByTestId('stub')).toHaveTextContent('Lobby'),
    { timeout: 15000 });
}, 90000);

test('seat-taken race shows the mapped copy and refreshes the picker', async () => {
  sessionStorage.clear(); // isolation: prior test's successful claim left ss.gameId behind
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  await user.type(screen.getByLabelText('join code'), seeded.joinCode);
  await user.type(screen.getByLabelText('display name'), 'Racer');
  await user.click(screen.getByRole('button', { name: 'Find game' }));
  await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument(), { timeout: 15000 });

  // Rival takes Alpha's GM seat AFTER our picker rendered it as open.
  const rival = await newClient('rival');
  await rival.call('joinGame', { joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Rival' });

  const alphaCard = screen.getByText('Alpha').closest('.card')!;
  await user.click(Array.from(alphaCard.querySelectorAll('button')).find((b) => b.textContent === 'GM')!);

  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('That seat was just taken — pick another role.'), { timeout: 15000 });
  await waitFor(() => {
    const refreshed = screen.getByText('Alpha').closest('.card')!;
    expect(refreshed.textContent).toContain('GM · taken');
  }, { timeout: 15000 });
}, 120000);
