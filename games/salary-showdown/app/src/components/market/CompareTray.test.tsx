import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { CatalogPlayer } from '../../types/models';
import { CompareTray } from './CompareTray';

const players = [12, 13, 14, 15].map((pid) => ({ pid, name: `Player ${pid}`, position: 'G',
  hype: '3.5', pts_per_game: '14', salary_per_round: '5', prev_pts_per_game: '11.2',
  prev_fg_pct: '.401', prev_mins_per_game: '23.7', turnovers_per_game: '2.1',
})) as CatalogPlayer[];

test('removes the selected pid without creating a recommendation', async () => {
  const onRemove = vi.fn();
  render(<CompareTray players={players.slice(0, 3)} onRemove={onRemove} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove Player 13 from comparison' }));
  expect(onRemove).toHaveBeenCalledWith(13);
  expect(screen.getByText('Previous PPG')).toBeInTheDocument();
  expect(screen.getByText('Previous FG%')).toBeInTheDocument();
  expect(screen.getByText('Previous MPG')).toBeInTheDocument();
  expect(screen.getAllByText('11.2')).toHaveLength(3);
  expect(screen.getAllByLabelText('hype 3.5 of 5')).toHaveLength(3);
  expect(screen.queryByText(/winner|recommended|value score/i)).toBeNull();
});

test('renders at most three columns and distinguishes missing values from zero', () => {
  render(<CompareTray players={[{ ...players[0], blocks_per_game: '0' }, ...players.slice(1)]}
    onRemove={() => {}} />);
  expect(screen.queryByText('Player 15')).toBeNull();
  const row = screen.getByText('BLK').closest('tr')!;
  expect(within(row).getByText('0')).toBeInTheDocument();
  expect(within(row).getAllByText('—')).toHaveLength(2);
});
