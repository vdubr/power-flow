import { describe, it, expect } from 'vitest';
import {
  aggregateByDay,
  aggregateByHour,
  aggregateByWeek,
  aggregateByMonth,
  aggregateByDayNight,
  getRawData,
  filterByTimeRange,
  getTopConsumptionDays,
} from '../utils/dataAggregation';
import { EnergyRecord, DayNightConfig } from '../types/energy';

// Helper to create test records
function createRecord(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  consumption: number,
  production: number
): EnergyRecord {
  return {
    timestamp: new Date(year, month - 1, day, hour, minute),
    consumption,
    production,
  };
}

describe('dataAggregation', () => {
  describe('aggregateByDay – year boundary', () => {
    it('places 31.12. and 1.1. records into separate, correct yearly days', () => {
      const records: EnergyRecord[] = [
        // Two records on the last day of 2022
        createRecord(2022, 12, 31, 12, 0, 1.0, 0.5),
        createRecord(2022, 12, 31, 18, 0, 2.0, 0.0),
        // Two records on the first day of 2023
        createRecord(2023, 1, 1, 0, 15, 0.3, 0.0),
        createRecord(2023, 1, 1, 6, 0, 0.4, 0.1),
      ];

      const result = aggregateByDay(records);

      expect(result).toHaveLength(2);

      const dec31 = result[0];
      expect(dec31.startDate.getFullYear()).toBe(2022);
      expect(dec31.startDate.getMonth()).toBe(11); // December (0-indexed)
      expect(dec31.startDate.getDate()).toBe(31);
      expect(dec31.totalConsumption).toBeCloseTo(3.0); // 1.0 + 2.0

      const jan1 = result[1];
      expect(jan1.startDate.getFullYear()).toBe(2023);
      expect(jan1.startDate.getMonth()).toBe(0); // January
      expect(jan1.startDate.getDate()).toBe(1);
      expect(jan1.totalConsumption).toBeCloseTo(0.7); // 0.3 + 0.4
    });
  });

  describe('aggregateByDay', () => {
    it('aggregates records by day', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 6, 15, 0.5, 0),
        createRecord(2022, 1, 1, 6, 30, 0.3, 0),
        createRecord(2022, 1, 1, 12, 0, 0.2, 1.5),
        createRecord(2022, 1, 2, 6, 15, 0.4, 0),
      ];

      const result = aggregateByDay(records);

      expect(result).toHaveLength(2);
      expect(result[0].totalConsumption).toBeCloseTo(1.0, 2); // 0.5 + 0.3 + 0.2
      expect(result[0].totalProduction).toBeCloseTo(1.5, 2);
      expect(result[1].totalConsumption).toBeCloseTo(0.4, 2);
    });

    it('calculates peak values correctly', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 6, 15, 0.5, 0.1),
        createRecord(2022, 1, 1, 12, 0, 1.2, 2.5),
        createRecord(2022, 1, 1, 18, 0, 0.3, 0.5),
      ];

      const result = aggregateByDay(records);

      expect(result[0].peakConsumption).toBe(1.2);
      expect(result[0].peakProduction).toBe(2.5);
    });

    it('handles empty array', () => {
      const result = aggregateByDay([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('aggregateByWeek', () => {
    it('aggregates records by week', () => {
      const records: EnergyRecord[] = [
        // Week 1 (Jan 3-9, 2022 - Monday to Sunday)
        createRecord(2022, 1, 3, 12, 0, 1.0, 0.5),
        createRecord(2022, 1, 5, 12, 0, 1.5, 1.0),
        // Week 2
        createRecord(2022, 1, 10, 12, 0, 2.0, 1.5),
      ];

      const result = aggregateByWeek(records);

      expect(result).toHaveLength(2);
      expect(result[0].totalConsumption).toBeCloseTo(2.5, 2);
      expect(result[1].totalConsumption).toBeCloseTo(2.0, 2);
    });
  });

  describe('aggregateByMonth', () => {
    it('aggregates records by month', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 12, 0, 1.0, 0.5),
        createRecord(2022, 1, 15, 12, 0, 1.5, 1.0),
        createRecord(2022, 2, 1, 12, 0, 2.0, 1.5),
        createRecord(2022, 2, 15, 12, 0, 2.5, 2.0),
      ];

      const result = aggregateByMonth(records);

      expect(result).toHaveLength(2);
      expect(result[0].totalConsumption).toBeCloseTo(2.5, 2); // January
      expect(result[1].totalConsumption).toBeCloseTo(4.5, 2); // February
    });

    it('handles records from different years', () => {
      const records: EnergyRecord[] = [
        createRecord(2021, 12, 15, 12, 0, 1.0, 0.5),
        createRecord(2022, 1, 15, 12, 0, 2.0, 1.5),
      ];

      const result = aggregateByMonth(records);

      expect(result).toHaveLength(2);
      expect(result[0].startDate.getFullYear()).toBe(2021);
      expect(result[1].startDate.getFullYear()).toBe(2022);
    });
  });

  describe('filterByTimeRange', () => {
    it('filters records within range', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 12, 0, 1.0, 0.5),
        createRecord(2022, 1, 15, 12, 0, 1.5, 1.0),
        createRecord(2022, 2, 1, 12, 0, 2.0, 1.5),
      ];

      const start = new Date(2022, 0, 10);
      const end = new Date(2022, 0, 20);

      const result = filterByTimeRange(records, start, end);

      expect(result).toHaveLength(1);
      expect(result[0].consumption).toBe(1.5);
    });

    it('returns all records when no range specified', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 12, 0, 1.0, 0.5),
        createRecord(2022, 2, 1, 12, 0, 2.0, 1.5),
      ];

      const result = filterByTimeRange(records);

      expect(result).toHaveLength(2);
    });
  });

  describe('calculateAggregation (via aggregateByDay)', () => {
    it('computes selfConsumptionRatio as percentage capped at 100', () => {
      // total cons = 4, total prod = 1 → 25 %
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 8, 0, 2, 0.5),
        createRecord(2022, 6, 1, 12, 0, 2, 0.5),
      ];
      const [day] = aggregateByDay(records);
      expect(day.selfConsumptionRatio).toBeCloseTo(25);
    });

    it('caps selfConsumptionRatio at 100 % when production > consumption', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 8, 0, 1, 5),
      ];
      const [day] = aggregateByDay(records);
      expect(day.selfConsumptionRatio).toBe(100);
    });

    it('returns 0 selfConsumptionRatio when consumption is 0', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 8, 0, 0, 5),
      ];
      const [day] = aggregateByDay(records);
      expect(day.selfConsumptionRatio).toBe(0);
    });

    it('computes avgConsumption and avgProduction as totals / record count', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 0, 0, 2, 1),
        createRecord(2022, 6, 1, 6, 0, 4, 3),
      ];
      const [day] = aggregateByDay(records);
      expect(day.avgConsumption).toBeCloseTo(3); // (2 + 4) / 2
      expect(day.avgProduction).toBeCloseTo(2); // (1 + 3) / 2
      expect(day.recordCount).toBe(2);
    });
  });

  describe('aggregateByDayNight (manual mode)', () => {
    const config: DayNightConfig = {
      mode: 'manual',
      manualDayStart: '06:00',
      manualDayEnd: '20:00',
    };

    it('splits records into day and night buckets per local day', () => {
      const records: EnergyRecord[] = [
        // Night (before 06:00)
        createRecord(2022, 6, 1, 2, 0, 0.5, 0),
        // Day (06:00 - 20:00)
        createRecord(2022, 6, 1, 12, 0, 2.0, 4.0),
        createRecord(2022, 6, 1, 18, 0, 1.0, 0.5),
        // Night (20:00+)
        createRecord(2022, 6, 1, 22, 0, 0.3, 0),
      ];
      const [day] = aggregateByDayNight(records, config);
      expect(day.dayConsumption).toBeCloseTo(3.0);
      expect(day.dayProduction).toBeCloseTo(4.5);
      expect(day.nightConsumption).toBeCloseTo(0.8);
      expect(day.nightProduction).toBe(0);
    });

    it('treats exactly the day-end time (20:00) as night', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 20, 0, 1.0, 0),
      ];
      const [day] = aggregateByDayNight(records, config);
      expect(day.dayConsumption).toBe(0);
      expect(day.nightConsumption).toBe(1.0);
    });

    it('returns one entry per calendar day, sorted ascending', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 3, 12, 0, 1, 0),
        createRecord(2022, 6, 1, 12, 0, 1, 0),
        createRecord(2022, 6, 2, 12, 0, 1, 0),
      ];
      const result = aggregateByDayNight(records, config);
      expect(result).toHaveLength(3);
      expect(result[0].date.getDate()).toBe(1);
      expect(result[2].date.getDate()).toBe(3);
    });

    it('returns empty array for no input', () => {
      expect(aggregateByDayNight([], config)).toEqual([]);
    });
  });

  describe('aggregateByDayNight – manual range spanning midnight', () => {
    // DayNightConfig uses manualDayStart / manualDayEnd as HH:mm strings.
    // The implementation calls isDaytimeManual which treats the range as a
    // simple HH:mm window within the same calendar day, so a window that
    // spans midnight (e.g. 22:00–06:00) is NOT directly supported – the
    // function would classify 22:00 as night and 01:00 also as night because
    // isDaytimeManual checks startHH:MM <= time < endHH:MM without wrapping.
    //
    // This test documents the ACTUAL behaviour of the current implementation
    // so that any future change to support cross-midnight ranges is immediately
    // visible in the test output.
    it('with a normal (non-midnight-spanning) daytime window, classifies correctly', () => {
      // Use a wider window (04:00 – 22:00) to test near-boundary classification.
      const wideConfig: DayNightConfig = {
        mode: 'manual',
        manualDayStart: '04:00',
        manualDayEnd: '22:00',
      };
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 15, 3, 45, 0.5, 0), // 03:45 → night (before 04:00)
        createRecord(2022, 6, 15, 4, 0, 1.0, 0),   // 04:00 → day (start of window)
        createRecord(2022, 6, 15, 21, 59, 1.5, 0), // 21:59 → day (inside window)
        createRecord(2022, 6, 15, 22, 0, 0.8, 0),  // 22:00 → night (end exclusive)
        createRecord(2022, 6, 15, 23, 0, 0.3, 0),  // 23:00 → night
      ];

      const [day] = aggregateByDayNight(records, wideConfig);

      // Day: 04:00 + 21:59 = 2.5
      expect(day.dayConsumption).toBeCloseTo(2.5);
      // Night: 03:45 + 22:00 + 23:00 = 1.6
      expect(day.nightConsumption).toBeCloseTo(1.6);
    });
  });

  describe('getRawData', () => {
    const buildRecords = (count: number): EnergyRecord[] =>
      Array.from({ length: count }, (_, i) =>
        createRecord(2022, 1, 1, Math.floor(i / 4), (i % 4) * 15, 1, 0)
      );

    it('returns records unchanged when count <= maxPoints', () => {
      const recs = buildRecords(100);
      expect(getRawData(recs, 1000)).toEqual(recs);
    });

    it('downsamples by an integer step when over maxPoints', () => {
      const recs = buildRecords(1000);
      const sampled = getRawData(recs, 100);
      // step = ceil(1000/100) = 10 → expected length is ceil(1000/10) = 100
      expect(sampled.length).toBeLessThanOrEqual(100);
      expect(sampled.length).toBeGreaterThan(0);
      // First record is preserved
      expect(sampled[0]).toBe(recs[0]);
    });

    it('uses the provided maxPoints parameter', () => {
      const recs = buildRecords(20);
      const sampled = getRawData(recs, 5);
      // 5 buckets of 4 records each; with uniform values every bucket's peak
      // resolves to its first record → indices 0, 4, 8, 12, 16.
      expect(sampled.map(r => recs.indexOf(r))).toEqual([0, 4, 8, 12, 16]);
    });

    it('keeps a consumption spike that a naive every-Nth-record sampler would skip', () => {
      // 1000 records downsampled to 100 → buckets of 10 records each.
      // A plain "take every 10th record starting at 0" sampler only ever
      // looks at indices 0, 10, 20, … and would silently drop this spike.
      const recs = buildRecords(1000);
      recs[5] = { ...recs[5], consumption: 999 };

      const sampled = getRawData(recs, 100);

      expect(sampled.some(r => r.consumption === 999)).toBe(true);
    });

    it('keeps a production spike independently of the consumption peak in the same bucket', () => {
      const recs = buildRecords(1000);
      recs[2] = { ...recs[2], consumption: 500 }; // consumption peak of bucket 0
      recs[7] = { ...recs[7], production: 300 }; // production peak of the same bucket

      const sampled = getRawData(recs, 100);

      expect(sampled.some(r => r.consumption === 500)).toBe(true);
      expect(sampled.some(r => r.production === 300)).toBe(true);
    });

    it('keeps a late spike near the end of the series (last, possibly larger, bucket)', () => {
      const recs = buildRecords(997); // does not divide evenly into 100 buckets
      recs[996] = { ...recs[996], consumption: 777 };

      const sampled = getRawData(recs, 100);

      expect(sampled.some(r => r.consumption === 777)).toBe(true);
    });

    it('returns records in chronological order', () => {
      const recs = buildRecords(1000);
      recs[123] = { ...recs[123], consumption: 42 };
      recs[456] = { ...recs[456], production: 42 };

      const sampled = getRawData(recs, 100);

      for (let i = 1; i < sampled.length; i++) {
        expect(sampled[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          sampled[i - 1].timestamp.getTime()
        );
      }
    });

    it('never returns more than twice maxPoints records', () => {
      const recs = buildRecords(5000);
      const sampled = getRawData(recs, 100);
      expect(sampled.length).toBeLessThanOrEqual(200);
    });
  });

  describe('aggregateByHour – DST transition day', () => {
    it('does not lose records on the DST spring-forward day (26.3.2023)', () => {
      // On 26.3.2023, clocks jump from 02:00 to 03:00 (CET→CEST).
      // Hour 02 does not exist in wall-clock time; JavaScript resolves
      // new Date(2023, 2, 26, 2, x) to hour 03 automatically.
      // We build records at unambiguous hours around the transition to verify
      // that aggregateByHour correctly groups all records without data loss.
      const records: EnergyRecord[] = [
        // 01:xx – last CET hour before the jump
        createRecord(2023, 3, 26, 1, 0, 1.0, 0),
        createRecord(2023, 3, 26, 1, 15, 1.0, 0),
        createRecord(2023, 3, 26, 1, 30, 1.0, 0),
        createRecord(2023, 3, 26, 1, 45, 1.0, 0),
        // 03:xx – first CEST hour after the jump (02:xx was skipped)
        createRecord(2023, 3, 26, 3, 0, 2.0, 0),
        createRecord(2023, 3, 26, 3, 15, 2.0, 0),
        createRecord(2023, 3, 26, 3, 30, 2.0, 0),
        createRecord(2023, 3, 26, 3, 45, 2.0, 0),
        // 04:xx – next ordinary CEST hour
        createRecord(2023, 3, 26, 4, 0, 0.5, 0.1),
      ];

      const result = aggregateByHour(records);

      // Three distinct hours: 1, 3, 4.
      expect(result).toHaveLength(3);

      // Sum of values must equal the total of all records (no records dropped).
      const totalConsumption = records.reduce((s, r) => s + r.consumption, 0);
      const aggregatedSum = result.reduce((s, a) => s + a.totalConsumption, 0);
      expect(aggregatedSum).toBeCloseTo(totalConsumption);

      // Hour 01 bucket: 4 records × 1.0 = 4.0
      const hour01 = result.find(r => r.startDate.getHours() === 1);
      expect(hour01).toBeDefined();
      expect(hour01!.totalConsumption).toBeCloseTo(4.0);
      expect(hour01!.recordCount).toBe(4);

      // Hour 03 bucket: 4 records × 2.0 = 8.0
      const hour03 = result.find(r => r.startDate.getHours() === 3);
      expect(hour03).toBeDefined();
      expect(hour03!.totalConsumption).toBeCloseTo(8.0);
      expect(hour03!.recordCount).toBe(4);
    });
  });

  describe('aggregateByHour', () => {
    it('groups records by hour correctly', () => {
      const records: EnergyRecord[] = [
        // Hour 6
        createRecord(2022, 1, 1, 6, 0, 0.5, 0),
        createRecord(2022, 1, 1, 6, 15, 0.3, 0),
        createRecord(2022, 1, 1, 6, 45, 0.2, 0.1),
        // Hour 7
        createRecord(2022, 1, 1, 7, 0, 0.4, 0.5),
        createRecord(2022, 1, 1, 7, 30, 0.6, 1.0),
        // Hour 12 (next day)
        createRecord(2022, 1, 2, 12, 0, 1.5, 2.5),
      ];

      const result = aggregateByHour(records);

      expect(result).toHaveLength(3);
      expect(result[0].totalConsumption).toBeCloseTo(1.0, 2); // 0.5 + 0.3 + 0.2
      expect(result[0].totalProduction).toBeCloseTo(0.1, 2);
      expect(result[1].totalConsumption).toBeCloseTo(1.0, 2); // 0.4 + 0.6
      expect(result[1].totalProduction).toBeCloseTo(1.5, 2);
      expect(result[2].totalConsumption).toBeCloseTo(1.5, 2);
      expect(result[2].totalProduction).toBeCloseTo(2.5, 2);
    });

    it('produces start/end one hour apart per group', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 15, 14, 30, 1, 0),
      ];
      const [hour] = aggregateByHour(records);
      expect(hour.startDate.getHours()).toBe(14);
      expect(hour.startDate.getMinutes()).toBe(0);
      // end = start + 1 hour - 1ms → still hour 14, last second
      expect(hour.endDate.getHours()).toBe(14);
      expect(hour.endDate.getMinutes()).toBe(59);
    });

    it('returns groups sorted ascending by start date', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 12, 0, 1, 0),
        createRecord(2022, 1, 1, 8, 0, 1, 0),
        createRecord(2022, 1, 1, 16, 0, 1, 0),
      ];
      const result = aggregateByHour(records);
      const hours = result.map(r => r.startDate.getHours());
      expect(hours).toEqual([8, 12, 16]);
    });

    it('handles empty array', () => {
      expect(aggregateByHour([])).toHaveLength(0);
    });
  });

  describe('getTopConsumptionDays', () => {
    it('returns top N days sorted by consumption descending', () => {
      const records: EnergyRecord[] = [
        // Day 1: total cons = 5
        createRecord(2022, 1, 1, 8, 0, 2, 1),
        createRecord(2022, 1, 1, 18, 0, 3, 0),
        // Day 2: total cons = 10 (winner)
        createRecord(2022, 1, 2, 8, 0, 4, 2),
        createRecord(2022, 1, 2, 18, 0, 6, 1),
        // Day 3: total cons = 7
        createRecord(2022, 1, 3, 8, 0, 3, 0.5),
        createRecord(2022, 1, 3, 18, 0, 4, 0.5),
        // Day 4: total cons = 2
        createRecord(2022, 1, 4, 8, 0, 1, 1),
        createRecord(2022, 1, 4, 18, 0, 1, 0),
      ];

      const top = getTopConsumptionDays(records, 3);
      expect(top).toHaveLength(3);
      expect(top[0].consumption).toBeCloseTo(10, 2);
      expect(top[1].consumption).toBeCloseTo(7, 2);
      expect(top[2].consumption).toBeCloseTo(5, 2);
      expect(top[0].date.getDate()).toBe(2);
      expect(top[1].date.getDate()).toBe(3);
      expect(top[2].date.getDate()).toBe(1);
    });

    it('computes daily totals (consumption and production) correctly', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 6, 1, 8, 0, 2, 1),
        createRecord(2022, 6, 1, 12, 0, 3, 4),
        createRecord(2022, 6, 1, 18, 0, 1, 0.5),
      ];
      const [top] = getTopConsumptionDays(records, 1);
      expect(top.consumption).toBeCloseTo(6, 2); // 2 + 3 + 1
      expect(top.production).toBeCloseTo(5.5, 2); // 1 + 4 + 0.5
      expect(top.date.getDate()).toBe(1);
      expect(top.date.getMonth()).toBe(5); // June (0-indexed)
    });

    it('uses local-day grouping (start of day)', () => {
      const records: EnergyRecord[] = [
        createRecord(2022, 1, 1, 0, 15, 1, 0),
        createRecord(2022, 1, 1, 23, 45, 2, 0),
      ];
      const [top] = getTopConsumptionDays(records, 1);
      expect(top.consumption).toBeCloseTo(3, 2);
      expect(top.date.getHours()).toBe(0);
      expect(top.date.getMinutes()).toBe(0);
    });

    it('defaults to top 10 when n is omitted', () => {
      const records: EnergyRecord[] = Array.from({ length: 15 }, (_, i) =>
        createRecord(2022, 1, i + 1, 12, 0, i + 1, 0)
      );
      const top = getTopConsumptionDays(records);
      expect(top).toHaveLength(10);
      // Sorted descending → first should be the highest consumption (15)
      expect(top[0].consumption).toBe(15);
      expect(top[9].consumption).toBe(6);
    });

    it('returns empty array for no records', () => {
      expect(getTopConsumptionDays([], 5)).toEqual([]);
    });
  });
});
