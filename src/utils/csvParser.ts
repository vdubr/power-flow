import { RawDataPoint, CSVParseResult, TimeRange } from '../types/energy';

/**
 * Decodes Windows-1250 encoded text to UTF-8
 */
export function decodeWindows1250(buffer: ArrayBuffer): string {
  // Windows-1250 to Unicode mapping for Czech characters
  const windows1250ToUnicode: { [key: number]: number } = {
    0x8a: 0x0160, // Š
    0x8c: 0x015a, // Ś
    0x8d: 0x0164, // Ť
    0x8e: 0x017d, // Ž
    0x8f: 0x0179, // Ź
    0x9a: 0x0161, // š
    0x9c: 0x015b, // ś
    0x9d: 0x0165, // ť
    0x9e: 0x017e, // ž
    0x9f: 0x017a, // ź
    0xa1: 0x02c7, // ˇ
    0xa2: 0x02d8, // ˘
    0xa3: 0x0141, // Ł
    0xa5: 0x0104, // Ą
    0xaa: 0x015e, // Ş
    0xaf: 0x017b, // Ż
    0xb2: 0x02db, // ˛
    0xb3: 0x0142, // ł
    0xb9: 0x0105, // ą
    0xba: 0x015f, // ş
    0xbc: 0x013d, // Ľ
    0xbd: 0x02dd, // ˝
    0xbe: 0x013e, // ľ
    0xbf: 0x017c, // ż
    0xc0: 0x0154, // Ŕ
    0xc3: 0x0102, // Ă
    0xc5: 0x0139, // Ĺ
    0xc6: 0x0106, // Ć
    0xc8: 0x010c, // Č
    0xca: 0x0118, // Ę
    0xcc: 0x011a, // Ě
    0xcf: 0x010e, // Ď
    0xd0: 0x0110, // Đ
    0xd1: 0x0143, // Ń
    0xd2: 0x0147, // Ň
    0xd5: 0x0150, // Ő
    0xd8: 0x0158, // Ř
    0xd9: 0x016e, // Ů
    0xdb: 0x0170, // Ű
    0xde: 0x0162, // Ţ
    0xdf: 0x00df, // ß
    0xe0: 0x0155, // ŕ
    0xe3: 0x0103, // ă
    0xe5: 0x013a, // ĺ
    0xe6: 0x0107, // ć
    0xe8: 0x010d, // č
    0xea: 0x0119, // ę
    0xec: 0x011b, // ě
    0xef: 0x010f, // ď
    0xf0: 0x0111, // đ
    0xf1: 0x0144, // ń
    0xf2: 0x0148, // ň
    0xf5: 0x0151, // ő
    0xf8: 0x0159, // ř
    0xf9: 0x016f, // ů
    0xfb: 0x0171, // ű
    0xfe: 0x0163, // ţ
    0xff: 0x02d9, // ˙
  };

  const bytes = new Uint8Array(buffer);
  let result = '';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte < 0x80) {
      result += String.fromCharCode(byte);
    } else if (windows1250ToUnicode[byte]) {
      result += String.fromCharCode(windows1250ToUnicode[byte]);
    } else if (byte >= 0xc0 && byte <= 0xff) {
      // Standard Latin-1 supplement mapping
      result += String.fromCharCode(byte);
    } else {
      result += String.fromCharCode(byte);
    }
  }

  return result;
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
 * Parses date in format DD.MM.YYYY HH:mm or DD.MM.YYYY HH:mm:ss
 */
export function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  
  // Expected format: DD.MM.YYYY HH:mm or DD.MM.YYYY HH:mm:ss
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;
  const match = trimmed.match(regex);
  
  if (!match) {
    return null;
  }
  
  const [, day, month, year, hour, minute, second] = match;
  const date = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1, // Month is 0-indexed
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    second ? parseInt(second, 10) : 0
  );
  
  // Validate the date is valid
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

