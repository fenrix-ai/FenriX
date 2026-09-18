import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, seedToPhase, newClient } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('draft night: analyst table, sign drawer, non-exclusive row persists, ALREADY_SIGNED', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  process.stdout.write(`W02 fixture ${seeded.gameId}\n`);
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
  // Another team's ordinary copy never removes this player's market row.
  await seeded.bots[0].gm.call('signPlayer', { gameId: seeded.gameId, pid: target.pid, years: 1 });
  await user.type(screen.getByLabelText('search players'), target.name);
  await user.click(screen.getByText(target.name));
  // Round 1 ask = CSV base exactly (assert on the drawer's text, not getByText —
  // the string spans nested elements and would match multiple ancestors).
  await waitFor(() => expect(document.querySelector('.drawer')!.textContent)
    .toContain(`asks $${Number(target.salary_per_round).toFixed(1)}M/rd tonight`));

  await user.click(screen.getByRole('button', { name: /^2 rd —/ }));
  const duration = screen.getByRole('button', { name: /^2 rd —/ });
  expect(duration).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByTestId('sign-note'))
    .toHaveTextContent('He remains available to every team.'), { timeout: 15000 });
  // …and reflects the signing live from the team doc.
  await waitFor(() => expect(roster().textContent).toContain(target.name), { timeout: 15000 });
  expect(roster().textContent).toContain('1 of 10');
  expect(duration).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('search players')).toHaveValue(target.name);
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toHaveFocus();
  // NON-EXCLUSIVE: the row is still in the table after signing (scope to the
  // table — the open drawer repeats the same name and getByText would ambiguate).
  expect(document.querySelector('table')!.textContent).toContain(target.name);

  // Signing the same copy again trips ALREADY_SIGNED, mapped to student copy.
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('He is already under contract with your team.'), { timeout: 15000 });
  expect(duration).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('search players')).toHaveValue(target.name);
}, 120000);

test("we're done (P2-2): acknowledgment derives from the server flag and survives a remount", async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  process.stdout.write(`W02 fixture ${seeded.gameId}\n`);
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


test('comparison keeps three pids through sorting and filtering; fourth selection preserves them', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY', teams: ['Alpha', 'Beta'] });
  process.stdout.write(`W02 comparison fixture ${seeded.gameId}\n`);
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({ joinCode: seeded.joinCode,
    teamId: seeded.teamIds[0], role: 'Scout', displayName: 'W02 fallback' });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);
  await screen.findByText('In market tonight (112)', {}, { timeout: 20000 });
  expect(screen.getByTestId('role-fallback')).toBeInTheDocument();
  const toggles = screen.getAllByRole('button', { name: /^Compare / }).slice(0, 4);
  for (const toggle of toggles) await user.click(toggle);
  expect(screen.getByText('Compare up to three players. Remove one to add another.')).toBeInTheDocument();
  const tray = screen.getByRole('region', { name: 'Player comparison' });
  expect(within(tray).getAllByRole('button', { name: /^Remove / })).toHaveLength(3);
  const names = within(tray).getAllByRole('columnheader').map((th) => th.textContent);
  await user.click(screen.getByRole('button', { name: 'Sort by Player' }));
  await user.type(screen.getByLabelText('search players'), 'no matching player');
  expect(within(tray).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(names);
  await user.click(within(tray).getAllByRole('button', { name: /^Remove / })[1]);
  expect(within(tray).getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  expect(within(tray).getAllByRole('button', { name: /^Remove / })[1]).toHaveFocus();
  await user.clear(screen.getByLabelText('search players'));
  const selectedName = toggles[0].getAttribute('aria-label')!.replace('Compare ', '');
  await user.click(screen.getByRole('button', { name: selectedName }));
  await user.click(screen.getByRole('button', { name: "We're done" }));
  await screen.findByRole('button', { name: 'Done noted' }, { timeout: 15000 });
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await screen.findByTestId('sign-note', {}, { timeout: 15000 });
  expect(screen.getByTestId('sign-note')).toHaveTextContent(`Signed ${selectedName}`);
  // The fallback closes when the actual GM seat is claimed.
  const gm = await newClient('w02-new-gm');
  await gm.call('joinGame', { joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Actual GM' });
  await waitFor(() => expect(screen.queryByTestId('role-fallback')).toBeNull());
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
  await gm.dispose();
}, 120000);


test('contract duration exposes future cap violations before a signing can be sent', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY', teams: ['Alpha', 'Beta'] });
  process.stdout.write(`W02 future cap fixture ${seeded.gameId}\n`);
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const target = cat.docs.map((d) => d.data()).find((p) => market.available.includes(p.pid) && p.salary_per_round === '2.0')!;
  // Construct a later-round obligation on this fresh test-only team.
  await adminDb().doc(`games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).update({
    deadMoney: [{ pid: 77, rate: 99, startRound: 2, endRound: 2 }],
  });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({ joinCode: seeded.joinCode,
    teamId: seeded.teamIds[0], role: 'GM', displayName: 'Future cap GM' });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);
  await screen.findByText('In market tonight (112)', {}, { timeout: 20000 });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('search players'), target.name);
  await user.click(screen.getByRole('button', { name: target.name }));
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '2 rd — $1.8M' }));
  expect(screen.getByText('Exceeds cap in round 2: $100.8M.')).toBeInTheDocument();
  expect(screen.getByLabelText('Round 2: cash $0.0M, dead money $99.0M, candidate $1.8M, total $100.8M, over cap')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '1 rd — $2.0M' }));
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeEnabled();
}, 120000);
