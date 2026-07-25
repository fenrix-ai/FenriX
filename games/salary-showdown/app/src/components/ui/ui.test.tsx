import { render, screen } from '@testing-library/react';
import { HypeStars } from './HypeStars';
import { LedTimer } from './LedTimer';
import { PayrollBar } from './PayrollBar';
import type { TeamDoc } from '../../types/models';

test('LedTimer renders the steady null state (Plan 2 has no professor timers)', () => {
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
