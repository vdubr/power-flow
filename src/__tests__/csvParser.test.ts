import { describe, it, expect } from 'vitest';
import {
  parseDate,
  parseValue,
  detectDataType,
  parseCSV,
  decodeWindows1250,
  intervalStart,
} from '../utils/csvParser';

const bytes = (...vals: number[]): ArrayBuffer => new Uint8Array(vals).buffer;

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

    it('returns null for rollover dates (e.g. Feb 30)', () => {
      expect(parseDate('30.02.2022 00:00')).toBeNull();
      expect(parseDate('31.04.2023 12:00')).toBeNull();
    });

    it('returns null for out-of-range time components', () => {
      expect(parseDate('01.01.2022 25:00')).toBeNull();
      expect(parseDate('01.01.2022 00:61')).toBeNull();
    });

    it('handles whitespace', () => {
      const result = parseDate('  01.01.2022 00:15  ');
      expect(result).toBeInstanceOf(Date);
    });

    it('DST spring-forward gap (26.03.2023 02:30 – time that never existed in CEST)', () => {
      // In CET→CEST transition, clocks jump from 02:00 to 03:00 on 26.3.2023.
      // 02:30 is a "phantom" local time that never occurred.
      // JavaScript's Date constructor resolves new Date(2023, 2, 26, 2, 30) by
      // rolling forward to 03:30 (the hour-check fails: expected 2, got 3).
      // Therefore parseDate must return null for this input – the implementation
      // correctly rejects it via the hours-equality guard.
      const result = parseDate('26.03.2023 02:30');
      expect(result).toBeNull();
    });

    it('DST fall-back duplicate hour (29.10.2023 02:30 – ambiguous in CEST/CET) is deterministic', () => {
      // In CEST→CET transition, 02:30 occurs twice on 29.10.2023.
      // JavaScript does not have a timezone-disambiguated Date API; it picks one
      // interpretation deterministically. Two calls with the same string must
      // always yield equal timestamps (idempotent / no random jitter).
      const result1 = parseDate('29.10.2023 02:30');
      const result2 = parseDate('29.10.2023 02:30');
      expect(result1).toBeInstanceOf(Date);
      expect(result2).toBeInstanceOf(Date);
      expect(result1!.getTime()).toBe(result2!.getTime());
      // Local time components are consistently 02:30 (whichever interpretation JS chose).
      expect(result1!.getHours()).toBe(2);
      expect(result1!.getMinutes()).toBe(30);
    });
  });

  describe('parseDate – end-of-day 24:00', () => {
    it('normalises 24:00 to midnight of the following day', () => {
      const result = parseDate('31.12.2025 24:00:00');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it('accepts 24:00 without seconds', () => {
      const result = parseDate('15.06.2023 24:00');
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
    });

    it('rejects 24:xx with a non-zero minute or second', () => {
      expect(parseDate('15.06.2023 24:15')).toBeNull();
      expect(parseDate('15.06.2023 24:00:01')).toBeNull();
    });

    it('still rejects hour 25 and impossible source days', () => {
      expect(parseDate('01.01.2022 25:00')).toBeNull();
      expect(parseDate('30.02.2022 24:00')).toBeNull();
    });
  });

  describe('intervalStart', () => {
    it('shifts a ČEZ timestamp back by one 15-minute interval', () => {
      const start = intervalStart(new Date(2022, 0, 1, 0, 15));
      expect(start.getFullYear()).toBe(2022);
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    });

    it('keeps the last interval of the year inside that year', () => {
      // Old format: the final row is 01.01.<next year> 00:00.
      const start = intervalStart(new Date(2023, 0, 1, 0, 0));
      expect(start.getFullYear()).toBe(2022);
      expect(start.getMonth()).toBe(11);
      expect(start.getDate()).toBe(31);
      expect(start.getHours()).toBe(23);
      expect(start.getMinutes()).toBe(45);
    });

    it('shifts by 15 minutes of absolute time across the spring DST jump', () => {
      // 27.03.2022: local time jumps 02:00 → 03:00. The interval ending at
      // 03:00 CEST starts at 01:45 CET.
      const start = intervalStart(new Date(2022, 2, 27, 3, 0));
      expect(start.getHours()).toBe(1);
      expect(start.getMinutes()).toBe(45);
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

    it('returns null for an empty cell (a missing reading is not 0 kWh)', () => {
      // A missing measurement used to be silently counted as zero consumption,
      // which under-reported totals and inflated the off-grid day count.
      expect(parseValue('')).toBeNull();
      expect(parseValue('  ')).toBeNull();
    });

    it('returns null for invalid values', () => {
      expect(parseValue('abc')).toBeNull();
    });

    it('returns null for negative values (ČEZ registers are non-negative)', () => {
      // A negative reading means the wrong file or a broken export. Clamping it
      // to 0 hid that from the user; the row is now reported instead.
      expect(parseValue('-1')).toBeNull();
      expect(parseValue('-0.5')).toBeNull();
      expect(parseValue('-0,001')).toBeNull();
    });

    it('returns null for ambiguous numbers with several separators', () => {
      // "1,234,567" could mean 1234567 or 1.234 depending on the locale.
      // Guessing produced a silently truncated value; rejecting it is honest.
      expect(parseValue('1,234,567')).toBeNull();
      expect(parseValue('1.234.567')).toBeNull();
    });

    it('accepts a space used as a thousands separator', () => {
      expect(parseValue('1 234,5')).toBeCloseTo(1234.5);
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

    it('does NOT match "A+" embedded inside a word (both sides are alphanumeric)', () => {
      // "KATA+LOG": 'A' before 'A+' and 'L' after – both alphanumeric → no match.
      expect(detectDataType('KATA+LOG')).toBeNull();
    });

    it('does NOT match "A+" when preceded by underscore but followed by a letter', () => {
      // "STANDARD_A+FORMAT": '_' is non-alphanumeric (before), but 'F' is alphanumeric
      // (after) → the right-hand lookahead fails → no match. The regex correctly
      // requires BOTH surroundings to be non-alphanumeric (or boundary).
      expect(detectDataType('STANDARD_A+FORMAT')).toBeNull();
    });

    it('matches "A+" when surrounded by non-alphanumeric delimiters (underscore both sides)', () => {
      // '_A+_': both neighbours are non-alphanumeric → should match as consumption.
      expect(detectDataType('_A+_')).toBe('consumption');
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

  describe('parseCSV – edge cases', () => {
    it('handles CSV with only a header line and no data rows', () => {
      // A file that has a valid header but zero data rows.
      const csv = `"Datum";"a+";"Status";`;
      const result = parseCSV(csv);
      // No data rows → success=false (data.length === 0) and recordCount=0.
      expect(result.success).toBe(false);
      expect(result.recordCount).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.dateRange).toBeNull();
    });

    it('rejects a data row with a missing value and reports it', () => {
      const csv = `"Datum";"a+";"Status";
01.01.2022 00:15;;data OK;
01.01.2022 00:30;0.5;data OK;`;
      const result = parseCSV(csv);
      // An empty cell is a missing measurement, not zero consumption.
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1);
      expect(result.data[0].value).toBeCloseTo(0.5);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Řádek 2/);
      expect(result.quality.rejectedRows).toBe(1);
      expect(result.quality.validRows).toBe(1);
    });

    it('accepts the end-of-day timestamp 24:00:00 used by the "+A/… [kW]" export', () => {
      // ČEZ marks the last interval of each day as 24:00:00. It used to roll
      // over into the next day and get rejected – 365 lost rows per year.
      const csv = `"Datum";"+A/84121509 [kW]";"Status";
"31.12.2025 23:45:00";1,5;"naměřená data OK";
"31.12.2025 24:00:00";2,5;"naměřená data OK";`;
      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.errors).toEqual([]);
      // Interval starts: 23:30 and 23:45 of 31.12.2025 – the year does not bleed.
      expect(result.data[1].timestamp.getFullYear()).toBe(2025);
      expect(result.data[1].timestamp.getMonth()).toBe(11);
      expect(result.data[1].timestamp.getDate()).toBe(31);
      expect(result.data[1].timestamp.getHours()).toBe(23);
      expect(result.data[1].timestamp.getMinutes()).toBe(45);
    });

    it('counts rows whose Status column reports an invalid or unknown reading', () => {
      const csv = `"Datum";"a+";"Status";
01.01.2022 00:15;0.3;naměřená data OK;
01.01.2022 00:30;0;neplatná data;
01.01.2022 00:45;0;neznámá hodnota;
01.01.2022 01:00;0.4;naměřená data, výpadek napětí;`;
      const result = parseCSV(csv);
      expect(result.recordCount).toBe(4);
      expect(result.quality.totalRows).toBe(4);
      expect(result.quality.validRows).toBe(4);
      // "výpadek napětí" is still a real measurement; the other two are not.
      expect(result.quality.invalidStatusRows).toBe(2);
    });

    it('recognises invalid statuses even when the diacritics are mangled', () => {
      // A sample file that has been re-saved through UTF-8 shows replacement
      // characters instead of Czech letters; the prefix still matches.
      const csv = `"Datum";"a+";"Status";
01.01.2022 00:15;0;nezn��m� hodnota;
01.01.2022 00:30;0;neplatn� data;`;
      const result = parseCSV(csv);
      expect(result.quality.invalidStatusRows).toBe(2);
    });

    it('handles CRLF line endings', () => {
      // Windows-style CRLF (\r\n) must be treated the same as LF.
      const csv = '"Datum";"a+";"Status";\r\n01.01.2022 00:15;0.336;data OK;\r\n01.01.2022 00:30;0.5;data OK;';
      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.data[0].value).toBeCloseTo(0.336);
    });

    it('handles data rows with extra (superfluous) columns', () => {
      // A line that has more semicolon-separated fields than expected.
      // The parser only reads the first two columns, so extra columns are ignored.
      const csv = `"Datum";"a+";"Status";"Extra";
01.01.2022 00:15;0.336;data OK;extraValue;`;
      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1);
      expect(result.data[0].value).toBeCloseTo(0.336);
    });

    it('limits reported errors to 10 and adds a summary message for the rest', () => {
      // Build a CSV with a valid header and 15 invalid rows (bad dates).
      // The parser collects errors then slices to first 10 and appends a summary.
      const lines = ['"Datum";"a+";"Status";'];
      for (let i = 1; i <= 15; i++) {
        lines.push(`invalid-date-${i};0.5;OK;`);
      }
      const csv = lines.join('\n');
      const result = parseCSV(csv);

      // All 15 rows failed → no data.
      expect(result.success).toBe(false);
      expect(result.recordCount).toBe(0);

      // The implementation slices errors to 10 and appends one summary line:
      // errors.slice(0, 10) + "... a dalších 5 chyb" → 11 entries total.
      expect(result.errors.length).toBe(11);
      // The last entry is the summary message.
      expect(result.errors[10]).toMatch(/dalších 5 chyb/);
    });
  });

  describe('decodeWindows1250', () => {
    it('decodes ASCII characters unchanged', () => {
      // "Hello"
      const buf = bytes(0x48, 0x65, 0x6c, 0x6c, 0x6f);
      expect(decodeWindows1250(buf)).toBe('Hello');
    });

    it('decodes a CR LF newline as-is', () => {
      const buf = bytes(0x41, 0x0d, 0x0a, 0x42);
      expect(decodeWindows1250(buf)).toBe('A\r\nB');
    });

    it('decodes Czech-specific Windows-1250 bytes to correct Unicode', () => {
      // Bytes for: Š š Č č Ř ř Ě ě Ž ž Ť ť Ů ů Ď ď Ň ň
      const buf = bytes(
        0x8a, 0x9a, // Š š
        0xc8, 0xe8, // Č č
        0xd8, 0xf8, // Ř ř
        0xcc, 0xec, // Ě ě
        0x8e, 0x9e, // Ž ž
        0x8d, 0x9d, // Ť ť
        0xd9, 0xf9, // Ů ů
        0xcf, 0xef, // Ď ď
        0xd2, 0xf2  // Ň ň
      );
      expect(decodeWindows1250(buf)).toBe('ŠšČčŘřĚěŽžŤťŮůĎďŇň');
    });

    it('decodes the realistic ČEZ status string "naměřená data OK"', () => {
      // n a m ě ř e n á <space> d a t a <space> O K
      const buf = bytes(
        0x6e, 0x61, 0x6d, 0xec, 0xf8, 0x65, 0x6e, 0xe1,
        0x20,
        0x64, 0x61, 0x74, 0x61,
        0x20,
        0x4f, 0x4b
      );
      expect(decodeWindows1250(buf)).toBe('naměřená data OK');
    });

    it('returns empty string for an empty buffer', () => {
      expect(decodeWindows1250(new ArrayBuffer(0))).toBe('');
    });
  });
});
