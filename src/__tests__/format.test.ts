import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatCount,
  formatCurrency,
  formatCurrencyPrecise,
  formatEnergy,
  formatKwh,
  formatPercent,
  formatAxisNumber,
  formatDayMonth,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatDays,
} from '../utils/format';

/**
 * The whole UI reads numbers through this module, so these tests pin the Czech
 * conventions: comma as the decimal separator and a space between thousands.
 * `toContain` is used for the separator because Intl emits a narrow no-break
 * space, which is invisible in a source file.
 */
describe('format', () => {
  describe('formatNumber', () => {
    it('uses a comma as the decimal separator', () => {
      expect(formatNumber(12.34, 2)).toBe('12,34');
      expect(formatNumber(1, 1)).toBe('1,0');
    });

    it('rounds to the requested number of decimals', () => {
      expect(formatNumber(2.567, 1)).toBe('2,6');
      expect(formatNumber(2.4, 0)).toBe('2');
    });

    it('returns a dash for values that are not finite', () => {
      expect(formatNumber(NaN)).toBe('–');
      expect(formatNumber(Infinity)).toBe('–');
    });
  });

  describe('formatCount', () => {
    it('groups thousands', () => {
      const result = formatCount(35040);
      expect(result).toMatch(/^35\s?040$/u);
      expect(result).not.toContain(',');
    });
  });

  describe('formatCurrency', () => {
    it('renders whole crowns with the Czech currency symbol', () => {
      const result = formatCurrency(6039);
      expect(result).toContain('Kč');
      expect(result).toMatch(/6\s?039/u);
      expect(result).not.toContain(',');
    });

    it('keeps two decimals for unit prices', () => {
      expect(formatCurrencyPrecise(6)).toContain('6,00');
    });
  });

  describe('formatEnergy', () => {
    it('stays in kWh below one megawatt-hour', () => {
      expect(formatEnergy(999)).toBe('999,0 kWh');
    });

    it('switches to MWh at and above one megawatt-hour', () => {
      expect(formatEnergy(1000)).toBe('1,0 MWh');
      expect(formatEnergy(4815.7)).toBe('4,8 MWh');
    });

    it('formatKwh never switches units, so columns stay comparable', () => {
      // The thousands separator is a narrow no-break space, matched here as \s.
      expect(formatKwh(4815.7)).toMatch(/^4\s?815,7 kWh$/u);
    });
  });

  describe('formatPercent', () => {
    it('appends a percent sign', () => {
      expect(formatPercent(85.14)).toBe('85,1 %');
      expect(formatPercent(90, 0)).toBe('90 %');
    });
  });

  describe('formatAxisNumber', () => {
    it('drops decimals for whole numbers', () => {
      expect(formatAxisNumber(10)).toBe('10');
    });

    it('keeps one decimal for fractions', () => {
      expect(formatAxisNumber(2.5)).toBe('2,5');
    });

    it('groups thousands and drops decimals for large values', () => {
      expect(formatAxisNumber(1500)).toMatch(/^1\s?500$/u);
    });

    it('returns an empty string for non-finite input so an axis never shows NaN', () => {
      expect(formatAxisNumber(NaN)).toBe('');
    });
  });

  describe('dates', () => {
    const date = new Date(2022, 5, 24, 18, 45);

    it('formats day and month for chart axes', () => {
      expect(formatDayMonth(date)).toMatch(/24\.\s?6\./u);
    });

    it('formats a full date', () => {
      expect(formatDate(date)).toMatch(/24\.\s?6\.\s?2022/u);
    });

    it('formats a date with time for peaks', () => {
      expect(formatDateTime(date)).toContain('18:45');
    });

    it('names months in Czech', () => {
      expect(formatMonthYear(1, 2022)).toBe('Leden 2022');
      expect(formatMonthYear(6, 2022)).toBe('Červen 2022');
      expect(formatMonthYear(12, 2025)).toBe('Prosinec 2025');
    });
  });

  describe('formatDays', () => {
    it('declines the Czech word for day', () => {
      expect(formatDays(1)).toBe('1 den');
      expect(formatDays(2)).toBe('2 dny');
      expect(formatDays(4)).toBe('4 dny');
      expect(formatDays(5)).toBe('5 dnů');
      expect(formatDays(0)).toBe('0 dnů');
      expect(formatDays(178)).toMatch(/178 dnů/u);
    });

    it('rounds before deciding the form', () => {
      expect(formatDays(1.4)).toBe('1 den');
      expect(formatDays(2.6)).toBe('3 dny');
    });
  });
});
