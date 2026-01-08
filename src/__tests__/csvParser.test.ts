import { describe, it, expect } from 'vitest';
import {
  parseDate,
  parseValue,
  detectDataType,
  parseCSV,
} from '../utils/csvParser';

describe('csvParser', () => {
  describe('parseDate', () => {
    it('parses valid date correctly', () => {
      const result = parseDate('01.01.2022 00:15');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2022);
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(1);
      expect(result?.getHours()).toBe(0);
      expect(result?.getMinutes()).toBe(15);
    });

    it('parses another valid date correctly', () => {
      const result = parseDate('15.06.2023 14:30');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(5); // June
      expect(result?.getDate()).toBe(15);
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
    });

    it('returns null for invalid date format', () => {
      expect(parseDate('2022-01-01')).toBeNull();
      expect(parseDate('invalid')).toBeNull();
      expect(parseDate('')).toBeNull();
    });

    it('handles whitespace', () => {
      const result = parseDate('  01.01.2022 00:15  ');
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('parseValue', () => {
    it('parses integer values', () => {
      expect(parseValue('0')).toBe(0);
      expect(parseValue('123')).toBe(123);
    });

    it('parses decimal values with dot', () => {
      expect(parseValue('0.336')).toBe(0.336);
      expect(parseValue('1.204')).toBe(1.204);
    });

    it('parses decimal values with comma', () => {
      expect(parseValue('0,336')).toBe(0.336);
      expect(parseValue('1,204')).toBe(1.204);
    });

    it('handles whitespace', () => {
      expect(parseValue('  0.5  ')).toBe(0.5);
    });

    it('returns 0 for empty string', () => {
      expect(parseValue('')).toBe(0);
      expect(parseValue('  ')).toBe(0);
    });

    it('returns null for invalid values', () => {
      expect(parseValue('abc')).toBeNull();
    });
  });

  describe('detectDataType', () => {
    it('detects consumption type with +A', () => {
      expect(detectDataType('"Datum";"+A/84121509 [kW]";"Status";')).toBe('consumption');
    });

    it('detects consumption type with a+', () => {
      expect(detectDataType('"Datum";"a+";"Status";')).toBe('consumption');
    });

    it('detects production type with -A', () => {
      expect(detectDataType('"Datum";"-A/84121509 [kW]";"Status";')).toBe('production');
    });

    it('detects production type with a-', () => {
      expect(detectDataType('"Datum";"a-";"Status";')).toBe('production');
    });

    it('returns null for unknown format', () => {
      expect(detectDataType('"Datum";"Value";"Status";')).toBeNull();
    });
  });

  describe('parseCSV', () => {
    it('parses consumption CSV correctly', () => {
      const csv = `"Datum";"a+";"Status";
01.01.2022 00:15;0.336;data OK;
01.01.2022 00:30;0.5;data OK;`;

      const result = parseCSV(csv);

      expect(result.success).toBe(true);
      expect(result.type).toBe('consumption');
      expect(result.recordCount).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].value).toBe(0.336);
      expect(result.data[0].type).toBe('consumption');
    });

    it('parses production CSV correctly', () => {
      const csv = `"Datum";"a-";"Status";
01.01.2022 00:15;0;data OK;
01.01.2022 00:30;1.2;data OK;`;

      const result = parseCSV(csv);

      expect(result.success).toBe(true);
      expect(result.type).toBe('production');
      expect(result.recordCount).toBe(2);
      expect(result.data[1].value).toBe(1.2);
      expect(result.data[1].type).toBe('production');
    });

    it('calculates date range correctly', () => {
      const csv = `"Datum";"a+";"Status";
01.01.2022 00:15;0.1;OK;
15.06.2022 12:00;0.2;OK;
31.12.2022 23:45;0.3;OK;`;

      const result = parseCSV(csv);

      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange?.start.getMonth()).toBe(0); // January
      expect(result.dateRange?.end.getMonth()).toBe(11); // December
    });

    it('handles empty file', () => {
      const result = parseCSV('');
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Soubor je prázdný');
    });

    it('handles invalid header', () => {
      const csv = `"Datum";"Value";"Status";
01.01.2022 00:15;0.1;OK;`;

      const result = parseCSV(csv);
      expect(result.success).toBe(false);
    });

    it('reports errors for invalid rows', () => {
      const csv = `"Datum";"a+";"Status";
invalid date;0.1;OK;
01.01.2022 00:15;abc;OK;
01.01.2022 00:30;0.5;OK;`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
