import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type { CatalogPlayer, TeamDoc, GameDoc } from '../../types/models';
import FreeAgencyPage from '../../pages/FreeAgencyPage';

const context = vi.hoisted(() => ({ value: {} as Record<string, unknown>, uid: 'u1' }));
vi.mock('../../contexts/GameContext', () => ({ useGame: () => context.value }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ uid: context.uid, ready: true }) }));
vi.mock('../../contexts/RoundPresentationContext', () => ({ useRoundPresentation: () => ({ rows: [] }) }));
vi.mock('../../hooks/useSeasonForm', () => ({ useSeasonForm: () => ({ form: new Map(), rows: [] }) }));

const player: CatalogPlayer = { pid: 12, player_id: '12', name: 'Avery Lane', position: 'G',
  age: '25', years_pro: '4', hype: '3', salary_per_round: '5', auction_round: '',
  personality: 'Quiet', scout_grade: 'B', social_media_followers: '50000', games_played: '60',
  mins_per_game: '25', pts_per_game: '14', fg_attempts_per_game: '12', fg_pct: '.400',
  three_pt_pct: '.300', ft_pct: '.700', rebounds_per_game: '3', assists_per_game: '4',
  steals_per_game: '1', blocks_per_game: '0', turnovers_per_game: '2',
  prev_pts_per_game: '12', prev_fg_pct: '.390', prev_mins_per_game: '22' };
const emptyTeam: TeamDoc = { name: 'Alpha', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
  roster: [], deadMoney: [], spendLog: [], lineup: null, lineupLockedRound: 0,
  hardshipUsed: [], doneRound: 0, donePhase: '' };
const game: GameDoc = { joinCode: 'TEST', status: 'active', phase: 'FREE_AGENCY', round: 1,
  timerEndsAt: null, timerPausedMs: null, teamCount: 2, config: { cap: 100, totalRounds: 5 }, professorUid: 'prof' };
const view = () => <MemoryRouter><FreeAgencyPage /></MemoryRouter>;
beforeEach(() => {
  context.uid = 'u1';
  context.value = { game, team: emptyTeam, gameId: 'g1', membership: { teamId: 't1', role: 'GM' },
    catalog: new Map([[12, player]]), market: { available: [12], unsoldPrices: {}, absentCounts: {} },
    call: vi.fn(), actsAs: () => true, teamSeats: new Map(), teams: new Map([['t1', emptyTeam]]) };
});

test('pending signing prevents duplicate calls and only a server snapshot changes payroll and roster', async () => {
  let resolve!: () => void;
  const call = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
  context.value.call = call;
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Avery Lane' }));
  await user.click(screen.getByRole('button', { name: /^2 rd/ }));
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  await user.click(screen.getByRole('button', { name: 'Signing…' }));
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith('signPlayer', { gameId: 'g1', pid: 12, years: 2 });
  expect(screen.queryByTestId('sign-note')).toBeNull();
  expect(screen.getByTestId('my-roster')).toHaveTextContent('0 of 10');
  await act(async () => resolve());
  expect(screen.getByTestId('sign-note')).toHaveTextContent('Signed Avery Lane — $4.6M/rd × 2. He remains available to every team.');
  expect(screen.getByTestId('my-roster')).toHaveTextContent('0 of 10');
  context.value.team = { ...emptyTeam, roster: [{ pid: 12, rate: 4.6, startRound: 1, years: 2, viaAuction: false, hardship: false }] };
  rerender(view());
  expect(screen.getByTestId('my-roster')).toHaveTextContent('1 of 10');
  expect(screen.getByLabelText(/Round 1: cash \$4.6M, dead money \$0.0M, candidate \$0.0M, total \$4.6M/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^2 rd/ })).toHaveAttribute('aria-pressed', 'true');
});

test('rejection retains contract and search; changing user suppresses a late success', async () => {
  context.value.call = vi.fn().mockRejectedValue(new Error('ALREADY_SIGNED'));
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('search players'), 'Avery');
  await user.click(screen.getByRole('button', { name: 'Avery Lane' }));
  await user.click(screen.getByRole('button', { name: /^3 rd/ }));
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('He is already under contract with your team.');
  expect(screen.getByLabelText('search players')).toHaveValue('Avery');
  expect(screen.getByRole('button', { name: /^3 rd/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByTestId('sign-note')).toBeNull();
  let resolve!: () => void;
  context.value.call = () => new Promise<void>((r) => { resolve = r; });
  rerender(view());
  await user.click(screen.getByRole('button', { name: 'Confirm signing' }));
  context.uid = 'u2';
  rerender(view());
  await act(async () => resolve());
  await waitFor(() => expect(screen.queryByTestId('sign-note')).toBeNull());
  expect(screen.getByLabelText('search players')).toHaveValue('');
});

test('unsold stars use their market ask and absent players remain inspectable but not signable', async () => {
  const star = { ...player, pid: 15, name: 'Unsold Star', salary_per_round: '', auction_round: '1' };
  context.value.catalog = new Map([[12, player], [15, star], [9001, { ...player, pid: 9001, name: 'Default Role Player' }]]);
  context.value.market = { available: [15], unsoldPrices: { 15: 10 }, absentCounts: {} };
  render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Unsold Star' }));
  expect(screen.getByText('asks $10.0M/rd tonight')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'All players (2)' }));
  await user.click(screen.getByRole('button', { name: 'Avery Lane' }));
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
  expect(screen.queryByText('Default Role Player')).toBeNull();
});
