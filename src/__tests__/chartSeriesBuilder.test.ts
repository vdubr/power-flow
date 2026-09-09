import { describe, it, expect } from 'vitest';
import {
  isTimeAxisAggregation,
  buildChartSeries,
  buildAccessibleChartSummary,
  computeBrushDateRange,
  computeNightMarkAreas,
} from '../utils/chartSeriesBuilder';
import { calculateYearStatistics, computeHasFlags } from '../utils/energyData';
import {
  AggregationType,
  DayNightConfig,
  EnergyRecord,
  YearlyData,
} from '../types/energy';
import { getDefaultLocation } from '../utils/sunCalculations';

/**
 * The chart's data shaping lives here as a pure function, so it can be checked
 * without a canvas. These tests pin the contract MainChart relies on: one
 * x-axis category for every point, keys that actually match the categories,
 * and a screen-reader summary that describes the same numbers.
 */

const dayNight: DayNightConfig = {
  mode: 'manual',
  manualDayStart: '06:00',
  manualDayEnd: '20:00',
};

/** A year of quarter-hourly records, one surplus and one deficit slot per day. */
function makeYear(year: number, days = 40): YearlyData {
  const records: EnergyRecord[] = [];
  for (let d = 0; d < days; d++) {
    const base = new Date(year, 0, 1 + d);
    records.push({
      timestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0),
      consumption: 0.2,
      production: 3,
    });
    records.push({
      timestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 21, 0),
      consumption: 2,
      production: 0,
    });
  }
  const { hasProduction, hasConsumption } = computeHasFlags(records);
  return {
    year,
    records,
    statistics: calculateYearStatistics(records, year),
    hasProduction,
    hasConsumption,
  };
}

const oneYear = new Map<number, YearlyData>([[2022, makeYear(2022)]]);
const twoYears = new Map<number, YearlyData>([
  [2022, makeYear(2022)],
  [2023, makeYear(2023)],
]);

function build(
  yearlyData: Map<number, YearlyData>,
  selectedYears: number[],
  aggregationType: AggregationType,
  showConsumption = true,
  showProduction = true,
  showDayNight = false
) {
  return buildChartSeries({
    yearlyData,
    selectedYears,
    aggregationType,
    showConsumption,
    showProduction,
    dayNightConfig: dayNight,
    showDayNight,
  });
}

