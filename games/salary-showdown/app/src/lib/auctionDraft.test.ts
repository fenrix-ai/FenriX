import { describe, expect, test } from 'vitest';
import { mergeAuctionSnapshot } from './auctionDraft';

describe('mergeAuctionSnapshot', () => {
  test('snapshot preserves dirty edits and dirty removal', () => {
    expect(mergeAuctionSnapshot(
      { a: { rate: 8, years: 2 } },
      { a: { rate: 3, years: 1 }, b: { rate: 2, years: 1 } },
      new Set(['a', 'b']),
    )).toEqual({ a: { rate: 8, years: 2 } });
  });

  test('snapshot updates clean offers while preserving a different dirty offer', () => {
    expect(mergeAuctionSnapshot(
      { a: { rate: 8, years: 2 }, b: { rate: 2, years: 1 } },
      { a: { rate: 9, years: 3 }, b: { rate: 4, years: 2 }, c: { rate: 6, years: 1 } },
      new Set(['b']),
    )).toEqual({
      a: { rate: 9, years: 3 },
      b: { rate: 2, years: 1 },
      c: { rate: 6, years: 1 },
    });
  });

  test('does not mutate the local draft or saved snapshot', () => {
    const draft = { a: { rate: 8, years: 2 } };
    const saved = { a: { rate: 3, years: 1 }, b: { rate: 2, years: 1 } };

    mergeAuctionSnapshot(draft, saved, new Set(['a']));

    expect(draft).toEqual({ a: { rate: 8, years: 2 } });
    expect(saved).toEqual({ a: { rate: 3, years: 1 }, b: { rate: 2, years: 1 } });
  });
});
