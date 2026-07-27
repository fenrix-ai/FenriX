import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import admin from 'firebase-admin';
import { adminDb, driveTo, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('auction results: results table for every star + private roster-skip note, hidden from a rival client', async () => {
  const seeded = await seedToPhase({ teams: ['Alpha', 'Beta'], to: 'R1:AUCTION' });
  const [aId, bId] = seeded.teamIds;
  const wave = (await adminDb().doc(`games/${seeded.gameId}/auctions/1`).get()).data()!;
  const stars = wave.stars as number[];
  const [star0, star1] = stars;

  // Simpler alternative (brief Step 3, accepted — commented per its "accept either,
  // comment which"): admin-write BOTH teams' private/auction bid docs directly instead
  // of routing through the submitBids callable. This also sidesteps driveTo's own
  // AUCTION-phase handling, which auto-submits fresh bot bids for every team in
  // `seeded.bots` (Beta here) and would otherwise stomp the rival bid written below
  // the next time driveTo saw phase === 'AUCTION'.
  await adminDb().doc(`games/${seeded.gameId}/teams/${bId}/private/auction`).set({
    bids: { [star0]: { rate: 3.0, years: 1 } }, round: 1,
  });
  await adminDb().doc(`games/${seeded.gameId}/teams/${aId}/private/auction`).set({
    // Losing low bid on star0 (rival's guaranteed 3.0 beats this 2.0) + a SOLO high bid
    // on star1 that will roster-skip once Alpha's roster is topped up to 10 below.
    bids: { [star0]: { rate: 2.0, years: 1 }, [star1]: { rate: 9.0, years: 1 } }, round: 1,
  });

  // Top up Alpha's roster to the 10-man active max so its star1 bid roster-skips —
  // resolveAuction checks `active.length >= 10` BEFORE the cap check (auction.js).
  // FREE_AGENCY's exit hook already hardship-signed Alpha to 8 $0 Default Role Players
  // (team index 0 has no bot, so its roster was empty at FREE_AGENCY). Adding 2 more
  // REAL catalog pids on top (rather than replacing the roster outright) keeps every
  // existing active pid resolvable in CATALOG, which the LINEUP hook's autoRepair
  // requires for all active pids.
  const teamA = (await adminDb().doc(`games/${seeded.gameId}/teams/${aId}`).get()).data()!;
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const usedPids = new Set<number>(
    [...teamA.roster.map((c: { pid: number }) => c.pid), star0, star1]);
  const extraPids = cat.docs
    .map((d) => ({ pid: Number(d.id), salary: d.data().salary_per_round }))
    .filter((p) => p.salary !== '' && !usedPids.has(p.pid))
    .slice(0, 2)
    .map((p) => p.pid);
  await adminDb().doc(`games/${seeded.gameId}/teams/${aId}`).update({
    roster: [...teamA.roster, ...extraPids.map((pid) => (
      { pid, rate: 0.1, startRound: 1, years: 5, viaAuction: false, hardship: false }))],
  });

  // Advance past AUCTION by hand — NOT via driveTo, for the reason noted above.
  await seeded.prof.call('advancePhase',
    { gameId: seeded.gameId, expectedPhase: 'AUCTION', expectedRound: 1 });
  // LINEUP -> SIMULATE -> RESULTS: neither phase needs bot action (auto-repair, auto-sim).
  await driveTo(seeded, 'R1:RESULTS');

  // Own client (Alpha, Scout) — sees the public results table AND its own skip note.
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: aId, role: 'Scout', displayName: 'IT Scout',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const ownRender = render(<MemoryRouter initialEntries={['/game/results']}><App /></MemoryRouter>);

  const card = await screen.findByTestId('auction-results', {}, { timeout: 20000 });
  const nameOf = new Map(cat.docs.map((d) => [Number(d.id), d.data().name as string]));
  for (const pid of stars) {
    const row = within(card).getByText(nameOf.get(pid) ?? String(pid)).closest('tr')!;
    if (pid === star0) {
      expect(row.textContent).toContain('Beta');
      expect(row.textContent).toContain('$3.0M/rd');
      expect(row.textContent).toContain('1 yr');
    } else {
      expect(row.textContent).toContain('Unsold');
    }
  }
  const note = await screen.findByTestId('auction-skip-note', {}, { timeout: 15000 });
  expect(note.textContent).toContain("couldn't be awarded (roster full)");

  ownRender.unmount();

  // Second, rival client (Beta) — negative privacy check. Impersonate the already-
  // joined Beta Scout bot's OWN uid via a minted custom token (the Auth emulator
  // honors it unsigned) so the DEFAULT app — the one <App/> actually reads — becomes a
  // genuine Beta-team member. Beta never had a skip (its bid won outright), so its own
  // private/auction doc carries no skippedRound; the note must not render for this
  // viewer, and the results table renders per its own team's card the same way.
  const rivalToken = await admin.auth().createCustomToken(seeded.bots[0].scout.uid);
  await signInWithCustomToken(auth, rivalToken);
  render(<MemoryRouter initialEntries={['/game/results']}><App /></MemoryRouter>);
  await screen.findByTestId('auction-results', {}, { timeout: 20000 });
  expect(screen.queryByTestId('auction-skip-note')).toBeNull();
}, 120000);
