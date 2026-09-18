import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  game: {} as any,
  uid: 'user-a',
  presentation: {} as any,
}));

vi.mock('../contexts/GameContext', () => ({ useGame: () => mocks.game }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ uid: mocks.uid, ready: true }),
}));
vi.mock('../contexts/RoundPresentationContext', () => ({
  useRoundPresentation: () => mocks.presentation,
}));
vi.mock('../components/ui/PhaseHeader', () => ({ PhaseHeader: () => null }));

import StandingsPage from './StandingsPage';

const roundDoc = (name: string) => ({
  standings: [{
    teamId: 'a', name, wins: 4, losses: 1, rank: 1, previousRank: null,
    pointDiff: 12,
  }],
});

beforeEach(() => {
  mocks.uid = 'user-a';
  mocks.game = {
    gameId: 'game-a',
    game: { round: 2, phase: 'FRONT_OFFICE' },
    teams: new Map([['a', { spendLog: [] }]]),
    membership: { teamId: 'a', role: 'GM' },
  };
  mocks.presentation = {
    rows: [],
    getRound: vi.fn().mockResolvedValue(roundDoc('Alpha')),
  };
});

test('historical table is hidden immediately while a new uid scope loads', async () => {
  const { rerender } = render(<MemoryRouter><StandingsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('row', { name: /Alpha/ })).toBeInTheDocument());

  mocks.uid = 'user-b';
  mocks.presentation = {
    ...mocks.presentation,
    getRound: vi.fn(() => new Promise(() => undefined)),
  };
  rerender(<MemoryRouter><StandingsPage /></MemoryRouter>);

  expect(screen.queryByTestId('standings')).not.toBeInTheDocument();
});

test('retired historical read cannot repopulate a replacement uid scope', async () => {
  let resolveOld!: (value: ReturnType<typeof roundDoc>) => void;
  let resolveNew!: (value: ReturnType<typeof roundDoc>) => void;
  mocks.presentation = {
    rows: [],
    getRound: vi.fn(() => new Promise((resolve) => { resolveOld = resolve; })),
  };
  const { rerender } = render(<MemoryRouter><StandingsPage /></MemoryRouter>);

  mocks.uid = 'user-b';
  mocks.presentation = {
    rows: [],
    getRound: vi.fn(() => new Promise((resolve) => { resolveNew = resolve; })),
  };
  rerender(<MemoryRouter><StandingsPage /></MemoryRouter>);

  await act(async () => { resolveOld(roundDoc('Old user')); });
  expect(screen.queryByText('Old user')).not.toBeInTheDocument();
  expect(screen.queryByTestId('standings')).not.toBeInTheDocument();

  await act(async () => { resolveNew(roundDoc('New user')); });
  await waitFor(() => expect(screen.getByRole('row', { name: /New user/ })).toBeInTheDocument());
});
