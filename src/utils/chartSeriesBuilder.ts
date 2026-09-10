/**
 * Pure (React-free) chart data preparation for MainChart.
 *
 * Kept separate from the component so the series-building logic — the
 * aggregation switch, the per-year color assignment, the night-band
 * computation — can be unit tested without mounting ECharts or React.
 */
import {
  EnergyRecord,
  AggregatedData,
  AggregationType,
  ChartMode,
  ConsumptionSplit,
  DayNightConfig,
  YearlyData,
} from '../types/energy';
import {
  aggregateByDay,
  aggregateByHour,
  aggregateByWeek,
  aggregateByMonth,
  getRawData,
} from './dataAggregation';
import {
  createIsDayPredicate,
  getDayBounds,
  resolveDayNightConfig,
  IsDayPredicate,
} from './dayNight';
import { formatLocalDateKey, isoWeek, parseLocalDateKey } from './dateUtils';
import { CHART_PALETTE, YEAR_SERIES_COLORS, withAlpha } from '../theme/echartsTheme';
import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatKwh,
  formatMonthName,
  formatSignedPercent,
  formatWeekName,
} from './format';

/**
 * True for aggregation types whose x-axis is a continuous timestamp (ECharts
 * `type: 'time'`), as opposed to one category per calendar period.
 */
export function isTimeAxisAggregation(type: AggregationType): boolean {
  return type === 'raw' || type === 'hourly';
}

export interface ChartSeriesDef {
  name: string;
  type: 'line' | 'bar';
  /** Plot values: consumption is negative, see `buildChartSeries`. */
  data: Array<[string | number, number]>;
  color: string;
  /** Line views only. */
  areaStyle?: { opacity: number };
  /** Line views only: distinguishes the older year when comparing. */
  lineDashed?: boolean;
  /** Which row of the filter under the chart this series belongs to. */
  quantity: SeriesQuantity;
  /** The year this series draws. */
  year: number;
  /**
   * `-1` for the series drawn below the zero line. Multiply a plot value by it
   * to get the energy back, so no reader ever sees a negative kWh.
   */
  plotSign: 1 | -1;
  /**
   * What tells this series apart from the others in its row — the year. The
   * row header already says "Spotřeba" or "Výroba", so the label does not
   * repeat it.
   */
  legendLabel: string;
}

export interface BuiltChartSeries {
  series: ChartSeriesDef[];
  dates: string[];
  /**
   * Day and night halves of each bucket's consumption, by
   * `splitLookupKey(category, year)`. Filled only for the `both` switch, which
   * leaves the bars alone and puts the division in the tooltip.
   */
  splitByKey: Map<string, DayNightHalves>;
}

export type SeriesQuantity = 'consumption' | 'production' | 'net';

/** What the user calls each quantity, in the chart and in the filter rows. */
export const QUANTITY_LABEL: Record<SeriesQuantity, string> = {
  consumption: 'Spotřeba',
  production: 'Výroba',
  net: 'Dokoupená energie',
};

/**
 * Identity of one series: what the chart legend used to show, what the filter
 * chips hide, and what `ChartConfig.hiddenSeries` stores.
 *
 * The year is only part of the name when several years are on screen — with a
 * single year "Spotřeba 2024" would be noise in every tooltip.
 */
export function chartSeriesName(
  quantity: SeriesQuantity,
  year: number,
  isCompare: boolean
): string {
  return isCompare ? `${QUANTITY_LABEL[quantity]} ${year}` : QUANTITY_LABEL[quantity];
}

/**
 * What tells a series apart from the others in its filter row. The row header
 * already says the quantity, so the label is the year.
 */
export function chartSeriesLabel(year: number): string {
  return String(year);
}

/**
 * Color of one series.
 *
 * Comparing years colors by year so the eye can follow a year across both
 * quantities; a single year uses the semantic consumption/production colors.
 * Production is drawn lighter than consumption of the same year, and the night
 * half of a split bar lighter still.
 */
export function chartSeriesColor(
  quantity: SeriesQuantity,
  isCompare: boolean,
  yearIndex: number
): string {
  const yearColor = isCompare
    ? YEAR_SERIES_COLORS[yearIndex % YEAR_SERIES_COLORS.length]
    : null;
  if (quantity === 'consumption') return yearColor ?? CHART_PALETTE.consumption;
  if (quantity === 'net') return yearColor ?? CHART_PALETTE.amber;
  // Production is drawn lighter than the consumption of the same year, so a
  // year reads as one pair rather than two unrelated bars.
  return yearColor ? withAlpha(yearColor, 0.53) : CHART_PALETTE.production;
}

/**
 * The two fragments of a week that a calendar year shares with its neighbour.
 *
 * A year almost never starts and ends on a Monday, so its first and last
 * weekly bucket can belong to the neighbouring year's ISO week: 1. 1. 2022 was
 * a Saturday, closing week 52 of 2021, and 29. 12. 2025 was a Monday, opening
 * week 1 of 2026. Those fragments get their own band at each end of the axis
 * instead of being merged into the neighbouring week — merging would inflate a
 * year's first or last bar by up to three days and make it look like a real
 * difference in the cross-year comparison.
 *
 * The ids sort around the week numbers (`W01`…`W53`) as plain strings, which is
 * what puts the bands at the ends of the axis.
 */
const WEEK_CARRY_IN_ID = 'W00';
const WEEK_CARRY_OUT_ID = 'W54';

/**
 * Identity of one week, shared by every year: the ISO week number.
 *
 * The calendar date of a Monday moves from year to year, so keying the axis by
 * it interleaved the years — week 27 of 2022 and of 2025 landed in different
 * bands three days apart, each holding a single year. The week number is the
 * same unit in every year, so the years stack up in one band.
 */
