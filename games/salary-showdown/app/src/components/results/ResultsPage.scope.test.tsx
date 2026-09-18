import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

type Listener = {
  path: string;
  next: (snapshot: { exists: () => boolean; data: () => unknown }) => void;
};

const mocks = vi.hoisted(() => ({
  game: {} as any,
  rd: {} as any,
  uid: 'user-a',
  autoPrivate: true,
  listeners: [] as Listener[],
}));

vi.mock('../../contexts/GameContext', () => ({ useGame: () => mocks.game }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ uid: mocks.uid, ready: true }),
}));
vi.mock('../../hooks/useRoundDoc', () => ({ useRoundDoc: () => mocks.rd }));
vi.mock('../../lib/firebase', () => ({ db: {} }));
vi.mock('../ui/PhaseHeader', () => ({ PhaseHeader: () => null }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (
    path: string,
    next: Listener['next'],
  ) => {
    mocks.listeners.push({ path, next });
    if (path.includes('/auctions/')) {
      next({
        exists: () => true,
        data: () => ({ stars: [17], results: [{ pid: 17, teamId: null }] }),
      });
    } else if (mocks.autoPrivate && path.includes('/teams/a/')) {
      next({
        exists: () => true,
        data: () => ({ skippedRound: 2, skipped: [{ pid: 17, reason: 'cap' }] }),
      });
    }
    return () => undefined;
  },
}));

import ResultsPage from '../../pages/ResultsPage';

const header = [
  'round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
  'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
  'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'playstyle',
].join(',');

beforeEach(() => {
  mocks.uid = 'user-a';
  mocks.autoPrivate = true;
  mocks.listeners.length = 0;
  const teamA = {
    name: 'Tigers',
    roster: [{ pid: 17, rate: 3, startRound: 2, years: 1 }],
    deadMoney: [],
    spendLog: [],
  };
  const teamB = { ...teamA };
  mocks.game = {
    gameId: 'game-a',
    game: { round: 2, phase: 'RESULTS' },
    membership: { teamId: 'a', role: 'GM' },
    team: teamA,
    teams: new Map([['a', teamA], ['b', teamB]]),
    catalog: new Map([[17, { pid: 17, name: 'Same Player', position: 'G' }]]),
  };
  mocks.rd = {
    games: [{ game_id: 'R2-G1', home: 'a', away: 'b', homeScore: 100, awayScore: 90 }],
    standings: [{
      teamId: 'a', name: 'Tigers', wins: 6, losses: 2, rank: 1,
      previousRank: 2, pointDiff: 10,
    }],
    awards: {
      roundMvp: { pid: 17, teamId: 'a', line: 'MVP' },
      topScorer: { pid: 17, teamId: 'a', pts: 40 },
      bargain: { pid: 17, teamId: 'a' },
    },
    boxCsv: `${header}\n`
      + '2,R2-G1,Tigers,Tigers,100,90,1,17,Same Player,G,starter,30,20,7,14,2,5,4,6,1,0,2,Balanced\n'
      + '2,R2-G1,Tigers,Tigers,90,100,0,17,Same Player,G,starter,30,40,7,14,2,5,4,6,1,0,2,Balanced',
  };
});

test('bargain award omits pooled calculations when team name and player id are ambiguous', () => {
  render(<ResultsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'next award' }));
  fireEvent.click(screen.getByRole('button', { name: 'next award' }));

  const awards = within(screen.getByTestId('awards'));
  expect(awards.getByText(/Same Player \(Tigers\)/)).toBeInTheDocument();
  expect(awards.getByText(/\$3\.0M\/rd/)).toBeInTheDocument();
  expect(awards.queryByText(/30\.0 pts/)).not.toBeInTheDocument();
});

test('private skip feedback is scope-gated across team changes and retired callbacks', () => {
  const { rerender } = render(<ResultsPage />);
  expect(screen.getByTestId('auction-skip-note')).toBeInTheDocument();
  const retired = mocks.listeners.find((listener) => listener.path.includes('/teams/a/'))!;

  mocks.autoPrivate = false;
  mocks.game = {
    ...mocks.game,
    membership: { teamId: 'b', role: 'GM' },
    team: mocks.game.teams.get('b'),
  };
  rerender(<ResultsPage />);
  expect(screen.queryByTestId('auction-skip-note')).not.toBeInTheDocument();

  act(() => retired.next({
    exists: () => true,
    data: () => ({ skippedRound: 2, skipped: [{ pid: 17, reason: 'cap' }] }),
  }));
  expect(screen.queryByTestId('auction-skip-note')).not.toBeInTheDocument();
});

test('private skip feedback is hidden while uid and game scopes reload', () => {
  const { rerender } = render(<ResultsPage />);
  expect(screen.getByTestId('auction-skip-note')).toBeInTheDocument();

  mocks.autoPrivate = false;
  mocks.uid = 'user-b';
  rerender(<ResultsPage />);
  expect(screen.queryByTestId('auction-skip-note')).not.toBeInTheDocument();

  mocks.game = { ...mocks.game, gameId: 'game-b' };
  rerender(<ResultsPage />);
  expect(screen.queryByTestId('auction-skip-note')).not.toBeInTheDocument();
});
