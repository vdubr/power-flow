import { describe, it, expect } from 'vitest';
import {
  calculateYearStatistics,
  mergeAndGroupByYear,
} from '../utils/energyData';
import { EnergyRecord, RawDataPoint } from '../types/energy';

const makeRecord = (
  isoTimestamp: string,
  consumption: number,
  production: number
): EnergyRecord => ({
  timestamp: new Date(isoTimestamp),
  consumption,
  production,
});

const makeRawPoint = (
  isoTimestamp: string,
  value: number,
  type: 'consumption' | 'production'
): RawDataPoint => ({
  timestamp: new Date(isoTimestamp),
  value,
  type,
});

describe('energyData', () => {
  describe('calculateYearStatistics', () => {
    it('returns zero stats for empty input', () => {
      const stats = calculateYearStatistics([], 2024);
      expect(stats).toEqual({
        year: 2024,
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
      });
    });

    it('sums consumption and production across records', () => {
      const records = [
        makeRecord('2024-03-01T08:00', 1.0, 0),
        makeRecord('2024-03-01T08:15', 0.5, 0.3),
        makeRecord('2024-03-01T08:30', 0.2, 1.2),
      ];
      const stats = calculateYearStatistics(records, 2024);
      expect(stats.totalConsumption).toBeCloseTo(1.7);
      expect(stats.totalProduction).toBeCloseTo(1.5);
    });

    it('counts unique days using local time (not UTC)', () => {
      // For CEST users: a 23:00 UTC measurement on Mar 31 is 01:00 Apr 1 locally.
      // Stats must count by LOCAL day to match what the user sees in charts.
      const records = [
        makeRecord('2024-06-15T01:00', 0.1, 0),
        makeRecord('2024-06-15T12:00', 0.1, 0),
        makeRecord('2024-06-15T23:45', 0.1, 0),
        makeRecord('2024-06-16T00:15', 0.1, 0),
      ];
      const stats = calculateYearStatistics(records, 2024);
      expect(stats.daysWithData).toBe(2);
    });

    it('finds peak consumption and production with their timestamps', () => {
      const peakConsRec = makeRecord('2024-01-10T18:00', 3.5, 0);
      const peakProdRec = makeRecord('2024-07-04T13:00', 0, 4.2);
      const records = [
        makeRecord('2024-01-01T00:00', 0.5, 0.1),
        peakConsRec,
        peakProdRec,
        makeRecord('2024-12-31T00:00', 0.4, 0.2),
      ];
      const stats = calculateYearStatistics(records, 2024);
      expect(stats.peakConsumption).toBe(3.5);
      expect(stats.peakConsumptionDate).toEqual(peakConsRec.timestamp);
      expect(stats.peakProduction).toBe(4.2);
      expect(stats.peakProductionDate).toEqual(peakProdRec.timestamp);
    });

    it('computes selfSufficiencyRatio as production/consumption %, capped at 100', () => {
      const stats = calculateYearStatistics(
        [
          makeRecord('2024-01-01T00:00', 10, 4),
          makeRecord('2024-01-01T00:15', 10, 1),
        ],
        2024
      );
      // 5 / 20 = 25 %
      expect(stats.selfSufficiencyRatio).toBeCloseTo(25);
    });

    it('caps selfSufficiencyRatio at 100 when production exceeds consumption', () => {
      const stats = calculateYearStatistics(
        [makeRecord('2024-01-01T00:00', 1, 50)],
        2024
      );
      expect(stats.selfSufficiencyRatio).toBe(100);
    });

    it('returns 0 selfSufficiencyRatio when no consumption', () => {
      const stats = calculateYearStatistics(
        [makeRecord('2024-01-01T00:00', 0, 5)],
        2024
      );
      expect(stats.selfSufficiencyRatio).toBe(0);
    });

    it('computes avgDaily by dividing totals by unique days', () => {
      const records = [
        makeRecord('2024-06-15T08:00', 2, 1),
        makeRecord('2024-06-15T20:00', 2, 1),
        makeRecord('2024-06-16T08:00', 4, 2),
      ];
      const stats = calculateYearStatistics(records, 2024);
      expect(stats.daysWithData).toBe(2);
      expect(stats.avgDailyConsumption).toBeCloseTo(8 / 2);
      expect(stats.avgDailyProduction).toBeCloseTo(4 / 2);
    });
  });

  describe('mergeAndGroupByYear', () => {
    it('returns empty map for empty inputs', () => {
      expect(mergeAndGroupByYear([], []).size).toBe(0);
    });

    it('converts kW power values to kWh by dividing by 4 (15-min intervals)', () => {
      const consumption = [makeRawPoint('2024-01-01T08:00', 4, 'consumption')];
      const result = mergeAndGroupByYear(consumption, []);
      const records = result.get(2024)!;
      expect(records).toHaveLength(1);
      // 4 kW for 15 min = 1 kWh
      expect(records[0].consumption).toBe(1);
      expect(records[0].production).toBe(0);
    });

    it('merges consumption and production points sharing the same timestamp', () => {
      const ts = '2024-05-01T12:00';
      const result = mergeAndGroupByYear(
        [makeRawPoint(ts, 2, 'consumption')],
        [makeRawPoint(ts, 8, 'production')]
      );
      const records = result.get(2024)!;
      expect(records).toHaveLength(1);
      expect(records[0].consumption).toBe(0.5); // 2 kW / 4
      expect(records[0].production).toBe(2); // 8 kW / 4
    });

    it('groups records by calendar year', () => {
      const result = mergeAndGroupByYear(
        [
          makeRawPoint('2022-12-31T12:00', 4, 'consumption'),
          makeRawPoint('2023-01-01T12:00', 4, 'consumption'),
          makeRawPoint('2024-06-15T12:00', 4, 'consumption'),
        ],
        []
      );
      expect(Array.from(result.keys()).sort()).toEqual([2022, 2023, 2024]);
      expect(result.get(2022)).toHaveLength(1);
      expect(result.get(2023)).toHaveLength(1);
      expect(result.get(2024)).toHaveLength(1);
    });

    it('sorts records within each year chronologically', () => {
      const result = mergeAndGroupByYear(
        [
          makeRawPoint('2024-03-15T12:00', 4, 'consumption'),
          makeRawPoint('2024-01-01T00:00', 4, 'consumption'),
          makeRawPoint('2024-12-31T23:45', 4, 'consumption'),
          makeRawPoint('2024-06-01T08:00', 4, 'consumption'),
        ],
        []
      );
      const records = result.get(2024)!;
      const times = records.map(r => r.timestamp.getTime());
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    });

    it('treats a production point without matching consumption as 0 consumption', () => {
      const result = mergeAndGroupByYear(
        [],
        [makeRawPoint('2024-06-01T08:00', 4, 'production')]
      );
      const records = result.get(2024)!;
      expect(records[0].consumption).toBe(0);
      expect(records[0].production).toBe(1);
    });

    it('sums readings that share a timestamp instead of overwriting them', () => {
      // On the autumn DST night local time 02:00–02:45 occurs twice and both
      // readings map to the same instant. Overwriting used to discard four
      // intervals of energy every year; summing keeps the total correct.
      const ts = '2024-06-01T08:00';
      const result = mergeAndGroupByYear(
        [
          makeRawPoint(ts, 4, 'consumption'),
          makeRawPoint(ts, 8, 'consumption'),
        ],
        []
      );
      expect(result.get(2024)![0].consumption).toBe(3); // (4 + 8) / 4
    });

    it('keeps the energy of the duplicated autumn DST hour', () => {
      // 27.10.2024 02:00–02:45 appears twice in a real ČEZ export.
      const points = [
        makeRawPoint('2024-10-27T02:00', 1, 'consumption'),
        makeRawPoint('2024-10-27T02:15', 1, 'consumption'),
        makeRawPoint('2024-10-27T02:00', 3, 'consumption'),
        makeRawPoint('2024-10-27T02:15', 3, 'consumption'),
      ];
      const result = mergeAndGroupByYear(points, []);
      const total = result.get(2024)!.reduce((sum, r) => sum + r.consumption, 0);
      // (1 + 1 + 3 + 3) kW over four quarter-hours = 2 kWh
      expect(total).toBeCloseTo(2);
    });
  });
});
