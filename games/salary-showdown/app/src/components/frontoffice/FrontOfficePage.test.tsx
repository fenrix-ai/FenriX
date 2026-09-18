import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { CatalogPlayer, TeamDoc } from '../../types/models';
import FrontOfficePage from '../../pages/FrontOfficePage';

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  context: {} as Record<string, unknown>,
}));

vi.mock('../../contexts/GameContext', () => ({
  useGame: () => mocks.context,
}));

vi.mock('../../hooks/useSeasonForm', () => ({
  useSeasonForm: () => ({ form: new Map() }),
}));

vi.mock('../../components/ui/PhaseHeader', () => ({
  PhaseHeader: () => <header>Front Office</header>,
}));

const player = (pid: number, name: string): CatalogPlayer => ({
  pid,
  player_id: String(pid),
  name,
  position: 'G',
  age: '27',
  years_pro: '5',
  hype: '3',
  salary_per_round: '10',
  auction_round: '',
  personality: 'Quiet',
  scout_grade: 'B',
  social_media_followers: '1000',
  games_played: '82',
  mins_per_game: '30',
  pts_per_game: '14',
  fg_attempts_per_game: '12',
  fg_pct: '.50',
  three_pt_pct: '.36',
  ft_pct: '.80',
  rebounds_per_game: '4',
  assists_per_game: '5',
  steals_per_game: '1',
  blocks_per_game: '.2',
  turnovers_per_game: '2',
  prev_pts_per_game: '13',
  prev_fg_pct: '.49',
  prev_mins_per_game: '29',
});

const expired = {
  pid: 1, rate: 8, startRound: 1, years: 1, viaAuction: false, hardship: false,
};
const active = {
  pid: 2, rate: 12, startRound: 1, years: 3, viaAuction: false, hardship: false,
};
const synthetic = {
  pid: 9001, rate: 0, startRound: 1, years: 1, viaAuction: false, hardship: true,
};

beforeEach(() => {
  mocks.call.mockReset();
  const team = {
    name: 'Cap City',
    identity: { accent: 'teal', jersey: 'stripe' },
    roster: [expired, active, synthetic],
    deadMoney: [],
    spendLog: [expired, active, synthetic],
    doneRound: 0,
    donePhase: '',
  } as unknown as TeamDoc;
  mocks.context = {
    game: {
      round: 2,
      phase: 'FRONT_OFFICE',
      timerEndsAt: null,
      timerPausedMs: null,
    },
    team,
    catalog: new Map([
      [1, player(1, 'Alex Expired')],
      [2, player(2, 'Casey Active')],
      [9001, player(9001, 'Default Role Player')],
    ]),
    call: mocks.call,
    gameId: 'game-1',
    membership: { teamId: 'team-1', role: 'GM' },
    actsAs: () => true,
  };
});

test('let walk is a reversible local decision and never emits a saved receipt', async () => {
  const user = userEvent.setup();
  render(<FrontOfficePage />);

  expect(screen.queryByText('Default Role Player')).toBeNull();
  const decision = screen.getByRole('region', {
    name: 'Contract decision for Alex Expired',
  });

  await user.click(within(decision).getByRole('button', { name: 'Let walk' }));

  expect(within(decision).getByText('Walk selected — undo until Front Office closes.'))
    .toBeInTheDocument();
  expect(within(decision).getByRole('button', { name: 'Undo walk' })).toBeEnabled();
  expect(screen.queryByRole('status', { name: 'Saved action' })).toBeNull();
  expect(mocks.call).not.toHaveBeenCalled();

  await user.click(within(decision).getByRole('button', { name: 'Undo walk' }));

  expect(within(decision).getByRole('button', { name: 'Let walk' })).toBeEnabled();
  expect(within(decision).queryByText(/Walk selected/)).toBeNull();
});

test('a rejected re-sign keeps the selected term and emits no success receipt', async () => {
  mocks.call.mockRejectedValueOnce(new Error('CAP_EXCEEDED:3:104'));
  const user = userEvent.setup();
  render(<FrontOfficePage />);
  const decision = screen.getByRole('region', {
    name: 'Contract decision for Alex Expired',
  });
  const term = within(decision).getByRole('combobox', {
    name: 'Contract length for Alex Expired',
  });

  await user.selectOptions(term, '3');
  await user.click(within(decision).getByRole('button', { name: 'Re-sign Alex Expired' }));

  await waitFor(() => expect(screen.getByText(/Over the cap: round 3 payroll/))
    .toBeInTheDocument());
  expect(term).toHaveValue('3');
  expect(screen.getByRole('region', { name: 'Contract decision for Alex Expired' }))
    .toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Saved action' })).toBeNull();
});

test('cutting an ordinary active deal does not add it to expiring decisions', async () => {
  mocks.call.mockResolvedValueOnce({ deadMoney: [] });
  const user = userEvent.setup();
  render(<FrontOfficePage />);

  await user.click(screen.getByRole('button', { name: 'Review cut for Casey Active' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));

  await waitFor(() => expect(screen.getByRole('status', { name: 'Saved action' }))
    .toHaveTextContent('Cut saved for Casey Active.'));
  expect(screen.getByText('0 of 1 decided')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review Casey Active' })).toBeNull();
});

test('round five with no expiring deals keeps the roster and full payroll horizon visible', () => {
  const roundFiveDeal = {
    ...active,
    startRound: 1,
    years: 5,
  };
  mocks.context = {
    ...mocks.context,
    game: {
      round: 5,
      phase: 'FRONT_OFFICE',
      timerEndsAt: null,
      timerPausedMs: null,
    },
    team: {
      ...(mocks.context.team as TeamDoc),
      roster: [roundFiveDeal],
      spendLog: [roundFiveDeal],
    },
  };

  render(<FrontOfficePage />);

  expect(screen.getByText('No contracts expired this round.')).toBeInTheDocument();
  expect(screen.getByText('$12.0M/rd through Round 5')).toBeInTheDocument();
  expect(screen.getByLabelText(/Round 5: cash \$12.0M, dead money \$0.0M/))
    .toBeInTheDocument();
});
