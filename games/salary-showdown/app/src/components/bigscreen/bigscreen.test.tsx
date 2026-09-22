import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { GameDoc, RevealDoc, RoundDoc, TeamDoc } from '../../types/models';
import { DecisionWall } from './DecisionWall';
import { FinaleWall } from './FinaleWall';
import { LobbyWall } from './LobbyWall';
import { SimulateFlood } from './SimulateFlood';
import { StandingsShuffle } from './StandingsShuffle';

const mocks = vi.hoisted(() => ({
  professor: {} as Record<string, unknown>,
  reduced: false,
}));

vi.mock('../../contexts/ProfessorContext', () => ({
  useProfessor: () => mocks.professor,
}));

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reduced,
}));

const game = (overrides: Partial<GameDoc> = {}): GameDoc => ({
  joinCode: 'ABCDE1',
  status: 'active',
  phase: 'SIMULATE',
  round: 2,
  timerEndsAt: null,
  timerPausedMs: null,
  teamCount: 2,
  config: { cap: 100, totalRounds: 5 },
  professorUid: 'prof',
  ...overrides,
});

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

const reveal: RevealDoc = {
  scatter: [
    { pid: 1, name: 'One Guard', hype: 5, salary: 20, ti: 2, isTrap: true,
      archetype: 'Volume Scorer' },
  ],
  perTeam: [
    { teamId: 't1', bestSigning: { pid: 1, valuePerDollar: 1.5 },
      worstSigning: { pid: 1, valuePerDollar: 1.5 } },
  ],
  winsPerDollar: [{ teamId: 't1', wins: 8, totalSpend: 50, ratio: 0.16 }],
  trueWeights: {
    narrative: 'The data told the story.',
    defenseVisible: true,
    turnoverWeight: -2,
    engine: { base: 1, scoring: 2, playmaking: 3, steal: 4, block: 5,
      rebound: 6, turnover: -7 },
    regression: { winsR2: 0.7, turnoverCoef: -3.8, turnoverP: '<0.001',
      payrollT: 0, hypeT: 1.3 },
  },
};

function standings(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    teamId: `t${index + 1}`,
    name: `Franchise ${index + 1}`,
    wins: count - index,
    losses: index,
    pointDiff: count - index,
    pointsFor: 1000 - index,
    tiebreakCoin: index,
    rank: index + 1,
    previousRank: index + 1,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T20:00:00Z'));
  sessionStorage.clear();
  mocks.reduced = false;
  mocks.professor = {};
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('simulation uses elapsed pacing and never shows final records before their game prefix', () => {
  const round: RoundDoc = {
    games: [
      { game_id: 'g1', home: 'a', away: 'b', homeScore: 101, awayScore: 90 },
      { game_id: 'g2', home: 'a', away: 'b', homeScore: 99, awayScore: 91 },
    ],
    standings: [
      { teamId: 'a', name: 'Alpha', wins: 2, losses: 0, pointDiff: 19,
        pointsFor: 200, tiebreakCoin: 0.1, rank: 1, previousRank: 2 },
      { teamId: 'b', name: 'Beta', wins: 0, losses: 2, pointDiff: -19,
        pointsFor: 181, tiebreakCoin: 0.2, rank: 2, previousRank: 1 },
    ],
    awards: {} as RoundDoc['awards'],
    boxCsv: '',
  };
  mocks.professor = {
    gameId: 'game-1',
    game: game(),
    round,
    teams: new Map([['a', team('Alpha')], ['b', team('Beta')]]),
  };

  render(<SimulateFlood />);

  expect(screen.queryAllByTestId('bs-scorecard')).toHaveLength(0);
  expect(screen.getByTestId('bs-live-record-a')).toHaveTextContent('0–0');

  act(() => vi.advanceTimersByTime(4250));
  expect(screen.getAllByTestId('bs-scorecard')).toHaveLength(1);
  expect(screen.getByTestId('bs-live-record-a')).toHaveTextContent('1–0');

  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getAllByTestId('bs-scorecard')).toHaveLength(2);
  expect(screen.getByTestId('bs-live-record-a')).toHaveTextContent('2–0');
});

test('reduced-motion classroom simulation shows every rank in a dense no-scroll wall', () => {
  mocks.reduced = true;
  const names = Array.from({ length: 21 }, (_, index) =>
    index === 0 ? 'North Coast Trailblazers' : `Classroom Franchise ${index + 1}`);
  const teams = new Map(names.map((name, index) => [`t${index + 1}`, team(name)]));
  const games = Array.from({ length: 8 }, (_, index) => ({
    game_id: `g${index + 1}`,
    home: `t${index * 2 + 1}`,
    away: `t${index * 2 + 2}`,
    homeScore: 80 + index,
    awayScore: 70 + index,
  }));
  const rows = standings(21).map((row, index) => ({ ...row, name: names[index] }));
  mocks.professor = {
    gameId: 'game-classroom',
    game: game({ phase: 'SIMULATE', teamCount: 21 }),
    round: { games, standings: rows, awards: {}, boxCsv: '' },
    teams,
  };

  render(<SimulateFlood />);

  expect(document.querySelector('main.bigscreen')).toHaveClass(
    'bs-sim-classroom', 'bs-sim-reduced-dense');
  expect(screen.getByTestId('bs-live-standings')).toHaveClass('is-classroom-grid');
  expect(screen.getAllByTestId('bs-live-row')).toHaveLength(21);
  expect(screen.getAllByTestId('bs-scorecard')).toHaveLength(8);
  expect(within(screen.getByTestId('bs-live-standings'))
    .getByText('North Coast Trailblazers')).toBeInTheDocument();
  expect(within(screen.getAllByTestId('bs-scorecard')[0])
    .getByText('North Coast Trailblazers')).toBeInTheDocument();
});

