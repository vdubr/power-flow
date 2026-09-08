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
  DayNightData,
  DayNightConfig,
  LocationConfig,
  YearlyData,
} from '../types/energy';
import {
  aggregateByDay,
  aggregateByHour,
  aggregateByWeek,
  aggregateByMonth,
  aggregateByDayNight,
  getRawData,
} from './dataAggregation';
import { getDefaultLocation, getSunTimes } from './sunCalculations';
import { formatLocalDateKey, parseLocalDateKey } from './dateUtils';
import { CHART_PALETTE, YEAR_SERIES_COLORS, withAlpha } from '../theme/echartsTheme';
import { formatKwh, formatDateTime, formatDate } from './format';

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
  data: Array<[string | number, number]>;
  color: string;
  areaStyle?: { opacity: number };
  stack?: string;
  lineDashed?: boolean;
}

export interface BuiltChartSeries {
  series: ChartSeriesDef[];
  dates: string[];
}

export interface BuildChartSeriesParams {
  yearlyData: Map<number, YearlyData>;
  selectedYears: number[];
  aggregationType: AggregationType;
  showConsumption: boolean;
  showProduction: boolean;
  dayNightConfig: DayNightConfig;
}

/**
 * Turns the raw yearly records into the series/x-axis-category shape
 * MainChart needs, for whichever aggregation and years are currently active.
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
}: BuildChartSeriesParams): BuiltChartSeries | null {
  if (selectedYears.length === 0 || yearlyData.size === 0) {
    return null;
  }

  const series: ChartSeriesDef[] = [];
  const allDates = new Set<string>();

  const latestSelectedYear = Math.max(...selectedYears);
  const isCompare = selectedYears.length > 1;

  selectedYears.forEach((year, yearIndex) => {
    const yearData = yearlyData.get(year);
    if (!yearData) return;

    const records = yearData.records;

    let aggregated: AggregatedData[] | DayNightData[] | EnergyRecord[];

    switch (aggregationType) {
      case 'raw':
        aggregated = getRawData(records); // Downsampled to MAX_RAW_CHART_POINTS
        break;
      case 'hourly':
        aggregated = aggregateByHour(records);
        break;
      case 'dayNight':
        aggregated = aggregateByDayNight(
          records,
          dayNightConfig,
          dayNightConfig.mode === 'sun' ? dayNightConfig.location || getDefaultLocation() : undefined
        );
        break;
      case 'daily':
        aggregated = aggregateByDay(records);
        break;
      case 'weekly':
        aggregated = aggregateByWeek(records);
        break;
      case 'monthly':
        aggregated = aggregateByMonth(records);
        break;
      default:
        aggregated = aggregateByDay(records);
    }

    const dashed = isCompare && year !== latestSelectedYear;
    const yearColor = isCompare ? YEAR_SERIES_COLORS[yearIndex % YEAR_SERIES_COLORS.length] : null;

    if (aggregationType === 'raw') {
      const rawData = aggregated as EnergyRecord[];

      if (showConsumption) {
        const consumptionData: Array<[number, number]> = rawData.map((r) => [
          r.timestamp.getTime(),
          r.consumption,
        ]);
        series.push({
          name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
          type: 'line',
          data: consumptionData,
          color: yearColor || CHART_PALETTE.consumption,
          areaStyle: { opacity: 0.1 },
          lineDashed: dashed,
        });
      }

      if (showProduction) {
        const productionData: Array<[number, number]> = rawData.map((r) => [
          r.timestamp.getTime(),
          r.production,
        ]);
        series.push({
          name: isCompare ? `Výroba ${year}` : 'Výroba',
          type: 'line',
          data: productionData,
          color: yearColor ? withAlpha(yearColor, 0.53) : CHART_PALETTE.production,
          areaStyle: { opacity: 0.1 },
          lineDashed: dashed,
        });
      }
    } else if (aggregationType === 'hourly') {
      const aggData = aggregated as AggregatedData[];

      if (showConsumption) {
        const consumptionData: Array<[number, number]> = aggData.map((d) => [
          d.startDate.getTime(),
          d.totalConsumption,
        ]);
        series.push({
          name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
          type: 'line',
          data: consumptionData,
          color: yearColor || CHART_PALETTE.consumption,
          areaStyle: { opacity: 0.1 },
          lineDashed: dashed,
        });
      }

      if (showProduction) {
        const productionData: Array<[number, number]> = aggData.map((d) => [
          d.startDate.getTime(),
          d.totalProduction,
        ]);
        series.push({
          name: isCompare ? `Výroba ${year}` : 'Výroba',
          type: 'line',
          data: productionData,
          color: yearColor ? withAlpha(yearColor, 0.53) : CHART_PALETTE.production,
          areaStyle: { opacity: 0.1 },
          lineDashed: dashed,
        });
      }
    } else if (aggregationType === 'dayNight') {
      const dayNightData = aggregated as DayNightData[];

      dayNightData.forEach((d) => {
        allDates.add(formatLocalDateKey(d.date));
      });

      if (showConsumption) {
        series.push({
          name: `Den - Spotřeba ${year}`,
          type: 'bar',
          stack: `consumption-${year}`,
          data: dayNightData.map((d) => [formatLocalDateKey(d.date), d.dayConsumption]),
          color: CHART_PALETTE.consumption,
        });
        series.push({
          name: `Noc - Spotřeba ${year}`,
          type: 'bar',
          stack: `consumption-${year}`,
          data: dayNightData.map((d) => [formatLocalDateKey(d.date), d.nightConsumption]),
          color: withAlpha(CHART_PALETTE.consumption, 0.3),
        });
      }

      if (showProduction) {
        series.push({
          name: `Den - Výroba ${year}`,
          type: 'bar',
          stack: `production-${year}`,
          data: dayNightData.map((d) => [formatLocalDateKey(d.date), d.dayProduction]),
          color: CHART_PALETTE.production,
        });
        series.push({
          name: `Noc - Výroba ${year}`,
          type: 'bar',
          stack: `production-${year}`,
          data: dayNightData.map((d) => [formatLocalDateKey(d.date), d.nightProduction]),
          color: withAlpha(CHART_PALETTE.production, 0.3),
        });
      }
    } else {
      const aggData = aggregated as AggregatedData[];

      // For multi-year comparison, normalize dates to same year for overlay
      const normalizeDate = (date: Date): string => {
        if (isCompare) {
          // Use month-day format for comparison
          return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
        return formatLocalDateKey(date);
      };

      if (showConsumption) {
        const consumptionData: Array<[string, number]> = aggData.map((d) => {
          const dateKey = normalizeDate(d.startDate);
          allDates.add(dateKey);
          return [dateKey, d.totalConsumption];
        });
        series.push({
          name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
          type: aggregationType === 'monthly' ? 'bar' : 'line',
          data: consumptionData,
          color: yearColor || CHART_PALETTE.consumption,
          areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
          lineDashed: aggregationType !== 'monthly' ? dashed : undefined,
        });
      }

      if (showProduction) {
        const productionData: Array<[string, number]> = aggData.map((d) => {
          const dateKey = normalizeDate(d.startDate);
          allDates.add(dateKey);
          return [dateKey, d.totalProduction];
        });
        series.push({
          name: isCompare ? `Výroba ${year}` : 'Výroba',
          type: aggregationType === 'monthly' ? 'bar' : 'line',
          data: productionData,
          color: yearColor ? withAlpha(yearColor, 0.53) : CHART_PALETTE.production,
          areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
          lineDashed: aggregationType !== 'monthly' ? dashed : undefined,
        });
      }
    }
  });

  return { series, dates: Array.from(allDates).sort() };
}

/**
 * Compute night-time markArea pairs ([{xAxis: nightStart}, {xAxis: nightEnd}])
 * for a date range. Each pair represents the night band from the previous day's
 * sunset to the current day's sunrise. Returns [] if range > 400 days
 * (performance guard).
 */
