import { create } from 'zustand';
import {
  EnergyRecord,
  YearlyData,
  YearStatistics,
  ChartConfig,
  BatteryConfig,
  BatterySimulationResult,
  AggregationType,
  DayNightConfig,
  TimeRange,
  RawDataPoint,
} from '../types/energy';
import { simulateBattery } from '../utils/batteryAlgorithm';

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
  
  // UI state
  isLoading: boolean;
  errors: string[];
  
  // Actions
  addData: (consumptionData: RawDataPoint[], productionData: RawDataPoint[]) => void;
  clearData: () => void;
  setAggregationType: (type: AggregationType) => void;
  setSelectedYears: (years: number[]) => void;
  setTimeRange: (range: TimeRange | null) => void;
  toggleConsumption: () => void;
  toggleProduction: () => void;
  setDayNightConfig: (config: DayNightConfig) => void;
  setBatteryConfig: (config: Partial<BatteryConfig>) => void;
  runBatterySimulation: () => void;
  setLoading: (loading: boolean) => void;
  addError: (error: string) => void;
  clearErrors: () => void;
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
};

const DEFAULT_BATTERY_CONFIG: BatteryConfig = {
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
};

function calculateYearStatistics(records: EnergyRecord[], year: number): YearStatistics {
  if (records.length === 0) {
    return {
      year,
      totalConsumption: 0,
      totalProduction: 0,
      avgDailyConsumption: 0,
      avgDailyProduction: 0,
      peakConsumption: 0,
      peakProduction: 0,
      peakConsumptionDate: null,
      peakProductionDate: null,
      selfSufficiencyRatio: 0,
      daysWithData: 0,
    };
  }

  // NOTE: ČEZ data represents grid balance:
  //   consumption = energy imported from grid
  //   production = energy exported to grid (FVE surplus)
  // In any given 15-min interval, typically only one of these is non-zero
  // (either we import or export, not both simultaneously)
  
  let totalGridImport = 0;
  let totalGridExport = 0;
  let peakConsumption = 0;
  let peakProduction = 0;
  let peakConsumptionDate: Date | null = null;
  let peakProductionDate: Date | null = null;
  
  const daysSet = new Set<string>();

  for (const record of records) {
    totalGridImport += record.consumption;
    totalGridExport += record.production;
    
    if (record.consumption > peakConsumption) {
      peakConsumption = record.consumption;
      peakConsumptionDate = record.timestamp;
    }
    
    if (record.production > peakProduction) {
      peakProduction = record.production;
      peakProductionDate = record.timestamp;
    }
    
    const dayKey = record.timestamp.toISOString().split('T')[0];
    daysSet.add(dayKey);
  }

  const daysWithData = daysSet.size;
  const avgDailyConsumption = daysWithData > 0 ? totalGridImport / daysWithData : 0;
  const avgDailyProduction = daysWithData > 0 ? totalGridExport / daysWithData : 0;
  
  // Ratio of grid export to grid import - indicates how much FVE surplus
  // could potentially cover grid imports (if storage/timing were perfect)
  // This is NOT true self-sufficiency (which would require knowing direct self-consumption)
  const selfSufficiencyRatio = totalGridImport > 0 
    ? Math.min(100, (totalGridExport / totalGridImport) * 100) 
    : 0;

  return {
    year,
    totalConsumption: totalGridImport,
    totalProduction: totalGridExport,
    avgDailyConsumption,
    avgDailyProduction,
    peakConsumption,
    peakProduction,
    peakConsumptionDate,
    peakProductionDate,
    selfSufficiencyRatio,
    daysWithData,
  };
}

function mergeAndGroupByYear(
  consumptionData: RawDataPoint[],
  productionData: RawDataPoint[]
): Map<number, EnergyRecord[]> {
  // Create a map of timestamp -> record
  const recordMap = new Map<number, EnergyRecord>();

  // CSV data contains values in kW (power) for 15-minute intervals
  // To convert to kWh (energy), we divide by 4 (since 15 min = 1/4 hour)
  const KW_TO_KWH_15MIN = 4;

  // Add consumption data
  for (const point of consumptionData) {
    const key = point.timestamp.getTime();
    const existing = recordMap.get(key);
    const energyKwh = point.value / KW_TO_KWH_15MIN;
    if (existing) {
      existing.consumption = energyKwh;
    } else {
      recordMap.set(key, {
        timestamp: point.timestamp,
        consumption: energyKwh,
        production: 0,
      });
    }
  }

  // Add production data
  for (const point of productionData) {
    const key = point.timestamp.getTime();
    const existing = recordMap.get(key);
    const energyKwh = point.value / KW_TO_KWH_15MIN;
    if (existing) {
      existing.production = energyKwh;
    } else {
      recordMap.set(key, {
        timestamp: point.timestamp,
        consumption: 0,
        production: energyKwh,
      });
    }
  }

  // Group by year
  const yearMap = new Map<number, EnergyRecord[]>();
  for (const record of recordMap.values()) {
    const year = record.timestamp.getFullYear();
    const yearRecords = yearMap.get(year) || [];
    yearRecords.push(record);
    yearMap.set(year, yearRecords);
  }

  // Sort each year's records by timestamp
  for (const [year, records] of yearMap) {
    records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    yearMap.set(year, records);
  }

  return yearMap;
}

export const useEnergyStore = create<EnergyStore>((set, get) => ({
  // Initial state
  yearlyData: new Map(),
  allRecords: [],
  availableYears: [],
  chartConfig: DEFAULT_CHART_CONFIG,
  batteryConfig: DEFAULT_BATTERY_CONFIG,
  batterySimulation: null,
  isLoading: false,
  errors: [],

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
      
      newYearlyData.set(year, {
        year,
        records: uniqueRecords,
        statistics,
      });
      
      allRecords.push(...uniqueRecords);
    }
    
    // Merge with existing years that weren't updated
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
    // (first load), default to the latest year
    const preservedSelection = currentChartConfig.selectedYears.filter(y => 
      availableYears.includes(y)
    );
    const newSelectedYears = preservedSelection.length > 0
      ? preservedSelection
      : availableYears.length > 0 
        ? [availableYears[availableYears.length - 1]] 
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
    set({
      chartConfig: {
        ...get().chartConfig,
        timeRange: range,
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
        set({ 
          batteryConfig: newConfig,
          errors: [...get().errors, `Chyba při simulaci baterie: ${error}`],
        });
      }
    } else {
      set({ batteryConfig: newConfig });
    }
  },

  runBatterySimulation: () => {
    const { allRecords, batteryConfig } = get();
    
    if (allRecords.length === 0) {
      return;
    }
    
    set({ isLoading: true });
    
    // Run simulation (this could be moved to a Web Worker for large datasets)
    try {
      const result = simulateBattery(allRecords, batteryConfig);
      set({ batterySimulation: result, isLoading: false });
    } catch (error) {
      set({ 
        isLoading: false,
        errors: [...get().errors, `Chyba při simulaci baterie: ${error}`],
      });
    }
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  addError: (error: string) => {
    set({ errors: [...get().errors, error] });
  },

  clearErrors: () => {
    set({ errors: [] });
  },
}));
