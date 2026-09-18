import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { adminDb, newClient, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('auction: private live merge, validation, legal exposure, revisions, withdrawal, and phase safety', async () => {
  const seeded = await seedToPhase({ to: 'R1:AUCTION' });
  const teammate = await newClient('auction-teammate');
  await teammate.call('joinGame', {
    joinCode: seeded.joinCode,
    teamId: seeded.teamIds[0],
    role: 'Coach',
    displayName: 'IT Teammate',
  });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode,
    teamId: seeded.teamIds[0],
    role: 'GM',
    displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);

  const wave = (await adminDb().doc(`games/${seeded.gameId}/auctions/1`).get()).data()!;
  expect(wave.stars).toHaveLength(5);
  await teammate.call('submitBids', { gameId: seeded.gameId, bids: {
    [wave.stars[0]]: { rate: 3, years: 1 },
    [wave.stars[1]]: { rate: 4, years: 1 },
  } });

  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/auction']}><App /></MemoryRouter>);

  const inputs = await screen.findAllByRole('spinbutton', { name: /Salary per round for/ },
    { timeout: 20000 });
  expect(inputs).toHaveLength(5);
  expect(screen.getByTestId('role-fallback')).toHaveTextContent('No Scout is seated');
  await waitFor(() => expect(inputs[0]).toHaveValue(3));
  await waitFor(() => expect(inputs[1]).toHaveValue(4));

  // A second teammate overwrites the private snapshot while this client is typing.
  // The dirty first offer stays local; clean offers follow the remote snapshot.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '8.0');
  await teammate.call('submitBids', { gameId: seeded.gameId, bids: {
    [wave.stars[1]]: { rate: 6, years: 2 },
    [wave.stars[2]]: { rate: 7, years: 1 },
  } });
  await waitFor(() => expect(inputs[0]).toHaveValue(8));
  await waitFor(() => expect(inputs[1]).toHaveValue(6));
  await waitFor(() => expect(inputs[2]).toHaveValue(7));

  // Client validation mirrors the server and keeps the save action unavailable.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '1.5');
  expect(await screen.findByText('Minimum tonight is $2.0M.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeDisabled();

  await user.clear(inputs[0]);
  await user.type(inputs[0], '2.35');
  expect(await screen.findByText('Bids move in $0.1M steps.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeDisabled();

  // Over-cap exposure is a warning, never a prohibition.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '95.0');
  const firstCard = inputs[0].closest('article')!;
  await user.click(within(firstCard).getByRole('radio', { name: '3 rounds' }));
  expect(await screen.findByText(/Peak exposure is .* This is allowed/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  expect(await screen.findByTestId('sealed-receipt')).toHaveTextContent('SEALED');
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]]).toEqual({ rate: 95, years: 3 });
  }, { timeout: 15000 });

  // Revisions stay open after SEALED.
  await user.clear(inputs[0]);
  await user.type(inputs[0], '9.5');
  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids[wave.stars[0]].rate).toBe(9.5);
  }, { timeout: 15000 });

  // Withdrawing uses the callable's required plain empty object, never null.
  await user.click(screen.getByRole('button', { name: 'Withdraw all offers' }));
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await waitFor(async () => {
    const priv = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}/private/auction`).get()).data()!;
    expect(priv.bids).toEqual({});
  }, { timeout: 15000 });

  // A save racing the phase close may commit or be rejected transactionally, but
  // either way an old-scope success receipt must never appear on the next phase.
  await user.type(inputs[0], '8.0');
  void user.click(screen.getByRole('button', { name: 'Lock in bids' }));
  await seeded.prof.call('advancePhase', {
    gameId: seeded.gameId,
    expectedPhase: 'AUCTION',
    expectedRound: 1,
  });
  expect(await screen.findByText(/Set Lineup/, {}, { timeout: 20000 })).toBeInTheDocument();
  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();

  await teammate.dispose();
}, 180000);
