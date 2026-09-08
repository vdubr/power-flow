import { create } from 'zustand';
import {
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
import { simulateBattery } from '../utils/batteryAlgorithm';
import { mergeAndGroupByYear, calculateYearStatistics, computeHasFlags } from '../utils/energyData';
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
  batterySimulation: BatterySimulationResult | null;

  // Actions
  addData: (consumptionData: RawDataPoint[], productionData: RawDataPoint[]) => void;
  clearData: () => void;
  removeYear: (year: number) => void;
  setAggregationType: (type: AggregationType) => void;
  setSelectedYears: (years: number[]) => void;
  setTimeRange: (range: TimeRange | null) => void;
  toggleConsumption: () => void;
  toggleProduction: () => void;
  setDayNightConfig: (config: DayNightConfig) => void;
  setBatteryConfig: (config: Partial<BatteryConfig>) => void;
  setRangeMode: (mode: RangeMode) => void;
  setShowSunOverlay: (show: boolean) => void;

  // Selectors
  getActiveRecords: () => EnergyRecord[];
}

const DEFAULT_CHART_CONFIG: ChartConfig = {
  aggregationType: 'daily',
  selectedYears: [],
  timeRange: null,
  showConsumption: true,
  showProduction: true,
  dayNightConfig: {
    mode: 'manual',
    manualDayStart: '06:00',
    manualDayEnd: '20:00',
  },
  rangeMode: 'avg',
  showSunOverlay: false,
};

const DEFAULT_BATTERY_CONFIG: BatteryConfig = {
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
};

