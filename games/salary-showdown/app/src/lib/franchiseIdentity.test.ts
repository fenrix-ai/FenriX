import { resolveIdentity, teamMonogram } from './franchiseIdentity';

test('resolveIdentity returns the saved cosmetic metadata unchanged', () => {
  const identity = { accent: 'violet', jersey: 'chevron' } as const;

  expect(resolveIdentity('team-alpha', identity)).toEqual(identity);
});

test('resolveIdentity gives legacy teams a deterministic enum-safe fallback', () => {
  const first = resolveIdentity('legacy-team');

  expect(first).toEqual(resolveIdentity('legacy-team'));
  expect(['gold', 'teal', 'coral', 'violet', 'sky', 'mint']).toContain(first.accent);
  expect(['classic', 'stripe', 'chevron']).toContain(first.jersey);
  expect(resolveIdentity('different-team')).not.toEqual(first);
});

test('teamMonogram uses two word initials and ignores extra whitespace', () => {
  expect(teamMonogram('  Los   Angeles  ')).toBe('LA');
});

test('teamMonogram uses the first two letters for a single-word name', () => {
  expect(teamMonogram('Storm')).toBe('ST');
  expect(teamMonogram('Q')).toBe('Q');
});

test('teamMonogram falls back to SS for a blank name', () => {
  expect(teamMonogram('   ')).toBe('SS');
});
