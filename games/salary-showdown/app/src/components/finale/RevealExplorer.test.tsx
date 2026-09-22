import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RevealDoc, StandingsRow, TeamDoc } from '../../types/models';
import FinalePage from '../../pages/FinalePage';
import { ScatterTI } from '../charts/ScatterTI';
import { Podium } from './Podium';
import { RevealExplorer } from './RevealExplorer';
import { SigningStory } from './SigningStory';

const finaleMock = vi.hoisted(() => ({
  uid: 'user-a' as string | null,
  game: {} as any,
  callbacks: [] as Array<{
    next: (snapshot: any) => void;
    error: (error: unknown) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ uid: finaleMock.uid }),
}));
vi.mock('../../contexts/GameContext', () => ({
  useGame: () => finaleMock.game,
}));
vi.mock('../../hooks/useRoundDoc', () => ({
  useRoundDoc: () => ({ standings: [] }),
}));
vi.mock('../../lib/firebase', () => ({ db: {} }));
vi.mock('../ui/PhaseHeader', () => ({ PhaseHeader: () => null }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  onSnapshot: (_path: string, next: (snapshot: any) => void,
    error: (listenerError: unknown) => void) => {
    const unsubscribe = vi.fn();
    finaleMock.callbacks.push({ next, error, unsubscribe });
    return unsubscribe;
  },
}));

const scatter: RevealDoc['scatter'] = [
  { pid: 1, name: 'Famous Volume Scorer', hype: 9, salary: 20, ti: 2,
    isTrap: true, archetype: 'volume_trap' },
  { pid: 2, name: 'Quiet Perimeter Defender', hype: 2, salary: 4, ti: 9,
    isTrap: false, archetype: 'elite_defender' },
  { pid: 3, name: 'Steady Rotation Wing', hype: 5, salary: 12, ti: 5,
    isTrap: false, archetype: 'journeyman' },
  { pid: 4, name: 'Auction Star', hype: 8, salary: null, ti: 8,
    isTrap: false, archetype: 'efficient_star' },
];

function team(spendLog: TeamDoc['spendLog']): TeamDoc {
  return {
    name: 'Team', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
    roster: [], deadMoney: [], spendLog, lineup: null, lineupLockedRound: 0,
    hardshipUsed: [], doneRound: 0, donePhase: '',
  };
}

const sharedDeal = {
  pid: 2, rate: 4, startRound: 1, years: 2, viaAuction: false, hardship: false,
};
const teams = new Map<string, TeamDoc>([
  ['alpha', { ...team([sharedDeal]), name: 'Alpha Analysts' }],
  ['beta', { ...team([sharedDeal]), name: 'Beta Ballers' }],
]);

const trueWeights: RevealDoc['trueWeights'] = {
  narrative: '', defenseVisible: true, turnoverWeight: 1.5,
  engine: {
    base: 6, scoring: 1.6, playmaking: 0.55, steal: 1.05,
    block: 1, rebound: 0.25, turnover: 1.5,
  },
  regression: {
    winsR2: 0.7, turnoverCoef: -3.84, turnoverP: '<0.001',
    payrollT: -0.03, hypeT: 1.37,
  },
};

function finaleReveal(narrative: string): RevealDoc {
  return {
    scatter: [], perTeam: [], winsPerDollar: [],
    trueWeights: { ...trueWeights, narrative },
  };
}

function publishFinale(index: number, narrative: string) {
  act(() => finaleMock.callbacks[index].next({
    exists: () => true,
    data: () => finaleReveal(narrative),
  }));
}

