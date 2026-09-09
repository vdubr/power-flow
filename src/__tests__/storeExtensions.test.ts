import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, RawDataPoint, YearlyData } from '../types/energy';
import { calculateYearStatistics, computeHasFlags } from '../utils/energyData';

const makeRecord = (
  isoTimestamp: string,
  consumption: number,
  production: number
): EnergyRecord => ({
  timestamp: new Date(isoTimestamp),
  consumption,
  production,
});

/**
 * Seed the store directly with multi-year data, bypassing addData.
 * This keeps tests focused on the new store extensions without depending on
 * CSV parsing or the rawDataPoint pipeline.
 */
function seedStore(yearMap: Map<number, EnergyRecord[]>) {
  const yearlyData = new Map<number, YearlyData>();
  const allRecords: EnergyRecord[] = [];

  for (const [year, records] of yearMap) {
    const sorted = [...records].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const { hasProduction, hasConsumption } = computeHasFlags(sorted);
    yearlyData.set(year, {
      year,
      records: sorted,
      statistics: calculateYearStatistics(sorted, year),
      hasProduction,
      hasConsumption,
    });
    allRecords.push(...sorted);
  }

  allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const availableYears = Array.from(yearlyData.keys()).sort();

  useEnergyStore.setState({
    yearlyData,
    allRecords,
    availableYears,
    chartConfig: {
      ...useEnergyStore.getState().chartConfig,
      selectedYears: availableYears,
      timeRange: null,
      rangeMode: 'years',
    },
    batterySimulation: null,
  });
}

