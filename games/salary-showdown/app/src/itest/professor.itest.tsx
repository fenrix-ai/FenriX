import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Client, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('professor panel: creator sees join code + Lobby; header follows startSeason and advance', async () => {
  // The app under test IS the professor: createGame stamps the caller's uid as
  // professorUid, and every panel listener rides that rule right. The professor
  // has NO players/{uid} membership doc — joinGame is never called for it.
  // AuthProvider only signs in once rendered, so sign in explicitly first
  // (same Task 6 finding the other itests restate).
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({ teamNames: names })
    .then((r) => r.data as { gameId: string; joinCode: string });

  // Bots on every team so driveTo can run its FA signing routine later.
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const bots: Seeded['bots'] = [];
  for (const [i, teamId] of teamIds.entries()) {
    const gm = await newClient(`gm${i}`);
    const scout = await newClient(`sc${i}`);
    const coach = await newClient(`co${i}`);
    await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId, gm, scout, coach });
  }
  // Prof shim over the DEFAULT app so driveTo's advancePhase calls (which
  // always carry expectedPhase + expectedRound — standing hard rule) come
  // from the professor uid via the shipped WebChannel transport.
  const prof = {
    uid: auth.currentUser!.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: () => Promise.resolve(),
  };
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };

  localStorage.setItem('ss.profGameId', gameId);
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(joinCode)).toBeInTheDocument(),
    { timeout: 20000 });
  expect(screen.getByText('Lobby')).toBeInTheDocument();
  // Spec §5 item 9: config shown read-only. fmtM(100) → "$100.0M"
  // (money.ts:11, `$${x.toFixed(1)}M`); config knobs are decorative, so this
  // is plain text — asserting on the exact string also guards against anyone
  // "improving" it into an input.
  expect(screen.getByText('Cap $100.0M · 5 rounds')).toBeInTheDocument();

  await driveTo(seeded, 'R1:FREE_AGENCY'); // calls startSeason under the hood
  await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
    { timeout: 20000 });

  await driveTo(seeded, 'R1:AUCTION'); // FA signing routine + one advance
  await waitFor(() => expect(screen.getByText(/Star Auction · Round 1/)).toBeInTheDocument(),
    { timeout: 30000 });
}, 240000);

test('panel: create enforces the 21-franchise cap, lists franchises, starts the season', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  localStorage.removeItem('ss.profGameId'); // fresh panel: force the create/resume view
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  const box = await screen.findByLabelText('team names', {}, { timeout: 20000 });
  await user.click(box);
  await user.paste(Array.from({ length: 22 }, (_, i) => `Team ${i + 1}`).join('\n'));
  await user.click(screen.getByRole('button', { name: 'Create game' }));
  // The franchise cap is enforced HERE in the panel (count check + exact copy),
  // NOT server-side (standing hard rule): the inline error renders and no game
  // was created (no session header appears).
  expect(screen.getByText(
    "Cap sessions at 21 franchises — the round document approaches Firestore's 1 MiB limit beyond that.",
  )).toBeInTheDocument();
  expect(screen.queryByLabelText('Join code')).toBeNull();

  await user.clear(box);
  await user.click(box);
  await user.paste('Alpha\nBeta\nGamma');
  await user.click(screen.getByRole('button', { name: 'Create game' }));
  await waitFor(() => expect(screen.getByLabelText('Join code')).toBeInTheDocument(),
    { timeout: 30000 });
  for (const nm of ['Alpha', 'Beta', 'Gamma']) {
    await waitFor(() => expect(screen.getByText(nm)).toBeInTheDocument(), { timeout: 20000 });
  }
  await user.click(await screen.findByRole('button', { name: 'Start season' }, { timeout: 20000 }));
  // startSeason lands in FREE_AGENCY R1 (Draft Night); the advance button names
  // the CONCRETE next phase from the order — Star Auction, same round.
  await screen.findByRole('button', { name: 'Advance → Star Auction · R1' }, { timeout: 30000 });
}, 240000);

test('panel advance: all-lights-on skips the modal; a missing submission names the team and confirm advances', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const names = ['Alpha', 'Beta', 'Gamma'];
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({ teamNames: names })
    .then((r) => r.data as { gameId: string; joinCode: string });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const bots: { teamId: string; gm: Client; scout: Client }[] = [];
  for (const [i, teamId] of teamIds.entries()) {
    const gm = await newClient(`gm${i}`);
    const scout = await newClient(`sc${i}`);
    await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
    bots.push({ teamId, gm, scout });
  }
  await httpsCallable(functions, 'startSeason')({ gameId }); // → FREE_AGENCY R1
  // Every GM marks done BEFORE the panel renders: all three Draft Night lights on.
  // markDone is a status flag, never a lock (T2).
  for (const bot of bots) await bot.gm.call('markDone', { gameId });

  localStorage.setItem('ss.profGameId', gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  // Happy advance: every light on → no confirm modal, straight to AUCTION.
  const advFa = await screen.findByRole('button',
    { name: 'Advance → Star Auction · R1' }, { timeout: 30000 });
  await waitFor(() => expect(screen.getByText('Submitted: 3 of 3')).toBeInTheDocument(),
    { timeout: 20000 });
  await user.click(advFa);
  expect(screen.queryByRole('dialog')).toBeNull(); // no guard when every light is on
  const advAuction = await screen.findByRole('button',
    { name: 'Advance → Lineup · R1' }, { timeout: 30000 });

  // AUCTION: exactly one team (Gamma) stays un-submitted. Rate 2.0 is round 1's
  // league minimum (minBid(1) — see harness).
  const wave = (await adminDb().doc(`games/${gameId}/auctions/1`).get()).data()!;
  await bots[0].scout.call('submitBids', { gameId,
    bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } });
  await bots[1].scout.call('submitBids', { gameId,
    bids: { [wave.stars[1 % wave.stars.length]]: { rate: 2.0, years: 1 } } });
  await waitFor(() => expect(screen.getByText('Submitted: 2 of 3')).toBeInTheDocument(),
    { timeout: 20000 });
  await user.click(advAuction);
  const dialog = await screen.findByRole('dialog');
  // Facts only: team NAMES, never bid contents.
  expect(dialog.textContent).toContain(
    "1 teams haven't submitted: Gamma. Advance anyway? Server defaults will apply.");
  await user.click(screen.getByRole('button', { name: 'Advance anyway' }));
  await screen.findByRole('button', { name: 'Advance → Simulate · R1' }, { timeout: 30000 });
}, 240000);
