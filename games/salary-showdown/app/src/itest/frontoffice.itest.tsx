import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, driveTo, seedToPhase, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

// Alpha's expiring deals must be REAL players. Hardship no longer signs real free
// agents — it signs synthetic $0 Default Role Players (spec §2, 2026-07-26) which are
// deliberately never re-signable and never listed here — so this test signs its own
// one-round contracts for Alpha during R1 free agency instead of leaning on the
// hardship fill the way it used to.
const EXPIRING_POSITIONS = ['G', 'W', 'B'];

async function signDeals(seeded: Seeded, positions: string[], years = 1) {
  const market = (await adminDb().doc(`games/${seeded.gameId}/market/1`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const byPid = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data()]));
  const pool: Record<string, { pid: number; sal: number }[]> = { G: [], W: [], B: [] };
  for (const pid of market.available as number[]) {
    const p = byPid[pid];
    // auction-class stars carry no list price; synthetics are not in `available` at all
    if (p.salary_per_round !== '') pool[p.position].push({ pid, sal: Number(p.salary_per_round) });
  }
  for (const q of ['G', 'W', 'B']) pool[q].sort((a, b) => a.sal - b.sal);
  const used = new Set<number>();
  const pids: number[] = [];
  for (const pos of positions) { // one per position → can never trip POSITION_LOCK
    const pick = pool[pos].find((x) => !used.has(x.pid))!;
    used.add(pick.pid);
    await httpsCallable(functions, 'signPlayer')(
      { gameId: seeded.gameId, pid: pick.pid, years });
    pids.push(pick.pid);
  }
  return pids;
}

test('front office: expiring re-sign, then a mid-contract cut with dead money', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  // Sign as Alpha's GM (same uid the app will render as) BEFORE the phase closes, so
  // these are genuine one-round contracts that expire into round 2's front office.
  const signed = await signDeals(seeded, EXPIRING_POSITIONS);
  const signedPlayers = await Promise.all(signed.map(async (pid) => ({
    pid,
    name: (await adminDb().doc(`games/${seeded.gameId}/catalog/${pid}`).get()).data()!.name as string,
  })));
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  const n = signed.length;
  await waitFor(() => expect(screen.getByText(`0 of ${n} decided`)).toBeInTheDocument(),
    { timeout: 20000 });

  // Alpha closed round 1 with only 3 active contracts (1G/1W/1B, signed above), so
  // hardship topped it up to the 8-man floor: need = max(8-3, deficits) = max(5, 2) = 5
  // synthetics signed — the roster really does carry expired synthetic contracts. They
  // must not surface as expiring deals: a Default Role Player is not re-signable
  // (backend refuses the pid range, and the client mirrors that filter in
  // lib/contracts). This is the pin for that filter.
  const alpha = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  expect(alpha.roster.some((c: { pid: number }) => c.pid >= 9000)).toBe(true);
  expect(screen.queryByText('Default Role Player')).toBeNull();

  // Re-sign the first expiring player on a 2-round deal. The selected player's
  // persistent rail previews the candidate across all five payroll rounds.
  const first = signedPlayers[0];
  const firstDecision = screen.getByRole('region', {
    name: `Contract decision for ${first.name}`,
  });
  const select = within(firstDecision).getByRole('combobox', {
    name: `Contract length for ${first.name}`,
  });
  await user.selectOptions(select, '2');
  expect(screen.getByLabelText(/Round 2: cash .*candidate \$.*total/)).toBeInTheDocument();
  await user.click(within(firstDecision).getByRole('button', {
    name: `Re-sign ${first.name}`,
  }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Saved action' }))
    .toHaveTextContent(`Re-sign saved for ${first.name}.`), { timeout: 15000 });
  await waitFor(() => expect(screen.getByText(`1 of ${n} decided`)).toBeInTheDocument(),
    { timeout: 15000 });

  // Let walk stays entirely local and reversible. It must not remove the
  // expired roster entry or pretend the server saved anything.
  const second = signedPlayers[1];
  await user.click(screen.getByRole('button', { name: `Review ${second.name}` }));
  const secondDecision = screen.getByRole('region', {
    name: `Contract decision for ${second.name}`,
  });
  await user.click(within(secondDecision).getByRole('button', { name: 'Let walk' }));
  expect(within(secondDecision).getByText('Walk selected — undo until Front Office closes.'))
    .toBeInTheDocument();
  const afterWalk = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  expect(afterWalk.roster.some((c: { pid: number }) => c.pid === second.pid)).toBe(true);
  await user.click(within(secondDecision).getByRole('button', { name: 'Undo walk' }));

  // Cut him — a genuine mid-contract cut (2-round deal, cut in its first round).
  await user.click(screen.getByRole('button', { name: `Review cut for ${first.name}` }));
  const dialog = screen.getByRole('dialog', { name: `Cut ${first.name}?` });
  expect(dialog).toHaveTextContent('No committed salary is removed.');
  expect(within(dialog).getByRole('list', { name: 'Remaining obligations' }))
    .toHaveTextContent('Round 2');
  expect(within(dialog).getByRole('list', { name: 'Remaining obligations' }))
    .toHaveTextContent('Round 3');
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Saved action' }))
    .toHaveTextContent(`Cut saved for ${first.name}.`), { timeout: 15000 });
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.deadMoney).toHaveLength(1);
    expect(t.deadMoney[0].endRound).toBe(3);
  }, { timeout: 15000 });
  expect(screen.getByText('Re-signed, then cut')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: `Review ${first.name}` }));
  expect(screen.getByRole('region', {
    name: `Contract decision for ${first.name}`,
  })).toHaveTextContent('Remaining salary is recorded as dead money.');
}, 120000);

