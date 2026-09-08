import { describe, it, expect } from 'vitest';
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from '../utils/dateUtils';

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
});
