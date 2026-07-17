import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('lineup: pre-arranged legal, playstyle pick, submit locks the round', async () => {
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'IT Coach',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  // @dnd-kit's DndContext always mounts its own off-screen role="status" live
  // region (drag/drop announcements) alongside the page's status line, so a
  // bare getByRole('status') is ambiguous once it's mounted — scope to ours.
  const lineupStatus = () =>
    screen.getAllByRole('status').find((el) => el.textContent?.startsWith('Lineup:'))!;

  // Alpha holds 8 hardship players → pre-arranged 5+1+2, zero depth, already legal.
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Balanced'), { timeout: 20000 });

  await user.click(screen.getByText('Lockdown'));
  expect(lineupStatus()).toHaveTextContent('Playstyle: Lockdown');
  await user.click(screen.getByRole('button', { name: 'Submit lineup' }));

  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.lineupLockedRound).toBe(1);
    expect(t.lineup.playstyle).toBe('Lockdown');
    expect(t.lineup.starters).toHaveLength(5);
    expect(t.lineup.bench).toHaveLength(2);
  }, { timeout: 15000 });
}, 120000);
