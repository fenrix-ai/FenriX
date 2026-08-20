import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { adminDb, newClient, seedToPhase } from './harness';
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
  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
}, 90000);

test('seat-taken race shows the mapped copy and refreshes the picker', async () => {
  localStorage.removeItem('ss.gameId'); // isolation: prior test's claim left it behind (localStorage since 3b)
  sessionStorage.clear(); // auth/session hygiene from the original isolation fix stays
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

  // Taken chips stay clickable — the server arbitrates. A rival's seat rejects again.
  const takenGm = Array.from(screen.getByText('Alpha').closest('.card')!.querySelectorAll('button'))
    .find((b) => b.textContent === 'GM · taken')!;
  expect(takenGm).not.toBeDisabled();
  await user.click(takenGm);
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('That seat was just taken — pick another role.'), { timeout: 15000 });
}, 120000);

test('create a franchise (student-created teams): one tap creates the team and claims the seat', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from prior tests' claims
  sessionStorage.clear();
  const prof = await newClient('prof-empty');
  const { gameId, joinCode } = await prof.call<{ gameId: string; joinCode: string }>(
    'createGame', {}); // zero-team game — the panel's new path
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  await user.type(screen.getByLabelText('join code'), joinCode);
  await user.type(screen.getByLabelText('display name'), 'Founder');
  await user.click(screen.getByRole('button', { name: 'Find game' }));

  // Zero teams yet — the create card is the picker's only affordance.
  const nameBox = await screen.findByLabelText('new franchise name', {}, { timeout: 15000 });
  await user.type(nameBox, 'Cap Crunchers');
  await user.click(screen.getByRole('button', { name: 'Create as GM' }));

  // createTeam resolved before setGameId (HARD INVARIANT) → PhaseRouter lands us in the lobby.
  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  expect(teamsSnap.size).toBe(1);
  expect(teamsSnap.docs[0].data().name).toBe('Cap Crunchers');
  const membership = (await adminDb().doc(
    `games/${gameId}/players/${auth.currentUser!.uid}`).get()).data()!;
  expect(membership).toMatchObject({ teamId: teamsSnap.docs[0].id, role: 'GM' });
  // LobbyWall's seat counter reads games/{id}.teamCount — the create incremented it.
  expect((await adminDb().doc(`games/${gameId}`).get()).data()!.teamCount).toBe(1);
}, 120000);
