import { render, screen } from '@testing-library/react';
import { HypeStars } from './HypeStars';
import { LedTimer } from './LedTimer';
import { PayrollBar } from './PayrollBar';
import { StandingsTable } from './StandingsTable';
import type { StandingsRow, TeamDoc } from '../../types/models';

test('LedTimer renders the steady null state (timer off)', () => {
  render(<LedTimer endsAt={null} />);
  expect(screen.getByTestId('led')).toHaveTextContent('--:--');
});
test('HypeStars renders glyphs, never digits', () => {
  render(<HypeStars hype={3.5} />);
  const el = screen.getByLabelText('hype 3.5 of 5');
  expect(el).toHaveTextContent('★★★½');
  expect(el.textContent).not.toMatch(/\d/);
});
test('PayrollBar computes label and segment widths from the roster', () => {
  const team = {
    name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
    roster: [{ pid: 1, rate: 78.2, startRound: 1, years: 5, viaAuction: false, hardship: false }],
    deadMoney: [{ pid: 2, rate: 9.1, startRound: 1, endRound: 5 }],
    spendLog: [], lineup: null, lineupLockedRound: 0, hardshipUsed: [],
    doneRound: 0, donePhase: '', // createGame init (backend game.js:46)
  } satisfies TeamDoc;
  const { container } = render(<PayrollBar team={team} round={3} />);
  expect(screen.getByTestId('payroll-bar')).toHaveTextContent(
    'Payroll $78.2M + $9.1M dead / $100.0M cap · $12.7M room');
  expect((container.querySelector('.cash') as HTMLElement).style.width)
    .toBe('78.2%');  // computed, not the mock’s hard-coded 70%
  expect((container.querySelector('.dead') as HTMLElement).style.width).toBe('9.1%');
});
test('LedTimer paused state renders the frozen clock plus plain "paused" text', () => {
  render(<LedTimer endsAt={null} pausedMs={95000} />);
  expect(screen.getByTestId('led')).toHaveTextContent('01:35');
  expect(screen.getByText('paused')).toBeInTheDocument();
});
test('LedTimer off state (both null) never shows "paused"', () => {
  render(<LedTimer endsAt={null} pausedMs={null} />);
  expect(screen.getByTestId('led')).toHaveTextContent('--:--');
  expect(screen.queryByText('paused')).toBeNull();
});

const srow = (teamId: string, name: string, rank: number): StandingsRow => ({
  teamId, name, rank, wins: 2, losses: 1, pointDiff: 0, pointsFor: 0,
  tiebreakCoin: 0, previousRank: null,
});
// F8's in-game sibling: a zero-spend team's W / $M is UNDEFINED — rendering
// 0.000 would fabricate a worst-possible-efficiency claim the finale (which
// emits null and shows "—") explicitly refuses to make. Same team, same rule.
test('StandingsTable W / $M renders "—" for a null ratio (zero spend), never 0.000', () => {
  render(<StandingsTable rows={[srow('a', 'Alpha', 1), srow('b', 'Bravo', 2)]}
    highlightTeamId={null} wpd={new Map([['a', 0.055], ['b', null]])} />);
  const wpdCell = (name: string) => [...screen.getByText(name).closest('tr')!
    .querySelectorAll('td')].at(-1)!.textContent;
  expect(wpdCell('Alpha')).toBe('0.055');
  expect(wpdCell('Bravo')).toBe('—');
});
