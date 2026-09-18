import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { CatalogPlayer, TeamDoc } from '../../types/models';
import FrontOfficePage from '../../pages/FrontOfficePage';

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  uid: 'user-a',
  context: {} as Record<string, unknown>,
}));

vi.mock('../../contexts/GameContext', () => ({
  useGame: () => mocks.context,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ uid: mocks.uid, ready: true }),
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
  mocks.uid = 'user-a';
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

test('a stale successful cut cannot close a new-game modal or emit a receipt', async () => {
  let resolveCut!: (value: unknown) => void;
  mocks.call.mockImplementationOnce(() => new Promise((resolve) => {
    resolveCut = resolve;
  }));
  const user = userEvent.setup();
  const { rerender } = render(<FrontOfficePage />);

  await user.click(screen.getByRole('button', { name: 'Review cut for Casey Active' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  mocks.context = { ...mocks.context, gameId: 'game-2' };
  rerender(<FrontOfficePage />);
  await user.click(screen.getByRole('button', { name: 'Review cut for Casey Active' }));

  await act(async () => resolveCut({}));

  expect(screen.getByRole('dialog', { name: 'Cut Casey Active?' })).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Saved action' })).toBeNull();
});

test('a stale rejected cut cannot surface its error in a new auth scope', async () => {
  let rejectCut!: (reason: unknown) => void;
  mocks.call.mockImplementationOnce(() => new Promise((_resolve, reject) => {
    rejectCut = reject;
  }));
  const user = userEvent.setup();
  const { rerender } = render(<FrontOfficePage />);

  await user.click(screen.getByRole('button', { name: 'Review cut for Casey Active' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  mocks.uid = 'user-b';
  rerender(<FrontOfficePage />);
  await act(async () => rejectCut(new Error('CUT_REJECTED')));

  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('status', { name: 'Saved action' })).toBeNull();
});

test('a live multi-round renewal displays authoritative rate and duration', () => {
  mocks.context = {
    ...mocks.context,
    team: {
      ...(mocks.context.team as TeamDoc),
      roster: [{ ...expired, startRound: 2, years: 3, rate: 9.2 }, active],
    },
  };

  render(<FrontOfficePage />);

  expect(screen.getByText('Re-signed for $9.2M/rd.')).toBeInTheDocument();
  expect(screen.getByText('3 rounds · Rounds 2–4.')).toBeInTheDocument();
});

test('a successful renewal keeps submitted multi-round terms before the live snapshot', async () => {
  mocks.call.mockResolvedValueOnce({});
  const user = userEvent.setup();
  render(<FrontOfficePage />);
  const decision = screen.getByRole('region', {
    name: 'Contract decision for Alex Expired',
  });

  await user.selectOptions(within(decision).getByRole('combobox'), '3');
  await user.click(within(decision).getByRole('button', { name: 'Re-sign Alex Expired' }));

  await waitFor(() => expect(screen.getByText('Re-signed for $9.2M/rd.'))
    .toBeInTheDocument());
  expect(screen.getByText('3 rounds · Rounds 2–4.')).toBeInTheDocument();
});

test('canceling a cut returns focus to the exact review trigger', async () => {
  const user = userEvent.setup();
  render(<FrontOfficePage />);
  const trigger = screen.getByRole('button', { name: 'Review cut for Casey Active' });

  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Keep player' }));

  expect(trigger).toHaveFocus();
});

test('a renewed player stays in the ledger when the cut snapshot arrives before its acknowledgment', async () => {
  let resolveCut!: (value: unknown) => void;
  mocks.call.mockImplementationOnce(() => new Promise((resolve) => {
    resolveCut = resolve;
  }));
  const renewed = { ...expired, startRound: 2, years: 3, rate: 9.2 };
  mocks.context = {
    ...mocks.context,
    team: {
      ...(mocks.context.team as TeamDoc),
      roster: [renewed, active],
      spendLog: [expired, renewed, active],
    },
  };
  const user = userEvent.setup();
  const { rerender } = render(<FrontOfficePage />);

  await user.click(screen.getByRole('button', { name: 'Review cut for Alex Expired' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  mocks.context = {
    ...mocks.context,
    team: {
      ...(mocks.context.team as TeamDoc),
      roster: [active],
      deadMoney: [{ pid: 1, rate: 9.2, startRound: 2, endRound: 4 }],
    },
  };
  rerender(<FrontOfficePage />);
  await act(async () => resolveCut({}));

  expect(screen.getByRole('button', { name: 'Review Alex Expired' })).toHaveTextContent(
    'Re-signed, then cut',
  );
});

test('same-frame action clicks are single-flight and a rejection permits retry', async () => {
  let rejectFirst!: (reason: unknown) => void;
  mocks.call
    .mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectFirst = reject;
    }))
    .mockResolvedValueOnce({});
  render(<FrontOfficePage />);
  const button = screen.getByRole('button', { name: 'Re-sign Alex Expired' });

  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.call).toHaveBeenCalledTimes(1);

  await act(async () => rejectFirst(new Error('SIGN_REJECTED')));
  expect(button).toBeEnabled();
  button.click();
  await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2));
});

test('a rejected cut keeps focus and error inside the modal and permits retry', async () => {
  let rejectFirst!: (reason: unknown) => void;
  mocks.call
    .mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectFirst = reject;
    }))
    .mockResolvedValueOnce({});
  const user = userEvent.setup();
  render(<FrontOfficePage />);

  await user.click(screen.getByRole('button', { name: 'Review cut for Casey Active' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await act(async () => rejectFirst(new Error('CUT_REJECTED')));

  const dialog = screen.getByRole('dialog', { name: 'Cut Casey Active?' });
  expect(within(dialog).getByRole('alert')).toBeInTheDocument();
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await user.tab({ shift: true });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);

  await user.click(within(dialog).getByRole('button', { name: 'Confirm cut' }));
  await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2));
});
