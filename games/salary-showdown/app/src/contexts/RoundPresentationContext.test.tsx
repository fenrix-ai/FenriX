import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RoundDoc } from '../types/models';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { useRoundDoc } from '../hooks/useRoundDoc';
import {
  RoundPresentationProvider,
  useRoundPresentation,
} from './RoundPresentationContext';

type SnapshotListener = {
  next: (snapshot: { exists(): boolean; data(): unknown }) => void;
  error?: (error: Error) => void;
};

const mocks = vi.hoisted(() => ({
  uid: 'user-a',
  reduced: false,
  gameValue: {} as Record<string, unknown>,
  listeners: new Map<string, SnapshotListener>(),
  unsubs: [] as ReturnType<typeof vi.fn>[],
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ uid: mocks.uid, ready: true }),
}));
vi.mock('./GameContext', () => ({
  useGame: () => mocks.gameValue,
}));
vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reduced,
}));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  onSnapshot: (...args: unknown[]) => mocks.onSnapshot(...args),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
}));

const GAME = {
  joinCode: 'SAFE01', status: 'active', phase: 'SIMULATE', round: 2,
  timerEndsAt: null, timerPausedMs: null, teamCount: 2,
  config: { cap: 100, totalRounds: 5 }, professorUid: 'prof',
};
const TEAM = {
  name: 'A Franchise Name That Must Still Fit', wins: 99, losses: 88,
  pointDiff: 0, pointsFor: 0, roster: [], deadMoney: [], spendLog: [],
  lineup: null, lineupLockedRound: 0, hardshipUsed: [], doneRound: 0, donePhase: '',
};
const ROUND: RoundDoc = {
  games: [
    { game_id: 'R2-G1', home: 'alpha', away: 'beta', homeScore: 110, awayScore: 100 },
    { game_id: 'R2-G2', home: 'beta', away: 'alpha', homeScore: 90, awayScore: 95 },
  ],
  standings: [
    { teamId: 'alpha', name: 'Alpha', wins: 10, losses: 2, pointDiff: 30,
      pointsFor: 1000, tiebreakCoin: 0.1, rank: 1, previousRank: 2 },
    { teamId: 'beta', name: 'Beta', wins: 3, losses: 9, pointDiff: -30,
      pointsFor: 900, tiebreakCoin: 0.2, rank: 2, previousRank: 1 },
  ],
  awards: {
    roundMvp: { pid: 1, teamId: 'alpha', line: '20 pts' },
    topScorer: { pid: 1, teamId: 'alpha', pts: 20 },
    bargain: null,
  },
  boxCsv: 'round,game_id\n',
};

function resetGame() {
  mocks.uid = 'user-a';
  mocks.reduced = false;
  mocks.gameValue = {
    gameId: 'game-a',
    game: { ...GAME },
    membership: { teamId: 'alpha', role: 'GM', displayName: 'Ada' },
    team: { ...TEAM },
    teams: new Map([['alpha', TEAM]]),
  };
}

function emit(path: string, data: unknown | null) {
  const listener = mocks.listeners.get(path);
  if (!listener) throw new Error(`No listener for ${path}`);
  act(() => listener.next({ exists: () => data !== null, data: () => data }));
}

let currentPresentation: ReturnType<typeof useRoundPresentation> | null = null;

function Probe() {
  const value = useRoundPresentation();
  currentPresentation = value;
  const alpha = value.rows.find((row) => row.teamId === 'alpha');
  const [history, setHistory] = useState('idle');
  return (
    <>
      <PhaseHeader title="Simulate" round={value.round} timerEndsAt={null} />
      <output data-testid="presentation">
        {value.applied}|{value.complete ? 'complete' : 'playing'}|{alpha ? `${alpha.wins}-${alpha.losses}` : 'none'}
      </output>
      <button onClick={value.revealNext}>Reveal next</button>
      <button onClick={value.revealAll}>Reveal all</button>
      <button onClick={() => void value.getRound(1).then((rd) => setHistory(rd ? 'found' : 'none'))}>
        Read round one
      </button>
      <output data-testid="history">{history}</output>
    </>
  );
}

function Subject({ strict = false }: { strict?: boolean }) {
  const tree = (
    <MemoryRouter>
      <RoundPresentationProvider><Probe /></RoundPresentationProvider>
    </MemoryRouter>
  );
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}

