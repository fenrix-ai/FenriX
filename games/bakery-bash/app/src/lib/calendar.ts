/**
 * Calendar helpers for the Bakery Bash date system.
 *
 * The game starts on January 1st (no year tracked). Each round corresponds
 * to one calendar month: Round 1 = January, Round 2 = February, etc.
 */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Days in each month (non-leap year). Index 0 = January. */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Returns the month name for a given round (1-indexed). Returns "" for invalid rounds. */
export function monthForRound(round: number | null | undefined): string {
  if (typeof round !== "number" || round < 1 || round > 12) return "";
  return MONTH_NAMES[round - 1];
}

/** Returns the number of days in the month corresponding to the given round. */
export function daysInRound(round: number | null | undefined): number {
  if (typeof round !== "number" || round < 1 || round > 12) return 0;
  return DAYS_IN_MONTH[round - 1];
}

/**
 * Format a (round, day) pair as a short calendar label, e.g. "Jan 15" or
 * "February 3". Day is 1-indexed within the month.
 */
export function formatGameDate(
  round: number | null | undefined,
  day: number | null | undefined,
  opts: { short?: boolean } = {},
): string {
  const month = monthForRound(round);
  if (!month || typeof day !== "number" || day < 1) return "";
  const label = opts.short ? month.slice(0, 3) : month;
  return `${label} ${day}`;
}
