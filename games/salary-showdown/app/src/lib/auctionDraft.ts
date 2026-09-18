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

export function dirtyAfterAcknowledgement(
  current: Bids,
  submitted: Bids,
  dirty: ReadonlySet<string>,
): Set<string> {
  const remaining = new Set<string>();
  for (const pid of dirty) {
    const currentBid = current[pid];
    const submittedBid = submitted[pid];
    const matches = currentBid === undefined && submittedBid === undefined
      || currentBid !== undefined && submittedBid !== undefined
        && currentBid.rate === submittedBid.rate && currentBid.years === submittedBid.years;
    if (!matches) remaining.add(pid);
  }
  return remaining;
}