beforeEach(() => {
  sessionStorage.clear();
  resetGame();
  mocks.listeners.clear();
  mocks.unsubs = [];
  mocks.onSnapshot.mockReset().mockImplementation(
    (path: string, next: SnapshotListener['next'], error?: SnapshotListener['error']) => {
      mocks.listeners.set(path, { next, error });
      const unsub = vi.fn();
      mocks.unsubs.push(unsub);
      return unsub;
    },
  );
  mocks.getDoc.mockReset();
  currentPresentation = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([false, true])('reduced motion preserves revealed games when toggled off (storage blocked: %s)', (blocked) => {
  if (blocked) {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  }
  const view = render(<Subject strict />);
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('0|playing|8-2');
  mocks.reduced = true;
  view.rerender(<Subject strict />);
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete|10-2');
  mocks.reduced = false;
  view.rerender(<Subject strict />);
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete|10-2');
  expect(screen.getByTestId('team-record')).toHaveTextContent('10–2');

  mocks.gameValue = { ...mocks.gameValue, game: { ...GAME, round: 3 } };
  view.rerender(<Subject strict />);
  emit('games/game-a/rounds/3', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('0|playing|8-2');
});

test('elapsed reveals survive the clock moving backwards without session storage', () => {
  vi.useFakeTimers();
  const start = new Date('2026-09-17T12:00:00Z');
  vi.setSystemTime(start);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  act(() => vi.advanceTimersByTime(4500));
  expect(screen.getByTestId('presentation')).toHaveTextContent('1|playing|9-2');
  vi.setSystemTime(start);
  act(() => vi.advanceTimersByTime(250));
  expect(screen.getByTestId('presentation')).toHaveTextContent('1|playing|9-2');
});

function HistoricalProbe({ round, observe }: { round: number; observe?: (rd: RoundDoc | null) => void }) {
  const historical = useRoundDoc(round);
  observe?.(historical);
  return <output data-testid="historical-scope">{historical?.boxCsv ?? 'none'}</output>;
}

function HistoricalSubject({ round = 1, observe }: {
  round?: number; observe?: (rd: RoundDoc | null) => void;
}) {
  return <RoundPresentationProvider><HistoricalProbe round={round} observe={observe} /></RoundPresentationProvider>;
}

function deferredRound() {
  let resolve!: (value: { exists(): boolean; data(): RoundDoc }) => void;
  const promise = new Promise<{ exists(): boolean; data(): RoundDoc }>((done) => { resolve = done; });
  return { promise, resolve: (label: string) => resolve({ exists: () => true, data: () => ({ ...ROUND, boxCsv: label }) }) };
}

test.each(['game', 'user'])('historical data is hidden on the first render after a %s change', async (scope) => {
  mocks.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ ...ROUND, boxCsv: 'old scope' }) });
  const observe = vi.fn();
  const view = render(<HistoricalSubject observe={observe} />);
  await waitFor(() => expect(screen.getByTestId('historical-scope')).toHaveTextContent('old scope'));
  const pending = deferredRound();
  mocks.getDoc.mockReturnValueOnce(pending.promise);
  if (scope === 'game') mocks.gameValue = { ...mocks.gameValue, gameId: 'game-b' };
  else mocks.uid = 'user-b';
  observe.mockClear();
  view.rerender(<HistoricalSubject observe={observe} />);
  expect(observe.mock.calls[0][0]).toBeNull();
  expect(screen.getByTestId('historical-scope')).toHaveTextContent('none');
  await act(async () => pending.resolve('new scope'));
  expect(screen.getByTestId('historical-scope')).toHaveTextContent('new scope');
});

test('historical reads ignore obsolete scope and query completions', async () => {
  mocks.gameValue = { ...mocks.gameValue, game: { ...GAME, round: 3 } };
  const oldScope = deferredRound(), oldQuery = deferredRound(), currentQuery = deferredRound();
  mocks.getDoc.mockReturnValueOnce(oldScope.promise)
    .mockReturnValueOnce(oldQuery.promise).mockReturnValueOnce(currentQuery.promise);
  const view = render(<HistoricalSubject />);
  mocks.gameValue = { ...mocks.gameValue, gameId: 'game-b' };
  mocks.uid = 'user-b';
  view.rerender(<HistoricalSubject />);
  view.rerender(<HistoricalSubject round={2} />);
  await act(async () => currentQuery.resolve('current query'));
  expect(screen.getByTestId('historical-scope')).toHaveTextContent('current query');
  await act(async () => {
    oldQuery.resolve('obsolete query');
    oldScope.resolve('obsolete scope');
  });
  expect(screen.getByTestId('historical-scope')).toHaveTextContent('current query');
});

