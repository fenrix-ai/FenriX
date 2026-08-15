import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
  await seeded.prof.call('startSeason', { gameId: seeded.gameId });
  await waitFor(() => expect(screen.getByRole('heading', { name: /Draft Night/ })).toBeInTheDocument(),
    { timeout: 15000 });
}, 90000);

test('second-tab strand (F6): a pre-membership boot recovers after join, no reload', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // The dev second-tab boot: ss.gameId is ALREADY set (shared localStorage)
  // while this tab's fresh uid has no membership — the game-doc and
  // membership listeners attach at mount and die terminally on
  // permission-denied (Firestore never retries a denied listen).
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  // Landing renders (membership null → PhaseRouter never bounces); drive the
  // REAL claim flow: joinGame resolves, THEN setGameId(same id) — the epoch
  // bump must tear down the dead listeners and resubscribe. Pre-fix, this
  // stranded on the picker (seat claimed server-side, UI stuck) until reload.
  await user.type(await screen.findByLabelText('join code', {}, { timeout: 15000 }),
    seeded.joinCode);
  await user.type(screen.getByLabelText('display name'), 'Tab Two');
  await user.click(screen.getByRole('button', { name: 'Find game' }));
  await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument(), { timeout: 15000 });
  const alphaCard = screen.getByText('Alpha').closest('.card')!;
  await user.click(Array.from(alphaCard.querySelectorAll('button'))
    .find((b) => b.textContent === 'GM')!);

  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
}, 120000);
