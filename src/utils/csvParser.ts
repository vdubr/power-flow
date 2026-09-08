import { RawDataPoint, CSVParseResult, TimeRange, DataQuality } from '../types/energy';
import { INTERVAL_MINUTES } from '../constants';

/**
 * Decodes text from a ČEZ export.
 *
 * The portal produces Windows-1250. We first try that strictly; if the bytes
 * are not valid Windows-1250 (or a UTF-8 BOM is present) we fall back to UTF-8.
 *
 * NOTE: `new TextDecoder('windows-1250')` without `fatal: true` never throws —
 * it silently substitutes U+FFFD. Every single-byte encoding maps all 256 byte
 * values, so strict Windows-1250 decoding cannot fail either. The BOM check is
 * therefore what actually detects UTF-8 files.
 */
export function decodeWindows1250(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // UTF-8 BOM (EF BB BF) → the file is UTF-8, not Windows-1250.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  return new TextDecoder('windows-1250').decode(bytes);
}

/**
 * Detects if the CSV contains consumption (+A/a+) or production (-A/a-) data
 * Markers are detected as standalone tokens (surrounded by non-alphanumeric chars)
 * to avoid matching substrings within other words.
 */
export function detectDataType(header: string): 'consumption' | 'production' | null {
  // A marker is "surrounded" if preceded/followed by a non-letter/non-digit char
  // (or string boundary). We allow: +A, A+, a+, -A, A-, a- as standalone tokens.
  // Check production first so "A-" is not mistaken (though they can't overlap).

  const productionRe = /(^|[^A-Za-z0-9])(-A|A-|a-)([^A-Za-z0-9]|$)/;
  if (productionRe.test(header)) {
    return 'production';
  }

  const consumptionRe = /(^|[^A-Za-z0-9])(\+A|A\+|a\+)([^A-Za-z0-9]|$)/;
  if (consumptionRe.test(header)) {
    return 'consumption';
  }

  return null;
}

/**
 * Parses a timestamp from a ČEZ export: DD.MM.YYYY HH:mm or DD.MM.YYYY HH:mm:ss.
 *
 * Hour 24 is accepted and normalised to 00:00 of the following day. ČEZ marks
 * the last interval of every day as `24:00:00` in the `+A/… [kW]` export format
 * (365 rows per year); rejecting it silently dropped ~0,8 % of the data.
 *
 * The returned Date is exactly what the file says — see `intervalStart()` for
 * the conversion to the interval's start, which is what the app stores.
 */
export function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  const regex = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;
  const match = trimmed.match(regex);

  if (!match) {
    return null;
  }

  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match;

  const d = parseInt(dayStr, 10);
  const m = parseInt(monthStr, 10);
  const y = parseInt(yearStr, 10);
  const h = parseInt(hourStr, 10);
  const min = parseInt(minuteStr, 10);
  const sec = secondStr ? parseInt(secondStr, 10) : 0;

  // "24:00[:00]" means midnight at the end of the day → 00:00 of the next day.
  if (h === 24) {
    if (min !== 0 || sec !== 0) {
      return null;
    }
    const midnight = new Date(y, m - 1, d + 1, 0, 0, 0);
    // Validate the source day itself (e.g. reject 30.02.2022 24:00).
    const sourceDay = new Date(y, m - 1, d);
    if (
      isNaN(midnight.getTime()) ||
      sourceDay.getFullYear() !== y ||
      sourceDay.getMonth() !== m - 1 ||
      sourceDay.getDate() !== d
    ) {
      return null;
    }
    return midnight;
  }

  const date = new Date(y, m - 1, d, h, min, sec);

  // Validate: reject NaN, rollover (e.g. Feb 30) and non-existent local times
  // (the spring-forward DST gap, where the constructor rolls forward an hour).
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== min
  ) {
    return null;
  }

  return date;
}

/**
 * Converts a ČEZ timestamp (which marks the END of a measurement interval)
 * to the START of that interval, which is what the application stores.
 *
 * The first row of a day is 00:15 (the interval 00:00–00:15) and the last row
 * of a year is 01.01.<next year> 00:00 (resp. 31.12. 24:00:00). Without this
 * shift every day inherited 15 minutes from the previous day and the final row
 * created a phantom year holding a single record.
 *
 * The shift is applied in absolute time, so a 15-minute interval stays
 * 15 minutes long across daylight-saving transitions.
 */
export function intervalStart(intervalEnd: Date): Date {
  return new Date(intervalEnd.getTime() - INTERVAL_MINUTES * 60_000);
}

