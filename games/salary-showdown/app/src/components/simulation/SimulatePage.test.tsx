import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RoundDoc, StandingsRow, TeamDoc } from '../../types/models';
import SimulatePage from '../../pages/SimulatePage';

const mocks = vi.hoisted(() => ({
  gameValue: {} as Record<string, unknown>,
  presentation: {} as Record<string, unknown>,
}));

vi.mock('../../contexts/GameContext', () => ({ useGame: () => mocks.gameValue }));
vi.mock('../../contexts/RoundPresentationContext', () => ({
  useRoundPresentation: () => mocks.presentation,
}));
vi.mock('../../hooks/useRoundDoc', () => ({
  useRoundDoc: () => (mocks.presentation.rd as RoundDoc | null) ?? null,
}));

const team = (name: string): TeamDoc => ({
  name,
  wins: 0,
  losses: 0,
  pointDiff: 0,
  pointsFor: 0,
  roster: [],
  deadMoney: [],
  spendLog: [],
  lineup: null,
  lineupLockedRound: 0,
  hardshipUsed: [],
  doneRound: 0,
  donePhase: '',
});
const rows = (wins: number, losses: number): StandingsRow[] => [
  { teamId: 'alpha', name: 'Alpha', wins, losses, pointDiff: 10, pointsFor: 210,
    tiebreakCoin: 0.1, rank: 1, previousRank: 2 },
  { teamId: 'beta', name: 'Beta', wins: 4, losses: 6, pointDiff: -10, pointsFor: 190,
    tiebreakCoin: 0.2, rank: 2, previousRank: 1 },
];

const boxHeader = 'round,game_id,team,opponent,team_score,opp_score,win,player_id,player_name,position,tier,mins,pts,fgm,fga,three_pm,three_pa,rebounds,assists,steals,blocks,turnovers,playstyle';
const ROUND: RoundDoc = {
  games: [
    { game_id: 'R2-G1', home: 'alpha', away: 'beta', homeScore: 109, awayScore: 101 },
    { game_id: 'R2-G2', home: 'beta', away: 'alpha', homeScore: 97, awayScore: 102 },
  ],
  standings: rows(10, 2),
  awards: {
    roundMvp: { pid: 1, teamId: 'alpha', line: '24 pts' },
    topScorer: { pid: 1, teamId: 'alpha', pts: 24 },
    bargain: null,
  },
  boxCsv: [
    boxHeader,
    '2,R2-G1,Alpha,Beta,109,101,1,1,Arlo King,G,starter,34,24,9,16,4,7,4,8,2,0,2,Balanced',
    '2,R2-G1,Beta,Alpha,101,109,0,2,Devon Miles,W,starter,33,18,7,14,2,5,7,3,1,1,3,Lockdown',
    '2,R2-G2,Beta,Alpha,97,102,0,2,Devon Miles,W,starter,32,16,6,13,2,5,6,4,1,1,2,Lockdown',
    '2,R2-G2,Alpha,Beta,102,97,1,1,Arlo King,G,starter,35,22,8,15,3,6,5,7,2,0,2,Balanced',
  ].join('\n'),
};

function reset(rd: RoundDoc | null = ROUND) {
  const alpha = team('Alpha');
  const beta = team('Beta');
  mocks.gameValue = {
    gameId: 'game-a',
    game: {
      joinCode: 'SAFE01', status: 'active', phase: 'SIMULATE', round: 2,
      timerEndsAt: null, timerPausedMs: null, teamCount: 2,
      config: { cap: 100, totalRounds: 5 }, professorUid: 'prof',
    },
    membership: { teamId: 'alpha', role: 'GM', displayName: 'Ada' },
    team: alpha,
    teams: new Map([['alpha', alpha], ['beta', beta]]),
  };
  mocks.presentation = {
    round: 2,
    rd,
    applied: 0,
    complete: false,
    rows: rows(8, 2),
    revealNext: vi.fn(),
    revealAll: vi.fn(),
    getRound: vi.fn(),
  };
}

function renderSubject() {
  return render(<MemoryRouter><SimulatePage /></MemoryRouter>);
}

beforeEach(() => reset());

test('keeps franchise and round context visible while the round document is missing', () => {
  reset(null);
  renderSubject();

  expect(screen.getByRole('heading', { name: 'Simulate · Round 2' })).toBeInTheDocument();
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing round 2 results');
  expect(screen.queryByText('109–101')).not.toBeInTheDocument();
});

test('the shared applied prefix gates scores, the live record, and completed expansion', () => {
  const view = renderSubject();

  expect(screen.getByTestId('simulation-record')).toHaveTextContent('8–2');
  expect(screen.getByText('Next matchup')).toBeInTheDocument();
  expect(screen.queryByText('109–101')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reveal all results' }));
  expect(mocks.presentation.revealAll).toHaveBeenCalledTimes(1);

  mocks.presentation = {
    ...mocks.presentation,
    applied: 1,
    rows: rows(9, 2),
  };
  view.rerender(<MemoryRouter><SimulatePage /></MemoryRouter>);

  expect(screen.getByTestId('simulation-record')).toHaveTextContent('9–2');
  expect(screen.getAllByText('109–101').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByTestId('completed-game-R2-G1'));
  expect(screen.getByTestId('match-boxscore')).toHaveTextContent('Arlo King');
  expect(screen.getByTestId('match-boxscore')).toHaveTextContent('Devon Miles');
  expect(screen.getByRole('columnheader', { name: 'turnovers' })).toBeInTheDocument();
});

test('duplicate franchise names keep the full selected matchup and show neutral guidance', () => {
  const tigersA = team('Tigers');
  const tigersB = team('Tigers');
  mocks.gameValue = {
    ...mocks.gameValue,
    team: tigersA,
    teams: new Map([['alpha', tigersA], ['beta', tigersB]]),
  };
  mocks.presentation = {
    ...mocks.presentation,
    applied: 1,
    rows: rows(9, 2).map((row) => ({ ...row, name: 'Tigers' })),
  };
  renderSubject();

  fireEvent.click(screen.getByTestId('completed-game-R2-G1'));
  expect(screen.getByRole('note')).toHaveTextContent('franchise names match');
  expect(screen.getByTestId('match-boxscore').querySelectorAll('tbody tr')).toHaveLength(2);
});