describe('FinalePage reveal scope', () => {
  beforeEach(() => {
    finaleMock.uid = 'user-a';
    finaleMock.callbacks = [];
    finaleMock.game = {
      gameId: 'game-a',
      game: { phase: 'FINALE', round: 5 },
      membership: { teamId: 'alpha' },
      team: null,
      teams: new Map(),
    };
  });

  test('scopes reveal data to the game and ignores a retired game callback', () => {
    const { rerender } = render(<FinalePage />);
    publishFinale(0, 'Game A secret');

    finaleMock.game = { ...finaleMock.game, gameId: 'game-b' };
    rerender(<FinalePage />);
    expect(screen.queryByTestId('narrative')).toBeNull();
    expect(finaleMock.callbacks[0].unsubscribe).toHaveBeenCalledOnce();

    publishFinale(1, 'Game B facts');
    publishFinale(0, 'Late game A secret');
    expect(screen.getByTestId('narrative')).toHaveTextContent('Game B facts');
  });

  test('suppresses a prior viewer reveal while the new uid scope loads', () => {
    const { rerender } = render(<FinalePage />);
    publishFinale(0, 'Prior viewer reveal');

    finaleMock.uid = 'user-b';
    rerender(<FinalePage />);
    expect(screen.queryByTestId('narrative')).toBeNull();

    publishFinale(1, 'Authorized viewer reveal');
    expect(screen.getByTestId('narrative')).toHaveTextContent('Authorized viewer reveal');
  });

  test('clears on phase exit and rejects delayed finale callbacks', () => {
    const { rerender } = render(<FinalePage />);
    publishFinale(0, 'Finale-only reveal');

    finaleMock.game = {
      ...finaleMock.game,
      game: { ...finaleMock.game.game, phase: 'RESULTS' },
    };
    rerender(<FinalePage />);
    expect(screen.queryByTestId('narrative')).toBeNull();

    publishFinale(0, 'Delayed finale reveal');
    expect(screen.queryByTestId('narrative')).toBeNull();
  });

  test('keeps listener errors observable while clearing unusable reveal data', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FinalePage />);
    publishFinale(0, 'Temporary reveal');

    const failure = new Error('permission lost');
    act(() => finaleMock.callbacks[0].error(failure));

    expect(screen.queryByTestId('narrative')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('reveal/latest listener', failure);
    errorSpy.mockRestore();
  });
});

