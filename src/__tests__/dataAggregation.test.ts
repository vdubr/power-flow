import { describe, it, expect } from 'vitest';
import {
  aggregateByDay,
  aggregateByWeek,
  aggregateByMonth,
  filterByTimeRange,
} from '../utils/dataAggregation';
import { EnergyRecord } from '../types/energy';

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
});