export const useEnergyStore = create<EnergyStore>((set, get) => ({
  // Initial state
  yearlyData: new Map(),
  allRecords: [],
  availableYears: [],
  chartConfig: DEFAULT_CHART_CONFIG,
  batteryConfig: DEFAULT_BATTERY_CONFIG,
  batterySimulation: null,

  // Actions
  addData: (consumptionData: RawDataPoint[], productionData: RawDataPoint[]) => {
    const yearMap = mergeAndGroupByYear(consumptionData, productionData);

    const newYearlyData = new Map<number, YearlyData>();
    const allRecords: EnergyRecord[] = [];

    for (const [year, records] of yearMap) {
      const existingYearData = get().yearlyData.get(year);

      // Merge with existing data if present
      const mergedRecords = existingYearData
        ? [...existingYearData.records, ...records]
        : records;

      // Remove duplicates based on timestamp
      const uniqueRecords = Array.from(
        new Map(mergedRecords.map(r => [r.timestamp.getTime(), r])).values()
      ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      const statistics = calculateYearStatistics(uniqueRecords, year);
      const { hasProduction, hasConsumption } = computeHasFlags(uniqueRecords);

      newYearlyData.set(year, {
        year,
        records: uniqueRecords,
        statistics,
        hasProduction,
        hasConsumption,
      });

      allRecords.push(...uniqueRecords);
    }

    // Merge with existing years that weren't updated (already have hasProduction/hasConsumption)
    for (const [year, data] of get().yearlyData) {
      if (!newYearlyData.has(year)) {
        newYearlyData.set(year, data);
        allRecords.push(...data.records);
      }
    }

    const availableYears = Array.from(newYearlyData.keys()).sort();

    // Sort all records
    allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Run battery simulation automatically with new data
    const { batteryConfig, chartConfig: currentChartConfig } = get();
    let batterySimulation: BatterySimulationResult | null = null;
    if (allRecords.length > 0) {
      try {
        batterySimulation = simulateBattery(allRecords, batteryConfig);
      } catch (error) {
        console.error('Battery simulation error:', error);
      }
    }

    // Preserve user's selected years that are still available; if none were selected
    // (first load), default to the year with the most records (most complete year).
    // This avoids defaulting to a "timezone-bleed" year that contains only a handful
    // of records (e.g. a single 1.1.YYYY 00:00 entry).
    const preservedSelection = currentChartConfig.selectedYears.filter(y =>
      availableYears.includes(y)
    );
    let defaultYear: number | null = null;
    if (availableYears.length > 0) {
      let maxCount = -1;
      for (const year of availableYears) {
        const count = newYearlyData.get(year)?.records.length ?? 0;
        if (count > maxCount) {
          maxCount = count;
          defaultYear = year;
        }
      }
    }
    const newSelectedYears = preservedSelection.length > 0
      ? preservedSelection
      : defaultYear !== null
        ? [defaultYear]
        : [];

    set({
      yearlyData: newYearlyData,
      allRecords,
      availableYears,
      chartConfig: {
        ...currentChartConfig,
        selectedYears: newSelectedYears,
      },
      batterySimulation,
    });
  },

  clearData: () => {
    set({
      yearlyData: new Map(),
      allRecords: [],
      availableYears: [],
      chartConfig: DEFAULT_CHART_CONFIG,
      batterySimulation: null,
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

  setSelectedYears: (years: number[]) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        selectedYears: years,
      },
    });
  },

  setTimeRange: (range: TimeRange | null) => {
    const current = get().chartConfig;
    set({
      chartConfig: {
        ...current,
        timeRange: range,
        // If user actively selects a range, switch to selection mode automatically
        rangeMode: range ? 'selection' : current.rangeMode,
      },
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

  setDayNightConfig: (config: DayNightConfig) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        dayNightConfig: config,
      },
    });
  },

  setBatteryConfig: (config: Partial<BatteryConfig>) => {
    const newConfig = {
      ...get().batteryConfig,
      ...config,
    };

    // Automatically run simulation when config changes
    const { allRecords } = get();
    if (allRecords.length > 0) {
      try {
        const result = simulateBattery(allRecords, newConfig);
        set({ batteryConfig: newConfig, batterySimulation: result });
      } catch (error) {
        console.error('Battery simulation error:', error);
        set({ batteryConfig: newConfig, batterySimulation: null });
      }
    } else {
      set({ batteryConfig: newConfig });
    }
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
    const newAvailableYears = Array.from(newYearlyData.keys()).sort();

    // Remove year from selectedYears
    const newSelectedYears = chartConfig.selectedYears.filter(y => y !== year);

    // Rerun battery simulation with remaining records
    let batterySimulation: BatterySimulationResult | null = null;
    if (newAllRecords.length > 0) {
      try {
        batterySimulation = simulateBattery(newAllRecords, batteryConfig);
      } catch (error) {
        console.error('Battery simulation error:', error);
      }
    }

    set({
      yearlyData: newYearlyData,
      allRecords: newAllRecords,
      availableYears: newAvailableYears,
      chartConfig: {
        ...chartConfig,
        selectedYears: newSelectedYears,
      },
      batterySimulation,
    });
  },

  setRangeMode: (mode: RangeMode) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        rangeMode: mode,
      },
    });
  },

  setShowSunOverlay: (show: boolean) => {
    set({
      chartConfig: {
        ...get().chartConfig,
        showSunOverlay: show,
      },
    });
  },

  getActiveRecords: (): EnergyRecord[] => {
    const { allRecords, availableYears, chartConfig } = get();
    const { rangeMode, selectedYears, timeRange } = chartConfig;

    switch (rangeMode) {
      case 'avg': {
        if (selectedYears.length === 0) return allRecords;
        const yearSet = new Set(selectedYears);
        return allRecords.filter(r => yearSet.has(r.timestamp.getFullYear()));
      }
      case 'last': {
        let targetYear: number | null = null;
        if (selectedYears.length > 0) {
          targetYear = Math.max(...selectedYears);
        } else if (availableYears.length > 0) {
          targetYear = Math.max(...availableYears);
        }
        if (targetYear === null) return allRecords;
        return allRecords.filter(r => r.timestamp.getFullYear() === targetYear);
      }
      case 'selection': {
        if (!timeRange) return allRecords;
        return filterByTimeRange(allRecords, timeRange.start, timeRange.end);
      }
      default:
        return allRecords;
    }
  },
}));
