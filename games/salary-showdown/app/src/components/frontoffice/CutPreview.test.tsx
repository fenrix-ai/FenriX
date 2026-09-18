import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { CatalogPlayer, Contract, TeamDoc } from '../../types/models';
import { CutPreview } from './CutPreview';

const deal: Contract = {
  pid: 42,
  rate: 8,
  startRound: 1,
  years: 4,
  viaAuction: false,
  hardship: false,
};

const team = {
  name: 'Cap City',
  roster: [deal],
  deadMoney: [{ pid: 2, rate: 3, startRound: 2, endRound: 5 }],
  spendLog: [deal],
} as unknown as TeamDoc;

const player = {
  pid: 42,
  name: 'Jordan Ledger',
  position: 'G',
} as CatalogPlayer;

test('shows the roster effect and every remaining annual cut obligation', () => {
  render(
    <CutPreview
      busy={false}
      canAct
      contract={deal}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={team}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Cut Jordan Ledger?' })).toBeInTheDocument();
  expect(screen.getByText('One roster spot opens. No committed salary is removed.'))
    .toBeInTheDocument();
  const obligations = screen.getByRole('list', { name: 'Remaining obligations' });
  expect(within(obligations).getByText('Round 3')).toBeInTheDocument();
  expect(within(obligations).getByText('Round 4')).toBeInTheDocument();
  expect(within(obligations).getAllByText('$8.0M dead money')).toHaveLength(2);
  expect(within(obligations).queryByText('Round 5')).toBeNull();
  expect(screen.getByLabelText(/Round 3: cash \$0.0M, dead money \$11.0M/))
    .toBeInTheDocument();
});

test('exposes confirm and cancel actions without hiding the preview', async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <CutPreview
      busy={false}
      canAct
      contract={deal}
      onCancel={onCancel}
      onConfirm={onConfirm}
      player={player}
      round={3}
      team={team}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Confirm cut' }));
  await user.click(screen.getByRole('button', { name: 'Keep player' }));

  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(screen.getByRole('heading', { name: 'Cut Jordan Ledger?' })).toBeInTheDocument();
});

test('stays mounted when the live team snapshot applies the cut before the action resolves', () => {
  const afterCut = {
    ...team,
    roster: [],
    deadMoney: [
      ...team.deadMoney,
      { pid: 42, rate: 8, startRound: 3, endRound: 4 },
    ],
  };
  const { rerender } = render(
    <CutPreview
      busy
      canAct
      contract={deal}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={team}
    />,
  );

  rerender(
    <CutPreview
      busy
      canAct
      contract={deal}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={afterCut}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Cut Jordan Ledger?' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Round 3: cash \$0.0M, dead money \$11.0M/))
    .toBeInTheDocument();
});

test('moves focus inside, traps both tab directions, and closes with Escape', async () => {
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <CutPreview
      busy={false}
      canAct
      contract={deal}
      onCancel={onCancel}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={team}
    />,
  );

  const dialog = screen.getByRole('dialog');
  const confirm = screen.getByRole('button', { name: 'Confirm cut' });
  const keep = screen.getByRole('button', { name: 'Keep player' });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);

  keep.focus();
  await user.tab();
  expect(confirm).toHaveFocus();

  confirm.focus();
  await user.tab({ shift: true });
  expect(keep).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(onCancel).toHaveBeenCalledOnce();
});

test('keeps focus on the dialog while a cut is busy and exposes rejection feedback', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <CutPreview
      busy={false}
      canAct
      contract={deal}
      error={null}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={team}
    />,
  );

  rerender(
    <CutPreview
      busy
      canAct
      contract={deal}
      error={new Error('CUT_REJECTED')}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      player={player}
      round={3}
      team={team}
    />,
  );

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveFocus();
  await user.tab();
  expect(dialog).toHaveFocus();
  expect(within(dialog).getByRole('alert')).toBeInTheDocument();
});
