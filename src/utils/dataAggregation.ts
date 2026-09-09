import {
  EnergyRecord,
  AggregatedData,
  AggregationType,
  DayNightData,
  DayNightConfig,
  LocationConfig,
} from '../types/energy';
import { createIsDayPredicate, IsDayPredicate } from './dayNight';
import { formatLocalDateKey, formatLocalMonthKey } from './dateUtils';
import { MAX_RAW_CHART_POINTS } from '../constants';

/**
 * Get the start of day for a date
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of hour for a date
 */
function startOfHour(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

/**
 * Returns a "YYYY-MM-DDTHH" key based on the date's LOCAL time components.
 */
function formatLocalHourKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
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
    case 'hourly':
      return start.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + start.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
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
  getKey: (date: Date) => string
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
  endDate: Date,
  isDay?: IsDayPredicate
): AggregatedData {
  let totalConsumption = 0;
  let totalProduction = 0;
  let peakConsumption = 0;
  let peakProduction = 0;
  let peakConsumptionTime: Date | null = null;
  let peakProductionTime: Date | null = null;
  let dayConsumption = 0;
  let dayProduction = 0;
  let nightConsumption = 0;
  let nightProduction = 0;

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

    // Splitting in this same loop keeps the day/night view free: no second
    // pass over the ~35 000 records of a year.
    if (isDay) {
      if (isDay(record.timestamp)) {
        dayConsumption += record.consumption;
        dayProduction += record.production;
      } else {
        nightConsumption += record.consumption;
        nightProduction += record.production;
      }
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
    dayNight: isDay
      ? { dayConsumption, dayProduction, nightConsumption, nightProduction }
      : undefined,
  };
}

/**
 * Aggregate records by day
 */
export function aggregateByDay(
  records: EnergyRecord[],
  isDay?: IsDayPredicate
): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => formatLocalDateKey(date)
  );
  
  const result: AggregatedData[] = [];
  
  for (const [, groupRecords] of groups) {
    const start = startOfDay(groupRecords[0].timestamp);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    
    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'daily'),
      start,
      end,
      isDay
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by hour
 */
export function aggregateByHour(
  records: EnergyRecord[],
  isDay?: IsDayPredicate
): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => formatLocalHourKey(date)
  );

  const result: AggregatedData[] = [];

  for (const [, groupRecords] of groups) {
    const start = startOfHour(groupRecords[0].timestamp);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    end.setMilliseconds(-1);

    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'hourly'),
      start,
      end,
      isDay
    ));
  }

  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by week
 */
export function aggregateByWeek(
  records: EnergyRecord[],
  isDay?: IsDayPredicate
): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => formatLocalDateKey(startOfWeek(date))
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
      end,
      isDay
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Aggregate records by month
 */
export function aggregateByMonth(
  records: EnergyRecord[],
  isDay?: IsDayPredicate
): AggregatedData[] {
  const groups = groupByPeriod(
    records,
    (date) => formatLocalMonthKey(date)
  );
  
  const result: AggregatedData[] = [];
  
  for (const [, groupRecords] of groups) {
    const start = startOfMonth(groupRecords[0].timestamp);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    
    result.push(calculateAggregation(
      groupRecords,
      formatPeriod(start, end, 'monthly'),
      start,
      end,
      isDay
    ));
  }
  
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Daily totals split into day and night, for the "ve dne / v noci" statistics.
 *
 * A thin wrapper over `aggregateByDay` so the split can never drift from the
 * one the chart draws.
 */
export function aggregateByDayNight(
  records: EnergyRecord[],
  config: DayNightConfig,
  location?: LocationConfig
): DayNightData[] {
  const isDay = createIsDayPredicate(config, location);
  return aggregateByDay(records, isDay).map((period) => ({
    date: period.startDate,
    dayConsumption: period.dayNight!.dayConsumption,
    dayProduction: period.dayNight!.dayProduction,
    nightConsumption: period.dayNight!.nightConsumption,
    nightProduction: period.dayNight!.nightProduction,
  }));
}

/**
 * Get raw data for the chart, downsampled to at most `maxPoints` when there
 * are more records than that.
 *
 * Records are split into `maxPoints` chronological buckets; from each bucket
 * we keep the record with the highest consumption AND the record with the
 * highest production (deduplicated if it is the same record). Plain
 * every-Nth-record decimation would silently drop the day's peak whenever it
 * falls between the sampled indices — exactly the case that matters most for
 * a "15min" view meant to show spikes. A bucket can therefore contribute 0
 * (empty bucket), 1 (peaks coincide) or 2 records; the result is clamped
 * back towards `maxPoints` by widening the bucket count is not attempted —
 * the output stays within a small constant factor of `maxPoints` while
 * preserving both extremes, which matters far more than an exact point cap
 * for a chart.
 */
export function getRawData(
  records: EnergyRecord[],
  maxPoints: number = MAX_RAW_CHART_POINTS
): EnergyRecord[] {
  if (records.length <= maxPoints) {
    return records;
  }

  const bucketCount = Math.max(1, maxPoints);
  const bucketSize = records.length / bucketCount;
  const sampled: EnergyRecord[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = b === bucketCount - 1 ? records.length : Math.floor((b + 1) * bucketSize);
    if (start >= end) continue;

    let peakConsumptionIdx = start;
    let peakProductionIdx = start;
    for (let i = start + 1; i < end; i++) {
      if (records[i].consumption > records[peakConsumptionIdx].consumption) {
        peakConsumptionIdx = i;
      }
      if (records[i].production > records[peakProductionIdx].production) {
        peakProductionIdx = i;
      }
    }

    sampled.push(records[peakConsumptionIdx]);
    if (peakProductionIdx !== peakConsumptionIdx) {
      sampled.push(records[peakProductionIdx]);
    }
  }

  // Buckets can each add two records, so re-sort chronologically: the
  // production peak of bucket N can be recorded after the consumption peak
  // of the same or a neighbouring bucket.
  return sampled.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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

export interface TopConsumptionDay {
  date: Date;
  consumption: number;
  production: number;
}

/**
 * Returns the top N days with highest consumption, sorted descending.
 */
export function getTopConsumptionDays(
  records: EnergyRecord[],
  n: number = 10
): TopConsumptionDay[] {
  const dailyMap = new Map<string, { date: Date; consumption: number; production: number }>();

  for (const record of records) {
    const key = formatLocalDateKey(record.timestamp);
    const existing = dailyMap.get(key);
    if (existing) {
      existing.consumption += record.consumption;
      existing.production += record.production;
    } else {
      dailyMap.set(key, {
        date: startOfDay(record.timestamp),
        consumption: record.consumption,
        production: record.production,
      });
    }
  }

  return Array.from(dailyMap.values())
    .sort((a, b) => b.consumption - a.consumption)
    .slice(0, n);
}
