import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CatalogPlayer, TeamDoc } from '../../types/models';
import { useGame } from '../../contexts/GameContext';
import { CourtSlot } from './CourtSlot';
import LineupPage from '../../pages/LineupPage';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  DragOverlay: ({ children }: { children: ReactNode }) => children,
  useDraggable: () => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, isDragging: false,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('../../contexts/GameContext', () => ({ useGame: vi.fn() }));
vi.mock('../ui/PhaseHeader', () => ({ PhaseHeader: () => <header>Set Lineup</header> }));

const player = (pid: number, name: string, position: 'G' | 'W' | 'B') => ({
  pid, name, position, pts_per_game: '10.0', rebounds_per_game: '5.0',
  mins_per_game: '24.0', age: '24', scout_grade: 'B', salary_per_round: '5', hype: '3',
} as CatalogPlayer);

const catalog = new Map<number, CatalogPlayer>([
  [1, player(1, 'Guard One', 'G')],
  [2, player(2, 'Guard Two', 'G')],
  [3, player(3, 'Bench Guard', 'G')],
  [4, player(4, 'Wing One', 'W')],
  [5, player(5, 'Wing Two', 'W')],
  [6, player(6, 'Bench Wing', 'W')],
  [7, player(7, 'Big One', 'B')],
  [8, player(8, 'Sixth Big', 'B')],
  [9, player(9, 'Depth Guard', 'G')],
  [10, player(10, 'Depth Wing', 'W')],
  [11, player(11, 'Depth Big', 'B')],
]);

const team: TeamDoc = {
  name: 'Alpha', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
  roster: Array.from(catalog.keys(), (pid) => ({
    pid, rate: 5, startRound: 1, years: 1, viaAuction: false, hardship: false,
  })),
  deadMoney: [], spendLog: [], hardshipUsed: [], doneRound: 0, donePhase: '',
  lineupLockedRound: 1,
  lineup: {
    starters: [1, 2, 4, 5, 7], sixth: 8, bench: [3, 6, 9, 10, 11],
    playstyle: 'Balanced',
  },
};

const mockContext = (call = vi.fn().mockResolvedValue({ ok: true })) => ({
  gameId: 'game-w05',
  setGameId: vi.fn(),
  game: {
    joinCode: 'W05DEV', status: 'active', phase: 'LINEUP', round: 1,
    timerEndsAt: null, timerPausedMs: null, teamCount: 2,
    config: { cap: 100, totalRounds: 5 }, professorUid: 'professor',
  },
  membership: { teamId: 'alpha', role: 'Coach', displayName: 'Coach Test' },
  team,
  teamSeats: new Map(),
  teams: new Map([['alpha', team]]),
  catalog,
  market: null,
  call,
  actsAs: (role: string) => role === 'Coach',
});

beforeEach(() => {
  vi.mocked(useGame).mockReturnValue(
    mockContext() as unknown as ReturnType<typeof useGame>,
  );
});

test('keyboard can choose a placement without drag', async () => {
  const onPlace = vi.fn();
  render(<CourtSlot label="Guard 1" pid={null} eligible onPlace={onPlace} />);
  screen.getByRole('button', { name: 'Guard 1' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(onPlace).toHaveBeenCalledTimes(1);
});

test('click placement performs a legal swap and preserves inactive depth order', async () => {
  const user = userEvent.setup();
  render(<LineupPage />);

  await user.click(await screen.findByRole('button', { name: /^Select Bench Guard,/ }));
  await user.click(screen.getByRole('button', { name: 'Guard 1' }));

  expect(screen.getByRole('button', { name: 'Guard 1' })).toHaveTextContent('Bench Guard');
  expect(screen.getByRole('button', { name: 'Active bench 1' })).toHaveTextContent('Guard One');
  const depth = screen.getByRole('button', { name: 'Inactive depth' });
  expect(within(depth).getAllByTestId('lineup-player-name').map((node) => node.textContent))
    .toEqual(['Depth Guard', 'Depth Wing', 'Depth Big']);
  expect(screen.getByRole('status', { name: 'Placement status' }))
    .toHaveTextContent('Placed Bench Guard in Guard 1. Guard One moved to Active bench 1.');
});

test('rejected occupied-slot swap leaves the lineup unchanged and explains the conflict', async () => {
  const user = userEvent.setup();
  render(<LineupPage />);

  await user.click(await screen.findByRole('button', { name: /^Select Guard One,/ }));
  const sixth = screen.getByRole('button', { name: 'Sixth player' });
  expect(sixth).toHaveAttribute('aria-disabled', 'true');
  await user.click(sixth);

  expect(screen.getByRole('button', { name: 'Guard 1' })).toHaveTextContent('Guard One');
  expect(sixth).toHaveTextContent('Sixth Big');
  expect(screen.getByRole('status', { name: 'Placement status' }))
    .toHaveTextContent('Sixth Big cannot move to Guard 1, so that swap is not legal.');
});

test('Escape cancels a keyboard placement selection', async () => {
  const user = userEvent.setup();
  render(<LineupPage />);

  const playerButton = await screen.findByRole('button', { name: /^Select Bench Guard,/ });
  await user.click(playerButton);
  expect(playerButton).toHaveAttribute('aria-pressed', 'true');
  await user.keyboard('{Escape}');
  expect(playerButton).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('status', { name: 'Placement status' }))
    .toHaveTextContent('Placement cancelled.');
});

test('keyboard selection stays separate from the supplemental drag handle', async () => {
  const user = userEvent.setup();
  render(<LineupPage />);

  const select = await screen.findByRole('button', { name: /^Select Bench Guard,/ });
  expect(screen.getByRole('button', { name: /^Drag Bench Guard,/ })).toBeInTheDocument();
  select.focus();
  await user.keyboard('{Enter}');
  expect(select).toHaveAttribute('aria-pressed', 'true');
});

test('submit keeps only the first two bench entries active and sends later depth in order', async () => {
  const call = vi.fn().mockResolvedValue({ ok: true });
  vi.mocked(useGame).mockReturnValue(
    mockContext(call) as unknown as ReturnType<typeof useGame>,
  );
  const user = userEvent.setup();
  render(<LineupPage />);

  await user.click(await screen.findByRole('button', { name: 'Submit lineup' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('submitLineup', {
    gameId: 'game-w05',
    lineup: {
      starters: [1, 2, 4, 5, 7],
      sixth: 8,
      bench: [3, 6, 9, 10, 11],
      playstyle: 'Balanced',
    },
  }));
  expect(screen.getByRole('status', { name: 'Placement status' }))
    .toHaveTextContent('Lineup saved for round 1. You can revise it until the phase closes.');
});
