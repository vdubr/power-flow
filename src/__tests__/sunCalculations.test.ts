import { describe, it, expect } from 'vitest';
import {
  isDaytime,
  isDaytimeManual,
  getDefaultLocation,
  getSunTimes,
  CZECH_LOCATIONS,
} from '../utils/sunCalculations';

describe('sunCalculations', () => {
  describe('isDaytimeManual', () => {
    const dayStart = '06:00';
    const dayEnd = '20:00';

    it('returns true at start of day window (inclusive lower bound)', () => {
      const ts = new Date(2024, 5, 15, 6, 0); // 06:00
      expect(isDaytimeManual(ts, dayStart, dayEnd)).toBe(true);
    });

    it('returns true just before end of day window', () => {
      const ts = new Date(2024, 5, 15, 19, 59);
      expect(isDaytimeManual(ts, dayStart, dayEnd)).toBe(true);
    });

    it('returns false at exact end of day window (exclusive upper bound)', () => {
      const ts = new Date(2024, 5, 15, 20, 0);
      expect(isDaytimeManual(ts, dayStart, dayEnd)).toBe(false);
    });

    it('returns false just before start of day window', () => {
      const ts = new Date(2024, 5, 15, 5, 59);
      expect(isDaytimeManual(ts, dayStart, dayEnd)).toBe(false);
    });

    it('returns false in the middle of the night', () => {
      const ts = new Date(2024, 5, 15, 2, 30);
      expect(isDaytimeManual(ts, dayStart, dayEnd)).toBe(false);
    });

    it('respects minute granularity', () => {
      const ts = new Date(2024, 5, 15, 6, 30);
      expect(isDaytimeManual(ts, '06:30', '20:00')).toBe(true);
      expect(isDaytimeManual(ts, '06:31', '20:00')).toBe(false);
    });

    it('handles custom non-default windows', () => {
      const ts = new Date(2024, 5, 15, 9, 0);
      expect(isDaytimeManual(ts, '08:00', '10:00')).toBe(true);
      expect(isDaytimeManual(ts, '10:00', '12:00')).toBe(false);
    });
  });

  describe('isDaytime (sun-based)', () => {
    const prague = getDefaultLocation();

    it('returns true at noon on summer solstice in Prague', () => {
      // 21 Jun 2024 12:00 local time - definitely daytime in Prague
      const noon = new Date(2024, 5, 21, 12, 0);
      expect(isDaytime(noon, prague)).toBe(true);
    });

    it('returns false at midnight in Prague', () => {
      const midnight = new Date(2024, 5, 21, 0, 0);
      expect(isDaytime(midnight, prague)).toBe(false);
    });

    it('returns false at noon on winter solstice early morning (03:00)', () => {
      const earlyDec = new Date(2024, 11, 21, 3, 0);
      expect(isDaytime(earlyDec, prague)).toBe(false);
    });

    it('day length on summer solstice is longer than on winter solstice', () => {
      const summer = getSunTimes(new Date(2024, 5, 21, 12, 0), prague);
      const winter = getSunTimes(new Date(2024, 11, 21, 12, 0), prague);
      const summerLen = summer.sunset.getTime() - summer.sunrise.getTime();
      const winterLen = winter.sunset.getTime() - winter.sunrise.getTime();
      expect(summerLen).toBeGreaterThan(winterLen);
    });
  });

  describe('getDefaultLocation', () => {
    it('returns Prague coordinates', () => {
      const loc = getDefaultLocation();
      expect(loc.name).toBe('Praha');
      expect(loc.latitude).toBeCloseTo(50.07, 1);
      expect(loc.longitude).toBeCloseTo(14.43, 1);
    });
  });

  describe('CZECH_LOCATIONS', () => {
    it('contains 10 cities with valid coordinates', () => {
      expect(CZECH_LOCATIONS).toHaveLength(10);
      for (const loc of CZECH_LOCATIONS) {
        expect(loc.latitude).toBeGreaterThan(48);
        expect(loc.latitude).toBeLessThan(51.5);
        expect(loc.longitude).toBeGreaterThan(12);
        expect(loc.longitude).toBeLessThan(19);
        expect(loc.name).toBeTruthy();
      }
    });
  });
});
