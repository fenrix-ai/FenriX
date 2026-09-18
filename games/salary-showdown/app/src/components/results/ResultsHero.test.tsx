import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { BoxRow } from '../../lib/boxfeed';
import type {
  AuctionDoc,
  CatalogPlayer,
  PrivateAuctionDoc,
  StandingsRow,
  TeamDoc,
} from '../../types/models';
import { StandingsTable } from '../ui/StandingsTable';
import { AuctionResolution } from './AuctionResolution';
import { BoxscoreExplorer } from './BoxscoreExplorer';
import { ResultsHero } from './ResultsHero';

describe('ResultsHero', () => {
  test('rank movement uses the actual prior rank', () => {
    render(<ResultsHero wins={5} losses={2} rank={2} previousRank={5} />);

    expect(screen.getByText('5–2')).toBeInTheDocument();
    expect(screen.getByText('League rank 2')).toBeInTheDocument();
    expect(screen.getByText('Up 3 places')).toBeInTheDocument();
  });

  test('does not fabricate movement without a prior rank', () => {
    render(<ResultsHero wins={3} losses={1} rank={1} previousRank={null} />);

    expect(screen.getByText('First round standing')).toBeInTheDocument();
    expect(screen.queryByText(/Up|Down|Held/)).not.toBeInTheDocument();
  });

  test('reports falls and held positions in plain language', () => {
    const { rerender } = render(
      <ResultsHero wins={7} losses={4} rank={6} previousRank={3} />,
    );
    expect(screen.getByText('Down 3 places')).toBeInTheDocument();

    rerender(<ResultsHero wins={7} losses={4} rank={6} previousRank={6} />);
    expect(screen.getByText('Held position')).toBeInTheDocument();
  });
});

const boxRow = (overrides: Partial<BoxRow> = {}): BoxRow => ({
  round: 1,
  game_id: 'R1-G001',
  team: 'Alpha',
  opponent: 'Beta',
  team_score: 101,
  opp_score: 99,
  win: 1,
  player_id: 101,
  player_name: 'Avery Stone',
  position: 'G',
  tier: 'starter',
  mins: 32,
  pts: 18,
  fgm: 7,
  fga: 14,
  three_pm: 2,
  three_pa: 5,
  rebounds: 4,
  assists: 6,
  steals: 1,
  blocks: 0,
  turnovers: 2,
  playstyle: 'Balanced',
  ...overrides,
});

describe('BoxscoreExplorer', () => {
  test('keeps all 23 raw columns accessible and filters by game or player', async () => {
    const rows = [
      boxRow(),
      boxRow({ player_id: 102, player_name: 'Bryn Vale' }),
      boxRow({ game_id: 'R1-G002', opponent: 'Gamma', player_id: 101 }),
    ];
    const user = userEvent.setup();
    render(<BoxscoreExplorer rows={rows} round={1} csv="header\nrow\n" />);

    expect([...screen.getByRole('table').querySelectorAll('thead th')]
      .map((th) => th.textContent)).toHaveLength(23);
    expect(screen.getByTestId('box-scroll')).toHaveAttribute('tabindex', '0');

    await user.selectOptions(screen.getByLabelText('Filter by game'), 'R1-G002');
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Players' }));
    await user.selectOptions(screen.getByLabelText('Filter by player'), '101');
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(2);
  });

  test('downloads the exact server CSV bytes', async () => {
    const csv = 'round,game_id,team\n1,R1-G001,"Alpha, Inc."\n';
    let downloaded: Blob | null = null;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new TypeError('Expected CSV download to use a Blob');
      downloaded = blob;
      return 'blob:w07-unit';
    });
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<BoxscoreExplorer rows={[boxRow()]} round={1} csv={csv} />);

    await user.click(screen.getByRole('button', { name: /Download boxscores_round_1\.csv/ }));
    expect(await downloaded!.text()).toBe(csv);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:w07-unit');

    anchorClick.mockRestore();
    revokeObjectURL.mockRestore();
    createObjectURL.mockRestore();
  });
});

describe('AuctionResolution', () => {
  test('keeps public winners visible and scopes skip feedback to the supplied private document', () => {
    const auction: AuctionDoc = {
      stars: [201, 202],
      results: [
        { pid: 201, teamId: 'beta', rate: 3, years: 1, guaranteed: 3 },
        { pid: 202, teamId: null, rate: null, years: null, guaranteed: null },
      ],
    };
    const privateAuction: PrivateAuctionDoc = {
      skippedRound: 1,
      skipped: [{ pid: 202, reason: 'roster' }],
    };
    const catalog = new Map([
      [201, { pid: 201, name: 'Jordan North', position: 'G' } as CatalogPlayer],
      [202, { pid: 202, name: 'Morgan West', position: 'W' } as CatalogPlayer],
    ]);
    const teams = new Map([
      ['beta', { name: 'Beta' } as TeamDoc],
    ]);

    const { rerender } = render(
      <AuctionResolution auction={auction} privateAuction={privateAuction} round={1}
        catalog={catalog} teams={teams} />,
    );
    expect(screen.getByRole('row', { name: /Jordan North/ })).toHaveTextContent('Beta');
    expect(screen.getByRole('row', { name: /Jordan North/ })).toHaveTextContent('$3.0M/rd');
    expect(screen.getByRole('row', { name: /Morgan West/ })).toHaveTextContent('Unsold');
    expect(screen.getByTestId('auction-skip-note')).toHaveTextContent('roster full');

    rerender(
      <AuctionResolution auction={auction} privateAuction={null} round={1}
        catalog={catalog} teams={teams} />,
    );
    expect(screen.queryByTestId('auction-skip-note')).not.toBeInTheDocument();
  });
});

describe('StandingsTable', () => {
  test('shows actual rank movement and retains stable server order', () => {
    const rows: StandingsRow[] = [
      { teamId: 'alpha', name: 'Alpha', wins: 6, losses: 2, pointDiff: 18,
        pointsFor: 820, tiebreakCoin: 0.2, rank: 1, previousRank: 4 },
      { teamId: 'beta', name: 'Beta', wins: 5, losses: 3, pointDiff: 8,
        pointsFor: 790, tiebreakCoin: 0.4, rank: 2, previousRank: null },
    ];
    render(<StandingsTable rows={rows} highlightTeamId="alpha"
      wpd={new Map([['alpha', 0.125], ['beta', null]])} round={2} showMovement />);

    const table = screen.getByTestId('standings');
    expect(table).toHaveAttribute('data-round', '2');
    expect([...table.querySelectorAll('tbody td.name')].map((cell) => cell.textContent))
      .toEqual(['Alpha', 'Beta']);
    expect(screen.getByRole('row', { name: /Alpha/ })).toHaveTextContent('Up 3');
    expect(screen.getByRole('row', { name: /Beta/ })).toHaveTextContent('—');
    expect(screen.getByRole('row', { name: /Beta/ })).toHaveTextContent('—');
  });
});
