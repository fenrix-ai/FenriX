import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, newClient, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('lobby shows own seats, fallback coverage, teammate arrival, and identity snapshots', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Casey',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);
  await waitFor(() => {
    expect(screen.getByText('Casey')).toBeInTheDocument();
    expect(screen.getByText('Your seat')).toBeInTheDocument();
    expect(screen.getAllByText('Open seat')).toHaveLength(2);
    expect(screen.getByText('Any teammate can cover an open role until it is claimed.'))
      .toBeInTheDocument();
  }, { timeout: 15000 });

  // Old games have no identity field. A deterministic fallback still renders editable choices.
  expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked))
    .toHaveLength(2);

  // The shared team-seat snapshot adds a teammate after the initial snapshot, and their
  // lobby-only identity write updates this clean editor without a reload.
  const teammate = await newClient('lobby-teammate');
  await teammate.call('joinGame', {
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'Taylor',
  });
  await waitFor(() => expect(screen.getByText('Just joined')).toBeInTheDocument(), { timeout: 15000 });
  expect(screen.getByText('Taylor')).toBeInTheDocument();
  await teammate.call('setTeamIdentity', {
    gameId: seeded.gameId, identity: { accent: 'teal', jersey: 'chevron' },
  });
  await waitFor(() => {
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Chevron' })).toBeChecked();
  }, { timeout: 15000 });
}, 90000);

test('lobby rename (playtest-2): a member names their own franchise, live for the room', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  // Names chosen to discriminate numeric-aware collation from plain lexicographic:
  // teamIds[0] = 'Franchise 10' is the team this test joins and renames.
  const seeded = await seedToPhase({
    to: 'LOBBY', teams: ['Franchise 10', 'Franchise 2', 'Beta', 'Alpha'],
  });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Namer',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);

  const input = await screen.findByLabelText('team name', {}, { timeout: 20000 });
  // Numeric-aware name sort (T1 review carry): Franchise 2 before Franchise 10.
  // A lexicographic regression (or dropping the sort) flips this exact order.
  expect([...document.querySelectorAll('[data-rival-name]')].map((e) => e.textContent))
    .toEqual(['Alpha', 'Beta', 'Franchise 2']);
  await user.clear(input);
  await user.type(input, 'Cap Crunchers');
  await user.click(screen.getByRole('button', { name: 'Rename' }));

  // The card follows the live team doc; the server owns the write.
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Cap Crunchers' })).toBeInTheDocument(),
    { timeout: 15000 });
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.name).toBe('Cap Crunchers');
  }, { timeout: 15000 });
  // Rival teams keep their names — rename can only target the caller's team.
  expect(screen.getByText('Beta')).toBeInTheDocument();
  expect(screen.getByText('Franchise 2')).toBeInTheDocument();
  // The own franchise remains the hero; rival cards retain numeric-aware ordering.
  expect([...document.querySelectorAll('[data-rival-name]')].map((e) => e.textContent))
    .toEqual(['Alpha', 'Beta', 'Franchise 2']);
}, 120000);
