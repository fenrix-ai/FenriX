import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('simulate: score and record follow the shared prefix through Reveal all', async () => {
  const seeded = await seedToPhase({ to: 'R1:SIMULATE' });
  const round = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  const first = round.games.find((game: { home: string; away: string }) =>
    game.home === seeded.teamIds[0] || game.away === seeded.teamIds[0]);
  const home = first.home === seeded.teamIds[0];
  const finalScore = `${home ? first.homeScore : first.awayScore}–${home ? first.awayScore : first.homeScore}`;
  const finalRow = round.standings.find((row: { teamId: string }) => row.teamId === seeded.teamIds[0]);
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/simulate']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Reveal all results' })).toBeEnabled());
  expect(screen.getByTestId('simulation-record')).toHaveTextContent('0–0');
  expect(screen.queryByText(finalScore)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Reveal all results' }));
  await waitFor(() => expect(screen.getByTestId('simulation-record'))
    .toHaveTextContent(`${finalRow.wins}–${finalRow.losses}`));
  expect(screen.getAllByText(finalScore).length).toBeGreaterThan(0);
  expect(screen.getByRole('status')).toHaveTextContent('Round complete — results ready.');
}, 120000);

test('simulate: a missing round document keeps a meaningful preparing state', async () => {
  const seeded = await seedToPhase({ to: 'R1:SIMULATE' });
  const ref = adminDb().doc(`games/${seeded.gameId}/rounds/1`);
  const snapshot = await ref.get();
  const round = snapshot.data()!;
  await ref.delete();
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Loading GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/simulate']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('status'))
    .toHaveTextContent('Preparing round 1 results'));
  expect(screen.getByText('Alpha')).toBeInTheDocument();

  await ref.set(round);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reveal all results' })).toBeEnabled());
}, 120000);
