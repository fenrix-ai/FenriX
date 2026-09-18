export type Bids = Record<string, { rate: number; years: number }>;

export function mergeAuctionSnapshot(
  draft: Bids,
  saved: Bids,
  dirty: ReadonlySet<string>,
): Bids {
  const result = { ...saved };
  for (const pid of dirty) {
    if (Object.prototype.hasOwnProperty.call(draft, pid)) result[pid] = draft[pid];
    else delete result[pid];
  }
  return result;
}
