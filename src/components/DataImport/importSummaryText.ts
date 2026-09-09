import { ImportSummary } from '../../types/energy';
import { formatCount } from '../../utils/format';

/** "2022", "2022 a 2025", "2022, 2023 a 2024" */
export function formatYearList(years: number[]): string {
  if (years.length === 0) return '';
  if (years.length === 1) return String(years[0]);
  return `${years.slice(0, -1).join(', ')} a ${years[years.length - 1]}`;
}

/**
 * What to tell the user after an import.
 *
 * An import used to be silent: with data already loaded, the panels kept
 * showing the previous year and the new one appeared only as a dimmed badge,
 * which read as "the files did not load". This sentence says what arrived and
 * what the panels now show.
 */
export function describeImport(summary: ImportSummary): string {
  const count = formatCount(summary.recordCount);
  const years = formatYearList(summary.years);
  const plural = summary.years.length > 1 ? 'roky' : 'rok';

  if (summary.years.length === 0) {
    return `Načteno ${count} záznamů.`;
  }

  const loaded = `Načteno ${count} záznamů za ${plural} ${years}.`;
  if (!summary.selectionChanged) {
    return loaded;
  }
  const shown = summary.years.length > 1 ? 'roky' : 'rok';
  return `${loaded} Graf a statistiky teď ukazují ${shown} ${years}.`;
}
