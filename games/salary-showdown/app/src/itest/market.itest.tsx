import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('draft night: analyst table, sign drawer, non-exclusive row persists, ALREADY_SIGNED', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);

  // Round-1 draw = 75% of the 150-player FA pool = 112 rows in "In market tonight".
  await waitFor(() => expect(screen.getByText('In market tonight (112)')).toBeInTheDocument(),
    { timeout: 20000 });
  // The two decoder columns the mock omitted are present.
  expect(screen.getByText('STL')).toBeInTheDocument();
  expect(screen.getByText('BLK')).toBeInTheDocument();

  // Pin (final-review wave, FreeAgencyPage synthetic-filter fix): catalog seeds the 8
  // synthetic Default Role Players (pid 9000+) at createGame time, well before any
  // team ever hits hardship — their salary_per_round is '0.0', which used to pass the
  // rows loop's isFa check and leak into the "All players" view. Real FA pool is
  // exactly 150 (175 total − 25 auction-class); a regression re-admits the 8
  // synthetics and this reads "All players (158)" with a visible DRP row.
  const allChip = screen.getByRole('button', { name: /^All players \(/ });
  expect(allChip).toHaveTextContent('All players (150)');
  await user.click(allChip);
  // page-wide sweep: safe at R1 only (hardship signs at the FA EXIT hook) — an R2+ FA test would trip this via the roster panel
  expect(screen.queryByText('Default Role Player')).toBeNull();

  // Playtest-2 item 2: the roster panel exists and starts empty.
  const roster = () => screen.getByTestId('my-roster');
  expect(roster().textContent).toContain('0 of 10');
  expect(roster().textContent).toContain('No players under contract yet.');

  // Open the drawer on a known cheap player: search by a name from the market.
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const target = (market.available as number[])
    .map((pid) => byPid[pid])
    .filter((p) => p.salary_per_round !== '')
    .sort((a, b) => Number(a.salary_per_round) - Number(b.salary_per_round))[0];
  await user.type(screen.getByLabelText('search players'), target.name);
  await user.click(screen.getByText(target.name));
  // Round 1 ask = CSV base exactly (assert on the drawer's text, not getByText —
  // the string spans nested elements and would match multiple ancestors).
  await waitFor(() => expect(document.querySelector('.drawer')!.textContent)
    .toContain(`asks $${Number(target.salary_per_round).toFixed(1)}M/rd tonight`));

  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByTestId('sign-note'))
    .toHaveTextContent('He remains available to every team.'), { timeout: 15000 });
  // …and reflects the signing live from the team doc.
  await waitFor(() => expect(roster().textContent).toContain(target.name), { timeout: 15000 });
  expect(roster().textContent).toContain('1 of 10');
  // NON-EXCLUSIVE: the row is still in the table after signing (scope to the
  // table — the open drawer repeats the same name and getByText would ambiguate).
  expect(document.querySelector('table')!.textContent).toContain(target.name);

  // Signing the same copy again trips ALREADY_SIGNED, mapped to student copy.
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('He is already under contract with your team.'), { timeout: 15000 });
}, 120000);

test("we're done (P2-2): acknowledgment derives from the server flag and survives a remount", async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  const first = render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);

  const btn = await screen.findByRole('button', { name: "We're done" }, { timeout: 20000 });
  expect(screen.queryByTestId('done-note')).toBeNull(); // nothing acknowledged yet
  await user.click(btn);

  // Label + note flip from the LIVE team doc (server stamped doneRound/donePhase).
  await screen.findByRole('button', { name: 'Done noted' }, { timeout: 15000 });
  expect(screen.getByTestId('done-note')).toHaveTextContent(
    'Marked done — you can still make changes until the phase closes.');
  expect(screen.getByRole('button', { name: 'Done noted' })).toBeEnabled(); // NEVER a lock

  // Remount (reload stand-in): the acknowledgment persists — it derives from
  // the team doc, not click-local state (the pre-fix behavior lost it here).
  first.unmount();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Done noted' }, { timeout: 20000 });
  expect(screen.getByTestId('done-note')).toBeInTheDocument();
}, 120000);