/**
 * Parses a numeric value from string (handles both . and , as decimal separator)
 */
export function parseValue(valueStr: string): number | null {
  const trimmed = valueStr.trim();
  
  if (!trimmed || trimmed === '') {
    return 0;
  }
  
  // Replace comma with dot for parsing
  const normalized = trimmed.replace(',', '.');
  const value = parseFloat(normalized);
  
  if (isNaN(value)) {
    return null;
  }
  
  return value;
}

/**
 * Parses CSV content and returns structured data
 */
export function parseCSV(content: string): CSVParseResult {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  
  if (lines.length === 0) {
    return {
      success: false,
      data: [],
      type: 'consumption',
      dateRange: null,
      errors: ['Soubor je prázdný'],
      recordCount: 0,
    };
  }
  
  // Parse header
  const header = lines[0];
  const dataType = detectDataType(header);
  
  if (!dataType) {
    return {
      success: false,
      data: [],
      type: 'consumption',
      dateRange: null,
      errors: ['Nepodařilo se rozpoznat typ dat. Hlavička musí obsahovat "+A", "a+", "-A" nebo "a-".'],
      recordCount: 0,
    };
  }
  
  const data: RawDataPoint[] = [];
  const errors: string[] = [];
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by semicolon
    const parts = line.split(';');
    
    if (parts.length < 2) {
      errors.push(`Řádek ${i + 1}: Neplatný formát`);
      continue;
    }
    
    const dateStr = parts[0].replace(/"/g, '').trim();
    const valueStr = parts[1].replace(/"/g, '').trim();
    
    const timestamp = parseDate(dateStr);
    if (!timestamp) {
      errors.push(`Řádek ${i + 1}: Neplatné datum "${dateStr}"`);
      continue;
    }
    
    const value = parseValue(valueStr);
    if (value === null) {
      errors.push(`Řádek ${i + 1}: Neplatná hodnota "${valueStr}"`);
      continue;
    }
    
    data.push({
      timestamp,
      value,
      type: dataType,
    });
    
    // Track date range
    if (!minDate || timestamp < minDate) {
      minDate = timestamp;
    }
    if (!maxDate || timestamp > maxDate) {
      maxDate = timestamp;
    }
  }
  
  const dateRange: TimeRange | null = minDate && maxDate 
    ? { start: minDate, end: maxDate }
    : null;
  
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
      
      // Try to decode as Windows-1250 first (common for Czech files)
      let content: string;
      try {
        content = decodeWindows1250(buffer);
      } catch {
        // Fallback to UTF-8
        const decoder = new TextDecoder('utf-8');
        content = decoder.decode(buffer);
      }
      
      const result = parseCSV(content);
      resolve(result);
    };
    
    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        type: 'consumption',
        dateRange: null,
        errors: ['Nepodařilo se přečíst soubor'],
        recordCount: 0,
      });
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Merges consumption and production data into combined records
 */
export function mergeData(
  consumptionData: RawDataPoint[],
  productionData: RawDataPoint[]
): Map<number, { consumption: number; production: number }> {
  const merged = new Map<number, { consumption: number; production: number }>();
  
  // Add consumption data
  for (const point of consumptionData) {
    const key = point.timestamp.getTime();
    const existing = merged.get(key) || { consumption: 0, production: 0 };
    existing.consumption = point.value;
    merged.set(key, existing);
  }
  
  // Add production data
  for (const point of productionData) {
    const key = point.timestamp.getTime();
    const existing = merged.get(key) || { consumption: 0, production: 0 };
    existing.production = point.value;
    merged.set(key, existing);
  }
  
  return merged;
}

/**
 * Gets the year from data points
 */
export function getYearsFromData(data: RawDataPoint[]): number[] {
  const years = new Set<number>();
  for (const point of data) {
    years.add(point.timestamp.getFullYear());
  }
  return Array.from(years).sort();
}
