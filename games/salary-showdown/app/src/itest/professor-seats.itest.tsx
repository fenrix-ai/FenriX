import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, newClient } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

beforeEach(() => localStorage.clear());

test('seat panel (playtest-2): two-click release frees a claimed seat', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({
    teamNames: ['Alpha', 'Beta'] })
    .then((r) => r.data as { gameId: string; joinCode: string });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamA = teamsSnap.docs.find((d) => d.data().name === 'Alpha')!.id;
  const scout = await newClient('seat-scout');
  await scout.call('joinGame', { joinCode, teamId: teamA, role: 'Scout', displayName: 'Leaver' });

  localStorage.setItem('ss.profGameId', gameId);
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  const panel = await screen.findByTestId('seat-panel', {}, { timeout: 20000 });
  await waitFor(() => expect(panel.textContent).toContain('Scout: Leaver'), { timeout: 15000 });

  // Two-click confirm: Release arms, Confirm release fires.
  await user.click(screen.getByRole('button', { name: 'Release' }));
  await user.click(screen.getByRole('button', { name: 'Confirm release' }));

  await waitFor(async () => {
    expect((await adminDb().doc(`games/${gameId}/players/${scout.uid}`).get()).exists).toBe(false);
  }, { timeout: 15000 });
  await waitFor(() => expect(panel.textContent).toContain('Scout: open'), { timeout: 15000 });
}, 120000);
