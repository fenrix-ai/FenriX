import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('absent-seat fallback (playtest-2): a GM on a Coach-less team submits the lineup', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // Alpha's ONLY member is this GM — no Coach claimed anywhere on the team.
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Solo GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  // The fallback is visible and the submit affordance is LIVE for the GM.
  await screen.findByTestId('role-fallback', {}, { timeout: 20000 });
  expect(screen.getByTestId('role-fallback').textContent)
    .toContain('No Coach on your team');
  const submit = await screen.findByRole('button', { name: 'Submit lineup' }, { timeout: 20000 });
  await waitFor(() => expect(submit).toBeEnabled(), { timeout: 20000 });
  await user.click(submit);

  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.lineupLockedRound).toBe(1);
  }, { timeout: 15000 });
}, 120000);
