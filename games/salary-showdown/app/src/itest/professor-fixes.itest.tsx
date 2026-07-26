import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import { AuthProvider } from '../contexts/AuthContext';
import { ProfessorProvider } from '../contexts/ProfessorContext';
import { AdvanceControl } from '../components/professor/AdvanceControl';
import App from '../App';

// 3b T1 backlog fixes. localStorage persists across tests within this file,
// so start every test from a clean slate and set the ss.prof* keys each test
// actually depends on (same hygiene T2 retrofits onto professor.itest.tsx).
beforeEach(() => localStorage.clear());

test('stuck advance: continuous settling past the threshold offers Resolve; resolving adopts the crashed flip', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const { gameId } = await httpsCallable(functions, 'createGame')({
    teamNames: ['Alpha', 'Beta'] })
    .then((r) => r.data as { gameId: string; joinCode: string });
  await httpsCallable(functions, 'startSeason')({ gameId }); // → R1:FREE_AGENCY

  // Simulate a CRASHED advance: the transactional flip committed (round/phase
  // already point at AUCTION, both timer fields nulled, marker set — exactly
  // the `update` advancePhase's transaction writes in game.js) but the caller
  // died before running hooks and deleting the marker. auctions/1 does NOT
  // exist yet — that is what makes this advance genuinely unfinished.
  await adminDb().doc(`games/${gameId}`).update({
    round: 1, phase: 'AUCTION', timerEndsAt: null, timerPausedMs: null,
    transition: { fromRound: 1, fromPhase: 'FREE_AGENCY', toRound: 1, toPhase: 'AUCTION' },
  });

  localStorage.setItem('ss.profGameId', gameId);
  const user = userEvent.setup();
  // AdvanceControl rendered directly (no router needed) so the shortened
  // stuck threshold can be passed as a prop — ProfessorPage always uses the
  // 10s default.
  render(
    <AuthProvider>
      <ProfessorProvider>
        <AdvanceControl stuckThresholdMs={6000} />
      </ProfessorProvider>
    </AuthProvider>,
  );

  // The transition-GATED view presents the phase we are LEAVING (Draft
  // Night), so the primary button names Star Auction — disabled while
  // settling.
  const primary = await screen.findByRole('button',
    { name: 'Advance → Star Auction · R1' }, { timeout: 20000 });
  expect(primary).toBeDisabled();
  // Below the threshold the affordance is absent. Listener attach runs ~1-2s
  // in this suite; the 6s test threshold leaves wide margin for this
  // immediate negative check.
  expect(screen.queryByRole('button', { name: 'Resolve stuck advance' })).toBeNull();

  const resolve = await screen.findByRole('button',
    { name: 'Resolve stuck advance' }, { timeout: 15000 });
  await user.click(resolve);

  // Adoption path: expectations were the RAW (post-flip) values, so the
  // server adopted the marker, ran the FREE_AGENCY exit hook (hardship-signs
  // both member-less teams) + enter:AUCTION, and deleted the marker.
  // auctions/1 existing proves the hooks actually ran.
  await waitFor(async () => {
    const g = (await adminDb().doc(`games/${gameId}`).get()).data()!;
    expect(g.transition).toBeUndefined();
    expect(g.phase).toBe('AUCTION');
    expect(g.round).toBe(1);
    expect((await adminDb().doc(`games/${gameId}/auctions/1`).get()).exists).toBe(true);
  }, { timeout: 30000 });

  // Panel un-sticks: settled AUCTION view, Resolve gone, primary re-enabled.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Advance → Lineup · R1' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Resolve stuck advance' })).toBeNull();
  }, { timeout: 20000 });
}, 240000);

test('clear session: a bad gameId is no longer a dead end', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // A gameId matching no game: rules deny the read (professorUid can never
  // match), the game doc never arrives, and pre-fix the panel sat on
  // "Connecting to session…" forever with no way out.
  localStorage.setItem('ss.profGameId', 'no-such-game');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  await screen.findByText('Connecting to session…', {}, { timeout: 20000 });
  await user.click(screen.getByRole('button', { name: 'Clear session' }));

  // Back at SessionSetup's create/resume view; the persisted key is gone.
  await screen.findByLabelText('team names', {}, { timeout: 15000 });
  expect(localStorage.getItem('ss.profGameId')).toBeNull();
  expect(screen.queryByText('Connecting to session…')).toBeNull();
}, 120000);

test('round context during Front Office shows the last completed round (r-1) with its label', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({
    teamNames: ['Alpha', 'Beta'] })
    .then((r) => r.data as { gameId: string; joinCode: string });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = ['Alpha', 'Beta'].map(
    (nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  // Zero bots: the FREE_AGENCY exit hook hardship-signs member-less teams and
  // the LINEUP exit auto-repairs — the same path bigscreen.itest.tsx drives.
  // The default app's signed-in user IS the professor (it called createGame),
  // so driveTo's advancePhase calls — which ALWAYS carry expectedPhase +
  // expectedRound, standing hard rule — ride the professor uid.
  const seeded: Seeded = {
    gameId, joinCode, teamIds,
    prof: {
      uid: auth.currentUser!.uid,
      call: <T,>(fn: string, data: unknown) =>
        httpsCallable(functions, fn)(data).then((r) => r.data as T),
      dispose: () => Promise.resolve(),
    },
    bots: [],
  };
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  localStorage.setItem('ss.profGameId', gameId);
  localStorage.setItem('ss.profAutoArm', '0');    // strip stays inert — not under test
  localStorage.setItem('ss.profAutoAdvance', '0');
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  // Pre-fix the panel was BLANK here: rounds/2 does not exist during round
  // 2's decision phases (only enter:SIMULATE writes it). The context now
  // reads rounds/1 and its header says which round it is showing.
  await waitFor(() => {
    const ctx = screen.getByTestId('round-context');
    expect(ctx.textContent).toContain('Standings · through Round 1');
    expect(ctx.textContent).toContain('Round 1 scores');
    expect(ctx.textContent).toMatch(/1 · (Alpha|Beta) · \d+-\d+ · [+-]?\d+/);
    expect(ctx.textContent).toMatch(/(Alpha|Beta) \d+–\d+ (Alpha|Beta)/);
  }, { timeout: 30000 });
}, 240000);
