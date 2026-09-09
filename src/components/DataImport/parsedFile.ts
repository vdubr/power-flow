import type { DataQuality, RawDataPoint } from '../../types/energy';
import { parseCSVFile } from '../../utils/csvParser';
import { emptyQuality, mergeQuality } from './DataQualityNote';

/**
 * Parsing one picked or dropped file into something the importer can commit.
 *
 * The staged-files list this used to feed is gone: files are committed as soon
 * as they parse, because the confirmation step sat below the fold and made a
 * successful pick look like nothing had happened.
 */

/**
 * Ids only need to be unique within this tab. `crypto.randomUUID` is undefined
 * outside secure contexts (plain http on a LAN address) and was called from
 * the catch block too, so one bad file took the whole batch down silently.
 */
let parsedIdCounter = 0;
const nextParsedId = (): string => `file-${++parsedIdCounter}`;

export interface StagedFile {
  id: string;
  fileName: string;
  data: RawDataPoint[];
  type: 'consumption' | 'production' | null;
  year: number | null;
  recordCount: number;
  error: string | null;
  quality: DataQuality;
}

function dominantYear(data: RawDataPoint[]): number | null {
  if (data.length === 0) return null;
  const counts = new Map<number, number>();
  for (const point of data) {
    const year = point.timestamp.getFullYear();
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = year;
    }
  }
  return best;
}

/** Parses one uploaded `File` into a {@link StagedFile}, never throwing. */
export async function parseFileToStagedFile(file: File): Promise<StagedFile> {
  try {
    const result = await parseCSVFile(file);

    if (!result.success) {
      return {
        id: nextParsedId(),
        fileName: file.name,
        data: [],
        type: null,
        year: null,
        recordCount: 0,
        error: result.errors.join(', ') || 'Soubor se nepodařilo zpracovat',
        quality: result.quality,
      };
    }

    const error =
      result.errors.length > 0
        ? `Některé řádky obsahovaly chyby: ${result.errors.slice(0, 3).join(', ')}${
            result.errors.length > 3 ? '...' : ''
          }`
        : null;

    return {
      id: nextParsedId(),
      fileName: file.name,
      data: result.data,
      type: result.type,
      year: dominantYear(result.data),
      recordCount: result.recordCount,
      error,
      quality: result.quality,
    };
  } catch (err) {
    return {
      id: nextParsedId(),
      fileName: file.name,
      data: [],
      type: null,
      year: null,
      recordCount: 0,
      error: `Nepodařilo se zpracovat soubor: ${err instanceof Error ? err.message : String(err)}`,
      quality: emptyQuality(),
    };
  }
}

/** Sums the quality of the files that actually contributed rows (i.e. were committed). */
export function sumCommittedQuality(files: StagedFile[]): DataQuality {
  return files
    .filter((f) => f.data.length > 0)
    .reduce((acc, f) => mergeQuality(acc, f.quality), emptyQuality());
}

/** List of files staged for import, with a per-file remove action. */
