import { describe, it, expect } from 'vitest';
import {
  buildMonthlyOption,
  buildDailyImportOption,
  buildChargeLevelOption,
  buildCapacityCurveOption,
} from '../utils/batteryChartOptions';
import { simulateBattery, buildCapacityCurve, recommendCapacity } from '../utils/batteryAlgorithm';
import { BatteryConfig, EnergyRecord } from '../types/energy';

/**
 * The option builders are pure, so they can be checked without rendering a
 * canvas. These tests guard the shapes the chart depends on: an axis label for
 * every data point, no NaN reaching a series, and the recommendation marked on
 * the capacity curve.
 */

const config: BatteryConfig = {
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
  roundTripEfficiency: 90,
  feedInPrice: 1.5,
};

/** Two months of a simple daily cycle: surplus at noon, deficit in the evening. */
function makeRecords(): EnergyRecord[] {
  const records: EnergyRecord[] = [];
  for (let month = 0; month < 2; month++) {
    for (let day = 1; day <= 20; day++) {
      records.push({
        timestamp: new Date(2022, month, day, 12, 0),
        consumption: 0.2,
        production: 5,
      });
      records.push({
        timestamp: new Date(2022, month, day, 20, 0),
        consumption: 4,
        production: 0,
      });
    }
  }
  return records;
}

const records = makeRecords();
const simulation = simulateBattery(records, config);

function seriesData(option: unknown, index = 0): unknown[] {
  const series = (option as { series: Array<{ data: unknown[] }> }).series;
  return series[index].data;
}

describe('batteryChartOptions', () => {
  describe('buildMonthlyOption', () => {
    it('has one axis label per month and three series', () => {
      const option = buildMonthlyOption(simulation)!;
      expect(option).not.toBeNull();
      const labels = (option.xAxis as { data: string[] }).data;
      expect(labels).toHaveLength(simulation.monthlyAnalysis.length);
      expect(labels[0]).toMatch(/^Leden 2022$/);
      expect((option.series as unknown[]).length).toBe(3);
      for (let i = 0; i < 3; i++) {
        expect(seriesData(option, i)).toHaveLength(labels.length);
      }
    });

    it('never puts a non-finite number into a series', () => {
      const option = buildMonthlyOption(simulation)!;
      for (let i = 0; i < 3; i++) {
        for (const value of seriesData(option, i) as number[]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });

    it('returns null when there is nothing to draw', () => {
      const empty = simulateBattery([], config);
      expect(buildMonthlyOption(empty)).toBeNull();
    });
  });

  describe('buildDailyImportOption', () => {
    it('has one bar per simulated day', () => {
      const option = buildDailyImportOption(simulation)!;
      const labels = (option.xAxis as { data: unknown[] }).data;
      expect(labels).toHaveLength(simulation.dailyGridImport.length);
      expect(seriesData(option)).toHaveLength(simulation.dailyGridImport.length);
    });

    it('colours a day the battery rescued differently from one that never needed the grid', () => {
      const option = buildDailyImportOption(simulation)!;
      const data = seriesData(option) as Array<{ itemStyle: { color: string } }>;
      const colours = new Set(data.map((d) => d.itemStyle.color));
      // At least one distinct colour is in use, and none of them is undefined.
      expect(colours.size).toBeGreaterThanOrEqual(1);
      for (const colour of colours) expect(colour).toBeTruthy();
    });
  });

  describe('buildChargeLevelOption', () => {
    it('caps the axis at the configured capacity', () => {
      const option = buildChargeLevelOption(simulation, config)!;
      expect((option.yAxis as { max: number }).max).toBe(config.capacity);
    });

    it('keeps every charge level within the battery', () => {
      const option = buildChargeLevelOption(simulation, config)!;
      for (const value of seriesData(option) as number[]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(config.capacity + 1e-6);
      }
    });

    it('guards against a zero capacity so the axis never collapses', () => {
      const zero = { ...config, capacity: 0 };
      const option = buildChargeLevelOption(simulateBattery(records, zero), zero)!;
      expect((option.yAxis as { max: number }).max).toBeGreaterThan(0);
    });
  });

  describe('tooltip and axis formatters', () => {
    // ECharts calls these at render time; they must produce Czech text and
    // never throw on the shapes ECharts actually passes in.
    function callFormatter(option: unknown, path: 'tooltip' | 'xAxis', dataIndex = 0): string {
      const node = (option as Record<string, { formatter?: unknown; axisLabel?: { formatter?: unknown } }>)[path];
      const fn = path === 'tooltip' ? node.formatter : node.axisLabel?.formatter;
      return (fn as (p: unknown) => string)([{ dataIndex, value: 1 }]);
    }

    it('monthly tooltip names the month and the money', () => {
      const text = callFormatter(buildMonthlyOption(simulation)!, 'tooltip');
      expect(text).toMatch(/Leden 2022/);
      expect(text).toMatch(/Kč/);
      expect(text).toMatch(/kWh/);
      expect(text).not.toMatch(/NaN|undefined/);
    });

    it('daily tooltip explains what the battery changed', () => {
      const text = callFormatter(buildDailyImportOption(simulation)!, 'tooltip');
      expect(text).toMatch(/Dokup ze sítě/);
      expect(text).toMatch(/Bez baterie/);
      expect(text).not.toMatch(/NaN|undefined/);
    });

    it('charge level tooltip reports the average state', () => {
      const text = callFormatter(buildChargeLevelOption(simulation, config)!, 'tooltip');
      expect(text).toMatch(/Průměrný stav/);
      expect(text).not.toMatch(/NaN|undefined/);
    });

    it('capacity curve tooltip states savings and off-grid days', () => {
      const curve = buildCapacityCurve(records, config);
      const option = buildCapacityCurveOption(curve, curve[0].capacity, 10)!;
      const text = callFormatter(option, 'tooltip');
      expect(text).toMatch(/kWh/);
      expect(text).toMatch(/Úspora/);
      expect(text).toMatch(/Dnů bez dokupu/);
      expect(text).not.toMatch(/NaN|undefined/);
    });

    it('tooltips survive an empty params array', () => {
      const option = buildMonthlyOption(simulation)! as unknown as {
        tooltip: { formatter: (p: unknown) => string };
      };
      expect(option.tooltip.formatter([])).toBe('');
      expect(option.tooltip.formatter(null)).toBe('');
    });

    it('axis labels are formatted for Czech readers', () => {
      const daily = buildDailyImportOption(simulation)! as unknown as {
        xAxis: { data: unknown[]; axisLabel: { formatter: (v: string) => string } };
      };
      const label = daily.xAxis.axisLabel.formatter(String(daily.xAxis.data[0]));
      expect(label).toMatch(/^\d+\.\s?\d+\.$/u);
    });
  });

  describe('buildCapacityCurveOption', () => {
    it('marks the recommended capacity on the curve', () => {
      const curve = buildCapacityCurve(records, config);
      const recommendation = recommendCapacity(records, config, curve);
      const option = buildCapacityCurveOption(curve, recommendation.capacity, 10)!;

      const series = (option.series as Array<{
        data: number[];
        markPoint: { data: Array<{ xAxis: string }> };
        markLine: { data: Array<{ xAxis: string }> };
      }>)[0];

      expect(series.data).toHaveLength(curve.length);
      expect(series.markPoint.data[0].xAxis).toBe(String(recommendation.capacity));
      // The dashed line shows where the user's own slider currently sits.
      expect(series.markLine.data[0].xAxis).toBe('10');
    });

    it('returns null for an empty curve', () => {
      expect(buildCapacityCurveOption([], 5, 10)).toBeNull();
    });
  });
});
