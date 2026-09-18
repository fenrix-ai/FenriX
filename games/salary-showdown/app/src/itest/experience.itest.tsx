import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('two-team experience preserves saved offers and revealed results across screen navigation', async () => {
  const seeded = await seedToPhase({ teams: ['North', 'South'], to: 'R1:AUCTION' });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Experience GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/auction']}><App /></MemoryRouter>);

  const offers = await screen.findAllByRole('spinbutton', { name: /Salary per round for/ },
    { timeout: 20000 });
  await user.clear(offers[0]);
  await user.type(offers[0], '2.3');
  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  expect(await screen.findByTestId('sealed-receipt')).toHaveTextContent('SEALED');
  const privateRef = adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`);
  const saved = (await privateRef.get()).data()!.bids;
  expect(Object.values(saved)).toContainEqual({ rate: 2.3, years: 1 });

  await user.click(screen.getByRole('link', { name: 'Standings' }));
  expect(await screen.findByText('No games in the books yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Back to the game' }));
  await waitFor(() => expect(screen.getAllByRole('spinbutton',
    { name: /Salary per round for/ })[0]).toHaveValue(2.3));
  expect((await privateRef.get()).data()!.bids).toEqual(saved);

  await driveTo(seeded, 'R1:SIMULATE');
  const revealAll = await screen.findByRole('button', { name: 'Reveal all results' },
    { timeout: 30000 });
  fireEvent.click(revealAll);
  const round = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  const own = round.standings.find((row: { teamId: string }) => row.teamId === seeded.teamIds[0]);
  const record = `${own.wins}–${own.losses}`;
  await waitFor(() => expect(screen.getByTestId('simulation-record')).toHaveTextContent(record));

  await user.click(screen.getByRole('link', { name: 'Standings' }));
  await waitFor(() => expect(screen.getByTestId('standings').querySelector('tr.sel'))
    .toHaveTextContent('North'));
  await user.click(screen.getByRole('link', { name: 'Back to the game' }));
  await waitFor(() => expect(screen.getByTestId('simulation-record')).toHaveTextContent(record));
  expect(screen.getByRole('button', { name: 'Reveal all results' })).toBeDisabled();

  await driveTo(seeded, 'R1:RESULTS');
  const result = await screen.findByRole('region', { name: 'Round result' }, { timeout: 30000 });
  expect(within(result).getByText(record)).toBeInTheDocument();
  expect(within(screen.getByTestId('box-lines')).getByRole('table')
    .querySelectorAll('thead th')).toHaveLength(23);
  expect(screen.getByTestId('standings').querySelectorAll('tbody tr')).toHaveLength(2);
}, 180000);