test('the shell and standings start from round-start totals, advance one prefix, and RESULTS completes', async () => {
  const view = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);

  expect(screen.getByTestId('presentation')).toHaveTextContent('0|playing|8-2');
  expect(screen.getByTestId('team-record')).toHaveTextContent('8–2');
  expect(screen.queryByText('99–88')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Reveal next' }));
  expect(screen.getByTestId('presentation')).toHaveTextContent('1|playing|9-2');
  expect(screen.getByTestId('team-record')).toHaveTextContent('9–2');

  (mocks.gameValue.game as typeof GAME).phase = 'RESULTS';
  view.rerender(<Subject />);
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete|10-2');
  expect(screen.getByTestId('team-record')).toHaveTextContent('10–2');
});

test('scope changes clear stale rows, ignore the old listener, and handle a missing round', () => {
  const view = render(<Subject />);
  const oldListener = mocks.listeners.get('games/game-a/rounds/2')!;
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('team-record')).toHaveTextContent('8–2');

  mocks.uid = 'user-b';
  mocks.gameValue = {
    ...mocks.gameValue,
    gameId: 'game-b',
    game: { ...GAME, round: 3 },
  };
  view.rerender(<Subject />);
  expect(screen.getByTestId('team-record')).toHaveTextContent('—');
  expect(mocks.unsubs[0]).toHaveBeenCalledTimes(1);

  act(() => oldListener.next({ exists: () => true, data: () => ROUND }));
  expect(screen.getByTestId('team-record')).toHaveTextContent('—');
  emit('games/game-b/rounds/3', null);
  expect(screen.getByTestId('presentation')).toHaveTextContent('0|playing|none');
});

test('historical reads are cached, failures become null, and SIMULATE refuses current or future reads', async () => {
  mocks.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ROUND });
  render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);

  fireEvent.click(screen.getByRole('button', { name: 'Read round one' }));
  await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('found'));
  fireEvent.click(screen.getByRole('button', { name: 'Read round one' }));
  await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(1));

  let current: RoundDoc | null = ROUND;
  let future: RoundDoc | null = ROUND;
  await act(async () => {
    current = await currentPresentation!.getRound(2);
    future = await currentPresentation!.getRound(3);
  });
  expect(current).toBeNull();
  expect(future).toBeNull();
  expect(mocks.getDoc).toHaveBeenCalledTimes(1);
});

test('Reveal all and reduced motion complete locally, and remount keeps manual progress', () => {
  const first = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  fireEvent.click(screen.getByRole('button', { name: 'Reveal next' }));
  expect(screen.getByTestId('presentation')).toHaveTextContent('1|playing');
  first.unmount();

  const second = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('1|playing');
  fireEvent.click(screen.getByRole('button', { name: 'Reveal all' }));
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete');
  second.unmount();

  mocks.reduced = true;
  const reduced = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete');
  reduced.unmount();
});

test('malformed progress is ignored and out-of-range progress is clamped', () => {
  const key = 'ss.round-presentation.game-a.user-a.2';
  sessionStorage.setItem(key, '{not-json');
  const malformed = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('0|playing');
  malformed.unmount();

  sessionStorage.setItem(key, JSON.stringify({
    gameId: 'game-a', uid: 'user-a', round: 2,
    startedAt: Date.now(), manualApplied: 999, revealAll: false,
  }));
  const clamped = render(<Subject />);
  emit('games/game-a/rounds/2', ROUND);
  expect(screen.getByTestId('presentation')).toHaveTextContent('2|complete');
  clamped.unmount();
});

test('a failed previous-round read leaves no record and reports the error', async () => {
  const failure = new Error('history unavailable');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getDoc.mockRejectedValue(failure);
  mocks.gameValue = {
    ...mocks.gameValue,
    game: { ...GAME, phase: 'FRONT_OFFICE', round: 3 },
  };

  render(<Subject />);

  await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
    'RoundPresentation: round read failed', failure,
  ));
  expect(screen.getByTestId('team-record')).toHaveTextContent('—');
  consoleError.mockRestore();
});

test('StrictMode and unmount clean up every current-round listener', () => {
  const view = render(<Subject strict />);
  const registered = [...mocks.unsubs];
  view.unmount();
  expect(registered.length).toBeGreaterThanOrEqual(1);
  for (const unsub of registered) expect(unsub).toHaveBeenCalledTimes(1);
});
