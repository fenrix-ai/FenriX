import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, newClient, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('lineup: pre-arranged legal, playstyle pick, submit locks the round', async () => {
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'IT Coach',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
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

  const activeBench = screen.getByRole('button', { name: 'Active bench 1' });
  const benchName = within(activeBench).getByTestId('lineup-player-name').textContent!;
  const benchPosition = within(activeBench).getByTestId('lineup-player-position').textContent!;
  const benchPid = within(activeBench).getByTestId('lineup-player-name')
    .closest('[data-player-pid]')!.getAttribute('data-player-pid')!;
  const target = benchPosition === 'G' ? 'Guard 1' : benchPosition === 'W' ? 'Wing 1' : 'Big';
  await user.click(screen.getByRole('button', {
    name: new RegExp(`^Select .*player ${benchPid}$`),
  }));
  await user.click(screen.getByRole('button', { name: target }));
  expect(screen.getByRole('button', { name: target })).toHaveTextContent(benchName);

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

test('lineup (F7): a GM tab follows the Coach\'s submit live and shows the locked badge', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  const lineupStatus = () =>
    screen.getAllByRole('status').find((el) => el.textContent?.startsWith('Lineup:'))!;

  // Alpha holds 8 hardship players (nobody signed for it) → auto-arranged
  // preview, Balanced, and NO badge: nothing is locked yet.
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Balanced'), { timeout: 20000 });
  expect(screen.queryByTestId('lineup-locked-badge')).toBeNull();

  // The Coach (a DIFFERENT client) submits Lockdown with a legal arrangement
  // built from the admin-read roster + catalog positions.
  const teamDoc = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  const active: number[] = teamDoc.roster
    .filter((c: { startRound: number; years: number }) => c.startRound + c.years - 1 >= 1)
    .map((c: { pid: number }) => c.pid);
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const posOf = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data().position]));
  const g = active.filter((p) => posOf[p] === 'G');
  const w = active.filter((p) => posOf[p] === 'W');
  const b = active.filter((p) => posOf[p] === 'B');
  const starters = [g[0], g[1], w[0], w[1], b[0]];
  const rest = active.filter((p) => !starters.includes(p));
  const sixth = rest.find((p) => posOf[p] === 'G')!;
  const benchB = rest.find((p) => posOf[p] === 'B')!;
  const benchW = rest.find((p) => posOf[p] === 'W')!;
  const coach = await newClient('f7-coach');
  await coach.call('joinGame', {
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'F7 C' });
  // Bench order [B, W] deliberately INVERTS what arrangeLineup would emit:
  // synthetics share identical minutes, Array.sort is stable, so an arranged
  // bench falls out in roster order ([W, B] here). Faithful render of the
  // locked lineup — bench order is the rule; these two play in THIS order —
  // must show B first. A regression back to arrangeLineup flips it.
  await coach.call('submitLineup', { gameId: seeded.gameId, lineup: {
    starters, sixth, bench: [benchB, benchW], playstyle: 'Lockdown' } });

  // The GM tab follows WITHOUT any remount/reload: live playstyle + badge.
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Playstyle: Lockdown'), { timeout: 15000 });
  expect(screen.getByTestId('lineup-locked-badge'))
    .toHaveTextContent('Lineup locked for round 1 — the Coach can revise until the phase closes.');

  // Faithful bench order: the ACTIVE BENCH zones show the Coach's exact
  // order (B then W), not the minutes-arranged one (W then B).
  const badges = [
    screen.getByRole('button', { name: 'Active bench 1' }).textContent ?? '',
    screen.getByRole('button', { name: 'Active bench 2' }).textContent ?? '',
  ];
  expect(badges).toHaveLength(2);
  expect(badges[0]).toContain('B');
  expect(badges[1]).toContain('W');
}, 120000);

