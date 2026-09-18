import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const app = vi.hoisted(() => ({
  uid: 'user-a',
  call: vi.fn(),
  remote: {} as Record<string, { rate: number; years: number }>,
  emit: null as null | ((bids: Record<string, { rate: number; years: number }>) => void),
  resolvePending: null as null | ((value: unknown) => void),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  onSnapshot: (path: string, next: (snapshot: unknown) => void) => {
    if (path.includes('/auctions/')) {
      next({ exists: () => true, data: () => ({ stars: [17] }) });
    } else {
      app.emit = (bids) => next({ exists: () => true, data: () => ({ round: 1, bids }) });
      app.emit(app.remote);
    }
    return () => {};
  },
}));
vi.mock('../../lib/firebase', () => ({ db: {} }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ uid: app.uid, ready: true }),
}));

const context = vi.hoisted(() => ({
  gameId: 'test-game',
  game: { round: 1, phase: 'AUCTION' },
  team: { roster: [], deadMoney: [] },
  catalog: new Map([[17, {
    pid: 17,
    name: 'Test Star',
    social_media_followers: '1000',
    games_played: '80',
    mins_per_game: '30',
  }]]),
  membership: { teamId: 'team-a', role: 'Scout' },
  actsAs: () => true,
}));
vi.mock('../../contexts/GameContext', () => ({
  useGame: () => ({ ...context, call: app.call }),
}));
vi.mock('../ui/PhaseHeader', () => ({ PhaseHeader: () => null }));
vi.mock('../ui/PayrollBar', () => ({ PayrollBar: () => null }));
vi.mock('../players/PlayerCard', () => ({
  PlayerCard: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
}));

import AuctionPage from '../../pages/AuctionPage';

const bid = (rate: number) => ({ '17': { rate, years: 1 } });
const input = () => screen.getByRole('spinbutton', { name: 'Salary per round for Test Star' });
const change = (rate: string) => fireEvent.change(input(), { target: { value: rate } });

beforeEach(() => {
  app.uid = 'user-a';
  app.remote = bid(3);
  app.emit = null;
  app.resolvePending = null;
  app.call.mockReset();
  app.call.mockImplementation(() => new Promise((resolve) => {
    app.resolvePending = resolve;
  }));
});

afterEach(() => cleanup());

test('a pending save preserves a newer edit back to the previous saved value', async () => {
  render(<AuctionPage />);
  change('8');
  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));
  change('3');

  await act(async () => {
    app.emit?.(bid(8));
    app.resolvePending?.({});
  });

  expect(input()).toHaveValue(3);
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeEnabled();
  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();
});

test('an unchanged snapshot cannot erase invalid raw typing', async () => {
  app.remote = bid(2.4);
  render(<AuctionPage />);
  change('2.35');
  expect(input()).toHaveAttribute('aria-invalid', 'true');

  await act(async () => app.emit?.(bid(2.4)));

  expect(input()).toHaveValue(2.35);
  expect(input()).toHaveAttribute('aria-invalid', 'true');
});

test('a different uid in the same team and role cannot inherit a pending receipt', async () => {
  const { rerender } = render(<AuctionPage />);
  change('8');
  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));
  const resolveOldScope = app.resolvePending;

  app.uid = 'user-b';
  rerender(<AuctionPage />);
  await act(async () => resolveOldScope?.({}));

  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();
  change('8');
  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));
  expect(app.call).toHaveBeenCalledTimes(2);
});

test('a rejected save leaves the edit unsaved and never shows SEALED', async () => {
  app.call.mockRejectedValueOnce(new Error('server rejected the offer'));
  render(<AuctionPage />);
  change('8');
  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(input()).toHaveValue(8);
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeEnabled();
  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));
  expect(app.call).toHaveBeenCalledTimes(2);
});

test('a newer teammate snapshot is not relabeled as the older saved payload', async () => {
  render(<AuctionPage />);
  change('8');
  fireEvent.click(screen.getByRole('button', { name: 'Lock in bids' }));

  await act(async () => {
    app.emit?.(bid(8));
    app.emit?.(bid(9));
    app.resolvePending?.({});
  });

  expect(input()).toHaveValue(8);
  expect(screen.getByRole('button', { name: 'Lock in bids' })).toBeEnabled();
  expect(screen.queryByTestId('sealed-receipt')).not.toBeInTheDocument();
});

test('two submit clicks in one render frame issue one callable', () => {
  render(<AuctionPage />);
  change('8');
  const button = screen.getByRole('button', { name: 'Lock in bids' });

  act(() => {
    button.click();
    button.click();
  });

  expect(app.call).toHaveBeenCalledTimes(1);
});
