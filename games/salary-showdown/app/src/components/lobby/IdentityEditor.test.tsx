import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { IdentityEditor } from './IdentityEditor';

test('preview selection does not save until explicitly submitted', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<IdentityEditor identity={{ accent: 'gold', jersey: 'classic' }}
    onSave={onSave} disabled={false} />);

  await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
  expect(onSave).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Save identity' }));
  expect(onSave).toHaveBeenCalledWith({ accent: 'teal', jersey: 'classic' });
  expect(await screen.findByText('Identity saved.')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Teal' })).toBeChecked();
});

test('a rejected save keeps the selected preview available for retry', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('identity is closed'));
  render(<IdentityEditor identity={{ accent: 'gold', jersey: 'classic' }}
    onSave={onSave} disabled={false} />);

  await userEvent.click(screen.getByRole('radio', { name: 'Coral' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Chevron' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save identity' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through');
  expect(screen.getByRole('radio', { name: 'Coral' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Chevron' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save identity' })).toBeEnabled();
});

test('a clean editor follows a teammate identity snapshot', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(
    <IdentityEditor identity={{ accent: 'gold', jersey: 'classic' }}
      onSave={onSave} disabled={false} />,
  );

  rerender(<IdentityEditor identity={{ accent: 'mint', jersey: 'stripe' }}
    onSave={onSave} disabled={false} />);

  expect(screen.getByRole('radio', { name: 'Mint' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Stripe' })).toBeChecked();
});

test('a phase change disables a racing save without erasing its rejected preview', async () => {
  let rejectSave!: (error: Error) => void;
  const onSave = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
  const { rerender } = render(
    <IdentityEditor identity={{ accent: 'gold', jersey: 'classic' }}
      onSave={onSave} disabled={false} />,
  );

  await userEvent.click(screen.getByRole('radio', { name: 'Violet' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save identity' }));
  expect(screen.getByRole('button', { name: 'Saving identity…' })).toBeDisabled();

  rerender(<IdentityEditor identity={{ accent: 'gold', jersey: 'classic' }}
    onSave={onSave} disabled />);
  rejectSave(new Error('identity is closed'));

  expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through');
  expect(screen.getByRole('radio', { name: 'Violet' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save identity' })).toBeDisabled();
});
