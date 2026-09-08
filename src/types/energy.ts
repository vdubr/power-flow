// Core data types for energy measurements

export interface EnergyRecord {
  timestamp: Date;
  consumption: number; // kWh - energy consumed from grid
  production: number; // kWh - energy exported to grid (from FVE)
}

export interface RawDataPoint {
  timestamp: Date;
  value: number;
  type: 'consumption' | 'production';
}

export interface AggregatedData {
  period: string;
  startDate: Date;
  endDate: Date;
  totalConsumption: number;
  totalProduction: number;
  avgConsumption: number;
  avgProduction: number;
  peakConsumption: number;
  peakProduction: number;
  peakConsumptionTime: Date | null;
  peakProductionTime: Date | null;
  selfConsumptionRatio: number; // Percentage of own consumption
  recordCount: number;
}

export interface YearlyData {
  year: number;
  records: EnergyRecord[];
  statistics: YearStatistics;
  hasProduction: boolean;
  hasConsumption: boolean;
}

export interface YearStatistics {
  year: number;
  totalConsumption: number;
  totalProduction: number;
  avgDailyConsumption: number;
  avgDailyProduction: number;
  peakConsumption: number;
  peakProduction: number;
  peakConsumptionDate: Date | null;
  peakProductionDate: Date | null;
  selfSufficiencyRatio: number;
  daysWithData: number;
}

// Aggregation types
export type AggregationType = 'raw' | 'hourly' | 'dayNight' | 'daily' | 'weekly' | 'monthly';

// Range mode controls how the active records subset is selected
export type RangeMode = 'avg' | 'last' | 'selection';

export interface DayNightData {
  date: Date;
  dayConsumption: number;
  dayProduction: number;
  nightConsumption: number;
  nightProduction: number;
}

// Battery simulation types
export interface BatteryConfig {
  capacity: number; // kWh - total battery capacity
  maxDischargePercent: number; // % - maximum discharge depth (e.g., 80 means can discharge to 20%)
  minReserve: number; // kWh - minimum reserve to keep
  electricityPrice: number; // CZK/kWh - price of electricity from grid
}

export interface BatteryState {
  timestamp: Date;
  chargeLevel: number; // kWh - current charge level
  charged: number; // kWh - energy charged in this interval
  discharged: number; // kWh - energy discharged in this interval
  gridImport: number; // kWh - energy imported from grid (with battery)
  gridExport: number; // kWh - energy exported to grid (with battery)
  originalGridImport: number; // kWh - original import without battery
  originalGridExport: number; // kWh - original export without battery
}

export interface DailyAverageLevel {
  date: string; // YYYY-MM-DD (formatLocalDateKey)
  avgCharge: number; // kWh - average charge level for the day
}

export interface BatterySimulationResult {
  config: BatteryConfig;
  recommendedCapacity: number;
  annualSavings: number; // CZK
  totalEnergyStored: number; // kWh
  totalEnergyUsedFromBattery: number; // kWh
  gridExportReduction: number; // kWh - how much less exported to grid
  gridImportReduction: number; // kWh - how much less imported from grid
  averageDailyChargeCycles: number;
  dailyAverageLevels: DailyAverageLevel[]; // Pre-aggregated daily averages (replaces batteryStates)
  monthlyAnalysis: MonthlyBatteryAnalysis[];
  dailyGridImport: DailyGridImport[]; // Daily grid import analysis
  offGridDays: number; // Number of days that could run off-grid
  offGridDaysPercent: number; // Percentage of days that could run off-grid
}

export interface MonthlyBatteryAnalysis {
  month: number;
  year: number;
  energyStored: number;
  energyUsed: number;
  savings: number;
  averageChargeLevel: number;
}

export interface DailyGridImport {
  date: Date;
  gridImport: number; // kWh - energy imported from grid with battery
  gridImportOriginal: number; // kWh - energy that would be imported without battery
  gridExport: number; // kWh - energy exported to grid with battery
  isOffGrid: boolean; // true if no grid import needed
  selfSufficiencyPercent: number; // percentage of consumption covered by FVE + battery
}

// Location for sun calculations
export interface LocationConfig {
  latitude: number;
  longitude: number;
  name?: string;
}

// Day/Night configuration
export interface DayNightConfig {
  mode: 'manual' | 'sun';
  manualDayStart: string; // HH:mm format
  manualDayEnd: string; // HH:mm format
  location?: LocationConfig;
}

// Time range for filtering
export interface TimeRange {
  start: Date;
  end: Date;
}

// CSV parsing types
export interface CSVParseResult {
  success: boolean;
  data: RawDataPoint[];
  type: 'consumption' | 'production';
  dateRange: TimeRange | null;
  errors: string[];
  recordCount: number;
}

// Chart configuration
export interface ChartConfig {
  aggregationType: AggregationType;
  selectedYears: number[];
  timeRange: TimeRange | null;
  showConsumption: boolean;
  showProduction: boolean;
  dayNightConfig: DayNightConfig;
  rangeMode: RangeMode;
  showSunOverlay: boolean;
}
