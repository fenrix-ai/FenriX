import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RevealDoc, StandingsRow, TeamDoc } from '../../types/models';
import { Podium } from './Podium';
import { RevealExplorer } from './RevealExplorer';
import { SigningStory } from './SigningStory';

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

describe('RevealExplorer', () => {
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
