import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useEnergyStore } from '../store/energyStore';
import {
  ConsumptionSplit,
  EnergyRecord,
  RawDataPoint,
  YearlyData,
} from '../types/energy';
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

  /**
   * Den a noc už není přepínač „rozdělit / nerozdělit“ (`showDayNight`), ale
   * čtyři stavy toho, co se do sloupce spotřeby počítá — proto ta akce
   * nastavuje `consumptionSplit`.
   */
  describe('setConsumptionSplit', () => {
    it('přepíná, co se ze spotřeby počítá, a začíná na celku', () => {
      expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe('sum');

      for (const split of ['both', 'day', 'night', 'sum'] as ConsumptionSplit[]) {
        useEnergyStore.getState().setConsumptionSplit(split);
        expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe(split);
      }
    });
  });

  describe('dayNightConfig', () => {
    it('defaults to sunrise-to-sunset for the default location', () => {
      // "Day" means what it means outside the window, so the default is the
      // sun, not clock hours.
      const { dayNightConfig } = useEnergyStore.getState().chartConfig;
      expect(dayNightConfig.mode).toBe('sun');
      expect(dayNightConfig.location?.name).toBe('Praha');
    });
  });

  describe('setChartMode', () => {
    it('přepíná mezi bilancí a dokoupenou energií, a začíná na bilanci', () => {
      expect(useEnergyStore.getState().chartConfig.chartMode).toBe('balance');

      useEnergyStore.getState().setChartMode('net');
      expect(useEnergyStore.getState().chartConfig.chartMode).toBe('net');

      useEnergyStore.getState().setChartMode('balance');
      expect(useEnergyStore.getState().chartConfig.chartMode).toBe('balance');
    });
  });

  describe('setConsumptionBelowAxis', () => {
    it('zrcadlení pod osu je vypnuté, dokud si ho uživatel nezapne', () => {
      expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(false);

      useEnergyStore.getState().setConsumptionBelowAxis(true);
      expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(true);

      useEnergyStore.getState().setConsumptionBelowAxis(false);
      expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(false);
    });
  });

  describe('setHighlightedSeries', () => {
    /** Rozsvítí simulaci, aby bylo na čem poznat, že se nepřepočítala. */
    function seedWithSimulation() {
      seedStore(
        new Map([
          [
            2024,
            [
              makeRecord('2024-06-15T12:00', 1, 3),
              makeRecord('2024-06-15T21:00', 2, 0),
              makeRecord('2024-06-16T12:00', 1, 3),
              makeRecord('2024-06-16T21:00', 2, 0),
            ],
          ],
        ])
      );
      // seedStore nechává simulaci nulovou; tohle ji spočítá.
      useEnergyStore.getState().setSelectedYears([2024]);
      expect(useEnergyStore.getState().batterySimulation).not.toBeNull();
    }

    it('drží zvýrazněné série v korenu storu, ne v chartConfig', () => {
      expect(useEnergyStore.getState().highlightedSeries).toEqual([]);

      useEnergyStore.getState().setHighlightedSeries(['Spotřeba 2024']);
      expect(useEnergyStore.getState().highlightedSeries).toEqual(['Spotřeba 2024']);

      useEnergyStore.getState().setHighlightedSeries([]);
      expect(useEnergyStore.getState().highlightedSeries).toEqual([]);
    });

    /**
     * Proto je zvýraznění mimo `chartConfig`: myš přejíždějící po čipech filtru
     * mění tento stav na každém pixelu a simulace baterie ani křivka kapacity
     * se za ní nesmí táhnout.
     */
    it('nepřepočítává simulaci ani doporučení kapacity', () => {
      seedWithSimulation();
      const simulation = useEnergyStore.getState().batterySimulation;
      const recommendation = useEnergyStore.getState().capacityRecommendation;
      const chartConfig = useEnergyStore.getState().chartConfig;

      useEnergyStore.getState().setHighlightedSeries(['Spotřeba 2024']);
      useEnergyStore.getState().setHighlightedSeries(['Výroba 2024']);

      // Táž instance, ne jen stejná čísla – jinak by se přepočet skryl.
      expect(useEnergyStore.getState().batterySimulation).toBe(simulation);
      expect(useEnergyStore.getState().capacityRecommendation).toBe(recommendation);
      expect(useEnergyStore.getState().chartConfig).toBe(chartConfig);
    });
  });

  /**
   * Zoom není rozhodnutí, že ho mají následovat statistiky – to je přepínač
   * rozsahu. `setZoomRange` proto rozsah jen odloží připravený k použití,
   * na rozdíl od `setTimeRange`, který přepne na „Výseč v grafu“.
   */
  describe('setZoomRange', () => {
    const range = { start: new Date(2024, 2, 1), end: new Date(2024, 2, 31, 23, 59) };

    function seedThreeYears() {
      seedStore(
        new Map([
          [
            2024,
            [
              makeRecord('2024-03-01T12:00', 1, 0.5),
              makeRecord('2024-03-02T12:00', 1, 0.5),
              makeRecord('2024-09-01T12:00', 3, 2),
              makeRecord('2024-09-02T12:00', 3, 2),
            ],
          ],
        ])
      );
    }

    it('nepřepíná rangeMode, jen odloží rozsah k použití', () => {
      seedThreeYears();
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('years');
      const activeBefore = useEnergyStore.getState().getActiveRecords().length;

      useEnergyStore.getState().setZoomRange(range);

      const state = useEnergyStore.getState();
      expect(state.chartConfig.timeRange).toEqual(range);
      // Rozsah je připravený, ale panely ho zatím nečtou.
      expect(state.chartConfig.rangeMode).toBe('years');
      expect(state.getActiveRecords().length).toBe(activeBefore);

      // A přepnutí na „Výseč v grafu“ pak použije přesně to, co je na obrazovce.
      useEnergyStore.getState().setRangeMode('selection');
      expect(useEnergyStore.getState().getActiveRecords()).toHaveLength(2);
    });

    it('v režimu „selection“ přepočítá aktivní rozsah hned', () => {
      seedThreeYears();
      useEnergyStore.getState().setRangeMode('selection');
      // Bez rozsahu je výseč celá data.
      expect(useEnergyStore.getState().getActiveRecords()).toHaveLength(4);

      useEnergyStore.getState().setZoomRange(range);

      const active = useEnergyStore.getState().getActiveRecords();
      expect(active).toHaveLength(2);
      expect(active.every((r) => r.timestamp.getMonth() === 2)).toBe(true);
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('selection');
    });

    it('mimo režim „selection“ simulaci nepřepočítává', () => {
      seedThreeYears();
      useEnergyStore.getState().setSelectedYears([2024]);
      const simulation = useEnergyStore.getState().batterySimulation;
      expect(simulation).not.toBeNull();

      useEnergyStore.getState().setZoomRange(range);
      // Panely rozsah nečtou, takže není co přepočítat.
      expect(useEnergyStore.getState().batterySimulation).toBe(simulation);
    });

    it('stejný rozsah podruhé je no-op, aby zoom netočil store dokola', () => {
      seedThreeYears();
      useEnergyStore.getState().setZoomRange(range);
      const chartConfig = useEnergyStore.getState().chartConfig;

      // ECharts hlásí okno i při dojezdu animace; každé hlášení se stejnou
      // hodnotou by jinak překreslilo celou stránku.
      useEnergyStore.getState().setZoomRange({
        start: new Date(range.start),
        end: new Date(range.end),
      });
      expect(useEnergyStore.getState().chartConfig).toBe(chartConfig);
    });

    it('zrušení zoomu smaže rozsah, ale režim nechá být', () => {
      seedThreeYears();
      useEnergyStore.getState().setRangeMode('last');
      useEnergyStore.getState().setZoomRange(range);

      useEnergyStore.getState().setZoomRange(null);
      expect(useEnergyStore.getState().chartConfig.timeRange).toBeNull();
      expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('last');
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

    it('switches to the monthly view when an import brings more than one year', () => {
      // A daily bar per year is unreadable in the comparison view, so an
      // import that lands there picks the granularity that can be read.
      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('daily');

      const y2023 = buildRange('2023-01-01T00:00', '2023-12-31T23:00');
      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00');
      useEnergyStore.getState().addData(
        [...y2023.consumption, ...y2024.consumption],
        [...y2023.production, ...y2024.production]
      );

      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('monthly');
    });

    it('leaves the aggregation alone when an import brings a single year', () => {
      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00');
      useEnergyStore.getState().addData(y2024.consumption, y2024.production);

      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('daily');
    });

    it('does not undo the user’s own aggregation on a re-import of the same years', () => {
      const y2023 = buildRange('2023-01-01T00:00', '2023-12-31T23:00');
      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00');
      const consumption = [...y2023.consumption, ...y2024.consumption];
      const production = [...y2023.production, ...y2024.production];

      useEnergyStore.getState().addData(consumption, production);
      useEnergyStore.getState().setAggregationType('weekly');

      // Same files again: the selection does not move, so neither does the view.
      useEnergyStore.getState().addData(consumption, production);
      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('weekly');
    });

    it('drops series hidden in the filter when the imported years take over', () => {
      const y2022 = buildRange('2022-01-01T00:00', '2022-12-31T23:00');
      useEnergyStore.getState().addData(y2022.consumption, y2022.production);
      useEnergyStore.getState().toggleSeriesVisibility('Spotřeba');
      expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual(['Spotřeba']);

      // Series are renamed per year once a second year appears; a leftover name
      // would silently hide part of the freshly imported data.
      const y2024 = buildRange('2024-01-01T00:00', '2024-12-31T23:00');
      useEnergyStore.getState().addData(y2024.consumption, y2024.production);
      expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual([]);
    });
  });

  describe('toggleSeriesVisibility', () => {
    it('hides and shows a single series without touching the data', () => {
      const records = new Map<number, EnergyRecord[]>([
        [2024, [makeRecord('2024-06-01T12:00', 5, 2), makeRecord('2024-06-02T12:00', 4, 3)]],
      ]);
      seedStore(records);
      const activeBefore = useEnergyStore.getState().getActiveRecords().length;

      useEnergyStore.getState().toggleSeriesVisibility('Výroba');
      expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual(['Výroba']);
      // Hiding a line is a view setting, not a filter on the data.
      expect(useEnergyStore.getState().getActiveRecords().length).toBe(activeBefore);
      expect(useEnergyStore.getState().chartConfig.showProduction).toBe(true);

      useEnergyStore.getState().toggleSeriesVisibility('Výroba');
      expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual([]);
    });
  });
});
