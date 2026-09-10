import { create } from 'zustand';
import {
  ChartMode,
  ConsumptionSplit,
  EnergyRecord,
  YearlyData,
  ChartConfig,
  BatteryConfig,
  BatterySimulationResult,
  AggregationType,
  DayNightConfig,
  TimeRange,
  RawDataPoint,
  RangeMode,
} from '../types/energy';
import { CapacityRecommendation, ImportSummary } from '../types/energy';
import { simulateBattery, recommendCapacity } from '../utils/batteryAlgorithm';
import {
  DEFAULT_DAY_START,
  DEFAULT_DAY_END,
  DEFAULT_ROUND_TRIP_EFFICIENCY,
  DEFAULT_FEED_IN_PRICE,
} from '../constants';
import { mergeAndGroupByYear, calculateYearStatistics, computeHasFlags } from '../utils/energyData';
import { getDefaultLocation } from '../utils/sunCalculations';
import { filterByTimeRange } from '../utils/dataAggregation';

interface EnergyStore {
  // Data
  yearlyData: Map<number, YearlyData>;
  allRecords: EnergyRecord[];
  availableYears: number[];

  // Chart configuration
  chartConfig: ChartConfig;

  // Battery configuration & results
  batteryConfig: BatteryConfig;
  /** Simulation over the active range, kept in sync with chartConfig. */
  batterySimulation: BatterySimulationResult | null;
  /** Which capacity to buy, plus the curve that justifies it. */
  capacityRecommendation: CapacityRecommendation | null;
  /** Identity of the inputs the curve was built from; internal memoisation. */
  capacityCurveKey: string;

  /**
   * Series the user is pointing at in the filter under the chart, by name.
   *
   * Deliberately outside `chartConfig`: every change there recomputes the
   * battery simulation and the capacity curve, and a mouse moving across four
   * year chips must not trigger that.
   */
  highlightedSeries: string[];

  // Actions
  addData: (
    consumptionData: RawDataPoint[],
    productionData: RawDataPoint[]
  ) => ImportSummary;
  clearData: () => void;
  removeYear: (year: number) => void;
  setAggregationType: (type: AggregationType) => void;
  setSelectedYears: (years: number[]) => void;
  setTimeRange: (range: TimeRange | null) => void;
  toggleConsumption: () => void;
  toggleProduction: () => void;
  toggleSeriesVisibility: (name: string) => void;
  setConsumptionSplit: (split: ConsumptionSplit) => void;
  setChartMode: (mode: ChartMode) => void;
  setConsumptionBelowAxis: (below: boolean) => void;
  setHighlightedSeries: (names: string[]) => void;
  setZoomRange: (range: TimeRange | null) => void;
  setDayNightConfig: (config: DayNightConfig) => void;
  setBatteryConfig: (config: Partial<BatteryConfig>) => void;
  setRangeMode: (mode: RangeMode) => void;

  // Selectors
  getActiveRecords: () => EnergyRecord[];
}

/**
 * Factories, not shared constants: the store holds these objects directly, so
 * a single accidental mutation of a shared literal would leak into every later
 * reset and across tests in the same process.
 */
const createDefaultChartConfig = (): ChartConfig => ({
  aggregationType: 'daily',
  selectedYears: [],
  timeRange: null,
  showConsumption: true,
  showProduction: true,
  dayNightConfig: {
    // Sunrise to sunset is what "day" means to someone with panels on the roof;
    // the manual window stays available as a setting.
    mode: 'sun',
    manualDayStart: DEFAULT_DAY_START,
    manualDayEnd: DEFAULT_DAY_END,
    location: getDefaultLocation(),
  },
  rangeMode: 'years',
  consumptionSplit: 'sum',
  chartMode: 'balance',
  // Off by default: both sides upright is the plain reading of the data, and
  // mirroring one of them is a deliberate way of looking at it.
  consumptionBelowAxis: false,
  hiddenSeries: [],
});

const createDefaultBatteryConfig = (): BatteryConfig => ({
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
  roundTripEfficiency: DEFAULT_ROUND_TRIP_EFFICIENCY,
  feedInPrice: DEFAULT_FEED_IN_PRICE,
});

