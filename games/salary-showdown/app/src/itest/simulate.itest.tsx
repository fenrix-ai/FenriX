import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('simulate: my three games cascade to a terminal state', async () => {
  const seeded = await seedToPhase({ to: 'R1:SIMULATE' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  sessionStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/simulate']}><App /></MemoryRouter>);

  // 4 teams → Alpha plays 3 games; cards appear over ~a few seconds of pacing.
  await waitFor(() => {
    const cards = [...screen.queryAllByTestId('game-win'), ...screen.queryAllByTestId('game-loss')];
    expect(cards).toHaveLength(3);
  }, { timeout: 60000 });
  expect(screen.getByRole('status')).toHaveTextContent('Round complete — results ready.');
}, 120000);