describe('RevealExplorer', () => {
  test('uses group semantics for interactive points and image semantics when read only', () => {
    const interactive = render(<RevealExplorer rows={scatter} teams={teams} />);
    const interactiveChart = screen.getByTestId('chart-scatter-ti');
    expect(interactiveChart).toHaveAttribute('role', 'group');
    expect(interactiveChart).toHaveAccessibleName(/interactive hype versus trueimpact/i);
    interactive.unmount();

    render(<ScatterTI rows={scatter} />);
    const readOnlyChart = screen.getByTestId('chart-scatter-ti');
    expect(readOnlyChart).toHaveAttribute('role', 'img');
    expect(readOnlyChart).toHaveAccessibleName('Hype versus TrueImpact, traps and bargains labeled');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  test('makes the scrollable visible-player data a named keyboard focus region', () => {
    render(<RevealExplorer rows={scatter} teams={teams} />);

    const region = screen.getByRole('region', { name: 'Visible player data' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByText('Quiet Perimeter Defender'));
  });

  test('selects a scatter point from the keyboard and publishes equivalent facts', () => {
    render(<RevealExplorer rows={scatter} teams={teams} />);
    const point = screen.getByRole('button', { name: /Quiet Perimeter Defender/ });
    fireEvent.keyDown(point, { key: 'Enter' });
    const detail = screen.getByRole('status', { name: 'Selected player details' });
    expect(detail).toHaveTextContent('Quiet Perimeter Defender');
    expect(detail).toHaveTextContent('Hype 2');
    expect(detail).toHaveTextContent('TrueImpact 9');
    expect(point).toHaveAttribute('aria-pressed', 'true');
  });

  test('filters from the full classification population without changing its data', async () => {
    const user = userEvent.setup();
    const original = structuredClone(scatter);
    render(<RevealExplorer rows={scatter} teams={teams} />);
    await user.click(screen.getByRole('button', { name: 'Known traps' }));
    expect(screen.getByText('Showing 1 of 4 players')).toBeInTheDocument();
    expect(screen.getByTestId('chart-scatter-ti')).toHaveAttribute('data-total-points', '4');
    expect(scatter).toEqual(original);
  });

  test('highlights a shared ordinary free agent for either team that signed him', async () => {
    const user = userEvent.setup();
    render(<RevealExplorer rows={scatter} teams={teams} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Highlight franchise signings' }),
      'beta');
    expect(screen.getByRole('button', { name: /Quiet Perimeter Defender/ }))
      .toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByText(/ordinary free agents can appear for more than one franchise/i))
      .toBeInTheDocument();
  });
});

const podiumRows: StandingsRow[] = [
  { teamId: 'alpha', name: 'Alpha Analysts', wins: 8, losses: 2,
    pointDiff: 40, pointsFor: 900, tiebreakCoin: 1, rank: 1, previousRank: 2 },
  { teamId: 'beta', name: 'Beta Ballers', wins: 6, losses: 4,
    pointDiff: 12, pointsFor: 850, tiebreakCoin: 2, rank: 2, previousRank: 1 },
];

describe('Podium', () => {
  const defaultMatchMedia = window.matchMedia;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    window.matchMedia = defaultMatchMedia;
  });

  test('handles a two-team podium and lets the viewer skip to the champion', () => {
    render(<Podium rows={podiumRows} teams={teams} celebrationKey="game/user" />);
    expect(screen.getByText('Beta Ballers')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Analysts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getByText('Alpha Analysts')).toBeInTheDocument();
    expect(screen.getAllByTestId('confetti-particle').length).toBeGreaterThan(0);
  });

  test('reduced motion shows the full podium immediately without particles', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
    render(<Podium rows={podiumRows} teams={teams} celebrationKey="reduced/user" />);
    expect(screen.getByText('Alpha Analysts')).toBeInTheDocument();
    expect(screen.getByText('Beta Ballers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip podium animation' })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
  });

  test('turning reduced motion off never hides an already revealed team', () => {
    let matches = false;
    let listener: ((event: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() { return matches; },
      media: query, onchange: null,
      addEventListener: (_type: string, next: (event: MediaQueryListEvent) => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(<Podium rows={podiumRows} teams={teams} celebrationKey="toggle/user" />);
    expect(screen.queryByText('Alpha Analysts')).not.toBeInTheDocument();

    act(() => {
      matches = true;
      listener?.({ matches: true } as MediaQueryListEvent);
    });
    expect(screen.getByText('Alpha Analysts')).toBeInTheDocument();

    act(() => {
      matches = false;
      listener?.({ matches: false } as MediaQueryListEvent);
    });
    expect(screen.getByText('Alpha Analysts')).toBeInTheDocument();
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
  });

  test('celebrates at most once for the same game and viewer', () => {
    const first = render(<Podium rows={podiumRows} teams={teams} celebrationKey="same/user" />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getAllByTestId('confetti-particle').length).toBeGreaterThan(0);
    first.unmount();

    render(<Podium rows={podiumRows} teams={teams} celebrationKey="same/user" />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
  });

  test('stops active confetti when reduced motion is enabled and never restarts it', () => {
    let matches = false;
    let listener: ((event: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() { return matches; },
      media: query, onchange: null,
      addEventListener: (_type: string, next: (event: MediaQueryListEvent) => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(<Podium rows={podiumRows} teams={teams} celebrationKey="motion/user" />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getAllByTestId('confetti-particle')).toHaveLength(28);

    act(() => {
      matches = true;
      listener?.({ matches: true } as MediaQueryListEvent);
    });
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);

    act(() => {
      matches = false;
      listener?.({ matches: false } as MediaQueryListEvent);
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
  });

  test('expires active confetti after its animation window', () => {
    render(<Podium rows={podiumRows} teams={teams} celebrationKey="expiry/user" />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getAllByTestId('confetti-particle')).toHaveLength(28);

    act(() => vi.advanceTimersByTime(2_499));
    expect(screen.getAllByTestId('confetti-particle')).toHaveLength(28);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
  });

  test('ends an active celebration when its game or viewer scope changes', () => {
    const { rerender } = render(
      <Podium rows={podiumRows} teams={teams} celebrationKey="game-a/user-a" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getAllByTestId('confetti-particle')).toHaveLength(28);

    rerender(<Podium rows={podiumRows} teams={teams} celebrationKey="game-b/user-b" />);
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(0);
    expect(screen.queryByText('Alpha Analysts')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip podium animation' }));
    expect(screen.getAllByTestId('confetti-particle')).toHaveLength(28);
  });
});

describe('SigningStory', () => {
  test('renders an intentional empty state for a franchise with no eligible signings', () => {
    render(<SigningStory teamName="Alpha Analysts" story={{
      teamId: 'alpha', bestSigning: null, worstSigning: null,
    }} playerNames={new Map()} />);
    expect(screen.getByText(/no eligible signings were recorded/i)).toBeInTheDocument();
    expect(screen.queryByText(/strategy|caused|because/i)).not.toBeInTheDocument();
  });
});