test('lineup (F7 fix round 2): a Coach remount seeds the LOCKED lineup verbatim, not re-arranged', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'IT Coach',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const first = render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  const lineupStatus = () =>
    screen.getAllByRole('status').find((el) => el.textContent?.startsWith('Lineup:'))!;
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Balanced'), { timeout: 20000 });

  // Same discriminating-bench-order technique as the F7 test above: the Coach
  // locks bench [B, W] where an arranged bench falls out [W, B] (synthetics
  // share identical minutes; stable sort → roster order).
  const teamDoc = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  const active: number[] = teamDoc.roster
    .filter((c: { startRound: number; years: number }) => c.startRound + c.years - 1 >= 1)
    .map((c: { pid: number }) => c.pid);
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const posOf = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data().position]));
  const g = active.filter((p) => posOf[p] === 'G');
  const w = active.filter((p) => posOf[p] === 'W');
  const b = active.filter((p) => posOf[p] === 'B');
  const starters = [g[0], g[1], w[0], w[1], b[0]];
  const rest = active.filter((p) => !starters.includes(p));
  const sixth = rest.find((p) => posOf[p] === 'G')!;
  const benchB = rest.find((p) => posOf[p] === 'B')!;
  const benchW = rest.find((p) => posOf[p] === 'W')!;
  // THIS tab's Coach submits directly (the same callable the Submit button
  // wraps — a stand-in for a drag rearrangement jsdom's DndContext can't do).
  await httpsCallable(functions, 'submitLineup')({ gameId: seeded.gameId, lineup: {
    starters, sixth, bench: [benchB, benchW], playstyle: 'Lockdown' } });
  await waitFor(() => expect(screen.getByTestId('lineup-locked-badge')).toBeInTheDocument(),
    { timeout: 15000 });

  // Remount (hard-refresh / Standings-round-trip stand-in, market.itest's
  // P2-2 pattern): the Coach's mount seed must return the locked lineup
  // VERBATIM. A seed that re-runs arrangeLineup rebuilds the bench by
  // minutes, silently flipping it back to [W, B] — and a re-Submit would
  // persist the reversion into the sim.
  first.unmount();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Lockdown'), { timeout: 20000 });
  const badges = [
    screen.getByRole('button', { name: 'Active bench 1' }).textContent ?? '',
    screen.getByRole('button', { name: 'Active bench 2' }).textContent ?? '',
  ];
  expect(badges).toHaveLength(2);
  expect(badges[0]).toContain('B'); // the locked order…
  expect(badges[1]).toContain('W'); // …not the minutes-arranged one
}, 120000);

test('lineup: a deep roster keeps every pid and later depth remains after the active bench', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  const teamRef = adminDb().doc(`games/${seeded.gameId}/teams/${seeded.teamIds[0]}`);
  const team = (await teamRef.get()).data()!;
  const rosterPids = new Set<number>(team.roster.map((c: { pid: number }) => c.pid));
  const catalogSnap = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const additions = ['G', 'W'].map((position) => {
    const doc = catalogSnap.docs.find((candidate) =>
      candidate.data().position === position && !rosterPids.has(Number(candidate.id)))!;
    return {
      pid: Number(doc.id), rate: 5, startRound: 1, years: 1,
      viaAuction: false, hardship: false,
    };
  });
  await teamRef.update({
    roster: [...team.roster, ...additions],
    lineup: null,
    lineupLockedRound: 0,
  });

  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'Deep Coach',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Inactive depth' }))
    .toBeInTheDocument(), { timeout: 20000 });
  const depthBefore = within(screen.getByRole('button', { name: 'Inactive depth' }))
    .getAllByTestId('lineup-player-name').map((node) => node.textContent);
  expect(depthBefore).toHaveLength(2);

  await user.click(screen.getByRole('button', { name: 'Submit lineup' }));
  await waitFor(async () => {
    const saved = (await teamRef.get()).data()!;
    expect(saved.lineupLockedRound).toBe(1);
    expect(saved.lineup.bench).toHaveLength(4);
    const savedPids = [
      ...saved.lineup.starters, saved.lineup.sixth, ...saved.lineup.bench,
    ].sort((a: number, b: number) => a - b);
    expect(savedPids).toEqual(
      [...team.roster.map((c: { pid: number }) => c.pid), ...additions.map((c) => c.pid)]
        .sort((a, b) => a - b),
    );
  }, { timeout: 15000 });
}, 120000);