test("we're done: GM sees the button, click stamps {doneRound, donePhase}", async () => {
  const seeded = await seedToPhase({ to: 'R2:FRONT_OFFICE' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  const btn = await screen.findByRole('button', { name: "We're done" }, { timeout: 20000 });
  await user.click(btn);

  await waitFor(() => expect(screen.getByTestId('done-note')).toHaveTextContent(
    'Marked done — you can still make changes until the phase closes.'), { timeout: 15000 });
  // The acknowledgment derives from the LIVE team doc (P2-2): the label flips
  // to 'Done noted' — and stays ENABLED (status flag, NEVER a lock).
  expect(screen.getByRole('button', { name: 'Done noted' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: "We're done" })).toBeNull();

  const t = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  expect(t.doneRound).toBe(2);
  expect(t.donePhase).toBe('FRONT_OFFICE');
}, 120000);

test('cut dialog: live rejection keeps keyboard focus and feedback inside', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode,
    teamId: seeded.teamIds[0],
    role: 'GM',
    displayName: 'IT Keyboard GM',
  });
  const [pid] = await signDeals(seeded, ['G'], 2);
  const playerName = (await adminDb().doc(
    `games/${seeded.gameId}/catalog/${pid}`).get()).data()!.name as string;
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  const trigger = await screen.findByRole('button', {
    name: `Review cut for ${playerName}`,
  }, { timeout: 20000 });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: `Cut ${playerName}?` });
  expect(within(dialog).getByRole('button', { name: 'Keep player' })).toHaveFocus();

  const teamRef = adminDb().doc(`games/${seeded.gameId}/teams/${seeded.teamIds[0]}`);
  const snapshot = (await teamRef.get()).data()!;
  await teamRef.update({
    roster: (snapshot.roster as Array<{ pid: number }>).filter((contract) => contract.pid !== pid),
  });
  await waitFor(() => expect(screen.queryByRole('button', {
    name: `Review cut for ${playerName}`,
  })).toBeNull(), { timeout: 15000 });

  await user.click(within(dialog).getByRole('button', { name: 'Confirm cut' }));
  await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument(), {
    timeout: 15000,
  });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await user.tab({ shift: true });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
}, 120000);
