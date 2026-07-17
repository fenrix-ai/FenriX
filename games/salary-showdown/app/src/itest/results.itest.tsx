import { render, screen, waitFor } from '@testing-library/react';
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
  sessionStorage.setItem('ss.gameId', seeded.gameId);
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
  if (rd.awards.bargain) {
    expect(screen.getByTestId('awards').textContent)
      .not.toContain(String(rd.awards.bargain.perDollar));
  }
  // Snapshot highlights the viewer's row.
  const sel = screen.getByTestId('standings').querySelector('tr.sel');
  expect(sel?.textContent).toContain('Alpha');
}, 120000);
