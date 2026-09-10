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

/**
 * ISO 8601 week of a date, by local time: the week number (1–53) and the
 * week-numbering year it belongs to.
 *
 * This is what makes "the same week" mean the same thing in different years:
 * the calendar date of a Monday moves from year to year, the week number does
 * not. ISO rules: weeks start on Monday and week 1 is the one holding the
 * first Thursday of the year — so the first days of January can still belong
 * to the last week of the previous year, which is why the year comes back too.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  // Shift to the Thursday of this week; the year of that Thursday is the ISO
  // week-numbering year, which is what makes the turn of the year work.
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (thursday.getDay() + 6) % 7; // Monday = 0
  thursday.setDate(thursday.getDate() - dayOfWeek + 3);

  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayOfWeek + 3);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  // Both dates are local midnights; rounding absorbs the DST hour.
  return {
    year: thursday.getFullYear(),
    week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / msPerWeek),
  };
}