export function computeSunMarkAreas(
  startDate: Date,
  endDate: Date,
  location: LocationConfig
): Array<[{ xAxis: number }, { xAxis: number }]> {
  const areas: Array<[{ xAxis: number }, { xAxis: number }]> = [];
  const daysSpan = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysSpan > 400) return areas;

  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  while (cur <= endDate) {
    const sun = getSunTimes(cur, location);
    // Night band: from previous sunset to today's sunrise
    const prevDay = new Date(cur);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevSun = getSunTimes(prevDay, location);
    if (
      prevSun.sunset instanceof Date &&
      !Number.isNaN(prevSun.sunset.getTime()) &&
      sun.sunrise instanceof Date &&
      !Number.isNaN(sun.sunrise.getTime())
    ) {
      areas.push([
        { xAxis: prevSun.sunset.getTime() },
        { xAxis: sun.sunrise.getTime() },
      ]);
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
    const values = s.data.map((d) => d[1]);
    const total = values.reduce((sum, v) => sum + v, 0);
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    return {
      name: s.name,
      total: formatKwh(total),
      min: formatKwh(min, 2),
      max: formatKwh(max, 2),
      count: s.data.length,
      firstPoints: joinPoints(s.data.slice(0, SUMMARY_EDGE_POINTS)),
      lastPoints: joinPoints(s.data.slice(-SUMMARY_EDGE_POINTS)),
    };
  });
}

