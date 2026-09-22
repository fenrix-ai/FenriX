import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { OfferCard } from './OfferCard';
import type { CatalogPlayer } from '../../types/models';

const player = {
  pid: 17,
  player_id: '17',
  name: 'Mara Voss',
  position: 'G',
  age: '27',
  years_pro: '6',
  hype: '3.5',
  salary_per_round: '',
  auction_round: '1',
  personality: 'Professional',
  scout_grade: 'A-',
  social_media_followers: '1250000',
  games_played: '81',
  mins_per_game: '34.2',
  pts_per_game: '21.4',
  fg_attempts_per_game: '17.8',
  fg_pct: '.481',
  three_pt_pct: '.392',
  ft_pct: '.852',
  rebounds_per_game: '4.1',
  assists_per_game: '7.3',
  steals_per_game: '1.6',
  blocks_per_game: '.3',
  turnovers_per_game: '2.1',
  prev_pts_per_game: '19.2',
  prev_fg_pct: '.470',
  prev_mins_per_game: '32.4',
} satisfies CatalogPlayer;

describe('OfferCard', () => {
  test('shows raw player facts and the guaranteed commitment', () => {
    render(<OfferCard player={player} rate="8.0" years={3} maxYears={5}
      disabled={false} dirty={false} onRateChange={() => {}} onYearsChange={() => {}} />);

    expect(screen.getByText('21.4')).toBeInTheDocument();
    expect(screen.getByText('.481')).toBeInTheDocument();
    expect(screen.getByText('1.6')).toBeInTheDocument();
    expect(screen.getByText('2.1')).toBeInTheDocument();
    expect(screen.getByText('$24.0M guaranteed')).toBeInTheDocument();
  });

  test('exposes accessible rate and duration controls', async () => {
    const user = userEvent.setup();
    const onRateChange = vi.fn();
    const onYearsChange = vi.fn();
    render(<OfferCard player={player} rate="" years={1} maxYears={3}
      disabled={false} dirty onRateChange={onRateChange} onYearsChange={onYearsChange} />);

    await user.type(screen.getByRole('spinbutton', { name: 'Salary per round for Mara Voss' }), '9.5');
    await user.click(screen.getByRole('radio', { name: '3 rounds' }));

    expect(onRateChange).toHaveBeenCalled();
    expect(onYearsChange).toHaveBeenCalledWith(3);
    expect(screen.getByText('Unsaved offer')).toBeInTheDocument();
  });

  test('keeps validation feedback attached to the salary control', () => {
    render(<OfferCard player={player} rate="1.5" years={1} maxYears={5}
      disabled={false} dirty error="Minimum tonight is $2.0M."
      onRateChange={() => {}} onYearsChange={() => {}} />);

    const input = screen.getByRole('spinbutton', { name: 'Salary per round for Mara Voss' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Minimum tonight is $2.0M.');
  });
});
