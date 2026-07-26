import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Client, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

// ss.prof* panel prefs are PANEL-LOCAL localStorage. Every test starts from a
// clean slate and states its OWN keys explicitly — before this pass the T8
// timer tests leaked ss.profAutoArm / ss.profAutoAdvance / ss.profTimerDefaults
// forward into the T9 grid test (harmless only because autoArm '0' kept
// timers off; leaked state is a flake seed, not a baseline). Task 1's
// ss.profArmedKey is cleared here too.
beforeEach(() => {
  localStorage.clear();
});

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
  localStorage.setItem('ss.profAutoArm', '0');     // deterministic: no advisory auto-timers
  localStorage.setItem('ss.profAutoAdvance', '0');
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
  // beforeEach cleared ss.profGameId — the panel opens on the create/resume view.
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
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
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
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

// ——— Task 8: timer strip + auto-arm/auto-advance ———
// The panel professor must be the DEFAULT app's signed-in user (the itest
// client that calls createGame IS the professor). seedToPhase() builds its own
// isolated prof client, so we assemble a Seeded by hand around the default app
// and reuse driveTo() for the season driving.
async function seedTimerGame(to: string): Promise<Seeded> {
  const cred = await signInAnonymously(auth);
  const prof = {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: async () => {},
  };
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const { gameId, joinCode } = await prof.call<{ gameId: string; joinCode: string }>(
    'createGame', { teamNames: names });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const bots: Seeded['bots'] = [];
  for (const i of [1, 2, 3]) {
    const gm = await newClient(`t8gm${i}`);
    const scout = await newClient(`t8sc${i}`);
    const coach = await newClient(`t8co${i}`);
    await gm.call('joinGame', { joinCode, teamId: teamIds[i], role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId: teamIds[i], role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId: teamIds[i], gm, scout, coach });
  }
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots };
  await driveTo(seeded, to);
  return seeded;
}

test('timer strip: UI-start 90s counts down, UI-pause freezes the led', async () => {
  // R2, not R1: round 1 has no FRONT_OFFICE (startSeason enters at R1:FREE_AGENCY;
  // FRONT_OFFICE exists only as the entry phase of rounds 2+). R2:FRONT_OFFICE keeps
  // the FRONT_OFFICE:90 default below, so the button reads "Start 01:30".
  const seeded = await seedTimerGame('R2:FRONT_OFFICE');
  localStorage.setItem('ss.profGameId', seeded.gameId);
  localStorage.setItem('ss.profAutoArm', '0');      // this test drives the timer by hand
  localStorage.setItem('ss.profAutoAdvance', '0');
  localStorage.setItem('ss.profTimerDefaults', JSON.stringify(
    { FRONT_OFFICE: 90, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 90, SIMULATE: 60, RESULTS: 90 }));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  await screen.findByTestId('timer-strip', {}, { timeout: 20000 });
  const strip = () => within(screen.getByTestId('timer-strip'));

  // Start uses the per-phase default read from ss.profTimerDefaults (90s here).
  await user.click(await strip().findByRole('button', { name: 'Start 01:30' }, { timeout: 10000 }));
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.timerEndsAt).not.toBeNull();
    expect(g.timerPausedMs).toBeNull();
    const ends = g.timerEndsAt.toMillis();
    expect(ends).toBeGreaterThan(Date.now() + 60_000);   // a ~90s deadline, not garbage
    expect(ends).toBeLessThanOrEqual(Date.now() + 91_000);
  }, { timeout: 15000 });

  // The panel led mirrors the countdown: it leaves --:-- and then ticks down.
  await waitFor(() => {
    expect(strip().getByTestId('led')).not.toHaveTextContent('--:--');
  }, { timeout: 15000 });
  const first = strip().getByTestId('led').textContent;
  await waitFor(() => {
    expect(strip().getByTestId('led').textContent).not.toBe(first);
  }, { timeout: 5000 });

  await user.click(strip().getByRole('button', { name: 'Pause' }));
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.timerEndsAt).toBeNull();
    expect(g.timerPausedMs).toBeGreaterThan(0);
    expect(g.timerPausedMs).toBeLessThanOrEqual(90_000);
  }, { timeout: 15000 });

  // Frozen while paused — bounded-negative pattern: the led text must NOT
  // change across a 1.2s wait (the running tick is 500ms / 1s resolution, so a
  // still-running clock would have moved at least once in that window).
  await waitFor(() => expect(strip().getByText('paused')).toBeInTheDocument(), { timeout: 10000 });
  const frozen = strip().getByTestId('led').textContent;
  await new Promise((r) => setTimeout(r, 1200));
  expect(strip().getByTestId('led').textContent).toBe(frozen);
}, 180000);

