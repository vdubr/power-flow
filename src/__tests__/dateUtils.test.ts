import { describe, it, expect } from 'vitest';
import { formatLocalDateKey, formatLocalMonthKey, isoWeek, parseLocalDateKey } from '../utils/dateUtils';

describe('dateUtils', () => {
  describe('formatLocalDateKey', () => {
    it('formats a regular date correctly', () => {
      const d = new Date(2022, 5, 15, 14, 30); // 15.6.2022 14:30 local
      expect(formatLocalDateKey(d)).toBe('2022-06-15');
    });

    it('pads single-digit month and day', () => {
      const d = new Date(2022, 0, 5, 0, 0);
      expect(formatLocalDateKey(d)).toBe('2022-01-05');
    });

    it('uses LOCAL time, not UTC (early-morning edge case)', () => {
      // New Year's Day 00:15 local time - in UTC (for CET, UTC+1) this would be
      // 31.12 previous year 23:15. Must return 2023-01-01, not 2022-12-31.
      const d = new Date(2023, 0, 1, 0, 15);
      expect(formatLocalDateKey(d)).toBe('2023-01-01');
    });

    it('uses LOCAL time for late-evening edge case', () => {
      // 31.12.2022 23:45 local - in UTC this might be 1.1.2023 (if UTC-something).
      // For positive offset (CET) it's still 31.12.2022 22:45 UTC, so local/UTC
      // would happen to agree. The opposite test (00:15) is the critical one above.
      const d = new Date(2022, 11, 31, 23, 45);
      expect(formatLocalDateKey(d)).toBe('2022-12-31');
    });

    it('formats the DST spring-forward day midnight correctly (26.3.2023 00:15 CET→CEST)', () => {
      // 26.3.2023 is the CET→CEST transition day. 00:15 is before the 02:00 clock jump,
      // so it is an unambiguous CET time. The local date is still 2023-03-26.
      const d = new Date(2023, 2, 26, 0, 15); // month index 2 = March
      expect(formatLocalDateKey(d)).toBe('2023-03-26');
    });
  });

  describe('formatLocalMonthKey', () => {
    it('formats month correctly with padding', () => {
      expect(formatLocalMonthKey(new Date(2022, 2, 15))).toBe('2022-03');
      expect(formatLocalMonthKey(new Date(2022, 11, 1))).toBe('2022-12');
    });

    it('returns December key for 31.12.2022 23:45 (New Year Eve last interval)', () => {
      const d = new Date(2022, 11, 31, 23, 45);
      expect(formatLocalMonthKey(d)).toBe('2022-12');
    });

    it('returns January key for 1.1.2023 00:15 (New Year first interval)', () => {
      const d = new Date(2023, 0, 1, 0, 15);
      expect(formatLocalMonthKey(d)).toBe('2023-01');
    });
  });

  describe('parseLocalDateKey', () => {
    it('parses back to local midnight', () => {
      const d = parseLocalDateKey('2022-06-15');
      expect(d.getFullYear()).toBe(2022);
      expect(d.getMonth()).toBe(5);
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });

    it('is the inverse of formatLocalDateKey', () => {
      const original = new Date(2023, 0, 1, 0, 15);
      const key = formatLocalDateKey(original);
      const parsed = parseLocalDateKey(key);
      expect(parsed.getFullYear()).toBe(original.getFullYear());
      expect(parsed.getMonth()).toBe(original.getMonth());
      expect(parsed.getDate()).toBe(original.getDate());
    });

    it('parses leap day 29.2.2024 correctly', () => {
      const d = parseLocalDateKey('2024-02-29');
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(1); // February (0-indexed)
      expect(d.getDate()).toBe(29);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });

    it('round-trip: parseLocalDateKey(formatLocalDateKey(d)) preserves the local day', () => {
      // Use a variety of representative dates to confirm the round-trip invariant.
      const dates = [
        new Date(2023, 2, 26, 0, 15),  // DST transition day, before the jump
        new Date(2023, 9, 29, 2, 30),  // DST fall-back day
        new Date(2024, 1, 29, 12, 0),  // leap day
        new Date(2022, 11, 31, 23, 45), // New Year's Eve last interval
        new Date(2023, 0, 1, 0, 15),   // New Year's Day first interval
      ];

      for (const original of dates) {
        const key = formatLocalDateKey(original);
        const roundTripped = parseLocalDateKey(key);
        expect(roundTripped.getFullYear()).toBe(original.getFullYear());
        expect(roundTripped.getMonth()).toBe(original.getMonth());
        expect(roundTripped.getDate()).toBe(original.getDate());
      }
    });
  });

  describe('isoWeek', () => {
    it('numbers weeks from the one holding the first Thursday', () => {
      // 4. 1. is always in week 1 by ISO rules.
      expect(isoWeek(new Date(2024, 0, 4))).toEqual({ year: 2024, week: 1 });
      expect(isoWeek(new Date(2024, 0, 8))).toEqual({ year: 2024, week: 2 });
      expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
    });

    /**
     * The reason the year comes back with the number: the same week can be fed
     * by two calendar years, and grouping it by the calendar year would split
     * one week into two rows of the cross-year comparison.
     */
    it('puts the first days of January into the previous year’s last week', () => {
      // 1. 1. 2023 was a Sunday, so it closes ISO week 52 of 2022.
      expect(isoWeek(new Date(2023, 0, 1))).toEqual({ year: 2022, week: 52 });
      // 2. 1. 2023 was the Monday that opens week 1.
      expect(isoWeek(new Date(2023, 0, 2))).toEqual({ year: 2023, week: 1 });
    });

    it('gives every day of one week the same number', () => {
      const monday = new Date(2022, 6, 4);
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        expect(isoWeek(day)).toEqual({ year: 2022, week: 27 });
      }
      const nextMonday = new Date(2022, 6, 11);
      expect(isoWeek(nextMonday).week).toBe(28);
    });

    it('survives the daylight-saving weeks, where a week is 167 or 169 hours', () => {
      // Spring forward 26. 3. 2023, fall back 29. 10. 2023.
      expect(isoWeek(new Date(2023, 2, 26, 12))).toEqual({ year: 2023, week: 12 });
      expect(isoWeek(new Date(2023, 2, 27, 12))).toEqual({ year: 2023, week: 13 });
      expect(isoWeek(new Date(2023, 9, 29, 12))).toEqual({ year: 2023, week: 43 });
      expect(isoWeek(new Date(2023, 9, 30, 12))).toEqual({ year: 2023, week: 44 });
    });

    it('reaches week 53 in years that have one', () => {
      // 2020 was a 53-week ISO year.
      expect(isoWeek(new Date(2020, 11, 31))).toEqual({ year: 2020, week: 53 });
    });
  });
});
