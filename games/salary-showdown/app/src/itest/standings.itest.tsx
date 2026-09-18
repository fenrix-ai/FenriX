import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';
import { spendThroughRound } from '../lib/contracts';

test('standings: server rank order, viewer highlight, W/$M column', async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' }); // round 1 played
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByTestId('standings')).toBeInTheDocument(),
    { timeout: 20000 });
  // Row order must be the SERVER's rank order, verbatim.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  const names = [...screen.getByTestId('standings').querySelectorAll('tbody td.name')]
    .map((td) => td.textContent);
  expect(names).toEqual(rd.standings.map((s: { name: string }) => s.name));
  expect(screen.getByText('W / $M')).toBeInTheDocument();
  expect(screen.getByTestId('standings').querySelector('tr.sel')?.textContent).toContain('Alpha');
  // PhaseRouter must NOT yank us off this always-accessible page.
  await new Promise((r) => setTimeout(r, 1500));
  expect(screen.getByTestId('standings')).toBeInTheDocument();
}, 120000);

test('standings: historical rounds keep their own record and spend basis', async () => {
  const seeded = await seedToPhase({ to: 'R1:RESULTS' });
  const teamId = seeded.teamIds[0];
  const rd1 = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  await driveTo(seeded, 'R2:RESULTS');

  // Mutation canary: the current TeamDoc total must never leak into a historical ratio.
  await adminDb().doc(`games/${seeded.gameId}/teams/${teamId}`).update({ wins: 99, losses: 0 });
  const currentTeam = (await adminDb().doc(`games/${seeded.gameId}/teams/${teamId}`).get()).data()!;
  const historicalRow = rd1.standings.find((row: { teamId: string }) => row.teamId === teamId)!;
  const spend = spendThroughRound(currentTeam.spendLog ?? [], 1);
  const expectedRatio = spend > 0 ? (historicalRow.wins / spend).toFixed(3) : '—';

  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId, role: 'GM', displayName: 'History GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>);

  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Standings round'), '1');
  await waitFor(() => expect(screen.getByTestId('standings')).toHaveAttribute('data-round', '1'));
  const ownRow = screen.getByTestId('standings').querySelector('tr.sel')!;
  expect(ownRow.textContent).toContain(`${historicalRow.wins}-${historicalRow.losses}`);
  expect(ownRow.textContent).toContain(expectedRatio);
  expect(ownRow.textContent).not.toContain('99-0');
}, 180000);

test('standings: current SIMULATE route never exposes the final round document', async () => {
  const seeded = await seedToPhase({ to: 'R2:SIMULATE' });
  const finalRound = (await adminDb().doc(`games/${seeded.gameId}/rounds/2`).get()).data()!;
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Reveal Coach',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>);

  const table = await screen.findByTestId('standings', {}, { timeout: 20000 });
  const displayed = [...table.querySelectorAll('tbody tr')].map((row) => row.textContent);
  const finalRecords = finalRound.standings.map(
    (row: { wins: number; losses: number }) => `${row.wins}-${row.losses}`,
  );
  expect(displayed).not.toEqual(expect.arrayContaining(finalRecords));
  expect(screen.queryByRole('option', { name: /Round 2 complete/ })).not.toBeInTheDocument();
}, 120000);
