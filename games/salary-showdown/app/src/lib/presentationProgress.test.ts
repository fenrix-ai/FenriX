import { expect, test } from 'vitest';
import { presentationProgress } from './presentationProgress';

test('starts hidden, catches up after backgrounding, and respects reduced motion', () => {
  expect(presentationProgress(0, 10, false)).toBe(0);
  expect(presentationProgress(4200, 10, false)).toBe(1);
  expect(presentationProgress(60000, 10, false)).toBe(10);
  expect(presentationProgress(0, 10, true)).toBe(10);
});

test('clamps empty, negative, and overlong progress to the available games', () => {
  expect(presentationProgress(10000, 0, false)).toBe(0);
  expect(presentationProgress(-1000, 3, false)).toBe(0);
  expect(presentationProgress(Number.POSITIVE_INFINITY, 3, false)).toBe(3);
});
