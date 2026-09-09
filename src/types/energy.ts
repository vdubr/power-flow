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

/**
 * Energy of one period split by whether the sun was up.
 *
 * "Day" runs from sunrise to sunset for the configured location, or between the
 * manual hours when that mode is chosen — see `createIsDayPredicate`.
 */
export interface DayNightSplit {
  dayConsumption: number;
  dayProduction: number;
  nightConsumption: number;
  nightProduction: number;
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
  /** Present only when the aggregation was given a day/night predicate. */
  dayNight?: DayNightSplit;
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
/**
 * How records are bucketed on the chart's x-axis.
 *
 * Day/night is deliberately absent: it is a toggle (`ChartConfig.showDayNight`)
 * that applies to whichever bucketing is active, so the user does not have to
 * give up their view to see the split.
 */
export type AggregationType = 'raw' | 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Which subset of the loaded data every panel works with.
 *
 * `years` – the years ticked in the year badges (the default)
 * `last` – only the most recent of those years
 * `selection` – the range brushed in the chart
 */
export type RangeMode = 'years' | 'last' | 'selection';

export interface DayNightData extends DayNightSplit {
  date: Date;
}

// Battery simulation types
export interface BatteryConfig {
  capacity: number; // kWh - total battery capacity
  maxDischargePercent: number; // % - maximum discharge depth (e.g., 80 means can discharge to 20%)
  minReserve: number; // kWh - minimum reserve to keep
  electricityPrice: number; // CZK/kWh - price of electricity bought from the grid
  roundTripEfficiency: number; // % - share of stored energy that comes back out
  feedInPrice: number; // CZK/kWh - what exported surplus would have earned instead
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

/**
 * One point of the "what would this capacity give me" curve. Produced for a
 * range of capacities so the recommendation can be shown, not just stated.
 */
export interface CapacityCurvePoint {
  capacity: number; // kWh
  savingsPerYear: number; // CZK per year, net of the lost feed-in revenue
  gridImportReductionPerYear: number; // kWh per year
  offGridDaysPerYear: number; // days per year with no grid import
}

export interface CapacityRecommendation {
  capacity: number; // kWh - the recommended size
  savingsPerYear: number; // CZK per year at that size
  /** Share of the largest simulated battery's savings this size already captures (0–1). */
  benefitShare: number;
  /** What one more kWh would add per year at that size, in CZK. */
  marginalSavingsPerKwh: number;
  curve: CapacityCurvePoint[];
}

export interface BatterySimulationResult {
  config: BatteryConfig;
  /** Number of distinct days covered by the simulated records. */
  daysSimulated: number;

  /** Net savings over the whole simulated period, in CZK. */
  totalSavings: number;
  /** Net savings normalised to a single year, in CZK. This is what UI labels "per year". */
  savingsPerYear: number;
  /** Money not spent on grid electricity, before subtracting the lost feed-in revenue. */
  avoidedPurchasePerYear: number;
  /** Feed-in revenue given up by storing surplus instead of exporting it. */
  lostFeedInPerYear: number;

  totalEnergyStored: number; // kWh - energy that actually entered the battery
  totalEnergyUsedFromBattery: number; // kWh - energy taken back out
  gridExportReduction: number; // kWh - surplus kept instead of exported
  gridImportReduction: number; // kWh - grid purchase avoided (equals energy used from battery)
  /** Share of the original grid import covered by the battery, weighted by energy (0–100). */
  importCoveragePercent: number;

  averageDailyChargeCycles: number;
  dailyAverageLevels: DailyAverageLevel[]; // Pre-aggregated daily averages (replaces batteryStates)
  monthlyAnalysis: MonthlyBatteryAnalysis[];
  dailyGridImport: DailyGridImport[]; // Daily grid import analysis

  offGridDays: number; // days with no grid import once the battery is in place
  offGridDaysPercent: number; // share of simulated days
  /** Days that already needed no grid import without any battery. */
  baselineOffGridDays: number;
  /** Days the battery actually turned into off-grid days. */
  offGridDaysGained: number;
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
  isOffGrid: boolean; // true if no grid import is needed once the battery is in place
  /** True if the day needed no grid import even without a battery. */
  wasAlreadyOffGrid: boolean;
  /** Share of this day's original grid import that the battery covered (0–100). */
  importCoveredPercent: number;
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

/**
 * How much of the file could actually be used. Reported to the user so they
 * know how much to trust the numbers derived from it.
 */
export interface DataQuality {
  totalRows: number; // data rows seen in the file (excluding the header)
  validRows: number; // rows turned into measurements
  invalidStatusRows: number; // rows whose Status column says the reading is invalid/unknown
  rejectedRows: number; // rows dropped because the date or value could not be parsed
}

/**
 * What one import changed, returned by `addData` so the UI can confirm it.
 *
 * Without this the user had no way to tell a successful import from a no-op:
 * the panels kept showing the previously selected year.
 */
export interface ImportSummary {
  /** Years the batch carried, ascending. */
  years: number[];
  /** Unique 15-minute intervals the batch contributed, after merging both files. */
  recordCount: number;
  /** Years that were not in the store before this batch. */
  newYears: number[];
  /** Whether the visible year selection changed because of this import. */
  selectionChanged: boolean;
}

export interface CSVParseResult {
  success: boolean;
  data: RawDataPoint[];
  type: 'consumption' | 'production';
  dateRange: TimeRange | null;
  errors: string[];
  recordCount: number;
  quality: DataQuality;
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
  /**
   * Split the chart by day and night. Bar views stack a day and a night
   * segment per series; the time-axis views mark the night hours with bands.
   */
  showDayNight: boolean;
}