/**
 * A year counts as "carried" by an import when it holds at least this share of
 * the batch's biggest year. It keeps a stray fragment — the single
 * `1.1.YYYY 00:00` row older exports ended with — from hijacking the view,
 * while a genuinely partial year (panels installed in November) still counts.
 */
const BATCH_YEAR_MIN_SHARE = 0.05;

/** Years an import actually brought data for, ascending. */
function carriedYears(yearMap: Map<number, EnergyRecord[]>): number[] {
  let largest = 0;
  for (const records of yearMap.values()) {
    largest = Math.max(largest, records.length);
  }
  return Array.from(yearMap.entries())
    .filter(([, records]) => records.length >= largest * BATCH_YEAR_MIN_SHARE)
    .map(([year]) => year)
    .sort((a, b) => a - b);
}

/**
 * The subset of the data every panel works with.
 *
 * Kept as a free function so the chart, the statistics and the battery
 * simulation all derive from exactly the same rule. Before this existed the
 * three panels read three different slices and could disagree after a brush
 * selection.
 */
/**
 * Everything derived from the data plus the current settings.
 *
 * Recomputed by `recompute()` whenever the active range or the battery
 * configuration changes, so no panel can drift out of sync with another.
 */
interface DerivedState {
  batterySimulation: BatterySimulationResult | null;
  capacityRecommendation: CapacityRecommendation | null;
  capacityCurveKey: string;
}

/**
 * Identity of the inputs the capacity curve depends on.
 *
 * The curve sweeps capacity, so `config.capacity` deliberately does not appear
 * here: dragging the capacity slider must not trigger a 57-run recomputation.
 */
function capacityCurveKeyOf(active: EnergyRecord[], config: BatteryConfig): string {
  const first = active.length > 0 ? active[0].timestamp.getTime() : 0;
  const last = active.length > 0 ? active[active.length - 1].timestamp.getTime() : 0;
  return [
    active.length,
    first,
    last,
    config.maxDischargePercent,
    config.minReserve,
    config.electricityPrice,
    config.roundTripEfficiency,
    config.feedInPrice,
  ].join('|');
}

function recompute(
  allRecords: EnergyRecord[],
  availableYears: number[],
  chartConfig: ChartConfig,
  batteryConfig: BatteryConfig,
  previous: { capacityCurveKey: string; capacityRecommendation: CapacityRecommendation | null }
): DerivedState {
  const active = selectActiveRecords(allRecords, availableYears, chartConfig);

  if (active.length === 0) {
    return { batterySimulation: null, capacityRecommendation: null, capacityCurveKey: '' };
  }

  let batterySimulation: BatterySimulationResult | null = null;
  try {
    batterySimulation = simulateBattery(active, batteryConfig);
  } catch (error) {
    console.error('Battery simulation error:', error);
  }

  const key = capacityCurveKeyOf(active, batteryConfig);
  let capacityRecommendation = previous.capacityRecommendation;
  if (key !== previous.capacityCurveKey || capacityRecommendation === null) {
    try {
      capacityRecommendation = recommendCapacity(active, batteryConfig);
    } catch (error) {
      console.error('Capacity recommendation error:', error);
      capacityRecommendation = null;
    }
  }

  return { batterySimulation, capacityRecommendation, capacityCurveKey: key };
}

function selectActiveRecords(
  allRecords: EnergyRecord[],
  availableYears: number[],
  chartConfig: ChartConfig
): EnergyRecord[] {
  const { rangeMode, selectedYears, timeRange } = chartConfig;

  switch (rangeMode) {
    case 'years': {
      if (selectedYears.length === 0) return allRecords;
      const yearSet = new Set(selectedYears);
      return allRecords.filter((r) => yearSet.has(r.timestamp.getFullYear()));
    }
    case 'last': {
      const pool = selectedYears.length > 0 ? selectedYears : availableYears;
      if (pool.length === 0) return allRecords;
      const targetYear = Math.max(...pool);
      return allRecords.filter((r) => r.timestamp.getFullYear() === targetYear);
    }
    case 'selection': {
      if (!timeRange) return allRecords;
      return filterByTimeRange(allRecords, timeRange.start, timeRange.end);
    }
    default:
      return allRecords;
  }
}

