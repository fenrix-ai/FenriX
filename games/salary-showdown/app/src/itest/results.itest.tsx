import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('results: record, box lines, awards without perDollar, highlighted snapshot', async () => {
  const seeded = await seedToPhase({ to: 'R1:RESULTS' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'IT S',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/results']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument(),
    { timeout: 20000 });
  // Record sums to Alpha's 3 games.
  const [w, l] = screen.getByRole('heading', { level: 2 }).textContent!.split('–').map(Number);
  expect(w + l).toBe(3);
  // Box lines: 8 players took the floor for Alpha (5 + sixth + 2 active bench).
  await waitFor(() => {
    const table = screen.getAllByRole('table')[0];
    expect(table.querySelectorAll('tbody tr').length).toBe(3 * 8);
  });
  // The bargain award never shows the computed per-dollar number.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  // The bargain exists in this fixture (every team fields 8 rostered players).
  expect(rd.awards.bargain).toBeTruthy();
  // Advance the carousel to the bargain slide (index 2) and pin the boundary:
  // raw line + salary render; the computed perDollar figure NEVER does.
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'next award' }));
  await user.click(screen.getByRole('button', { name: 'next award' }));
  await waitFor(() => expect(screen.getByTestId('awards'))
    .toHaveTextContent('Bargain of the Round'), { timeout: 15000 });
  const awardsText = screen.getByTestId('awards').textContent!;
  expect(awardsText).toMatch(/\$\d+\.\dM\/rd/);                     // raw salary present
  expect(awardsText).not.toContain(String(rd.awards.bargain.perDollar)); // ratio absent
  // Snapshot highlights the viewer's row.
  const sel = screen.getByTestId('standings').querySelector('tr.sel');
  expect(sel?.textContent).toContain('Alpha');
}, 120000);
