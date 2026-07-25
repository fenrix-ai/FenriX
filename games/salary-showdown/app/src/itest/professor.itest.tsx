import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Seeded } from './harness';
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