export const useEnergyStore = create<EnergyStore>((set, get) => ({
  // Initial state
  yearlyData: new Map(),
  allRecords: [],
  availableYears: [],
  chartConfig: createDefaultChartConfig(),
  batteryConfig: createDefaultBatteryConfig(),
  batterySimulation: null,
  capacityRecommendation: null,
  capacityCurveKey: '',
  highlightedSeries: [],

  // Actions
  addData: (consumptionData: RawDataPoint[], productionData: RawDataPoint[]) => {
    const previousYears = new Set(get().availableYears);
    const yearMap = mergeAndGroupByYear(consumptionData, productionData);

    // Which side did this batch actually carry? A batch with only the
    // consumption file must not blank out production already in the store
    // (and vice versa), while re-importing the same file must not double it.
    const batchHasConsumption = consumptionData.length > 0;
    const batchHasProduction = productionData.length > 0;

    const newYearlyData = new Map<number, YearlyData>();
    const allRecords: EnergyRecord[] = [];

    for (const [year, records] of yearMap) {
      const existingYearData = get().yearlyData.get(year);

      let mergedRecords: EnergyRecord[];

      if (existingYearData) {
        // Start from what is already stored, then overlay the incoming batch
        // field by field: a field is only replaced when the batch carries it.
        const byTimestamp = new Map<number, EnergyRecord>();
        for (const record of existingYearData.records) {
          byTimestamp.set(record.timestamp.getTime(), { ...record });
        }
        for (const record of records) {
          const key = record.timestamp.getTime();
          const existing = byTimestamp.get(key);
          if (existing) {
            if (batchHasConsumption) existing.consumption = record.consumption;
            if (batchHasProduction) existing.production = record.production;
          } else {
            byTimestamp.set(key, { ...record });
          }
        }
        mergedRecords = Array.from(byTimestamp.values());
      } else {
        mergedRecords = records;
      }

      const uniqueRecords = mergedRecords.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      const statistics = calculateYearStatistics(uniqueRecords, year);
      const { hasProduction, hasConsumption } = computeHasFlags(uniqueRecords);

      newYearlyData.set(year, {
        year,
        records: uniqueRecords,
        statistics,
        hasProduction,
        hasConsumption,
      });

      for (const record of uniqueRecords) allRecords.push(record);
    }

    // Keep years that this batch did not touch.
    for (const [year, data] of get().yearlyData) {
      if (!newYearlyData.has(year)) {
        newYearlyData.set(year, data);
        for (const record of data.records) allRecords.push(record);
      }
    }

    const availableYears = Array.from(newYearlyData.keys()).sort((a, b) => a - b);

    // Sort all records
    allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const { batteryConfig, chartConfig: currentChartConfig } = get();

    // Show what was just imported. Keeping the previous selection meant an
    // import could change nothing on screen — the new year appeared only as a
    // dimmed badge — which read as "the files did not load".
    const carried = carriedYears(yearMap);
    const previousSelection = currentChartConfig.selectedYears.filter(y =>
      availableYears.includes(y)
    );
    const alreadySelected =
      carried.length > 0 && carried.every(y => previousSelection.includes(y));
    const newSelectedYears =
      carried.length === 0 || alreadySelected ? previousSelection : carried;

    const selectionChanged =
      newSelectedYears.length !== previousSelection.length ||
      newSelectedYears.some(y => !previousSelection.includes(y));

    // An import carrying several years lands in the comparison view, where a
    // daily bar per year is a wall of noise — four years is 1 460 bars over
    // 365 categories. Monthly is the granularity at which a multi-year chart
    // can actually be read; the user can switch back at any time. Only on a
    // changed selection, so a re-import does not undo their own choice.
    const switchToMonthly = selectionChanged && newSelectedYears.length > 1;

    const chartConfig: ChartConfig = {
      ...currentChartConfig,
      selectedYears: newSelectedYears,
      aggregationType: switchToMonthly ? 'monthly' : currentChartConfig.aggregationType,
      // A range brushed in the previous year would leave every panel empty
      // once the selection moves to the imported year.
      timeRange: selectionChanged ? null : currentChartConfig.timeRange,
      rangeMode:
        selectionChanged && currentChartConfig.rangeMode === 'selection'
          ? 'years'
          : currentChartConfig.rangeMode,
      // Series names change with the imported years, and a name left over from
      // the previous set would silently hide a freshly imported year.
      hiddenSeries: selectionChanged ? [] : currentChartConfig.hiddenSeries,
    };

    set({
      yearlyData: newYearlyData,
      allRecords,
      availableYears,
      chartConfig,
      ...recompute(allRecords, availableYears, chartConfig, batteryConfig, get()),
    });

    let recordCount = 0;
    for (const records of yearMap.values()) recordCount += records.length;

    return {
      years: carried,
      recordCount,
      newYears: carried.filter(y => !previousYears.has(y)),
      selectionChanged,
    };
  },

  /**
   * "Vymazat všechna data" – returns the app to its first-run state.
   * The battery configuration is reset too, so the next import is not silently
   * evaluated against sliders left over from the previous dataset.
   */
  clearData: () => {
    set({
      yearlyData: new Map(),
      allRecords: [],
      availableYears: [],
      chartConfig: createDefaultChartConfig(),
      batteryConfig: createDefaultBatteryConfig(),
      batterySimulation: null,
      capacityRecommendation: null,
      capacityCurveKey: '',
      highlightedSeries: [],
    });
  },

  setAggregationType: (type: AggregationType) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        aggregationType: type,
      },
    });
  },

  /** Changes the active range, so everything derived is recomputed. */
  setSelectedYears: (years: number[]) => {
    const state = get();
    const chartConfig: ChartConfig = { ...state.chartConfig, selectedYears: years };
    set({
      chartConfig,
      ...recompute(
        state.allRecords,
        state.availableYears,
        chartConfig,
        state.batteryConfig,
        state
      ),
    });
  },

  setTimeRange: (range: TimeRange | null) => {
    const state = get();
    const chartConfig: ChartConfig = {
      ...state.chartConfig,
      timeRange: range,
      // Brushing a range in the chart switches every panel to that range.
      // Clearing it returns to whichever mode was active before.
      rangeMode: range
        ? 'selection'
        : state.chartConfig.rangeMode === 'selection'
          ? 'years'
          : state.chartConfig.rangeMode,
    };
    set({
      chartConfig,
      ...recompute(
        state.allRecords,
        state.availableYears,
        chartConfig,
        state.batteryConfig,
        state
      ),
    });
  },

  toggleConsumption: () => {
    set({
      chartConfig: {
        ...get().chartConfig,
        showConsumption: !get().chartConfig.showConsumption,
      },
    });
  },

  toggleProduction: () => {
    set({
      chartConfig: {
        ...get().chartConfig,
        showProduction: !get().chartConfig.showProduction,
      },
    });
  },

  /**
   * Shows or hides a single series from the filter under the chart.
   *
   * Hiding is purely visual: the series stays in the active range, so the
   * statistics and the battery simulation are unaffected — the filter answers
   * "which lines do I want to look at", not "which data counts".
   */
  toggleSeriesVisibility: (name: string) => {
    const { hiddenSeries } = get().chartConfig;
    set({
      chartConfig: {
        ...get().chartConfig,
        hiddenSeries: hiddenSeries.includes(name)
          ? hiddenSeries.filter((n) => n !== name)
          : [...hiddenSeries, name],
      },
    });
  },

  setDayNightConfig: (config: DayNightConfig) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        dayNightConfig: config,
      },
    });
  },

  setBatteryConfig: (config: Partial<BatteryConfig>) => {
    const state = get();
    const batteryConfig: BatteryConfig = { ...state.batteryConfig, ...config };
    set({
      batteryConfig,
      ...recompute(
        state.allRecords,
        state.availableYears,
        state.chartConfig,
        batteryConfig,
        state
      ),
    });
  },

  removeYear: (year: number) => {
    const { yearlyData, allRecords, chartConfig, batteryConfig } = get();

    // Remove year from yearlyData
    const newYearlyData = new Map(yearlyData);
    newYearlyData.delete(year);

    // Filter allRecords by year
    const newAllRecords = allRecords.filter(
      r => r.timestamp.getFullYear() !== year
    );

    // Recompute availableYears from yearlyData keys (sorted)
    const newAvailableYears = Array.from(newYearlyData.keys()).sort((a, b) => a - b);

    // Remove year from selectedYears
    const newSelectedYears = chartConfig.selectedYears.filter(y => y !== year);

    // Drop a chart selection that pointed into the removed year, otherwise the
    // statistics panel would silently show an empty range.
    const selectionStillValid =
      chartConfig.timeRange !== null &&
      newAllRecords.some(
        r =>
          r.timestamp >= chartConfig.timeRange!.start &&
          r.timestamp <= chartConfig.timeRange!.end
      );
    const newTimeRange = selectionStillValid ? chartConfig.timeRange : null;
    const newRangeMode =
      chartConfig.rangeMode === 'selection' && !selectionStillValid
        ? 'years'
        : chartConfig.rangeMode;

    const newChartConfig: ChartConfig = {
      ...chartConfig,
      selectedYears: newSelectedYears,
      timeRange: newTimeRange,
      rangeMode: newRangeMode,
    };

    set({
      yearlyData: newYearlyData,
      allRecords: newAllRecords,
      availableYears: newAvailableYears,
      chartConfig: newChartConfig,
      ...recompute(newAllRecords, newAvailableYears, newChartConfig, batteryConfig, get()),
    });
  },

  setRangeMode: (mode: RangeMode) => {
    const state = get();
    const chartConfig: ChartConfig = { ...state.chartConfig, rangeMode: mode };
    set({
      chartConfig,
      ...recompute(
        state.allRecords,
        state.availableYears,
        chartConfig,
        state.batteryConfig,
        state
      ),
    });
  },

  /** Purely a chart appearance switch — nothing derived depends on it. */
  /**
   * Which half of the day the chart counts. `sum` and `both` draw the same
   * bars — `both` only adds the breakdown to the tooltip — while `day` and
   * `night` cut the data down.
   *
   * A view setting, like `hiddenSeries`: it clips the chart and its tooltip,
   * not the active range. The statistics and the battery simulation keep
   * reading whole days, and the "ve dne / v noci" tiles keep showing both
   * halves, so no number silently changes meaning under the user.
   */
  setConsumptionSplit: (split: ConsumptionSplit) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        consumptionSplit: split,
      },
    });
  },

  setChartMode: (mode: ChartMode) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        chartMode: mode,
      },
    });
  },

  /**
   * Whether what was bought is drawn below the zero line.
   *
   * Only the direction of the drawing: the series carry `plotSign`, so every
   * number the user reads comes out the same either way.
   */
  setConsumptionBelowAxis: (below: boolean) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        consumptionBelowAxis: below,
      },
    });
  },

  /**
   * Pointing at a chip in the filter highlights its series in the chart.
   *
   * Sets store state outside `chartConfig`, so a mouse crossing the chips does
   * not drag the battery simulation through a recompute on every pixel.
   */
  setHighlightedSeries: (names: string[]) => {
    set({ highlightedSeries: names });
  },

  /**
   * The range the chart is currently zoomed to.
   *
   * Unlike `setTimeRange` this does not switch `rangeMode`: zooming is how the
   * user reads the chart, not a decision that the statistics and the battery
   * simulation should follow. The range is kept ready so that switching to
   * "Výseč v grafu" applies exactly what is on screen.
   */
  setZoomRange: (range: TimeRange | null) => {
    const { chartConfig } = get();
    const current = chartConfig.timeRange;
    const same =
      (current === null && range === null) ||
      (current !== null &&
        range !== null &&
        current.start.getTime() === range.start.getTime() &&
        current.end.getTime() === range.end.getTime());
    if (same) return;

    const nextConfig: ChartConfig = { ...chartConfig, timeRange: range };
    // Only worth recomputing while the panels are actually following the
    // selection; otherwise the new range just sits there until they do.
    if (chartConfig.rangeMode !== 'selection') {
      set({ chartConfig: nextConfig });
      return;
    }
    const { allRecords, availableYears, batteryConfig } = get();
    set({
      chartConfig: nextConfig,
      ...recompute(allRecords, availableYears, nextConfig, batteryConfig, get()),
    });
  },

  getActiveRecords: (): EnergyRecord[] => {
    const { allRecords, availableYears, chartConfig } = get();
    return selectActiveRecords(allRecords, availableYears, chartConfig);
  },
}));
