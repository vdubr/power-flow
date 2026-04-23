/**
 * Date helper utilities.
 *
 * IMPORTANT: Do not use `Date.prototype.toISOString()` for generating date keys
 * (like "2022-01-01") because it converts to UTC. For a user in CET/CEST, a
 * local time like 2022-01-01 00:15 can become 2021-12-31 23:15 in UTC, which
 * puts the record into the wrong day (and even wrong year).
 *
 * Always use local-time helpers below when grouping/bucketing records by day.
 */

/**
 * Returns a "YYYY-MM-DD" key based on the date's LOCAL time components.
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns a "YYYY-MM" key based on the date's LOCAL time components.
 */
export function formatLocalMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Parses a "YYYY-MM-DD" key back into a Date at local midnight.
 * Safe inverse of `formatLocalDateKey`.
 */
export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
