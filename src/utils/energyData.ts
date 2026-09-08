import { EnergyRecord, RawDataPoint, YearStatistics } from '../types/energy';
import { formatLocalDateKey } from './dateUtils';
import { INTERVALS_PER_HOUR } from '../constants';

/**
 * Calculate statistics for a sorted list of EnergyRecords belonging to a single year.
 *
 * NOTE: ČEZ data represents grid balance:
 *   consumption = energy imported from grid (kWh)
 *   production  = energy exported to grid (kWh, FVE surplus)
 * In any given 15-min interval, typically only one of these is non-zero.
 *
 * `selfSufficiencyRatio` is therefore an upper-bound estimate of how much
 * of the grid import could potentially be covered by FVE surplus (with perfect
 * timing/storage). It is NOT true direct self-consumption.
 */
export function calculateYearStatistics(records: EnergyRecord[], year: number): YearStatistics {
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

    daysSet.add(formatLocalDateKey(record.timestamp));
  }

  const daysWithData = daysSet.size;
  const avgDailyConsumption = daysWithData > 0 ? totalGridImport / daysWithData : 0;
  const avgDailyProduction = daysWithData > 0 ? totalGridExport / daysWithData : 0;

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

/**
 * Merge consumption and production raw points (in kW) into EnergyRecords (in kWh)
 * grouped by calendar year. Records of the same timestamp from both inputs are merged.
 *
 * The CSV stores average power in kW for each 15-minute interval. To get energy
 * for the interval we divide by 4 (= 60 / INTERVAL_MINUTES).
 */
export function mergeAndGroupByYear(
  consumptionData: RawDataPoint[],
  productionData: RawDataPoint[]
): Map<number, EnergyRecord[]> {
  const recordMap = new Map<number, EnergyRecord>();

  const addPoint = (point: RawDataPoint, field: 'consumption' | 'production') => {
    const key = point.timestamp.getTime();
    const energyKwh = point.value / INTERVALS_PER_HOUR;
    const existing = recordMap.get(key);
    if (existing) {
      // Two readings can share a timestamp on the autumn DST night, when local
      // time 02:00–02:45 occurs twice and JavaScript maps both to the same
      // instant. Summing keeps the year's total energy correct; overwriting
      // used to silently discard four intervals every year.
      existing[field] += energyKwh;
    } else {
      recordMap.set(key, {
        timestamp: point.timestamp,
        consumption: field === 'consumption' ? energyKwh : 0,
        production: field === 'production' ? energyKwh : 0,
      });
    }
  };

  for (const point of consumptionData) addPoint(point, 'consumption');
  for (const point of productionData) addPoint(point, 'production');

  // Group by year and sort within year
  const yearMap = new Map<number, EnergyRecord[]>();
  for (const record of recordMap.values()) {
    const year = record.timestamp.getFullYear();
    const bucket = yearMap.get(year) ?? [];
    bucket.push(record);
    yearMap.set(year, bucket);
  }

  for (const records of yearMap.values()) {
    records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  return yearMap;
}

/**
 * Returns whether the given sorted records contain any production or consumption values.
 * Used to pre-compute hasProduction / hasConsumption on YearlyData.
 */
export function computeHasFlags(records: EnergyRecord[]): { hasProduction: boolean; hasConsumption: boolean } {
  let hasProduction = false;
  let hasConsumption = false;
  for (const r of records) {
    if (!hasProduction && r.production > 0) hasProduction = true;
    if (!hasConsumption && r.consumption > 0) hasConsumption = true;
    if (hasProduction && hasConsumption) break;
  }
  return { hasProduction, hasConsumption };
}
