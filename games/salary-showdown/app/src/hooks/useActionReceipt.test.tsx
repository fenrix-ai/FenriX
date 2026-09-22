import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useActionReceipt } from './useActionReceipt';
import { useReducedMotion } from './useReducedMotion';

test('successful operations return their value and emit a receipt', async () => {
  const { result } = renderHook(() => useActionReceipt('game-1/r1/market/team-a/user-a'), {
    wrapper: StrictMode,
  });

  let value: number | undefined;
  await act(async () => {
    value = await result.current.run('Player signed', async () => 42);
  });

  expect(value).toBe(42);
  expect(result.current.receipt).toEqual({ id: 1, label: 'Player signed' });
});

test('rejected operations propagate the error and never emit a receipt', async () => {
  const { result } = renderHook(() => useActionReceipt('scope-a'));
  const failure = new Error('server rejected the action');

  await act(async () => {
    await expect(result.current.run('Saved', async () => { throw failure; }))
      .rejects.toBe(failure);
  });

  expect(result.current.receipt).toBeNull();
});

test('an old-scope asynchronous success returns without emitting in the new scope', async () => {
  let finish!: (value: string) => void;
  const operation = new Promise<string>((resolve) => { finish = resolve; });
  const { result, rerender } = renderHook(
    ({ scope }) => useActionReceipt(scope),
    { initialProps: { scope: 'game-1/r1/market/team-a/user-a' } },
  );

  let pending!: Promise<string>;
  act(() => {
    pending = result.current.run('Player signed', () => operation);
  });
  rerender({ scope: 'game-1/r1/auction/team-a/user-a' });

  let value: string | undefined;
  await act(async () => {
    finish('accepted');
    value = await pending;
  });

  expect(value).toBe('accepted');
  expect(result.current.receipt).toBeNull();
});

test('changing scope clears an existing receipt', async () => {
  const { result, rerender } = renderHook(
    ({ scope }) => useActionReceipt(scope),
    { initialProps: { scope: 'round-1' } },
  );

  await act(async () => {
    await result.current.run('Lineup saved', async () => undefined);
  });
  expect(result.current.receipt).not.toBeNull();

  rerender({ scope: 'round-2' });
  expect(result.current.receipt).toBeNull();
});

test('useReducedMotion follows preference changes and removes its listener', () => {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const addEventListener = vi.fn((event: string, next: EventListenerOrEventListenerObject) => {
    if (event === 'change') listener = next as (event: MediaQueryListEvent) => void;
  });
  const removeEventListener = vi.fn();
  const query = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => query),
  });

  const { result, unmount } = renderHook(() => useReducedMotion());
  expect(result.current).toBe(false);

  act(() => listener?.({ matches: true } as MediaQueryListEvent));
  expect(result.current).toBe(true);

  unmount();
  expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
});

test('useReducedMotion has a false fallback when matchMedia is unavailable', () => {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });

  const { result } = renderHook(() => useReducedMotion());

  expect(result.current).toBe(false);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
});
