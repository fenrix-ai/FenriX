/**
 * In-game calendar helpers.
 *
 * The game starts on January 1st and each round corresponds to one
 * calendar month (Round 1 = January, Round 2 = February, ...). These
 * helpers let UI surfaces like the round-briefing screen, event
 * reports (burglary / inspection dates), and the results CSV talk
 * about rounds in terms of real month names and day-of-month numbers.
 *
 * The "year" never matters — we only expose month names and day counts.
 */

const MONTH_NAMES = [
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

/** Number of days in each month for a typical (non-leap) year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Return the month name corresponding to `round` (1-indexed). Returns
 * null when the round is out of range (e.g. pre-game or past month 12).
 */
export function monthNameForRound(round: number | null | undefined): string | null {
  if (typeof round !== "number" || !Number.isFinite(round)) return null;
  const idx = Math.floor(round) - 1;
  if (idx < 0 || idx >= MONTH_NAMES.length) return null;
  return MONTH_NAMES[idx];
}

/** Number of days in the month for `round`. Falls back to 30 when out of range. */
export function daysInRound(round: number | null | undefined): number {
  if (typeof round !== "number" || !Number.isFinite(round)) return 30;
  const idx = Math.floor(round) - 1;
  if (idx < 0 || idx >= MONTH_DAYS.length) return 30;
  return MONTH_DAYS[idx];
}

/**
 * Format a single day-of-month (1-indexed) as a short month-day label.
 * Example: `formatDayInRound(2, 15)` → "Feb 15".
 */
export function formatDayInRound(
  round: number | null | undefined,
  day: number,
): string {
  const month = monthNameForRound(round);
  const dayNum = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
  if (!month) return `Day ${dayNum}`;
  return `${month.slice(0, 3)} ${dayNum}`;
}

/**
 * Format an array of day-of-month numbers into a compact "Feb 4, 17, 28"
 * style string. Empty input returns an empty string.
 */
export function formatDaysInRound(
  round: number | null | undefined,
  days: number[] | null | undefined,
): string {
  if (!Array.isArray(days) || days.length === 0) return "";
  const monthShort = monthNameForRound(round)?.slice(0, 3) ?? null;
  const nums = days
    .map((d) => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : null))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return "";
  if (!monthShort) return nums.map((n) => `Day ${n}`).join(", ");
  return `${monthShort} ${nums.join(", ")}`;
}
