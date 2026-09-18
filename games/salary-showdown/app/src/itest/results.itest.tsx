import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { vi } from 'vitest';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import App from '../App';

test('results: record, box lines, awards without perDollar, highlighted snapshot', async () => {
  const seeded = await seedToPhase({ to: 'R1:RESULTS' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'IT S',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/results']}><App /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole('region', { name: 'Round result' })).toBeInTheDocument(),
    { timeout: 20000 });
  // Record sums to Alpha's 3 games.
  const record = within(screen.getByRole('region', { name: 'Round result' }))
    .getByText(/\d+–\d+/).textContent!;
  const [w, l] = record.split('–').map(Number);
  expect(w + l).toBe(3);
  // Box lines: 8 players took the floor for Alpha (5 + sixth + 2 active bench).
  // Scoped to the box-lines card by testid (Task 3, playtest-polish): a Star Auction
  // results card can now also render above it with its own <table>, so `getAllByRole
  // ('table')[0]` is no longer reliably the box-lines table.
  await waitFor(() => {
    const table = within(screen.getByTestId('box-lines')).getByRole('table');
    expect(table.querySelectorAll('tbody tr').length).toBe(3 * 8);
  });
  // The bargain award never shows the computed per-dollar number.
  const rd = (await adminDb().doc(`games/${seeded.gameId}/rounds/1`).get()).data()!;
  // The bargain exists in this fixture (every team fields 8 rostered players).
  expect(rd.awards.bargain).toBeTruthy();
  // Advance the carousel to the bargain slide (index 2) and pin the boundary:
  // raw line + salary render; the computed perDollar figure NEVER does.
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'next award' }));
  await user.click(screen.getByRole('button', { name: 'next award' }));
  await waitFor(() => expect(screen.getByTestId('awards'))
    .toHaveTextContent('Bargain of the Round'), { timeout: 15000 });
  const awardsText = screen.getByTestId('awards').textContent!;
  expect(awardsText).toMatch(/\$\d+\.\dM\/rd/);                     // raw salary present
  expect(awardsText).not.toContain(String(rd.awards.bargain.perDollar)); // ratio absent
  // Snapshot highlights the viewer's row.
  const sel = screen.getByTestId('standings').querySelector('tr.sel');
  expect(sel?.textContent).toContain('Alpha');

  // Every frozen box-score column stays reachable inside the explicit data scroller.
  const boxTable = within(screen.getByTestId('box-lines')).getByRole('table');
  expect([...boxTable.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
    'round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
    'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
    'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
    'playstyle',
  ]);
  expect(screen.getByTestId('box-scroll')).toHaveAttribute('tabindex', '0');

  // Game and player views filter the real feed instead of projecting derived metrics.
  const gameSelect = screen.getByLabelText('Filter by game') as HTMLSelectElement;
  const selectedGameId = gameSelect.options[1].value;
  await user.selectOptions(gameSelect, selectedGameId);
  expect([...boxTable.querySelectorAll('tbody tr')].length).toBe(8);
  await user.click(screen.getByRole('tab', { name: 'Players' }));
  const playerSelect = screen.getByLabelText('Filter by player') as HTMLSelectElement;
  const playerId = playerSelect.options[1].value;
  await user.selectOptions(playerSelect, playerId);
  expect([...boxTable.querySelectorAll('tbody tr')].every((row) =>
    row.textContent?.includes(playerSelect.options[playerSelect.selectedIndex].text) ?? false)).toBe(true);

  // Download bytes are the exact server payload; the UI never parses and reserializes them.
  let downloaded: Blob | null = null;
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new TypeError('Expected CSV download to use a Blob');
    downloaded = blob;
    return 'blob:w07-results';
  });
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  await user.click(screen.getByRole('button', { name: /Download boxscores_round_1\.csv/ }));
  expect(downloaded).not.toBeNull();
  expect(await downloaded!.text()).toBe(rd.boxCsv);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:w07-results');
  anchorClick.mockRestore();
  revokeObjectURL.mockRestore();
  createObjectURL.mockRestore();

  // Duplicate display names cannot be resolved from the CSV alone. Cross-check the
  // sanctioned game IDs and show both sides with a neutral ambiguity disclosure.
  await user.click(screen.getByRole('tab', { name: 'Games' }));
  expect([...boxTable.querySelectorAll('tbody tr')]).toHaveLength(8);
  const selectedGame = rd.games.find((game: { game_id: string }) => game.game_id === selectedGameId)!;
  const opponentId = selectedGame.home === seeded.teamIds[0] ? selectedGame.away : selectedGame.home;
  await adminDb().doc(`games/${seeded.gameId}/teams/${opponentId}`).update({ name: 'Alpha' });
  await waitFor(() => expect(screen.getByText(/Two franchises share this name/)).toBeInTheDocument());
  expect([...boxTable.querySelectorAll('tbody tr')]).toHaveLength(16);
}, 120000);
