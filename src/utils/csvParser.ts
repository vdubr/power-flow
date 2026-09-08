import { RawDataPoint, CSVParseResult, TimeRange } from '../types/energy';

/**
 * Decodes Windows-1250 encoded text to UTF-8 using the native TextDecoder API.
 */
export function decodeWindows1250(buffer: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('windows-1250').decode(buffer);
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
  
  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match;

  const d = parseInt(dayStr, 10);
  const m = parseInt(monthStr, 10);
  const y = parseInt(yearStr, 10);
  const h = parseInt(hourStr, 10);
  const min = parseInt(minuteStr, 10);
  const sec = secondStr ? parseInt(secondStr, 10) : 0;

  const date = new Date(y, m - 1, d, h, min, sec);

  // Validate: reject NaN and rollover (e.g. Feb 30 → March)
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

  // ČEZ data are non-negative; clamp negatives to 0
  return value < 0 ? 0 : value;
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
