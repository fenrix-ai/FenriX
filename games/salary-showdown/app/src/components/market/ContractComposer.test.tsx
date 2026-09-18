import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import type { TeamDoc } from '../../types/models';
import { ContractComposer } from './ContractComposer';

const team = { roster: [], deadMoney: [{ pid: 8, rate: 98, startRound: 2, endRound: 2 }] } as unknown as TeamDoc;
const props = { team, round: 1, pid: 12, ask: 5, years: 2,
  onYears: () => {}, onSign: () => {}, canSign: true, inMarket: true, pending: false };

test('blocks a future-round cap violation and shows its payroll and guarantee', () => {
  render(<ContractComposer {...props} />);
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
  expect(screen.getByText('Exceeds cap in round 2: $102.6M.')).toBeInTheDocument();
  expect(screen.getByText('$9.2M guaranteed')).toBeInTheDocument();
  expect(screen.getByLabelText(/Round 2: cash \$0.0M, dead money \$98.0M, candidate \$4.6M, total \$102.6M, over cap/)).toBeInTheDocument();
});

test('late-round offers stop at round five and role/pending/availability gates apply', () => {
  const { rerender } = render(<ContractComposer {...props} round={5} years={5} />);
  expect(screen.getAllByRole('button', { name: /rd —/ })).toHaveLength(1);
  expect(screen.getByText('$5.0M guaranteed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeEnabled();
  rerender(<ContractComposer {...props} round={5} canSign={false} />);
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
  rerender(<ContractComposer {...props} round={5} pending />);
  expect(screen.getByRole('button', { name: 'Signing…' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Signing…' })).not.toBeDisabled();
  rerender(<ContractComposer {...props} round={5} inMarket={false} />);
  expect(screen.getByRole('button', { name: 'Confirm signing' })).toBeDisabled();
});
