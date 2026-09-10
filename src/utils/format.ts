/**
 * Number and unit formatting for the whole UI.
 *
 * Everything the user reads goes through here, so the app never shows
 * "4.8 MWh" next to "35 036 záznamů". Czech convention: comma as the decimal
 * separator, narrow no-break space between thousands.
 *
 * ECharts cannot call `Intl` from inside its own default formatters, so the
 * axis and tooltip helpers below are passed to it explicitly.
 */

const LOCALE = 'cs-CZ';

const decimalFormatters = new Map<number, Intl.NumberFormat>();

function decimalFormatter(digits: number): Intl.NumberFormat {
  let formatter = decimalFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    decimalFormatters.set(digits, formatter);
  }
  return formatter;
}

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'CZK',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyPreciseFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'CZK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Plain number with a fixed number of decimals, e.g. `12,34`. */
export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  return decimalFormatter(decimals).format(value);
}

/** Whole number with thousands separators, e.g. `35 036`. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return integerFormatter.format(value);
}

/** Money, rounded to whole crowns: `6 039 Kč`. */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return currencyFormatter.format(value);
}

/** Money with two decimals, for unit prices: `6,00 Kč`. */
export function formatCurrencyPrecise(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return currencyPreciseFormatter.format(value);
}

/**
 * Energy with the unit picked to keep the number readable:
 * below 1 MWh in kWh, above it in MWh.
 */
export function formatEnergy(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  if (Math.abs(value) >= 1000) {
    return `${formatNumber(value / 1000, decimals)} MWh`;
  }
  return `${formatNumber(value, decimals)} kWh`;
}

/** Energy always in kWh, for columns that must stay comparable. */
export function formatKwh(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  return `${formatNumber(value, decimals)} kWh`;
}

/** Percentage: `85,1 %`. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  return `${formatNumber(value, decimals)} %`;
}

/** Compact axis label for charts: no unit, at most one decimal. */
export function formatAxisNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return integerFormatter.format(value);
  return Number.isInteger(value) ? integerFormatter.format(value) : formatNumber(value, 1);
}

/** Day and month for a chart axis: `24. 6.` */
export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' });
}

/** Full date: `24. 6. 2022` */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/** Date with time, for peaks: `1. 2. 2022 18:45` */
export function formatDateTime(date: Date): string {
  return date.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MONTH_NAMES = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
];

/** Month name with year: `Červen 2022`. `month` is 1-based. */
export function formatMonthYear(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** Month name alone: `Červen`. `month` is 1-based. */
export function formatMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** Week of the year: `27. týden`. */
export function formatWeekName(week: number): string {
  return `${formatCount(week)}. týden`;
}

/**
 * Difference from a reference value: `+8,2 %`, `−6,0 %`, `0,0 %`.
 *
 * Uses the typographic minus (U+2212), not a hyphen, so a negative share does
 * not read like a bullet point at small sizes.
 */
export function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const rounded = Number(formatNumber(Math.abs(value), 1).replace(',', '.'));
  if (rounded === 0) return formatPercent(0);
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatPercent(Math.abs(value))}`;
}

/** Czech plural for a count of days: 1 den, 2 dny, 5 dnů. */
export function formatDays(count: number): string {
  const rounded = Math.round(count);
  if (rounded === 1) return '1 den';
  if (rounded >= 2 && rounded <= 4) return `${formatCount(rounded)} dny`;
  return `${formatCount(rounded)} dnů`;
}