describe('energyStore extensions', () => {
  beforeEach(() => {
    // Reset to a clean state before each test
    useEnergyStore.getState().clearData();
  });

  describe('removeYear', () => {
    it('removes the year from yearlyData, allRecords, availableYears, and selectedYears', () => {
      seedStore(
        new Map([
          [
            2022,
            [
              makeRecord('2022-06-15T12:00', 1, 0.5),
              makeRecord('2022-06-16T12:00', 1, 0.5),
            ],
          ],
          [
            2023,
            [
              makeRecord('2023-06-15T12:00', 2, 1),
              makeRecord('2023-06-16T12:00', 2, 1),
            ],
          ],
          [
            2024,
            [
              makeRecord('2024-06-15T12:00', 3, 2),
              makeRecord('2024-06-16T12:00', 3, 2),
            ],
          ],
        ])
      );

      // Pre-condition
      expect(useEnergyStore.getState().availableYears).toEqual([2022, 2023, 2024]);
      expect(useEnergyStore.getState().chartConfig.selectedYears).toEqual([
        2022, 2023, 2024,
      ]);
      expect(useEnergyStore.getState().allRecords).toHaveLength(6);

      useEnergyStore.getState().removeYear(2023);

      const state = useEnergyStore.getState();
      expect(state.yearlyData.has(2023)).toBe(false);
      expect(state.availableYears).toEqual([2022, 2024]);
      expect(state.chartConfig.selectedYears).toEqual([2022, 2024]);
      expect(state.allRecords).toHaveLength(4);
      expect(
        state.allRecords.every(r => r.timestamp.getFullYear() !== 2023)
      ).toBe(true);
    });

    it('clears batterySimulation to null when no records remain', () => {
      seedStore(
        new Map([[2022, [makeRecord('2022-06-15T12:00', 1, 0.5)]]])
      );

      useEnergyStore.getState().removeYear(2022);

      const state = useEnergyStore.getState();
      expect(state.allRecords).toHaveLength(0);
      expect(state.availableYears).toEqual([]);
      expect(state.batterySimulation).toBeNull();
    });

    it('is a no-op for a year that does not exist', () => {
      seedStore(
        new Map([[2022, [makeRecord('2022-06-15T12:00', 1, 0.5)]]])
      );

      useEnergyStore.getState().removeYear(1999);

      const state = useEnergyStore.getState();
      expect(state.availableYears).toEqual([2022]);
      expect(state.allRecords).toHaveLength(1);
    });
  });

  describe('setRangeMode', () => {
    it('updates chartConfig.rangeMode', () => {
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('years');

      useEnergyStore.getState().setRangeMode('last');
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('last');

      useEnergyStore.getState().setRangeMode('selection');
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('selection');

      useEnergyStore.getState().setRangeMode('years');
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('years');
    });
  });

  describe('setTimeRange', () => {
    it('switches rangeMode to "selection" when given a non-null range', () => {
      // Start in 'years' mode (default)
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('years');

      const range = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 11, 31),
      };
      useEnergyStore.getState().setTimeRange(range);

      const state = useEnergyStore.getState();
      expect(state.chartConfig.timeRange).toEqual(range);
      expect(state.chartConfig.rangeMode).toBe('selection');
    });

    it('does NOT change rangeMode when called with null', () => {
      // Set mode to 'last' first
      useEnergyStore.getState().setRangeMode('last');
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('last');

      useEnergyStore.getState().setTimeRange(null);

      const state = useEnergyStore.getState();
      expect(state.chartConfig.timeRange).toBeNull();
      expect(state.chartConfig.rangeMode).toBe('last');
    });
  });

  describe('setShowDayNight', () => {
    it('updates chartConfig.showDayNight', () => {
      expect(useEnergyStore.getState().chartConfig.showDayNight).toBe(false);

      useEnergyStore.getState().setShowDayNight(true);
      expect(useEnergyStore.getState().chartConfig.showDayNight).toBe(true);

      useEnergyStore.getState().setShowDayNight(false);
      expect(useEnergyStore.getState().chartConfig.showDayNight).toBe(false);
    });

    it('defaults to sunrise-to-sunset for the default location', () => {
      // "Day" means what it means outside the window, so the default is the
      // sun, not clock hours.
      const { dayNightConfig } = useEnergyStore.getState().chartConfig;
      expect(dayNightConfig.mode).toBe('sun');
      expect(dayNightConfig.location?.name).toBe('Praha');
    });
  });

  describe('getActiveRecords', () => {
    beforeEach(() => {
      seedStore(
        new Map([
          [
            2022,
            [
              makeRecord('2022-03-01T12:00', 1, 0.5),
              makeRecord('2022-09-01T12:00', 1, 0.5),
            ],
          ],
          [
            2023,
            [
              makeRecord('2023-03-01T12:00', 2, 1),
              makeRecord('2023-09-01T12:00', 2, 1),
            ],
          ],
          [
            2024,
            [
              makeRecord('2024-03-01T12:00', 3, 2),
              makeRecord('2024-09-01T12:00', 3, 2),
            ],
          ],
        ])
      );
    });

    it('returns records for selected years in "avg" mode', () => {
      useEnergyStore.getState().setSelectedYears([2022, 2024]);
      useEnergyStore.getState().setRangeMode('years');

      const active = useEnergyStore.getState().getActiveRecords();

      expect(active).toHaveLength(4);
      const years = new Set(active.map(r => r.timestamp.getFullYear()));
      expect(years).toEqual(new Set([2022, 2024]));
    });

    it('returns all records in "avg" mode when selectedYears is empty', () => {
      useEnergyStore.getState().setSelectedYears([]);
      useEnergyStore.getState().setRangeMode('years');

      const active = useEnergyStore.getState().getActiveRecords();
      expect(active).toHaveLength(6);
    });

    it('returns only records from the most recent selected year in "last" mode', () => {
      useEnergyStore.getState().setSelectedYears([2022, 2023]);
      useEnergyStore.getState().setRangeMode('last');

      const active = useEnergyStore.getState().getActiveRecords();
      expect(active).toHaveLength(2);
      expect(active.every(r => r.timestamp.getFullYear() === 2023)).toBe(true);
    });

    it('falls back to most recent availableYears in "last" mode if selectedYears is empty', () => {
      useEnergyStore.getState().setSelectedYears([]);
      useEnergyStore.getState().setRangeMode('last');

      const active = useEnergyStore.getState().getActiveRecords();
      expect(active).toHaveLength(2);
      expect(active.every(r => r.timestamp.getFullYear() === 2024)).toBe(true);
    });

    it('returns records filtered by timeRange in "selection" mode', () => {
      const range = {
        start: new Date(2023, 5, 1), // June 1, 2023
        end: new Date(2024, 5, 1), // June 1, 2024
      };
      useEnergyStore.getState().setTimeRange(range);
      // setTimeRange auto-switches to 'selection'
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('selection');

      const active = useEnergyStore.getState().getActiveRecords();
      // Should include 2023-09-01 and 2024-03-01 only
      expect(active).toHaveLength(2);
      const dates = active.map(r => r.timestamp.toISOString().slice(0, 10));
      expect(dates).toContain('2023-09-01');
      expect(dates).toContain('2024-03-01');
    });

    it('returns all records in "selection" mode when timeRange is null', () => {
      useEnergyStore.getState().setRangeMode('selection');
      // timeRange is still null

      const active = useEnergyStore.getState().getActiveRecords();
      expect(active).toHaveLength(6);
    });
  });

  describe('setBatteryConfig – simulation failure', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets batterySimulation to null when simulateBattery throws', async () => {
      // Seed store with valid data so allRecords.length > 0
      seedStore(
        new Map([
          [
            2023,
            [
              makeRecord('2023-06-15T12:00', 1, 0.5),
              makeRecord('2023-06-16T12:00', 2, 1.0),
            ],
          ],
        ])
      );

      // Manually set a non-null batterySimulation to verify it gets cleared on error
      useEnergyStore.setState({ batterySimulation: { annualSavings: 999 } as never });
      expect(useEnergyStore.getState().batterySimulation).not.toBeNull();

      // Mock simulateBattery to throw
      const batteryModule = await import('../utils/batteryAlgorithm');
      vi.spyOn(batteryModule, 'simulateBattery').mockImplementation(() => {
        throw new Error('Simulated failure');
      });

      // Re-import the store action after the mock is in place
      // (the store already holds a reference, so we call the action directly)
      useEnergyStore.getState().setBatteryConfig({ capacity: 5 });

      const state = useEnergyStore.getState();
      // Config must be updated
      expect(state.batteryConfig.capacity).toBe(5);
      // Simulation must be null, not the stale previous result
      expect(state.batterySimulation).toBeNull();
    });
  });

  describe('addData default selectedYears', () => {
    const makeRaw = (
      iso: string,
      value: number,
      type: 'consumption' | 'production'
    ): RawDataPoint => ({
      timestamp: new Date(iso),
      value,
      type,
    });

    /** Build a raw consumption+production stream covering a date range with one
     * point every interval (default daily). All values are non-zero so each
     * timestamp results in a record after merging. */
    function buildRange(
      startIso: string,
      endIso: string,
      stepHours = 24
    ): { consumption: RawDataPoint[]; production: RawDataPoint[] } {
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      const consumption: RawDataPoint[] = [];
      const production: RawDataPoint[] = [];
      const stepMs = stepHours * 60 * 60 * 1000;
      for (let t = start; t <= end; t += stepMs) {
        const iso = new Date(t).toISOString();
        consumption.push(makeRaw(iso, 1, 'consumption'));
        production.push(makeRaw(iso, 0.5, 'production'));
      }
      return { consumption, production };
    }

    it('selects the year with the most records on first load (timezone-bleed protection)', () => {
      // Simulate a real-world ČEZ export where 2022 has full year data (~365)
      // and 2023 has a single timezone-bleed record at 1.1.2023 00:00.
      const fullYear = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      const bleedConsumption = makeRaw('2023-01-01T00:00', 0.137, 'consumption');
      const bleedProduction = makeRaw('2023-01-01T00:00', 0, 'production');

      useEnergyStore.getState().addData(
        [...fullYear.consumption, bleedConsumption],
        [...fullYear.production, bleedProduction]
      );

      const state = useEnergyStore.getState();
      expect(state.availableYears).toEqual([2022, 2023]);
      // A single stray record is a fragment of an export, not a year the user
      // imported: it stays below the batch share threshold and is not selected.
      expect(state.chartConfig.selectedYears).toEqual([2022]);
    });

    it('selects the only year present when single-year data is loaded', () => {
      const { consumption, production } = buildRange(
        '2024-01-01T00:00',
        '2024-12-31T23:00'
      );

      useEnergyStore.getState().addData(consumption, production);

      const state = useEnergyStore.getState();
      expect(state.availableYears).toEqual([2024]);
      expect(state.chartConfig.selectedYears).toEqual([2024]);
    });

    it('shows the year that was just imported', () => {
      // Keeping the previous selection made an import look like it had done
      // nothing: the panels still showed the old year and the new one appeared
      // only as a dimmed badge.
      const y2022 = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      useEnergyStore.getState().addData(y2022.consumption, y2022.production);
      expect(useEnergyStore.getState().chartConfig.selectedYears).toEqual([2022]);

      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00', 12);
      const summary = useEnergyStore.getState().addData(y2024.consumption, y2024.production);

      const state = useEnergyStore.getState();
      expect(state.availableYears).toEqual([2022, 2024]);
      expect(state.chartConfig.selectedYears).toEqual([2024]);
      expect(summary.years).toEqual([2024]);
      expect(summary.newYears).toEqual([2024]);
      expect(summary.selectionChanged).toBe(true);
      expect(summary.recordCount).toBeGreaterThan(0);
      // The earlier year is still one badge click away.
      useEnergyStore.getState().setSelectedYears([2022, 2024]);
      expect(useEnergyStore.getState().chartConfig.selectedYears).toEqual([2022, 2024]);
    });

    it('keeps the selection when the batch only adds a file for a selected year', () => {
      const y2022 = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      useEnergyStore.getState().addData(y2022.consumption, []);
      expect(useEnergyStore.getState().chartConfig.selectedYears).toEqual([2022]);

      // Second file of the same year: nothing new to show, so nothing moves.
      const summary = useEnergyStore.getState().addData([], y2022.production);
      expect(useEnergyStore.getState().chartConfig.selectedYears).toEqual([2022]);
      expect(summary.selectionChanged).toBe(false);
      expect(summary.newYears).toEqual([]);
    });

    it('clears a stale brush selection when the imported year takes over', () => {
      const y2022 = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      useEnergyStore.getState().addData(y2022.consumption, y2022.production);
      useEnergyStore
        .getState()
        .setTimeRange({ start: new Date(2022, 5, 1), end: new Date(2022, 5, 30) });
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('selection');

      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00');
      useEnergyStore.getState().addData(y2024.consumption, y2024.production);

      // A range brushed in 2022 would leave every panel empty once 2024 is shown.
      const state = useEnergyStore.getState();
      expect(state.chartConfig.timeRange).toBeNull();
      expect(state.chartConfig.rangeMode).toBe('years');
    });

    it('selects every year a multi-year batch carries', () => {
      // First load: 2022 only → selected = [2022].
      const y2022 = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      useEnergyStore.getState().addData(y2022.consumption, y2022.production);

      // User clears data and loads two new years where 2024 has more records.
      useEnergyStore.getState().clearData();
      const y2023 = buildRange('2023-01-01T00:00', '2023-12-31T23:00', 24);
      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00', 12);
      useEnergyStore.getState().addData(
        [...y2023.consumption, ...y2024.consumption],
        [...y2023.production, ...y2024.production]
      );

      const state = useEnergyStore.getState();
      expect(state.availableYears).toEqual([2023, 2024]);
      // Two real years in one batch is a comparison: show both.
      expect(state.chartConfig.selectedYears).toEqual([2023, 2024]);
    });
  });
});