export function weekUnitId(startDate: Date, seriesYear: number): string {
  const { year, week } = isoWeek(startDate);
  if (year < seriesYear) return WEEK_CARRY_IN_ID;
  if (year > seriesYear) return WEEK_CARRY_OUT_ID;
  return `W${String(week).padStart(2, '0')}`;
}

/**
 * X-axis category one aggregated bucket belongs to.
 *
 * Comparing years overlays them on a shared axis, so the year has to drop out
 * of the key: months share a month-day, weeks share their ISO week number. A
 * single year keeps the full date, which the axis can label directly. Both the
 * series and the cross-year tooltip derive their keys from here, otherwise a
 * tooltip lookup would silently miss.
 */
export function chartCategoryKey(
  startDate: Date,
  isCompare: boolean,
  aggregationType: AggregationType,
  seriesYear: number
): string {
  if (!isCompare) return formatLocalDateKey(startDate);
  if (aggregationType === 'weekly') return weekUnitId(startDate, seriesYear);
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const day = String(startDate.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * Axis label for one category of the bar views.
 *
 * A single year labels the period's first day, which is the Monday of a week
 * and the 1st of a month. Comparing years has no single date to show, so weeks
 * fall back to their number and the two turn-of-the-year fragments are named
 * rather than numbered — their week number differs from year to year.
 */
export function formatCategoryAxisLabel(
  category: string,
  isCompare: boolean,
  aggregationType: AggregationType
): string {
  if (!isCompare) return formatDayMonth(parseLocalDateKey(category));

  if (aggregationType === 'weekly') {
    if (category === WEEK_CARRY_IN_ID || category === WEEK_CARRY_OUT_ID) return 'přelom';
    return `${Number(category.slice(1))}.`;
  }

  const [month, day] = category.split('-').map(Number);
  return formatDayMonth(new Date(2000, month - 1, day));
}

export interface BuildChartSeriesParams {
  yearlyData: Map<number, YearlyData>;
  selectedYears: number[];
  aggregationType: AggregationType;
  showConsumption: boolean;
  showProduction: boolean;
  dayNightConfig: DayNightConfig;
  /** What the chart does with the day/night half of consumption. */
  consumptionSplit: ConsumptionSplit;
  /** Import against export, or the net of the two. */
  chartMode: ChartMode;
  /** Draw what was bought below the zero line instead of above it. */
  consumptionBelowAxis: boolean;
}

/** One x-axis position of one year, after the day/night switch is applied. */
interface YearPoint {
  key: string | number;
  consumption: number;
  production: number;
  /** Halves of this bucket's consumption, where the bucket spans both. */
  split?: DayNightHalves;
}

export interface DayNightHalves {
  day: number;
  night: number;
}

/** Identifies one bucket of one year in `BuiltChartSeries.splitByKey`. */
export function splitLookupKey(categoryKey: string | number, year: number): string {
  return `${categoryKey}|${year}`;
}

/**
 * Consumption of a single reading under the day/night switch.
 *
 * A 15-minute interval is wholly day or wholly night, so there is nothing to
 * divide: `day` and `night` keep the reading or drop it.
 */
function pickConsumption(value: number, split: ConsumptionSplit, isDaytime: boolean): number {
  if (split === 'day') return isDaytime ? value : 0;
  if (split === 'night') return isDaytime ? 0 : value;
  return value;
}

/** Consumption of an aggregated bucket under the day/night switch. */
function bucketConsumption(bucket: AggregatedData, split: ConsumptionSplit): number {
  if (split === 'day') return bucket.dayNight?.dayConsumption ?? 0;
  if (split === 'night') return bucket.dayNight?.nightConsumption ?? 0;
  return bucket.totalConsumption;
}

/**
 * One year's records reduced to one point per x-axis position.
 *
 * The three aggregation families (raw readings, a time axis, calendar
 * categories) used to build their series separately, which meant every new
 * chart feature had to be written three times. They differ only in how a point
 * gets its key, so that is the only thing left branching.
 */
function buildYearPoints(
  records: EnergyRecord[],
  aggregationType: AggregationType,
  consumptionSplit: ConsumptionSplit,
  isDay: IsDayPredicate | undefined,
  isCompare: boolean,
  year: number
): YearPoint[] {
  if (aggregationType === 'raw') {
    return getRawData(records).map((r) => ({
      key: r.timestamp.getTime(),
      consumption: pickConsumption(
        r.consumption,
        consumptionSplit,
        isDay ? isDay(r.timestamp) : true
      ),
      production: r.production,
    }));
  }

  const aggregate =
    aggregationType === 'hourly'
      ? aggregateByHour
      : aggregationType === 'weekly'
        ? aggregateByWeek
        : aggregationType === 'monthly'
          ? aggregateByMonth
          : aggregateByDay;

  return aggregate(records, isDay).map((bucket) => ({
    key: isTimeAxisAggregation(aggregationType)
      ? bucket.startDate.getTime()
      : chartCategoryKey(bucket.startDate, isCompare, aggregationType, year),
    consumption: bucketConsumption(bucket, consumptionSplit),
    production: bucket.totalProduction,
    split: bucket.dayNight
      ? { day: bucket.dayNight.dayConsumption, night: bucket.dayNight.nightConsumption }
      : undefined,
  }));
}

/**
 * Turns the raw yearly records into the series/x-axis-category shape
 * MainChart needs, for whichever aggregation and years are currently active.
 *
 * With `consumptionBelowAxis` the consumption is emitted **negative**: the two
 * sides of the meter are then mirrored around zero, which reads at a glance,
 * where two upward bars have to be compared to each other. Every consumer
 * multiplies by `plotSign` to get the number back either way, so nothing
 * downstream ever shows a negative kWh.
 *
 * Returns `null` when there is nothing to draw (no data at all, or no year
 * ticked) — callers distinguish the two cases themselves for the empty-state
 * message, since this function does not need to.
 */
export function buildChartSeries({
  yearlyData,
  selectedYears,
  aggregationType,
  showConsumption,
  showProduction,
  dayNightConfig,
  consumptionSplit,
  chartMode,
  consumptionBelowAxis,
}: BuildChartSeriesParams): BuiltChartSeries | null {
  if (selectedYears.length === 0 || yearlyData.size === 0) {
    return null;
  }

  const series: ChartSeriesDef[] = [];
  const allDates = new Set<string>();
  const splitByKey = new Map<string, DayNightHalves>();

  // Built once, not per record: each call is a date key plus a map lookup, so
  // it is only worth it when a half of the day is actually asked for.
  const isDay = consumptionSplit === 'sum' ? undefined : createIsDayPredicate(dayNightConfig);

  const latestSelectedYear = Math.max(...selectedYears);
  const isCompare = selectedYears.length > 1;
  const isTimeAxis = isTimeAxisAggregation(aggregationType);
  /** Bought energy points down only when the user asked for the mirror. */
  const boughtSign: 1 | -1 = consumptionBelowAxis ? -1 : 1;

  selectedYears.forEach((year, yearIndex) => {
    const yearData = yearlyData.get(year);
    if (!yearData) return;

    const points = buildYearPoints(
      yearData.records,
      aggregationType,
      consumptionSplit,
      isDay,
      isCompare,
      year
    );

    for (const point of points) {
      if (typeof point.key === 'string') allDates.add(point.key);
      // Only `both` shows the halves; the clipping modes have already been
      // applied to the value itself.
      if (consumptionSplit === 'both' && point.split) {
        splitByKey.set(splitLookupKey(point.key, year), point.split);
      }
    }

    const dashed = isCompare && year !== latestSelectedYear;
    const push = (
      quantity: SeriesQuantity,
      plotSign: 1 | -1,
      value: (point: YearPoint) => number
    ) => {
      series.push({
        name: chartSeriesName(quantity, year, isCompare),
        type: isTimeAxis ? 'line' : 'bar',
        data: points.map((point) => [point.key, plotSign * value(point)]),
        color: chartSeriesColor(quantity, isCompare, yearIndex),
        ...(isTimeAxis ? { areaStyle: { opacity: 0.1 }, lineDashed: dashed } : {}),
        quantity,
        year,
        plotSign,
        legendLabel: chartSeriesLabel(year),
      });
    };

    if (chartMode === 'net') {
      // One convention for the whole app: "dokoupená energie" is what the
      // meter bought, so it is positive and it follows the consumption side of
      // the axis. The other direction means the export outweighed the import.
      push('net', boughtSign, (point) => point.consumption - point.production);
      return;
    }

    if (showConsumption) push('consumption', boughtSign, (point) => point.consumption);
    if (showProduction) push('production', 1, (point) => point.production);
  });

  return { series, dates: Array.from(allDates).sort(), splitByKey };
}

/**
 * Mean of every point of the given series, in plot values.
 *
 * Taken over the series the chart actually draws, not over everything built:
 * an average that counted a year hidden in the filter would sit at a level the
 * user cannot see the reason for. `null` when there is nothing to average.
 */
export function seriesAverage(series: ChartSeriesDef[]): number | null {
  let sum = 0;
  let count = 0;
  for (const one of series) {
    for (const [, value] of one.data) {
      sum += value;
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

/**
 * Aggregations whose x-axis unit repeats every year — a month or a week of the
 * year is the same unit in 2022 as in 2025, so the years can be put side by
 * side on it. A day cannot: 365 units of one day each say nothing when
 * compared, and the axis would need a tooltip per calendar date.
 */
export function isComparableUnitAggregation(type: AggregationType): boolean {
  return type === 'weekly' || type === 'monthly';
}

export interface UnitYearValue {
  year: number;
  value: number;
  /** Series color when the chart draws this year, `null` when it does not. */
  color: string | null;
  /** Difference from the unit's average in per cent; `null` if the average is 0. */
  vsAverage: number | null;
  /**
   * Which days this year's value covers — "30. 6. – 6. 7.". Weekly only: the
   * Monday of a week moves from year to year, so the band alone does not say
   * what was summed. A month needs no range, its name is the range.
   */
  rangeLabel?: string;
}

export interface UnitQuantityComparison {
  rows: UnitYearValue[];
  average: number;
}

export interface UnitComparison {
  /** Which unit this is: "Červenec", "27. týden". */
  label: string;
  consumption: UnitQuantityComparison;
  production: UnitQuantityComparison;
  /** Import minus export: below zero the unit ended with a surplus. */
  net: UnitQuantityComparison;
  // (Same sign convention as the chart's net series: positive = bought.)
  /** Halves of the consumption, for the `both` switch. */
  consumptionDay: UnitQuantityComparison;
  consumptionNight: UnitQuantityComparison;
}

export interface BuildUnitComparisonParams {
  yearlyData: Map<number, YearlyData>;
  availableYears: number[];
  selectedYears: number[];
  aggregationType: AggregationType;
  /** Clips the compared consumption the same way it clips the chart. */
  consumptionSplit: ConsumptionSplit;
  dayNightConfig: DayNightConfig;
}

/** One year's totals for one unit, before averages are known. */
interface UnitYearTotals {
  consumption: number;
  production: number;
  dayConsumption: number;
  nightConsumption: number;
  /** First and last day the year's buckets for this unit cover. */
  from: Date;
  to: Date;
}

interface UnitBucket {
  label: string;
  byYear: Map<number, UnitYearTotals>;
}

/**
 * Which unit an aggregated bucket belongs to, and what to call it.
 *
 * The id matches the x-axis category of the comparison view, so the tooltip
 * can look the unit up by what it is hovering. `seriesYear` is the calendar
 * year the bucket's records come from — the same year the chart draws the bar
 * under, which for the two turn-of-the-year fragments is not the year of their
 * ISO week.
 */
function unitOf(
  startDate: Date,
  aggregationType: AggregationType,
  seriesYear: number
): { id: string; label: string } {
  if (aggregationType === 'monthly') {
    const month = startDate.getMonth() + 1;
    return { id: `M${String(month).padStart(2, '0')}`, label: formatMonthName(month) };
  }

  const id = weekUnitId(startDate, seriesYear);
  if (id === WEEK_CARRY_IN_ID) return { id, label: 'Začátek roku – zbytek týdne z prosince' };
  if (id === WEEK_CARRY_OUT_ID) return { id, label: 'Konec roku – začátek lednového týdne' };
  return { id, label: formatWeekName(isoWeek(startDate).week) };
}

function toComparison(
  values: Array<{ year: number; value: number; color: string | null; rangeLabel?: string }>
): UnitQuantityComparison {
  if (values.length === 0) return { rows: [], average: 0 };
  const average = values.reduce((sum, v) => sum + v.value, 0) / values.length;
  return {
    rows: values.map((v) => ({
      year: v.year,
      value: v.value,
      color: v.color,
      rangeLabel: v.rangeLabel,
      vsAverage: average !== 0 ? ((v.value - average) / Math.abs(average)) * 100 : null,
    })),
    average,
  };
}

export interface UnitComparisonIndex {
  /** Lookup by x-axis category — what the tooltip has in hand. */
  byCategory: Map<string, UnitComparison>;
  /** Every unit in calendar order, for the chart's text alternative. */
  units: UnitComparison[];
}

/**
 * Values of one x-axis unit — a month or a week of the year — across **every
 * imported year**, keyed by the axis category the chart draws it at.
 *
 * This is what turns the chart from "what happened" into "how does this July
 * compare": deliberately not limited to the selected years, because the point
 * is to hold a year up against the ones that are not on screen. Years the
 * chart does not draw come without a color, so the tooltip can tell them apart
 * from the ones the user is looking at.
 *
 * Returns `null` for aggregations where a unit does not repeat yearly.
 */
export function buildUnitComparison({
  yearlyData,
  availableYears,
  selectedYears,
  aggregationType,
  consumptionSplit,
  dayNightConfig,
}: BuildUnitComparisonParams): UnitComparisonIndex | null {
  if (!isComparableUnitAggregation(aggregationType) || availableYears.length === 0) {
    return null;
  }

  const aggregate = aggregationType === 'monthly' ? aggregateByMonth : aggregateByWeek;
  const isCompare = selectedYears.length > 1;
  // The comparison has to be clipped the same way the chart is, otherwise the
  // tooltip would answer a different question than the bars it hangs off.
  const isDay = consumptionSplit === 'sum' ? undefined : createIsDayPredicate(dayNightConfig);
  const units = new Map<string, UnitBucket>();
  const categoryToUnit = new Map<string, string>();

  for (const year of availableYears) {
    const data = yearlyData.get(year);
    if (!data) continue;

    const isSelected = selectedYears.includes(year);
    for (const bucket of aggregate(data.records, isDay)) {
      const unit = unitOf(bucket.startDate, aggregationType, year);

      let entry = units.get(unit.id);
      if (!entry) {
        entry = { label: unit.label, byYear: new Map() };
        units.set(unit.id, entry);
      }
      const consumption = bucketConsumption(bucket, consumptionSplit);
      const dayConsumption = bucket.dayNight?.dayConsumption ?? 0;
      const nightConsumption = bucket.dayNight?.nightConsumption ?? 0;

      const yearTotals = entry.byYear.get(year);
      if (yearTotals) {
        // Belt and braces: one year should feed a unit once, and summing is
        // the only safe answer if it ever feeds it twice.
        yearTotals.consumption += consumption;
        yearTotals.production += bucket.totalProduction;
        yearTotals.dayConsumption += dayConsumption;
        yearTotals.nightConsumption += nightConsumption;
        if (bucket.startDate < yearTotals.from) yearTotals.from = bucket.startDate;
        if (bucket.endDate > yearTotals.to) yearTotals.to = bucket.endDate;
      } else {
        entry.byYear.set(year, {
          consumption,
          production: bucket.totalProduction,
          dayConsumption,
          nightConsumption,
          from: bucket.startDate,
          to: bucket.endDate,
        });
      }

      // Only selected years put categories on the axis, so only they can be
      // hovered — but the values above come from all of them.
      if (isSelected) {
        categoryToUnit.set(
          chartCategoryKey(bucket.startDate, isCompare, aggregationType, year),
          unit.id
        );
      }
    }
  }

  const comparisons = new Map<string, UnitComparison>();
  for (const [unitId, entry] of units) {
    const years = Array.from(entry.byYear.keys()).sort((a, b) => a - b);
    const colorOf = (quantity: SeriesQuantity, year: number): string | null => {
      const index = selectedYears.indexOf(year);
      if (index < 0) return null;
      return chartSeriesColor(quantity, isCompare, index);
    };

    // A month's name already says which days it covers; a week's does not.
    const rangeOf = (year: number): string | undefined => {
      if (aggregationType !== 'weekly') return undefined;
      const totals = entry.byYear.get(year)!;
      return `${formatDayMonth(totals.from)} – ${formatDayMonth(totals.to)}`;
    };

    const group = (
      quantity: SeriesQuantity,
      value: (totals: UnitYearTotals) => number
    ): UnitQuantityComparison =>
      toComparison(
        years.map((year) => ({
          year,
          value: value(entry.byYear.get(year)!),
          color: colorOf(quantity, year),
          rangeLabel: rangeOf(year),
        }))
      );

    comparisons.set(unitId, {
      label: entry.label,
      consumption: group('consumption', (t) => t.consumption),
      production: group('production', (t) => t.production),
      net: group('net', (t) => t.consumption - t.production),
      consumptionDay: group('consumption', (t) => t.dayConsumption),
      consumptionNight: group('consumption', (t) => t.nightConsumption),
    });
  }

  // Re-key from unit id to the axis category, which is what the tooltip has.
  const byCategory = new Map<string, UnitComparison>();
  for (const [category, unitId] of categoryToUnit) {
    const comparison = comparisons.get(unitId);
    if (comparison) byCategory.set(category, comparison);
  }

  // Unit ids are zero-padded and prefixed (M01…M12, W01…W53), so sorting them
  // as strings puts the units in calendar order.
  const orderedUnits = Array.from(comparisons.keys())
    .sort()
    .map((unitId) => comparisons.get(unitId)!);

  return { byCategory, units: orderedUnits };
}

export interface UnitComparisonRow {
  unit: string;
  quantity: string;
  year: number;
  value: string;
  average: string;
  vsAverage: string;
}

/**
 * The cross-year comparison as flat, formatted rows for the chart's text
 * alternative — the same numbers the tooltip shows, for readers without a
 * pointer.
 */
export function buildUnitComparisonRows(
  index: UnitComparisonIndex | null,
  options: {
    chartMode: ChartMode;
    consumptionSplit: ConsumptionSplit;
    hasConsumption: boolean;
    hasProduction: boolean;
  }
): UnitComparisonRow[] {
  if (!index) return [];

  const rows: UnitComparisonRow[] = [];
  for (const unit of index.units) {
    for (const group of unitGroups(unit, options)) {
      for (const row of group.comparison.rows) {
        rows.push({
          unit: unit.label,
          quantity: group.label,
          year: row.year,
          value: formatKwh(row.value, 1),
          average: formatKwh(group.comparison.average, 1),
          vsAverage: row.vsAverage === null ? '–' : formatSignedPercent(row.vsAverage),
        });
      }
    }
  }
  return rows;
}

/** Why a chip in the filter is switched off, when it is. */
export type SeriesChipOffReason =
  /** Clicked off in the filter; clicking it again brings the series back. */
  | 'hidden'
  /** The row switch is off — that switch is the way back. */
  | 'quantity-off'
  /** The year is not ticked in "Import dat" — that badge is the way back. */
  | 'year-not-selected';

export interface SeriesFilterChip {
  /** Stable across selections, unlike the series name. */
  key: string;
  quantity: SeriesQuantity;
  year: number;
  /** Series name in the chart; the key `hiddenSeries` stores. */
  seriesName: string;
  label: string;
  color: string;
  /** True when the chart draws this series. */
  active: boolean;
  /** `null` while the chip is active. */
  offReason: SeriesChipOffReason | null;
}

/**
 * Which rows the filter under the chart has.
 *
 * The net view is one series per year, so it has one row and no quantity to
 * switch off. Exported because the filter must not decide this for itself —
 * it would sooner or later disagree with what the chart draws.
 */
export function seriesFilterRows(chartMode: ChartMode): SeriesQuantity[] {
  return chartMode === 'net' ? ['net'] : ['consumption', 'production'];
}

export interface BuildSeriesFilterChipsParams {
  availableYears: number[];
  selectedYears: number[];
  showConsumption: boolean;
  showProduction: boolean;
  chartMode: ChartMode;
  hiddenSeries: string[];
}

/**
 * One chip per series the user could look at — every imported year, not just
 * the ones currently drawn.
 *
 * A chip that is off because its row switch is off or because its year is not
 * ticked in "Import dat" stays in the row, greyed out: dropping it would make
 * the filter jump around as the user works, and the row is where they look to
 * find out what is missing from the chart.
 */
export function buildSeriesFilterChips({
  availableYears,
  selectedYears,
  showConsumption,
  showProduction,
  chartMode,
  hiddenSeries,
}: BuildSeriesFilterChipsParams): SeriesFilterChip[] {
  const isCompare = selectedYears.length > 1;
  const chips: SeriesFilterChip[] = [];

  const rows = seriesFilterRows(chartMode);
  const quantityOn: Record<SeriesQuantity, boolean> = {
    consumption: showConsumption,
    production: showProduction,
    net: true,
  };

  for (const quantity of rows) {
    for (const year of availableYears) {
      const selectedIndex = selectedYears.indexOf(year);
      const isSelected = selectedIndex >= 0;
      const seriesName = chartSeriesName(quantity, year, isCompare);

      const offReason: SeriesChipOffReason | null = !quantityOn[quantity]
        ? 'quantity-off'
        : !isSelected
          ? 'year-not-selected'
          : hiddenSeries.includes(seriesName)
            ? 'hidden'
            : null;

      chips.push({
        key: `${quantity}-${year}`,
        quantity,
        year,
        seriesName,
        label: chartSeriesLabel(year),
        // An unselected year has no place in the year palette yet, so it
        // shows the semantic color of its quantity.
        color: chartSeriesColor(
          quantity,
          isCompare && isSelected,
          isSelected ? selectedIndex : 0
        ),
        active: offReason === null,
        offReason,
      });
    }
  }

  return chips;
}

/**
 * Night bands for a date range: one pair per day, from the previous day's end
 * of daylight to this day's start of daylight.
 *
 * Uses the same day window as the bar split, so a manual 06:00–20:00 setting
 * bands the same hours the statistics count as night. Returns `[]` for ranges
 * over 400 days, where a band per day would be unreadable anyway.
 */
export function computeNightMarkAreas(
  startDate: Date,
  endDate: Date,
  config: DayNightConfig
): Array<[{ xAxis: number }, { xAxis: number }]> {
  const areas: Array<[{ xAxis: number }, { xAxis: number }]> = [];
  const daysSpan = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysSpan > 400) return areas;

  const resolved = resolveDayNightConfig(config);
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);

  while (cur <= endDate) {
    const today = getDayBounds(formatLocalDateKey(cur), resolved);
    const prevDay = new Date(cur);
    prevDay.setDate(prevDay.getDate() - 1);
    const previous = getDayBounds(formatLocalDateKey(prevDay), resolved);

    const from = previous.dayEnd.getTime();
    const to = today.dayStart.getTime();
    if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
      areas.push([{ xAxis: from }, { xAxis: to }]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return areas;
}

/** How many leading/trailing points of each series go into the a11y summary. */
export const SUMMARY_EDGE_POINTS = 5;

export interface AccessibleSeriesSummary {
  name: string;
  total: string;
  min: string;
  max: string;
  count: number;
  firstPoints: string;
  lastPoints: string;
}

/** X-axis values are either a timestamp (time axis) or a date-ish category key. */
function formatPointLabel(x: string | number): string {
  if (typeof x === 'number') return formatDateTime(new Date(x));
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return formatDate(parseLocalDateKey(x));
  return x; // e.g. multi-year "MM-DD" comparison key
}

function joinPoints(points: Array<[string | number, number]>): string {
  return points.map(([x, y]) => `${formatPointLabel(x)}: ${formatKwh(y, 2)}`).join('; ');
}

/**
 * Screen-reader alternative to the canvas: a per-series summary (total, min,
 * max) plus the first/last few points, instead of dumping every one of the
 * (potentially tens of thousands of) rendered points into the DOM.
 */
export function buildAccessibleChartSummary(
  chartData: BuiltChartSeries | null
): AccessibleSeriesSummary[] {
  if (!chartData) return [];
  return chartData.series.map((s) => {
    // Consumption is plotted below zero; the summary talks energy, not
    // geometry, so the sign comes back out here.
    const points: Array<[string | number, number]> = s.data.map(([key, value]) => [
      key,
      value * s.plotSign,
    ]);
    const values = points.map((d) => d[1]);
    const total = values.reduce((sum, v) => sum + v, 0);
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    return {
      name: s.name,
      total: formatKwh(total),
      min: formatKwh(min, 2),
      max: formatKwh(max, 2),
      count: points.length,
      firstPoints: joinPoints(points.slice(0, SUMMARY_EDGE_POINTS)),
      lastPoints: joinPoints(points.slice(-SUMMARY_EDGE_POINTS)),
    };
  });
}

/** Shape ECharts passes to an `axis`-trigger tooltip formatter. */
interface TooltipPoint {
  axisValue?: string | number;
  axisValueLabel?: string;
  seriesName?: string;
  color?: string;
  value?: number | [string | number, number];
}

/**
 * What the tooltip needs to know beyond the hovered point.
 *
 * The formatter only gets series names and plot values from ECharts, so the
 * sign convention, the day/night halves and the cross-year comparison all have
 * to be handed to it.
 */
export interface ChartTooltipContext {
  /** Cross-year comparison of the hovered unit; `null` outside week/month. */
  unitComparison: UnitComparisonIndex | null;
  /** The series the chart draws, for the quantity and sign behind a name. */
  series: ChartSeriesDef[];
  /** Day and night halves per bucket, filled only for the `both` switch. */
  splitByKey: Map<string, DayNightHalves>;
  consumptionSplit: ConsumptionSplit;
  chartMode: ChartMode;
}

/** ▲ above the average, ▼ below it, nothing when it sits on it. */
function trendMark(vsAverage: number | null): string {
  if (vsAverage === null) return '';
  const signed = formatSignedPercent(vsAverage);
  if (!signed.startsWith('+') && !signed.startsWith('−')) return '';
  return `${signed.startsWith('+') ? '▲' : '▼'} ${signed}`;
}

function unitQuantityRows(label: string, quantity: UnitQuantityComparison): string {
  if (quantity.rows.length === 0) return '';

  const header =
    `<tr><td colspan="3" style="padding:6px 0 2px;opacity:0.75">${label}</td></tr>`;
  const rows = quantity.rows
    .map((row) => {
      // No color means the chart is not drawing that year right now: it is here
      // for the comparison, so it gets a hollow marker instead of a series dot.
      const marker = row.color
        ? `<span style="color:${row.color}">●</span>`
        : `<span style="opacity:0.5">○</span>`;
      const dim = row.color ? '' : 'opacity:0.6;';
      // The week's own Monday–Sunday span, because it differs per year: the
      // band says "week 27", the row says which seven days that was.
      const range = row.rangeLabel
        ? ` <span style="opacity:0.6">${row.rangeLabel}</span>`
        : '';
      return (
        `<tr style="${dim}">` +
        `<td style="padding-right:8px;white-space:nowrap">${marker} ${row.year}${range}</td>` +
        `<td style="text-align:right;padding-right:8px">${formatKwh(row.value, 1)}</td>` +
        `<td style="text-align:right;white-space:nowrap">${trendMark(row.vsAverage)}</td>` +
        `</tr>`
      );
    })
    .join('');
  const average =
    `<tr style="opacity:0.75">` +
    `<td style="padding-right:8px">Ø ${quantity.rows.length} let</td>` +
    `<td style="text-align:right;padding-right:8px">${formatKwh(quantity.average, 1)}</td>` +
    `<td></td></tr>`;

  return header + rows + average;
}

/** Label of the day and night halves, when the `both` switch asks for them. */
export const CONSUMPTION_DAY_LABEL = 'Spotřeba ve dne';
export const CONSUMPTION_NIGHT_LABEL = 'Spotřeba v noci';

export interface UnitGroup {
  label: string;
  comparison: UnitQuantityComparison;
}

/**
 * Which groups of a unit the user should see.
 *
 * Shared by the tooltip and the chart's text alternative so the two cannot
 * describe the same hover differently: the net view has one group, the balance
 * view has whichever quantities are drawn, and the `both` switch adds the two
 * halves of the consumption.
 */
export function unitGroups(
  unit: UnitComparison,
  options: {
    chartMode: ChartMode;
    consumptionSplit: ConsumptionSplit;
    hasConsumption: boolean;
    hasProduction: boolean;
  }
): UnitGroup[] {
  if (options.chartMode === 'net') {
    return [{ label: QUANTITY_LABEL.net, comparison: unit.net }];
  }

  const groups: UnitGroup[] = [];
  if (options.hasConsumption) {
    groups.push({ label: QUANTITY_LABEL.consumption, comparison: unit.consumption });
    if (options.consumptionSplit === 'both') {
      groups.push({ label: CONSUMPTION_DAY_LABEL, comparison: unit.consumptionDay });
      groups.push({ label: CONSUMPTION_NIGHT_LABEL, comparison: unit.consumptionNight });
    }
  }
  if (options.hasProduction) {
    groups.push({ label: QUANTITY_LABEL.production, comparison: unit.production });
  }
  return groups;
}

/** Energy behind a plot value: the chart draws consumption below zero. */
function energyOf(plotValue: number, plotSign: 1 | -1): number {
  return plotValue * plotSign;
}

/**
 * Tooltip formatter for the chart.
 *
 * On the weekly and monthly views it answers "how does this month compare?":
 * the hovered unit's totals for **every imported year**, the average across
 * them, and how far each year sits from that average. Everywhere else it lists
 * the hovered series, which is all a single day or hour can say — plus the day
 * and night halves when the switch asks for them.
 */
export function createChartTooltipFormatter(
  context: ChartTooltipContext
): (params: unknown) => string {
  const byName = new Map(context.series.map((one) => [one.name, one]));
  const hasConsumption = context.series.some((one) => one.quantity === 'consumption');
  const hasProduction = context.series.some((one) => one.quantity === 'production');

  const perSeriesTooltip = (points: TooltipPoint[]): string => {
    let tooltip = `<strong>${points[0].axisValueLabel ?? ''}</strong><br/>`;
    for (const point of points) {
      const raw = point.value;
      const plotValue =
        typeof raw === 'number' ? raw : Array.isArray(raw) ? Number(raw[1]) || 0 : 0;
      const definition = point.seriesName ? byName.get(point.seriesName) : undefined;
      const energy = energyOf(plotValue, definition?.plotSign ?? 1);

      tooltip +=
        `<span style="color:${point.color}">●</span> ${point.seriesName}: ` +
        `${formatKwh(energy, 2)}<br/>`;

      // `both` leaves the bars alone and puts the division here.
      const key = definition ? splitLookupKey(point.axisValue ?? '', definition.year) : '';
      const halves = context.consumptionSplit === 'both' && key ? context.splitByKey.get(key) : undefined;
      if (halves && definition?.quantity === 'consumption') {
        tooltip +=
          `<span style="opacity:0.7">&nbsp;&nbsp;ve dne ${formatKwh(halves.day, 2)}` +
          ` · v noci ${formatKwh(halves.night, 2)}</span><br/>`;
      }
    }
    return tooltip;
  };

  return (params: unknown): string => {
    if (!Array.isArray(params) || params.length === 0) return '';
    const points = params as TooltipPoint[];

    const category = points[0].axisValue;
    const unit =
      context.unitComparison && typeof category === 'string'
        ? context.unitComparison.byCategory.get(category)
        : undefined;
    if (!unit) return perSeriesTooltip(points);

    const body = unitGroups(unit, {
      chartMode: context.chartMode,
      consumptionSplit: context.consumptionSplit,
      hasConsumption,
      hasProduction,
    })
      .map((group) => unitQuantityRows(group.label, group.comparison))
      .join('');
    if (!body) return '';

    return (
      `<strong>${unit.label}</strong> <span style="opacity:0.6">— všechny roky</span>` +
      `<table style="border-collapse:collapse;font-variant-numeric:tabular-nums">${body}</table>`
    );
  };
}

/**
 * Last moment of the bucket that starts on `start`.
 *
 * A category names the first day of its period, so a range that ends on a
 * category has to be stretched over the rest of it — a month is not one day.
 */
function endOfPeriod(start: Date, aggregationType: AggregationType): Date {
  if (aggregationType === 'monthly') {
    return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  if (aggregationType === 'weekly') {
    return new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 6,
      23,
      59,
      59,
      999
    );
  }
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
}

/**
 * An area of the x-axis, as ECharts reports it: `coordRange` in axis values on
 * a time axis, `range` in category indices otherwise.
 */
export interface BrushAreaLike {
  coordRange?: [number | string, number | string];
  range?: [number, number];
}

/**
 * Converts an area of the x-axis into a concrete date range, or `null` when it
 * cannot mean one (empty area, malformed range, a multi-year category-axis
 * comparison where an index does not map to a single date).
 *
 * The brush tool it was written for is gone — the zoom window is the selection
 * now — but the conversion is the same, so `computeZoomDateRange` builds on it.
 */
export function computeBrushDateRange(
  area: BrushAreaLike | undefined,
  aggregationType: AggregationType,
  selectedYearsCount: number,
  dates: string[]
): { start: Date; end: Date } | null {
  if (!area) return null;
  const range = area.coordRange ?? area.range;
  if (!range || range.length < 2) return null;

  const isTimeAxis = isTimeAxisAggregation(aggregationType);

  // Multi-year compare with category axis: no meaningful date range.
  if (!isTimeAxis && selectedYearsCount > 1) return null;

  let startMs: number | null = null;
  let endMs: number | null = null;

  if (isTimeAxis) {
    // Time axis: coordRange is [startMs, endMs] (numbers). Numeric compare.
    const [s, e] = range as [number | string, number | string];
    const sNum = typeof s === 'number' ? s : Number(s);
    const eNum = typeof e === 'number' ? e : Number(e);
    if (Number.isFinite(sNum) && Number.isFinite(eNum)) {
      startMs = Math.min(sNum, eNum);
      endMs = Math.max(sNum, eNum);
    }
  } else {
    // Category axis (single year only) — convert indices to dates.
    if (dates.length === 0) return null;
    const [si, ei] = range as [number, number];
    const startIdx = Math.max(0, Math.min(dates.length - 1, Math.floor(Math.min(si, ei))));
    const endIdx = Math.max(0, Math.min(dates.length - 1, Math.ceil(Math.max(si, ei))));
    const startKey = dates[startIdx];
    const endKey = dates[endIdx];
    if (!startKey || !endKey) return null;
    // Single-year category keys are YYYY-MM-DD (parseLocalDateKey) and name the
    // FIRST day of the bucket. The range has to reach the end of the last
    // bucket, otherwise selecting through September would keep 1. 9. alone.
    const startDate = parseLocalDateKey(startKey);
    const endDate = endOfPeriod(parseLocalDateKey(endKey), aggregationType);
    startMs = startDate.getTime();
    endMs = endDate.getTime();
  }

  if (
    startMs === null ||
    endMs === null ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs >= endMs
  ) {
    return null;
  }

  return { start: new Date(startMs), end: new Date(endMs) };
}

/** The zoom window ECharts reports for the x-axis after a zoom or a pan. */
export interface ZoomWindowLike {
  /** Timestamp on a time axis, category index on a category axis. */
  startValue?: number | string;
  endValue?: number | string;
  /** Percentage of the full extent; tells a zoom apart from the whole range. */
  start?: number;
  end?: number;
}

/** True while the chart shows less than the whole range. */
export function isZoomedWindow(window: ZoomWindowLike | null | undefined): boolean {
  if (!window) return false;
  // A hair of tolerance: dragging the slider back to the edge lands on
  // 0.0001 rather than exactly 0.
  return (window.start ?? 0) > 0.05 || (window.end ?? 100) < 99.95;
}

/**
 * The date range the chart is currently zoomed to.
 *
 * This is what makes the zoom the selection: the range the user narrowed the
 * chart to is the range the statistics and the battery simulation can follow,
 * so there is nothing left to draw with a brush tool.
 *
 * `null` when the window cannot mean a single range: several years share a
 * month-day axis, where a category index belongs to every selected year at
 * once and no interval of real time exists.
 */
export function computeZoomDateRange(
  window: ZoomWindowLike | undefined,
  aggregationType: AggregationType,
  selectedYearsCount: number,
  dates: string[]
): { start: Date; end: Date } | null {
  if (!window || window.startValue === undefined || window.endValue === undefined) {
    return null;
  }

  if (isTimeAxisAggregation(aggregationType)) {
    return computeBrushDateRange(
      { coordRange: [Number(window.startValue), Number(window.endValue)] },
      aggregationType,
      selectedYearsCount,
      dates
    );
  }

  if (selectedYearsCount > 1) return null;
  return computeBrushDateRange(
    { range: [Number(window.startValue), Number(window.endValue)] },
    aggregationType,
    selectedYearsCount,
    dates
  );
}

/**
 * How the zoomed range reads above the chart: "1. 6. 2025 – 31. 8. 2025".
 *
 * Comparing years has no such range (see `computeZoomDateRange`), so the
 * categories name themselves instead — "20. týden – 30. týden" says what is on
 * screen even though it is four years at once.
 */
export function formatZoomWindowLabel(
  window: ZoomWindowLike | undefined,
  aggregationType: AggregationType,
  selectedYearsCount: number,
  dates: string[]
): string | null {
  const range = computeZoomDateRange(window, aggregationType, selectedYearsCount, dates);
  if (range) return `${formatDate(range.start)} – ${formatDate(range.end)}`;

  if (
    !window ||
    window.startValue === undefined ||
    window.endValue === undefined ||
    isTimeAxisAggregation(aggregationType) ||
    dates.length === 0
  ) {
    return null;
  }

  const isCompare = selectedYearsCount > 1;
  const first = Math.max(0, Math.min(dates.length - 1, Math.floor(Number(window.startValue))));
  const last = Math.max(0, Math.min(dates.length - 1, Math.ceil(Number(window.endValue))));
  const from = formatCategoryAxisLabel(dates[first], isCompare, aggregationType);
  const to = formatCategoryAxisLabel(dates[last], isCompare, aggregationType);
  return from === to ? from : `${from} – ${to}`;
}

/**
 * Night-band `markArea` for the first series of a time-axis, single-year
 * chart, or `undefined` when there is nothing to show (toggle off, no data,
 * or a range with no night bands).
 */
export function buildNightMarkArea(
  chartData: BuiltChartSeries,
  config: DayNightConfig
):
  | {
      silent: true;
      itemStyle: { color: string };
      data: ReturnType<typeof computeNightMarkAreas>;
    }
  | undefined {
  const firstSeries = chartData.series[0];
  if (!firstSeries || firstSeries.data.length === 0) return undefined;

  const firstX = firstSeries.data[0][0];
  const lastX = firstSeries.data[firstSeries.data.length - 1][0];
  const minT = typeof firstX === 'number' ? firstX : new Date(firstX as string).getTime();
  const maxT = typeof lastX === 'number' ? lastX : new Date(lastX as string).getTime();
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return undefined;

  const areas = computeNightMarkAreas(new Date(minT), new Date(maxT), config);
  if (areas.length === 0) return undefined;

  return {
    silent: true,
    // Violet = "night depth" per DESIGN.md.
    itemStyle: { color: withAlpha(CHART_PALETTE.violet, 0.14) },
    data: areas,
  };
}