test('auto-advance: 2s timer at LINEUP advances to SIMULATE without a click', async () => {
  const seeded = await seedTimerGame('R1:LINEUP');
  // Lineups "locked" via the harness (admin status-flag writes) so every light
  // is green. This is only the doneness flag: the LINEUP exit hook still
  // validates/auto-repairs actual lineups server-side, so the flag alone is
  // safe — timers are advisory and expiry never blocks anything server-side.
  for (const teamId of seeded.teamIds) {
    await adminDb().doc(`games/${seeded.gameId}/teams/${teamId}`)
      .update({ lineupLockedRound: 1 });
  }
  localStorage.setItem('ss.profGameId', seeded.gameId);
  localStorage.setItem('ss.profAutoArm', '0');       // deterministic: we arm via the Start button
  localStorage.setItem('ss.profAutoAdvance', '1');   // the toggle under test
  localStorage.setItem('ss.profTimerDefaults', JSON.stringify(
    { FRONT_OFFICE: 180, FREE_AGENCY: 150, AUCTION: 120, LINEUP: 2, SIMULATE: 60, RESULTS: 90 }));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  await screen.findByTestId('timer-strip', {}, { timeout: 20000 });
  const strip = () => within(screen.getByTestId('timer-strip'));

  await user.click(await strip().findByRole('button', { name: 'Start 00:02' }, { timeout: 10000 }));

  // No Advance click anywhere in this test: the strip itself fires advancePhase
  // (with expectedPhase/expectedRound from the gated game) when the timer hits 0.
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${seeded.gameId}`).get()).data()!;
    expect(g.phase).toBe('SIMULATE');
    expect(g.round).toBe(1);
  }, { timeout: 30000 });
}, 240000);

// ——— Task 9: SubmissionGrid + RoundContext ———
// The rendered panel's call() goes through the default app, so the DEFAULT
// app's anonymous user must BE the professor (contracts: the itest client that
// calls createGame IS the professor). seedToPhase() can't be used here — its
// professor is a separate harness client. The prof shim below satisfies the
// harness Client shape so driveTo() works unchanged (it always sends
// expectedPhase + expectedRound to advancePhase — RULING unchanged).
async function seedProfGame(names: string[]): Promise<Seeded> {
  const cred = await signInAnonymously(auth);
  const { gameId, joinCode } = (await httpsCallable(functions, 'createGame')({
    teamNames: names })).data as { gameId: string; joinCode: string };
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = names.map((nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const prof: Client = {
    uid: cred.user.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: async () => {},
  };
  const bots: Seeded['bots'] = [];
  for (const [i, teamId] of teamIds.entries()) {
    const gm = await newClient(`pgm${i}`);
    const scout = await newClient(`psc${i}`);
    const coach = await newClient(`pco${i}`);
    await gm.call('joinGame', { joinCode, teamId, role: 'GM', displayName: `GM${i}` });
    await scout.call('joinGame', { joinCode, teamId, role: 'Scout', displayName: `S${i}` });
    await coach.call('joinGame', { joinCode, teamId, role: 'Coach', displayName: `C${i}` });
    bots.push({ teamId, gm, scout, coach });
  }
  return { gameId, joinCode, teamIds, prof, bots };
}

test('submission grid: lights track markDone, bids, lineup locks; absent in SIMULATE; round context at RESULTS', async () => {
  const seeded = await seedProfGame(['Alpha', 'Beta']);
  // Round 1 has NO FRONT_OFFICE — startSeason enters at R1:FREE_AGENCY
  // (FRONT_OFFICE exists only rounds 2+). markDone and the doneRound/donePhase
  // light rule apply identically in FREE_AGENCY.
  await driveTo(seeded, 'R1:FREE_AGENCY');
  localStorage.setItem('ss.profGameId', seeded.gameId);
  localStorage.setItem('ss.profAutoArm', '0');     // previously leaked in from the T8 tests
  localStorage.setItem('ss.profAutoAdvance', '0');
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);
  const [alphaId, betaId] = seeded.teamIds;

  // FREE_AGENCY: grid renders, both lights empty.
  await waitFor(() => {
    expect(screen.getByTestId(`light-${alphaId}`)).toHaveTextContent('○ Alpha');
    expect(screen.getByTestId(`light-${betaId}`)).toHaveTextContent('○ Beta');
  }, { timeout: 20000 });

  // Harness GM marks done → only Alpha's light fills.
  await seeded.bots[0].gm.call('markDone', { gameId: seeded.gameId });
  await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
    .toHaveTextContent('● Alpha'), { timeout: 15000 });
  expect(screen.getByTestId(`light-${betaId}`)).toHaveTextContent('○ Beta');

  // AUCTION: lights reset (phase-scoped), then a Scout's bid fills Alpha's.
  await driveTo(seeded, 'R1:AUCTION');
  await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
    .toHaveTextContent('○ Alpha'), { timeout: 20000 });
  const wave = (await adminDb().doc(
    `games/${seeded.gameId}/auctions/1`).get()).data()!;
  await seeded.bots[0].scout.call('submitBids', { gameId: seeded.gameId,
    bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } });
  await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
    .toHaveTextContent('● Alpha'), { timeout: 15000 });
  // Lights only — the grid must NEVER surface bid contents.
  expect(screen.getByTestId('submission-grid').textContent).not.toContain('2.0');

  // LINEUP: harness leaves lineups to the exit hook's auto-repair, so the
  // light needs an explicit Coach submitLineup (full 5+sixth+rest assignment;
  // validateLineup requires EVERY active pid assigned and 2G/2W/1B starters).
  await driveTo(seeded, 'R1:LINEUP');
  await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
    .toHaveTextContent('○ Alpha'), { timeout: 20000 });
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const posOf = new Map(cat.docs.map((d) => [Number(d.id), d.data().position as string]));
  const alpha = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${alphaId}`).get()).data()!;
  const pids: number[] = alpha.roster
    .filter((c: { startRound: number; years: number }) => c.startRound + c.years - 1 >= 1)
    .map((c: { pid: number }) => c.pid);
  const byPos: Record<string, number[]> = { G: [], W: [], B: [] };
  for (const pid of pids) byPos[posOf.get(pid)!].push(pid);
  const starters = [byPos.G[0], byPos.G[1], byPos.W[0], byPos.W[1], byPos.B[0]];
  const rest = pids.filter((p) => !starters.includes(p));
  await seeded.bots[0].coach.call('submitLineup', { gameId: seeded.gameId,
    lineup: { starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' } });
  await waitFor(() => expect(screen.getByTestId(`light-${alphaId}`))
    .toHaveTextContent('● Alpha'), { timeout: 15000 });

  // SIMULATE: no lights section at all.
  await driveTo(seeded, 'R1:SIMULATE');
  await waitFor(() =>
    expect(screen.queryByTestId('submission-grid')).toBeNull(), { timeout: 20000 });

  // RESULTS: RoundContext renders facts from rounds/1 — a standings row
  // (rank · name · W-L · point diff) and a score line (names, not teamIds).
  await driveTo(seeded, 'R1:RESULTS');
  await waitFor(() => {
    const ctx = screen.getByTestId('round-context');
    expect(ctx.textContent).toMatch(/1 · (Alpha|Beta) · \d+-\d+ · [+-]?\d+/);
    expect(ctx.textContent).toMatch(/(Alpha|Beta) \d+–\d+ (Alpha|Beta)/);
  }, { timeout: 20000 });
}, 240000);
