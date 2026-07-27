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

async function signOneRoundDeals(seeded: Seeded, positions: string[]) {
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
      { gameId: seeded.gameId, pid: pick.pid, years: 1 });
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
  const signed = await signOneRoundDeals(seeded, EXPIRING_POSITIONS);
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/office']}><App /></MemoryRouter>);

  const n = signed.length;
  await waitFor(() => expect(screen.getByText(`0 of ${n} decided`)).toBeInTheDocument(),
    { timeout: 20000 });

  // Alpha finished round 1 three players short, so hardship DID top it up — the roster
  // really does carry expired synthetic contracts. They must not surface as expiring
  // deals: a Default Role Player is not re-signable (backend refuses the pid range, and
  // the client mirrors that filter in lib/contracts). This is the pin for that filter.
  const alpha = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  expect(alpha.roster.some((c: { pid: number }) => c.pid >= 9000)).toBe(true);
  expect(screen.queryByText('Default Role Player')).toBeNull();

  // Re-sign the first expiring player on a 2-round deal.
  const firstCard = screen.getAllByRole('button', { name: 'Re-sign' })[0].closest('.card')!;
  const select = within(firstCard as HTMLElement).getByRole('combobox');
  await user.selectOptions(select, '2');
  await user.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Re-sign' }));
  await waitFor(() => expect(screen.getByText(`1 of ${n} decided`)).toBeInTheDocument(),
    { timeout: 15000 });

  // Cut him — a genuine mid-contract cut (2-round deal, cut in its first round).
  await user.click(screen.getByRole('button', { name: 'Cut' }));
  expect(screen.getByRole('dialog').textContent).toContain('dead money');
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.deadMoney).toHaveLength(1);
    expect(t.deadMoney[0].endRound).toBe(3);
  }, { timeout: 15000 });
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
  // Status flag, NEVER a lock: the button must still be pressable after success.
  expect(screen.getByRole('button', { name: "We're done" })).toBeEnabled();

  const t = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  expect(t.doneRound).toBe(2);
  expect(t.donePhase).toBe('FRONT_OFFICE');
}, 120000);
