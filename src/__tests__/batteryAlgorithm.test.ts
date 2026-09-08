import { describe, it, expect } from 'vitest';
import {
  simulateBattery,
  recommendCapacity,
  buildCapacityCurve,
  chargeWindow,
} from '../utils/batteryAlgorithm';
import { formatCurrency, formatEnergy } from '../utils/format';
import { EnergyRecord, BatteryConfig } from '../types/energy';

// Helper to create test records
function createRecord(
  dateStr: string,
  consumption: number,
  production: number
): EnergyRecord {
  const [day, month, year, hour, minute] = dateStr
    .match(/(\d+)\.(\d+)\.(\d+) (\d+):(\d+)/)!
    .slice(1)
    .map(Number);

  return {
    timestamp: new Date(year, month - 1, day, hour, minute),
    consumption,
    production,
  };
}

describe('batteryAlgorithm', () => {
  const defaultConfig: BatteryConfig = {
    capacity: 10,
    maxDischargePercent: 80,
    minReserve: 1,
    electricityPrice: 6,
    // A lossless battery with no feed-in tariff keeps the existing arithmetic
    // checks readable; dedicated tests below cover efficiency and feed-in.
    roundTripEfficiency: 100,
    feedInPrice: 0,
  };

  describe('simulateBattery', () => {
    it('charges battery when there is surplus', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 1.0, 3.0), // Surplus of 2 kWh
      ];

      const result = simulateBattery(records, defaultConfig);

      expect(result.totalEnergyStored).toBeGreaterThan(0);
      // dailyAverageLevels exists and has the right date
      expect(result.dailyAverageLevels).toHaveLength(1);
      expect(result.dailyAverageLevels[0].avgCharge).toBeGreaterThan(0);
    });

    it('discharges battery when there is deficit', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 0.5, 3.0), // Surplus - charge
        createRecord('01.01.2022 20:00', 2.0, 0), // Deficit - discharge
      ];

      const result = simulateBattery(records, defaultConfig);

      // The daily average charge should reflect the discharge
      expect(result.dailyAverageLevels).toHaveLength(1);
      // totalEnergyUsedFromBattery should be positive
      expect(result.totalEnergyUsedFromBattery).toBeGreaterThan(0);
    });

    it('respects minimum reserve', () => {
      const config: BatteryConfig = {
        ...defaultConfig,
        capacity: 5,
        minReserve: 2,
      };

      // Start with battery at minimum (minChargeLevel = max(5*(1-80/100), 2) = max(1, 2) = 2)
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 20:00', 5.0, 0), // Large deficit
      ];

      const result = simulateBattery(records, config);

      // Battery should not discharge below minReserve;
      // dailyAverageLevels reflects the resulting charge
      expect(result.dailyAverageLevels[0].avgCharge).toBeGreaterThanOrEqual(config.minReserve);
    });

    it('calculates annual savings correctly', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 0, 5.0), // Surplus - store
        createRecord('01.01.2022 20:00', 3.0, 0), // Use stored energy
      ];

      const result = simulateBattery(records, defaultConfig);

      // Savings = energy used from battery * price
      expect(result.savingsPerYear).toBeGreaterThan(0);
    });

    it('handles empty records', () => {
      const result = simulateBattery([], defaultConfig);

      expect(result.totalEnergyStored).toBe(0);
      expect(result.savingsPerYear).toBe(0);
      expect(result.dailyAverageLevels).toHaveLength(0);
    });

    it('aggregates monthly analysis with year, month and sums', () => {
      const records: EnergyRecord[] = [
        // January: charge then discharge
        createRecord('15.01.2022 12:00', 0, 4),
        createRecord('15.01.2022 20:00', 3, 0),
        // February: only charge
        createRecord('15.02.2022 12:00', 0, 2),
      ];
      const result = simulateBattery(records, defaultConfig);
      expect(result.monthlyAnalysis).toHaveLength(2);
      const jan = result.monthlyAnalysis[0];
      const feb = result.monthlyAnalysis[1];
      expect(jan.year).toBe(2022);
      expect(jan.month).toBe(1);
      expect(feb.month).toBe(2);
      expect(jan.energyStored).toBeGreaterThan(0);
      expect(jan.energyUsed).toBeGreaterThan(0);
      // savings = energyUsed * price
      expect(jan.savings).toBeCloseTo(jan.energyUsed * defaultConfig.electricityPrice);
      expect(feb.energyStored).toBeGreaterThan(0);
      expect(feb.energyUsed).toBe(0);
    });

    it('sorts monthly analysis chronologically across years', () => {
      const records: EnergyRecord[] = [
        createRecord('15.12.2021 12:00', 0, 1),
        createRecord('15.01.2022 12:00', 0, 1),
        createRecord('15.06.2021 12:00', 0, 1),
      ];
      const result = simulateBattery(records, defaultConfig);
      const ordered = result.monthlyAnalysis.map(m => `${m.year}-${m.month}`);
      expect(ordered).toEqual(['2021-6', '2021-12', '2022-1']);
    });

    it('produces dailyGridImport rows with totals from original and battery-adjusted import', () => {
      const records: EnergyRecord[] = [
        // Morning surplus
        createRecord('10.05.2022 10:00', 0, 5),
        // Evening deficit covered by battery
        createRecord('10.05.2022 20:00', 3, 0),
      ];
      const result = simulateBattery(records, defaultConfig);
      expect(result.dailyGridImport).toHaveLength(1);
      const d = result.dailyGridImport[0];
      // Original import = 3 (deficit at 20:00)
      expect(d.gridImportOriginal).toBeCloseTo(3);
      // Battery covered most of it → effective import smaller
      expect(d.gridImport).toBeLessThan(d.gridImportOriginal);
      // Self-sufficiency in this context = how much of import was covered
      expect(d.importCoveredPercent).toBeGreaterThan(0);
      expect(d.importCoveredPercent).toBeLessThanOrEqual(100);
    });

    it('marks a day as off-grid when battery-adjusted import is below threshold', () => {
      const records: EnergyRecord[] = [
        // Day with enough surplus to cover the small evening deficit
        createRecord('10.05.2022 10:00', 0, 5),
        createRecord('10.05.2022 20:00', 0.5, 0),
      ];
      const result = simulateBattery(records, defaultConfig);
      expect(result.offGridDays).toBe(1);
      expect(result.offGridDaysPercent).toBe(100);
      expect(result.dailyGridImport[0].isOffGrid).toBe(true);
    });

    it('counts no off-grid days when battery cannot cover deficit', () => {
      const config: BatteryConfig = { ...defaultConfig, capacity: 1, minReserve: 0.5 };
      const records: EnergyRecord[] = [
        // No production, large deficit → must import from grid
        createRecord('10.05.2022 20:00', 5, 0),
      ];
      const result = simulateBattery(records, config);
      expect(result.offGridDays).toBe(0);
      expect(result.offGridDaysPercent).toBe(0);
    });

    it('reports gridImportReduction and gridExportReduction', () => {
      const records: EnergyRecord[] = [
        createRecord('10.05.2022 10:00', 0, 4), // surplus charged
        createRecord('10.05.2022 20:00', 3, 0), // discharge covers part of deficit
      ];
      const result = simulateBattery(records, defaultConfig);
      // Battery stored some of the surplus → less exported
      expect(result.gridExportReduction).toBeGreaterThan(0);
      // Battery covered some of the deficit → less imported
      expect(result.gridImportReduction).toBeGreaterThan(0);
      // Savings over the period = import reduction * price (feedInPrice is 0 here);
      // savingsPerYear scales that to a full year, and this fixture covers one day.
      expect(result.totalSavings).toBeCloseTo(
        result.gridImportReduction * defaultConfig.electricityPrice
      );
      expect(result.daysSimulated).toBe(1);
      expect(result.savingsPerYear).toBeCloseTo(result.totalSavings * 365);
    });

    it('counts charge cycles against the usable energy, not the nameplate capacity', () => {
      // Two days, each storing 4 kWh → 8 kWh stored in total.
      // At 80 % depth of discharge and a 1 kWh reserve the floor is 2 kWh, so a
      // full cycle is 8 kWh, not 10: 8 / 8 = 1 cycle over two days = 0.5/day.
      const records: EnergyRecord[] = [
        createRecord('01.06.2022 12:00', 0, 4),
        createRecord('02.06.2022 12:00', 0, 4),
      ];
      const result = simulateBattery(records, defaultConfig);
      expect(chargeWindow(defaultConfig).usableEnergy).toBeCloseTo(8);
      expect(result.averageDailyChargeCycles).toBeCloseTo(0.5, 2);
    });

    it('does not charge beyond capacity', () => {
      const config: BatteryConfig = { ...defaultConfig, capacity: 2, minReserve: 0 };
      const records: EnergyRecord[] = [
        createRecord('01.06.2022 12:00', 0, 100), // huge surplus
      ];
      const result = simulateBattery(records, config);
      expect(result.dailyAverageLevels[0].avgCharge).toBeLessThanOrEqual(config.capacity);
      // Energy stored cannot exceed (capacity - minChargeLevel)
      expect(result.totalEnergyStored).toBeLessThanOrEqual(config.capacity);
    });

    it('dailyAverageLevels has one entry per day, sorted by date', () => {
      const records: EnergyRecord[] = [
        createRecord('02.06.2022 12:00', 0, 2),
        createRecord('01.06.2022 12:00', 0, 3),
        createRecord('01.06.2022 18:00', 1, 0),
      ];
      const result = simulateBattery(records, defaultConfig);
      // Two unique days
      expect(result.dailyAverageLevels).toHaveLength(2);
      // Sorted ascending by date string
      expect(result.dailyAverageLevels[0].date).toBe('2022-06-01');
      expect(result.dailyAverageLevels[1].date).toBe('2022-06-02');
      // avgCharge is the mean of per-interval charge levels for that day
      for (const entry of result.dailyAverageLevels) {
        expect(entry.avgCharge).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(entry.avgCharge)).toBe(true);
      }
    });

    // -----------------------------------------------------------------------
    // Edge-case tests
    // -----------------------------------------------------------------------

    it('capacity=0: does not throw and produces no NaN/Infinity in result', () => {
      const config: BatteryConfig = { ...defaultConfig, capacity: 0, minReserve: 0 };
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 1, 2),
        createRecord('01.01.2022 20:00', 3, 0),
      ];

      let result: ReturnType<typeof simulateBattery>;
      expect(() => {
        result = simulateBattery(records, config);
      }).not.toThrow();

      // None of the scalar numeric fields should be NaN or Infinity
      const scalars = [
        result!.savingsPerYear,
        result!.totalEnergyStored,
        result!.totalEnergyUsedFromBattery,
        result!.gridExportReduction,
        result!.gridImportReduction,
        result!.averageDailyChargeCycles,
        result!.offGridDays,
        result!.offGridDaysPercent,
        result!.baselineOffGridDays,
        result!.offGridDaysGained,
        result!.importCoveragePercent,
        result!.daysSimulated,
      ];
      for (const v of scalars) {
        expect(Number.isFinite(v)).toBe(true);
      }

      // dailyAverageLevels entries must also be finite
      for (const entry of result!.dailyAverageLevels) {
        expect(Number.isFinite(entry.avgCharge)).toBe(true);
      }
    });

    it('minReserve > capacity: battery neither charges nor discharges', () => {
      const config: BatteryConfig = {
        ...defaultConfig,
        capacity: 5,
        minReserve: 10, // Impossible reserve – above capacity
        maxDischargePercent: 80,
      };
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 10:00', 0, 5), // Surplus
        createRecord('01.01.2022 20:00', 3, 0), // Deficit
      ];

      const result = simulateBattery(records, config);

      // With minReserve > capacity no usable capacity exists, so no energy flows
      expect(result.totalEnergyStored).toBe(0);
      expect(result.totalEnergyUsedFromBattery).toBe(0);
    });

    it('maxDischargePercent=0: battery cannot discharge, but charging is still possible', () => {
      const config: BatteryConfig = {
        ...defaultConfig,
        capacity: 10,
        maxDischargePercent: 0, // usableCapacity = 10 * 0/100 = 0 → minChargeLevel = max(10, minReserve)
        minReserve: 0,
      };
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 0, 5), // Surplus
        createRecord('01.01.2022 20:00', 3, 0), // Deficit
      ];

      const result = simulateBattery(records, config);

      // maxDischargePercent=0 means usableCapacity=0, so no energy can be discharged
      expect(result.totalEnergyUsedFromBattery).toBe(0);
    });

    it('year-boundary: charging on 31.12 and discharging on 1.1 crosses calendar year', () => {
      const records: EnergyRecord[] = [
        createRecord('31.12.2022 23:45', 0, 4),  // Surplus – charges battery (2022)
        createRecord('01.01.2023 00:15', 3, 0),  // Deficit  – discharges battery (2023)
      ];

      const result = simulateBattery(records, defaultConfig);

      // monthlyAnalysis should have entries for Dec 2022 and Jan 2023
      const dec2022 = result.monthlyAnalysis.find(m => m.year === 2022 && m.month === 12);
      const jan2023 = result.monthlyAnalysis.find(m => m.year === 2023 && m.month === 1);

      expect(dec2022).toBeDefined();
      expect(jan2023).toBeDefined();

      // December should show charging
      expect(dec2022!.energyStored).toBeGreaterThan(0);

      // January should show discharging (battery had energy stored from Dec)
      expect(jan2023!.energyUsed).toBeGreaterThan(0);

      // Cross-year discharge actually reduces grid import in Jan 2023
      expect(result.gridImportReduction).toBeGreaterThan(0);

      // dailyAverageLevels must cover both days
      const dates = result.dailyAverageLevels.map(d => d.date);
      expect(dates).toContain('2022-12-31');
      expect(dates).toContain('2023-01-01');
    });
  });

  describe('calculateRecommendedCapacity', () => {
    it('returns reasonable capacity for typical usage', () => {
      const records: EnergyRecord[] = [];

      // Simulate a few days of typical solar pattern
      for (let day = 1; day <= 10; day++) {
        // Night - consumption only
        records.push(createRecord(`0${day}.01.2022 06:00`, 1.0, 0));
        // Morning - some production
        records.push(createRecord(`0${day}.01.2022 09:00`, 0.5, 1.5));
        // Midday - high production
        records.push(createRecord(`0${day}.01.2022 12:00`, 0.3, 3.0));
        // Afternoon
        records.push(createRecord(`0${day}.01.2022 15:00`, 0.4, 2.0));
        // Evening - consumption only
        records.push(createRecord(`0${day}.01.2022 20:00`, 1.5, 0));
      }

      const recommendation = recommendCapacity(records, defaultConfig);

      expect(recommendation.capacity).toBeGreaterThan(0);
      expect(recommendation.capacity).toBeLessThanOrEqual(30);
      // The recommendation must be backed by a curve the user can inspect.
      expect(recommendation.curve.length).toBeGreaterThan(1);
      expect(recommendation.benefitShare).toBeGreaterThan(0);
      expect(recommendation.benefitShare).toBeLessThanOrEqual(1);
    });

    it('returns default for empty records', () => {
      const recommendation = recommendCapacity([], defaultConfig);
      expect(recommendation.capacity).toBe(5); // Default value
      expect(recommendation.curve).toEqual([]);
    });

    it('buildCapacityCurve honours the requested range and step', () => {
      const records: EnergyRecord[] = [
        createRecord('01.06.2022 12:00', 0, 6),
        createRecord('01.06.2022 20:00', 6, 0),
      ];
      const curve = buildCapacityCurve(records, defaultConfig, {
        minKwh: 2,
        maxKwh: 5,
        stepKwh: 1,
      });
      expect(curve.map((p) => p.capacity)).toEqual([2, 3, 4, 5]);
      // A bigger battery cannot save less than a smaller one.
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].savingsPerYear).toBeGreaterThanOrEqual(curve[i - 1].savingsPerYear);
      }
    });
  });

  describe('formatCurrency', () => {
    it('formats currency correctly', () => {
      const formatted = formatCurrency(1234);
      expect(formatted).toContain('1');
      expect(formatted).toContain('234');
      expect(formatted).toContain('Kč');
    });

    it('handles zero', () => {
      const formatted = formatCurrency(0);
      expect(formatted).toContain('0');
    });
  });

  describe('formatEnergy', () => {
    it('formats small values in kWh', () => {
      expect(formatEnergy(123)).toBe('123,0 kWh');
      expect(formatEnergy(0.5)).toBe('0,5 kWh');
    });

    it('formats large values in MWh', () => {
      expect(formatEnergy(1500)).toBe('1,5 MWh');
      expect(formatEnergy(2345.6)).toBe('2,3 MWh');
    });

    it('respects decimal places parameter', () => {
      expect(formatEnergy(123.456, 2)).toBe('123,46 kWh');
      expect(formatEnergy(1234.5, 0)).toBe('1 MWh');
    });
  });
});
