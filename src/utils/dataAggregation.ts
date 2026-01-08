import {
  EnergyRecord,
  AggregatedData,
  AggregationType,
  DayNightData,
  DayNightConfig,
  LocationConfig,
} from '../types/energy';
import { isDaytime, isDaytimeManual } from './sunCalculations';

/**
 * Get the start of day for a date
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of week (Monday) for a date
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of month for a date
 */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Format a date range for display
 */
function formatPeriod(start: Date, end: Date, type: AggregationType): string {
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  
  switch (type) {
    case 'daily':
      return start.toLocaleDateString('cs-CZ', options);
    case 'weekly':
      return `${start.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('cs-CZ', options)}`;
    case 'monthly':
      return start.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
    default:
      return start.toLocaleDateString('cs-CZ', options);
  }
}

/**
 * Group records by time period
 */
function groupByPeriod(
  records: EnergyRecord[],
  getKey: (date: Date) => string,
  getStart: (date: Date) => Date
): Map<string, EnergyRecord[]> {
  const groups = new Map<string, EnergyRecord[]>();
  
  for (const record of records) {
    const key = getKey(record.timestamp);
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }
  
  return groups;
}

/**
 * Calculate aggregated data from a group of records
 */
function calculateAggregation(
  records: EnergyRecord[],
  period: string,
  startDate: Date,
  endDate: Date
): AggregatedData {
  let totalConsumption = 0;
  let totalProduction = 0;
  let peakConsumption = 0;
  let peakProduction = 0;
  let peakConsumptionTime: Date | null = null;
  let peakProductionTime: Date | null = null;
  
  for (const record of records) {
    totalConsumption += record.consumption;
    totalProduction += record.production;
    
    if (record.consumption > peakConsumption) {
      peakConsumption = record.consumption;
      peakConsumptionTime = record.timestamp;
    }
    
    if (record.production > peakProduction) {
      peakProduction = record.production;
      peakProductionTime = record.timestamp;
    }
  }
  
  const avgConsumption = records.length > 0 ? totalConsumption / records.length : 0;
  const avgProduction = records.length > 0 ? totalProduction / records.length : 0;
  
  // Self-consumption ratio: simplified calculation
  const selfConsumptionRatio = totalConsumption > 0
    ? Math.min(1, totalProduction / totalConsumption) * 100
    : 0;
  
  return {
    period,
    startDate,
    endDate,
    totalConsumption,
    totalProduction,
    avgConsumption,
    avgProduction,
    peakConsumption,
    peakProduction,
    peakConsumptionTime,
    peakProductionTime,
    selfConsumptionRatio,
    recordCount: records.length,
  };
}

/**
 * Aggregate records by day
 */
export function aggregateByDay(records: EnergyRecord[]): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => date.toISOString().split('T')[0],
    startOfDay
  );
  
  const result: AggregatedData[] = [];
  
  for (const [key, groupRecords] of groups) {
    const start = startOfDay(groupRecords[0].timestamp);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    
    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'daily'),
      start,
      end
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by week
 */
export function aggregateByWeek(records: EnergyRecord[]): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => {
      const weekStart = startOfWeek(date);
      return weekStart.toISOString().split('T')[0];
    },
    startOfWeek
  );
  
  const result: AggregatedData[] = [];
  
  for (const [, groupRecords] of groups) {
    const start = startOfWeek(groupRecords[0].timestamp);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(-1);
    
    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'weekly'),
      start,
      end
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by month
 */
export function aggregateByMonth(records: EnergyRecord[]): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    startOfMonth
  );
  
  const result: AggregatedData[] = [];
  
  for (const [, groupRecords] of groups) {
    const start = startOfMonth(groupRecords[0].timestamp);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    
    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'monthly'),
      start,
      end
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by day/night
 */
export function aggregateByDayNight(
  records: EnergyRecord[],
  config: DayNightConfig,
  location?: LocationConfig
): DayNightData[] {
  // Group by date first
  const dayGroups = groupByPeriod(
    records,
    (date) => date.toISOString().split('T')[0],
    startOfDay
  );
  
  const result: DayNightData[] = [];
  
  for (const [, dayRecords] of dayGroups) {
    const date = startOfDay(dayRecords[0].timestamp);
    
    let dayConsumption = 0;
    let dayProduction = 0;
    let nightConsumption = 0;
    let nightProduction = 0;
    
    for (const record of dayRecords) {
      let isDay: boolean;
      
      if (config.mode === 'sun' && location) {
        isDay = isDaytime(record.timestamp, location);
      } else {
        isDay = isDaytimeManual(
          record.timestamp,
          config.manualDayStart,
          config.manualDayEnd
        );
      }
      
      if (isDay) {
        dayConsumption += record.consumption;
        dayProduction += record.production;
      } else {
        nightConsumption += record.consumption;
        nightProduction += record.production;
      }
    }
    
    result.push({
      date,
      dayConsumption,
      dayProduction,
      nightConsumption,
      nightProduction,
    });
  }
  
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Get raw data (no aggregation, but with optional sampling for large datasets)
 */
export function getRawData(
  records: EnergyRecord[],
  maxPoints: number = 10000
): EnergyRecord[] {
  if (records.length <= maxPoints) {
    return records;
  }
  
  // Sample data to reduce points
  const step = Math.ceil(records.length / maxPoints);
  const sampled: EnergyRecord[] = [];
  
  for (let i = 0; i < records.length; i += step) {
    sampled.push(records[i]);
  }
  
  return sampled;
}

/**
 * Main aggregation function
 */
export function aggregateData(
  records: EnergyRecord[],
  type: AggregationType,
  dayNightConfig?: DayNightConfig,
  location?: LocationConfig
): AggregatedData[] | DayNightData[] | EnergyRecord[] {
  switch (type) {
    case 'raw':
      return getRawData(records);
    case 'dayNight':
      return aggregateByDayNight(
        records,
        dayNightConfig || { mode: 'manual', manualDayStart: '06:00', manualDayEnd: '20:00' },
        location
      );
    case 'daily':
      return aggregateByDay(records);
    case 'weekly':
      return aggregateByWeek(records);
    case 'monthly':
      return aggregateByMonth(records);
    default:
      return aggregateByDay(records);
  }
}

/**
 * Filter records by time range
 */
export function filterByTimeRange(
  records: EnergyRecord[],
  start?: Date,
  end?: Date
): EnergyRecord[] {
  return records.filter((record) => {
    if (start && record.timestamp < start) return false;
    if (end && record.timestamp > end) return false;
    return true;
  });
}

/**
 * Filter records by year
 */
export function filterByYear(records: EnergyRecord[], year: number): EnergyRecord[] {
  return records.filter((record) => record.timestamp.getFullYear() === year);
}

/**
 * Normalize records to day of year (for multi-year comparison)
 * Returns records with timestamp normalized to same year (2000)
 */
export function normalizeToYear(records: EnergyRecord[]): EnergyRecord[] {
  return records.map((record) => ({
    ...record,
    timestamp: new Date(
      2000,
      record.timestamp.getMonth(),
      record.timestamp.getDate(),
      record.timestamp.getHours(),
      record.timestamp.getMinutes()
    ),
  }));
}
