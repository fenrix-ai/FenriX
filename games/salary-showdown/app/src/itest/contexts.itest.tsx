import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { newClient, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { GameProvider, useGame } from '../contexts/GameContext';

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
  await user.click(screen.getByRole('button', { name: 'Choose Alpha' }));
  await user.click(screen.getByRole('button', { name: 'Join as GM' }));

  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
}, 120000);

function SeatProbe() {
  const { teamSeats, actsAs } = useGame();
  const seats = [...teamSeats.entries()]
    .map(([uid, seat]) => `${uid}:${seat.teamId}:${seat.role}:${seat.displayName}`)
    .sort()
    .join('|');
  return (
    <output data-testid="team-seats">
      {teamSeats.size};coach={String(actsAs('Coach'))};{seats}
    </output>
  );
}

test('GameContext exposes only same-team seats and preserves absent-role fallback', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Seat GM',
  });
  const scout = await newClient('same-team-scout');
  await scout.call('joinGame', {
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'Seat Scout',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);

  render(<AuthProvider><GameProvider><SeatProbe /></GameProvider></AuthProvider>);

  await waitFor(() => expect(screen.getByTestId('team-seats')).toHaveTextContent('2;coach=true'),
    { timeout: 15000 });
  expect(screen.getByTestId('team-seats')).toHaveTextContent(seeded.teamIds[0]);
  expect(screen.getByTestId('team-seats')).not.toHaveTextContent(seeded.teamIds[1]);

  const coach = await newClient('same-team-coach');
  await coach.call('joinGame', {
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Seat Coach',
  });
  await waitFor(() => expect(screen.getByTestId('team-seats')).toHaveTextContent('3;coach=false'),
    { timeout: 15000 });
}, 120000);