test('normal-motion classroom simulation keeps full names inside paged rows', () => {
  const names = Array.from({ length: 21 }, (_, index) =>
    index === 0 ? 'North Coast Trailblazers' : `Classroom Franchise ${index + 1}`);
  const teams = new Map(names.map((name, index) => [`t${index + 1}`, team(name)]));
  const games = Array.from({ length: 8 }, (_, index) => ({
    game_id: `g${index + 1}`,
    home: `t${index * 2 + 1}`,
    away: `t${index * 2 + 2}`,
    homeScore: 80 + index,
    awayScore: 70 + index,
  }));
  const rows = standings(21).map((row, index) => ({ ...row, name: names[index] }));
  mocks.professor = {
    gameId: 'game-classroom-normal',
    game: game({ phase: 'SIMULATE', teamCount: 21 }),
    round: { games, standings: rows, awards: {}, boxCsv: '' },
    teams,
  };

  render(<SimulateFlood />);
  act(() => vi.advanceTimersByTime(26000));

  expect(document.querySelector('main.bigscreen')).toHaveClass('bs-sim-classroom');
  expect(document.querySelector('main.bigscreen')).not.toHaveClass('bs-sim-reduced-dense');
  expect(screen.getByTestId('bs-live-standings')).not.toHaveClass('is-classroom-grid');
  expect(screen.getAllByTestId('bs-live-row')).toHaveLength(7);
  expect(screen.getByTestId('bs-live-page-status')).toHaveTextContent(/Page [123] of 3/);
  expect(within(screen.getAllByTestId('bs-scorecard')[0])
    .getByText('North Coast Trailblazers')).toBeInTheDocument();
  expect(within(screen.getByTestId('bs-live-standings'))
    .getByText('Classroom Franchise 8')).toBeInTheDocument();
});

test('reduced-motion small-league simulation keeps the standard split wall', () => {
  mocks.reduced = true;
  const rows = standings(2);
  mocks.professor = {
    gameId: 'game-small',
    game: game({ phase: 'SIMULATE', teamCount: 2 }),
    round: {
      games: [{ game_id: 'g1', home: 't1', away: 't2', homeScore: 90, awayScore: 80 }],
      standings: rows,
      awards: {},
      boxCsv: '',
    },
    teams: new Map([['t1', team('Franchise 1')], ['t2', team('Franchise 2')]]),
  };

  render(<SimulateFlood />);

  expect(document.querySelector('main.bigscreen')).not.toHaveClass(
    'bs-sim-classroom', 'bs-sim-reduced-dense');
  expect(screen.getByTestId('bs-live-standings')).not.toHaveClass('is-classroom-grid');
  expect(screen.getAllByTestId('bs-live-row')).toHaveLength(2);
});

test('reduced motion exposes all 21 final placements immediately', () => {
  mocks.reduced = true;
  mocks.professor = {
    game: game({ phase: 'RESULTS', teamCount: 21 }),
    round: { games: [], standings: standings(21), awards: {}, boxCsv: '' },
  };

  render(<StandingsShuffle />);

  expect(document.querySelector('main.bigscreen')).toHaveClass('bs-results');
  expect(screen.getByTestId('bs-shuffle')).toHaveClass('is-classroom-grid');
  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(21);
  expect(screen.getByText('Franchise 1')).toBeInTheDocument();
  expect(screen.getByText('Franchise 21')).toBeInTheDocument();
});

test('reduced motion keeps small-league standings at their readable wall scale', () => {
  mocks.reduced = true;
  mocks.professor = {
    game: game({ phase: 'RESULTS', teamCount: 2 }),
    round: { games: [], standings: standings(2), awards: {}, boxCsv: '' },
  };

  render(<StandingsShuffle />);

  expect(screen.getByTestId('bs-shuffle')).toHaveClass('is-static-grid');
  expect(screen.getByTestId('bs-shuffle')).not.toHaveClass('is-classroom-grid');
  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(2);
});

