import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, newClient } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

beforeEach(() => localStorage.clear());

test('seat panel keeps modal focus and live selection while releasing the current holder', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({
    teamNames: ['Alpha', 'Beta'] })
    .then((r) => r.data as { gameId: string; joinCode: string });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamA = teamsSnap.docs.find((d) => d.data().name === 'Alpha')!.id;
  const teamB = teamsSnap.docs.find((d) => d.data().name === 'Beta')!.id;
  const scout = await newClient('seat-scout');
  await scout.call('joinGame', { joinCode, teamId: teamB, role: 'Scout', displayName: 'Leaver' });
  await httpsCallable(functions, 'startSeason')({ gameId });

  localStorage.setItem('ss.profGameId', gameId);
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  const manageSeats = await screen.findByRole('button', { name: 'Manage seats' },
    { timeout: 20000 });
  await user.click(manageSeats);
  const panel = await screen.findByTestId('seat-panel', {}, { timeout: 20000 });
  const close = screen.getByRole('button', { name: 'Close seat tools' });

  // aria-modal must contain keyboard focus in both directions.
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(panel).toContainElement(document.activeElement as HTMLElement);
  const picker = screen.getByRole('combobox', { name: 'Franchise' });
  await user.selectOptions(picker, teamB);
  await waitFor(() => expect(panel.textContent).toContain('Scout: Leaver'), { timeout: 15000 });
  const releaseButton = screen.getByRole('button', { name: 'Release Scout on Beta' });
  releaseButton.focus();
  await user.tab();
  expect(close).toHaveFocus();

  // An unrelated team listener snapshot must not reset selection, confirmation,
  // or focus. Confirmation is also invalidated if that exact holder changes.
  await user.click(releaseButton);
  await adminDb().doc(`games/${gameId}/teams/${teamA}`).update({
    doneRound: 1,
    donePhase: 'FREE_AGENCY',
  });
  await waitFor(() => {
    expect(screen.getByTestId(`franchise-${teamA}`).textContent).toContain('Done signal received');
  }, { timeout: 15000 });
  expect(picker).toHaveValue(teamB);
  expect(screen.getByRole('button', { name: 'Confirm release Scout on Beta' })).toHaveFocus();

  await adminDb().doc(`games/${gameId}/players/${scout.uid}`).delete();
  const replacementUid = `replacement-${Date.now()}`;
  await adminDb().doc(`games/${gameId}/players/${replacementUid}`).set({
    teamId: teamB,
    role: 'Scout',
    displayName: 'Replacement',
  });
  await waitFor(() => expect(panel.textContent).toContain('Scout: Replacement'), { timeout: 15000 });
  expect(screen.getByRole('button', { name: 'Release Scout on Beta' })).toBeInTheDocument();

  // Two-click confirm: Release arms, Confirm release fires.
  await user.click(screen.getByRole('button', { name: 'Release Scout on Beta' }));
  await user.click(screen.getByRole('button', { name: 'Confirm release Scout on Beta' }));

  await waitFor(async () => {
    expect((await adminDb().doc(`games/${gameId}/players/${replacementUid}`).get()).exists).toBe(false);
  }, { timeout: 15000 });
  await waitFor(() => expect(screen.getByTestId(`seats-${teamB}`).textContent).toContain('Scout: open'),
    { timeout: 15000 });

  await user.click(screen.getByRole('button', { name: 'Close seat tools' }));
  await waitFor(() => expect(screen.queryByTestId('seat-panel')).toBeNull());
  expect(manageSeats).toHaveFocus();
}, 120000);
