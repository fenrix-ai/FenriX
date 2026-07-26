import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

// Pins the §3a contract: the backend's flip-first advance publishes the new
// round/phase BEFORE the enter hook creates that phase's data, bracketed by the
// games/{id}.transition marker. While the marker is present the client must
// HOLD the phase it is leaving (whose data exists), and follow only when the
// marker clears. advancePhase resolves its hooks before returning, so the
// mid-flight window cannot be reached through the public API deterministically —
// the test writes the exact wire states the server writes, in the same order.
test('a mid-advance transition marker holds the client on the fully-built phase', async () => {
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth); // AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'T GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument(),
    { timeout: 20000 });

  // Mid-flight state, verbatim from advancePhase's flip transaction: new phase
  // live on the wire, marker present, enter hook NOT yet run (no auctions/1).
  await adminDb().doc(`games/${seeded.gameId}`).update({
    round: 1, phase: 'AUCTION', timerEndsAt: null,
    transition: { fromRound: 1, fromPhase: 'FREE_AGENCY', toRound: 1, toPhase: 'AUCTION' },
  });

  // Bounded negative check: the client must stay on Draft Night, not route to a
  // blank Star Auction (AuctionPage renders null while the wave doc is missing).
  await new Promise((r) => setTimeout(r, 1500));
  expect(screen.getByText(/Draft Night · Round 1/)).toBeInTheDocument();
  expect(screen.queryAllByLabelText(/salary for /)).toHaveLength(0);

  // Enter hook lands (any five catalog pids render fine as a wave), marker
  // clears — the client must now follow to the auction and show all five cards.
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).limit(5).get();
  await adminDb().doc(`games/${seeded.gameId}/auctions/1`)
    .set({ stars: cat.docs.map((d) => Number(d.id)) });
  await adminDb().doc(`games/${seeded.gameId}`).update({ transition: FieldValue.delete() });
  await waitFor(() => expect(screen.getAllByLabelText(/salary for /)).toHaveLength(5),
    { timeout: 20000 });
}, 120000);