test('dense lobby preserves every full franchise name and role in compact cards', () => {
  const names = [
    ...Array.from({ length: 19 }, (_, index) => `Classroom Franchise ${index + 3}`),
    'North Coast Trailblazers',
    'South Coast Independents',
  ];
  const teams = new Map(names.map((name, index) => [`t${index + 1}`, team(name)]));
  mocks.professor = {
    game: game({ phase: 'LOBBY', teamCount: 21 }),
    teams,
    players: new Map(),
  };

  render(<LobbyWall />);

  const cards = [...document.querySelectorAll<HTMLElement>('.bs-teamcard')];
  expect(cards).toHaveLength(21);
  expect(cards.map((card) => card.querySelector('h2')?.textContent))
    .toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  expect(document.querySelectorAll('.bs-teamcard .chip')).toHaveLength(63);
  cards.forEach((card) => {
    expect(card.querySelector('svg')?.style.getPropertyValue('--mark-size')).toBe('32px');
  });
});

test('turning reduced motion off cannot shroud placements already exposed', () => {
  mocks.reduced = true;
  mocks.professor = {
    gameId: 'game-1',
    game: game({ phase: 'RESULTS' }),
    round: { games: [], standings: standings(2), awards: {}, boxCsv: '' },
  };
  const view = render(<StandingsShuffle />);
  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(2);

  mocks.reduced = false;
  view.rerender(<StandingsShuffle />);

  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(2);
});

test('an equivalent round snapshot cannot replay a completed shuffle', () => {
  mocks.professor = {
    gameId: 'game-1',
    game: game({ phase: 'RESULTS' }),
    round: { games: [], standings: standings(2), awards: {}, boxCsv: '' },
  };
  const view = render(<StandingsShuffle />);
  act(() => vi.advanceTimersByTime(1600));
  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(2);

  mocks.professor = {
    ...mocks.professor,
    round: structuredClone(mocks.professor.round),
  };
  view.rerender(<StandingsShuffle />);

  expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(2);
});

test('settled 21-team standings rotate through every fixed page without skipping a row', () => {
  mocks.professor = {
    game: game({ phase: 'RESULTS', teamCount: 21 }),
    round: { games: [], standings: standings(21), awards: {}, boxCsv: '' },
  };

  render(<StandingsShuffle />);
  act(() => vi.advanceTimersByTime(26000));

  const seen = new Set<string>();
  for (let page = 0; page < 3; page += 1) {
    const table = screen.getByTestId('bs-shuffle');
    within(table).queryAllByTestId('bs-shuffle-row').forEach((row) => {
      const name = row.querySelector('.bs-shuffle-name')?.textContent;
      if (name) seen.add(name);
    });
    expect(screen.getByTestId('bs-page-status')).toHaveTextContent(/Page [123] of 3/);
    act(() => vi.advanceTimersByTime(6000));
  }

  expect([...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
    .toEqual(Array.from({ length: 21 }, (_, i) => `Franchise ${i + 1}`));
});

test('decision wall keeps all 21 franchises in its readable grid', () => {
  const teams = new Map(Array.from({ length: 21 }, (_, i) => {
    const id = `t${i + 1}`;
    return [id, team(`Franchise ${i + 1}`)] as const;
  }));
  mocks.professor = {
    game: game({ phase: 'LINEUP', teamCount: 21 }),
    teams,
    bidsSubmitted: new Set<string>(),
  };

  render(<DecisionWall />);

  expect(screen.getAllByTestId('bs-light-row')).toHaveLength(21);
  expect(screen.getByText('Franchise 1')).toBeInTheDocument();
  expect(screen.getByText('Franchise 21')).toBeInTheDocument();
});

describe('finale wall steps', () => {
  const finaleContext = (step: number, payload: RevealDoc | null = reveal) => ({
    game: game({ phase: 'FINALE', round: 5, revealStep: step }),
    round: { games: [], standings: standings(3), awards: {}, boxCsv: '' },
    reveal: payload,
    teams: new Map([['t1', team('Franchise 1')], ['t2', team('Franchise 2')],
      ['t3', team('Franchise 3')]]),
  });

  test.each([
    [0, 'Podium', 'finale-podium'],
    [1, 'Hype vs Reality', 'finale-scatter'],
    [2, 'What the engine paid for', 'finale-weights'],
    [3, 'Wins per dollar', 'finale-wpd'],
    [4, 'Best & worst signings', 'finale-bestworst'],
  ])('step %i renders %s in projector-sized chart space', (step, title, testId) => {
    mocks.professor = finaleContext(step);
    render(<FinaleWall />);

    expect(screen.getByTestId('finale-wall')).toHaveClass('bs-finale');
    expect(screen.getByTestId('finale-step-title')).toHaveTextContent(title);
    const content = screen.getByTestId(testId);
    if (step > 0) expect(content).toHaveClass('bs-reveal-chart');
  });

  test('missing reveal shows loading and out-of-range steps clamp to the nearest endpoint', () => {
    mocks.professor = finaleContext(2, null);
    const view = render(<FinaleWall />);
    expect(screen.getByText('Loading the reveal…')).toBeInTheDocument();

    mocks.professor = finaleContext(-10);
    view.rerender(<FinaleWall />);
    expect(screen.getByTestId('finale-podium')).toBeInTheDocument();

    mocks.professor = finaleContext(99);
    view.rerender(<FinaleWall />);
    expect(screen.getByTestId('finale-bestworst')).toBeInTheDocument();
    expect(screen.getByTestId('finale-step-title')).toHaveTextContent('Best & worst signings');
  });
});