/**
 * Parses a numeric value from string.
 *
 * Accepts both `.` and `,` as the decimal separator. Returns `null` for values
 * that cannot be trusted — an empty cell, a non-numeric string, an ambiguous
 * number with several separators, or a negative value (ČEZ registers are
 * non-negative; a negative reading means the wrong file or a broken export).
 * The caller reports these rows instead of silently treating them as 0 kWh.
 */
export function parseValue(valueStr: string): number | null {
  const trimmed = valueStr.trim();

  if (!trimmed) {
    return null;
  }

  // Strip spaces used as thousands separators ("1 234,5").
  const withoutSpaces = trimmed.replace(/\s/gu, '');

  // More than one separator is ambiguous ("1,234,567" could be 1234567 or 1.234).
  const separatorCount = (withoutSpaces.match(/[.,]/g) || []).length;
  if (separatorCount > 1) {
    return null;
  }

  const value = parseFloat(withoutSpaces.replace(',', '.'));

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return null;
  }

  return value;
}

/**
 * Status values in the third CSV column that mean "no valid measurement".
 *
 * Compared as lower-case prefixes because the diacritics differ between exports:
 * a correctly encoded file says "neplatná data" / "neznámá hodnota", while an
 * export that has been re-saved through UTF-8 shows replacement characters.
 * The prefixes below are stable in both cases.
 */
const INVALID_STATUS_PREFIXES = ['neplatn', 'nezn'];

function isInvalidStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  return INVALID_STATUS_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function emptyQuality(): DataQuality {
  return { totalRows: 0, validRows: 0, invalidStatusRows: 0, rejectedRows: 0 };
}

function failedResult(errors: string[]): CSVParseResult {
  return {
    success: false,
    data: [],
    type: 'consumption',
    dateRange: null,
    errors,
    recordCount: 0,
    quality: emptyQuality(),
  };
}

/**
 * Parses CSV content and returns structured data.
 *
 * Timestamps in the result are interval STARTS (see `intervalStart`).
 */
export function parseCSV(content: string): CSVParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return failedResult(['Soubor je prázdný']);
  }

  const header = lines[0];
  const dataType = detectDataType(header);

  if (!dataType) {
    return failedResult([
      'Nepodařilo se rozpoznat typ dat. Hlavička musí obsahovat "+A", "a+", "-A" nebo "a-".',
    ]);
  }

  const data: RawDataPoint[] = [];
  const errors: string[] = [];
  const quality = emptyQuality();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    quality.totalRows++;

    const parts = line.split(';');

    if (parts.length < 2) {
      errors.push(`Řádek ${i + 1}: Neplatný formát`);
      quality.rejectedRows++;
      continue;
    }

    const dateStr = parts[0].replace(/"/g, '').trim();
    const valueStr = parts[1].replace(/"/g, '').trim();
    const statusStr = parts.length > 2 ? parts[2].replace(/"/g, '') : '';

    const intervalEnd = parseDate(dateStr);
    if (!intervalEnd) {
      errors.push(`Řádek ${i + 1}: Neplatné datum "${dateStr}"`);
      quality.rejectedRows++;
      continue;
    }

    const value = parseValue(valueStr);
    if (value === null) {
      errors.push(`Řádek ${i + 1}: Neplatná hodnota "${valueStr}"`);
      quality.rejectedRows++;
      continue;
    }

    if (isInvalidStatus(statusStr)) {
      quality.invalidStatusRows++;
    }

    const timestamp = intervalStart(intervalEnd);

    data.push({
      timestamp,
      value,
      type: dataType,
    });
    quality.validRows++;

    if (!minDate || timestamp < minDate) {
      minDate = timestamp;
    }
    if (!maxDate || timestamp > maxDate) {
      maxDate = timestamp;
    }
  }

  const dateRange: TimeRange | null = minDate && maxDate ? { start: minDate, end: maxDate } : null;

  // Limit errors to first 10
  const limitedErrors = errors.slice(0, 10);
  if (errors.length > 10) {
    limitedErrors.push(`... a dalších ${errors.length - 10} chyb`);
  }

  return {
    success: data.length > 0,
    data,
    type: dataType,
    dateRange,
    errors: limitedErrors,
    recordCount: data.length,
    quality,
  };
}

/**
 * Reads and parses a CSV file
 */
export async function parseCSVFile(file: File): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      resolve(parseCSV(decodeWindows1250(buffer)));
    };

    reader.onerror = () => {
      resolve(failedResult(['Nepodařilo se přečíst soubor']));
    };

    reader.readAsArrayBuffer(file);
  });
}