/** Shape ECharts passes to an `axis`-trigger tooltip formatter. */
interface TooltipPoint {
  axisValueLabel?: string;
  seriesName?: string;
  color?: string;
  value?: number | [string | number, number];
}

/**
 * Builds the tooltip HTML for the chart's axis-trigger tooltip. Pure so the
 * markup (and the fact that it goes through `formatKwh`, not `toFixed`) can
 * be unit tested without mounting ECharts.
 */
export function formatChartTooltip(params: unknown): string {
  if (!Array.isArray(params) || params.length === 0) return '';
  const points = params as TooltipPoint[];

  let tooltip = `<strong>${points[0].axisValueLabel ?? ''}</strong><br/>`;
  points.forEach((p) => {
    const raw = p.value;
    const value = typeof raw === 'number' ? raw : Array.isArray(raw) ? Number(raw[1]) || 0 : 0;
    tooltip += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${formatKwh(value, 2)}<br/>`;
  });
  return tooltip;
}

/** What ECharts passes to a `brushEnd` event handler for a single brushed area. */
export interface BrushAreaLike {
  coordRange?: [number | string, number | string];
  range?: [number, number];
}

/**
 * Converts a brushed chart area into a concrete date range, or `null` if the
 * brush selection cannot be resolved (empty area, malformed range, a
 * multi-year category-axis comparison where indices don't map to one date).
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
    // Single-year category keys are YYYY-MM-DD (parseLocalDateKey)
    const startDate = parseLocalDateKey(startKey);
    const endDate = parseLocalDateKey(endKey);
    // Make endDate inclusive (end of day)
    endDate.setHours(23, 59, 59, 999);
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

/**
 * Night-band `markArea` for the first series of a time-axis, single-year
 * chart, or `undefined` when there is nothing to show (overlay off, no
 * data, or the computed range has no night bands).
 *
 * Takes just the location (not the whole `DayNightConfig`) so callers can
 * depend on `dayNightConfig.location` alone — the mode/manual times do not
 * affect this overlay and should not trigger a recompute.
 */
export function buildNightMarkArea(
  chartData: BuiltChartSeries,
  location: LocationConfig | undefined
): { silent: true; itemStyle: { color: string }; data: ReturnType<typeof computeSunMarkAreas> } | undefined {
  const firstSeries = chartData.series[0];
  if (!firstSeries || firstSeries.data.length === 0) return undefined;

  const firstX = firstSeries.data[0][0];
  const lastX = firstSeries.data[firstSeries.data.length - 1][0];
  const minT = typeof firstX === 'number' ? firstX : new Date(firstX as string).getTime();
  const maxT = typeof lastX === 'number' ? lastX : new Date(lastX as string).getTime();
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return undefined;

  const areas = computeSunMarkAreas(new Date(minT), new Date(maxT), location || getDefaultLocation());
  if (areas.length === 0) return undefined;

  return {
    silent: true,
    // Violet = "night depth" per DESIGN.md.
    itemStyle: { color: withAlpha(CHART_PALETTE.violet, 0.14) },
    data: areas,
  };
}