describe('chartSeriesBuilder', () => {
  describe('isTimeAxisAggregation', () => {
    it('is true only for the two aggregations plotted against real time', () => {
      expect(isTimeAxisAggregation('raw')).toBe(true);
      expect(isTimeAxisAggregation('hourly')).toBe(true);
      for (const type of ['daily', 'weekly', 'monthly'] as AggregationType[]) {
        expect(isTimeAxisAggregation(type)).toBe(false);
      }
    });
  });

  describe('buildChartSeries', () => {
    it('returns nothing to draw when no year is selected', () => {
      expect(build(oneYear, [], 'daily')).toBeNull();
    });

    it('returns nothing to draw when there is no data at all', () => {
      expect(build(new Map(), [2022], 'daily')).toBeNull();
    });

    it('builds one consumption and one production series for a single year', () => {
      const result = build(oneYear, [2022], 'daily')!;
      expect(result.series.map((s) => s.name)).toEqual(['Spotřeba', 'Výroba']);
      expect(result.dates).toHaveLength(40);
      expect(result.series[0].data).toHaveLength(40);
    });

    it('every point key exists as an x-axis category', () => {
      // This is the contract that keeps the chart from collapsing into one column.
      const result = build(oneYear, [2022], 'daily')!;
      const categories = new Set(result.dates);
      for (const series of result.series) {
        for (const [key] of series.data) {
          expect(categories.has(String(key))).toBe(true);
        }
      }
    });

    it('keeps the categories sorted chronologically', () => {
      const result = build(oneYear, [2022], 'daily')!;
      const sorted = [...result.dates].sort();
      expect(result.dates).toEqual(sorted);
      expect(result.dates[0]).toBe('2022-01-01');
    });

    it('hides a series the user switched off', () => {
      const onlyConsumption = build(oneYear, [2022], 'daily', true, false)!;
      expect(onlyConsumption.series).toHaveLength(1);
      expect(onlyConsumption.series[0].name).toBe('Spotřeba');

      const neither = build(oneYear, [2022], 'daily', false, false)!;
      expect(neither.series).toHaveLength(0);
    });

    it('normalises two years onto a shared month-day axis for comparison', () => {
      const result = build(twoYears, [2022, 2023], 'daily')!;
      // Four series: consumption and production for each year, named by year.
      expect(result.series).toHaveLength(4);
      expect(result.series.map((s) => s.name)).toEqual([
        'Spotřeba 2022',
        'Výroba 2022',
        'Spotřeba 2023',
        'Výroba 2023',
      ]);
      // Keys collapse to MM-DD so the years overlay each other.
      for (const key of result.dates) {
        expect(key).toMatch(/^\d{2}-\d{2}$/);
      }
      // Bars cannot be dashed, so the years are told apart by colour only.
      expect(result.series[0].lineDashed).toBeUndefined();
      expect(result.series[0].color).not.toBe(result.series[2].color);
    });

    it('uses distinct colours per year when comparing', () => {
      const result = build(twoYears, [2022, 2023], 'daily')!;
      expect(result.series[0].color).not.toBe(result.series[2].color);
    });

    it('produces time-axis points for raw and hourly aggregation', () => {
      for (const type of ['raw', 'hourly'] as AggregationType[]) {
        const result = build(oneYear, [2022], type)!;
        for (const [x] of result.series[0].data) {
          expect(typeof x).toBe('number');
          expect(Number.isFinite(x as number)).toBe(true);
        }
      }
    });

    it('splits consumption into day and night, and leaves production whole', () => {
      const result = build(oneYear, [2022], 'daily', true, true, true)!;

      // Production has no night half: panels export nothing after sunset, so
      // the series would be a permanently empty legend entry.
      expect(result.series.map((s) => s.name)).toEqual([
        'Spotřeba – den',
        'Spotřeba – noc',
        'Výroba',
      ]);
      expect(result.series.every((s) => s.type === 'bar')).toBe(true);

      // Day is pushed first, so ECharts draws it at the bottom of the stack.
      expect(result.series[0].role).toBe('day');
      expect(result.series[1].role).toBe('night');
      expect(result.series[0].stack).toBe('consumption-2022');
      expect(result.series[1].stack).toBe('consumption-2022');
      expect(result.series[2].stack).toBeUndefined();
      expect(result.series[2].role).toBeUndefined();

      // Night reuses the day colour at a lower opacity.
      expect(result.series[1].color).not.toBe(result.series[0].color);
      expect(result.series[1].color).toMatch(/^rgba\(/);
    });

    it('splitting keeps the same consumption totals as the undivided bars', () => {
      const plain = build(oneYear, [2022], 'daily')!;
      const split = build(oneYear, [2022], 'daily', true, true, true)!;

      const plainConsumption = plain.series[0].data;
      const day = split.series[0].data;
      const night = split.series[1].data;

      expect(day).toHaveLength(plainConsumption.length);
      for (let i = 0; i < plainConsumption.length; i++) {
        expect(day[i][0]).toBe(plainConsumption[i][0]);
        expect(Number(day[i][1]) + Number(night[i][1])).toBeCloseTo(
          Number(plainConsumption[i][1]),
          6
        );
      }
    });

    it('gives each year its own consumption stack when comparing with the toggle on', () => {
      const result = build(twoYears, [2022, 2023], 'daily', true, true, true)!;

      // Per year: consumption day + night, production whole.
      expect(result.series).toHaveLength(6);
      expect(result.series.map((s) => s.name)).toEqual([
        'Spotřeba 2022 – den',
        'Spotřeba 2022 – noc',
        'Výroba 2022',
        'Spotřeba 2023 – den',
        'Spotřeba 2023 – noc',
        'Výroba 2023',
      ]);
      expect(new Set(result.series.map((s) => s.stack))).toEqual(
        new Set(['consumption-2022', 'consumption-2023', undefined])
      );
      // Different years keep different colours even when split.
      expect(result.series[0].color).not.toBe(result.series[3].color);
    });

    it('leaves bars undivided and unstacked when the toggle is off', () => {
      const result = build(oneYear, [2022], 'daily')!;
      expect(result.series).toHaveLength(2);
      expect(result.series.every((s) => s.stack === undefined)).toBe(true);
      expect(result.series.every((s) => s.role === undefined)).toBe(true);
      expect(result.series.every((s) => s.areaStyle === undefined)).toBe(true);
    });

    it('draws every calendar aggregation as bars and the time axis as lines', () => {
      for (const type of ['daily', 'weekly', 'monthly'] as AggregationType[]) {
        expect(build(oneYear, [2022], type)!.series[0].type).toBe('bar');
      }
      for (const type of ['raw', 'hourly'] as AggregationType[]) {
        expect(build(oneYear, [2022], type)!.series[0].type).toBe('line');
      }
    });
  });

  describe('buildAccessibleChartSummary', () => {
    it('describes each series with the same numbers the chart draws', () => {
      const chartData = build(oneYear, [2022], 'daily')!;
      const summary = buildAccessibleChartSummary(chartData);

      expect(summary).toHaveLength(2);
      expect(summary[0].name).toBe('Spotřeba');
      expect(summary[0].count).toBe(40);
      // 40 days × (0.2 + 2) kWh = 88 kWh of grid import.
      expect(summary[0].total).toMatch(/88/);
      expect(summary[0].firstPoints).toContain('1. 1. 2022');
      expect(summary[0].lastPoints).toBeTruthy();
    });

    it('returns an empty list when there is no chart', () => {
      expect(buildAccessibleChartSummary(null)).toEqual([]);
    });
  });

  describe('computeBrushDateRange', () => {
    const dates = ['2022-01-01', '2022-01-02', '2022-01-03', '2022-01-04'];

    it('reads a time-axis brush straight from the coordinate range', () => {
      const start = new Date(2022, 0, 1, 8, 0).getTime();
      const end = new Date(2022, 0, 3, 8, 0).getTime();
      const range = computeBrushDateRange({ coordRange: [start, end] }, 'raw', 1, dates)!;
      expect(range.start.getTime()).toBe(start);
      expect(range.end.getTime()).toBe(end);
    });

    it('maps category indices to whole days, end inclusive', () => {
      const range = computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 1, dates)!;
      expect(range.start.getDate()).toBe(1);
      expect(range.end.getDate()).toBe(3);
      expect(range.end.getHours()).toBe(23);
    });

    it('handles a brush dragged right to left', () => {
      const range = computeBrushDateRange({ coordRange: [3, 1] }, 'daily', 1, dates)!;
      expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    });

    it('refuses a multi-year comparison, where an index is not one date', () => {
      expect(computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 2, dates)).toBeNull();
    });

    it('refuses malformed input', () => {
      expect(computeBrushDateRange(undefined, 'daily', 1, dates)).toBeNull();
      expect(computeBrushDateRange({}, 'daily', 1, dates)).toBeNull();
      expect(computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 1, [])).toBeNull();
    });
  });

  describe('computeNightMarkAreas', () => {
    const sunConfig: DayNightConfig = {
      mode: 'sun',
      manualDayStart: '06:00',
      manualDayEnd: '20:00',
      location: getDefaultLocation(),
    };

    it('produces one night band per day', () => {
      const areas = computeNightMarkAreas(new Date(2022, 5, 1), new Date(2022, 5, 5), sunConfig);
      expect(areas.length).toBeGreaterThanOrEqual(4);
      for (const [from, to] of areas) {
        expect(from.xAxis).toBeLessThan(to.xAxis);
      }
    });

    it('bands the manual window when that mode is chosen', () => {
      // The band runs from 20:00 to 06:00 the next morning, so the same hours
      // the statistics count as night.
      const areas = computeNightMarkAreas(new Date(2022, 5, 2), new Date(2022, 5, 3), dayNight);
      expect(areas.length).toBeGreaterThanOrEqual(1);
      const [from, to] = areas[0];
      expect(new Date(from.xAxis).getHours()).toBe(20);
      expect(new Date(to.xAxis).getHours()).toBe(6);
    });

    it('bails out on ranges too long to be worth drawing', () => {
      const areas = computeNightMarkAreas(new Date(2020, 0, 1), new Date(2023, 0, 1), sunConfig);
      expect(areas).toEqual([]);
    });
  });
});
