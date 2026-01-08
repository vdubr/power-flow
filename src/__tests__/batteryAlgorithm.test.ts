import { describe, it, expect } from 'vitest';
import {
  simulateBattery,
  calculateRecommendedCapacity,
  formatCurrency,
  formatEnergy,
} from '../utils/batteryAlgorithm';
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
  };

  describe('simulateBattery', () => {
    it('charges battery when there is surplus', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 1.0, 3.0), // Surplus of 2 kWh
      ];

      const result = simulateBattery(records, defaultConfig);

      expect(result.totalEnergyStored).toBeGreaterThan(0);
      expect(result.batteryStates[0].charged).toBeGreaterThan(0);
    });

    it('discharges battery when there is deficit', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 0.5, 3.0), // Surplus - charge
        createRecord('01.01.2022 20:00', 2.0, 0), // Deficit - discharge
      ];

      const result = simulateBattery(records, defaultConfig);

      expect(result.batteryStates[1].discharged).toBeGreaterThan(0);
    });

    it('respects minimum reserve', () => {
      const config: BatteryConfig = {
        ...defaultConfig,
        capacity: 5,
        minReserve: 2,
      };

      // Start with battery at 50% (2.5 kWh), need to discharge
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 20:00', 5.0, 0), // Large deficit
      ];

      const result = simulateBattery(records, config);

      // Battery should not discharge below minReserve
      expect(result.batteryStates[0].chargeLevel).toBeGreaterThanOrEqual(config.minReserve);
    });

    it('calculates annual savings correctly', () => {
      const records: EnergyRecord[] = [
        createRecord('01.01.2022 12:00', 0, 5.0), // Surplus - store
        createRecord('01.01.2022 20:00', 3.0, 0), // Use stored energy
      ];

      const result = simulateBattery(records, defaultConfig);

      // Savings = energy used from battery * price
      expect(result.annualSavings).toBeGreaterThan(0);
    });

    it('handles empty records', () => {
      const result = simulateBattery([], defaultConfig);

      expect(result.totalEnergyStored).toBe(0);
      expect(result.annualSavings).toBe(0);
      expect(result.batteryStates).toHaveLength(0);
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

      const capacity = calculateRecommendedCapacity(records);

      expect(capacity).toBeGreaterThan(0);
      expect(capacity).toBeLessThanOrEqual(30);
    });

    it('returns default for empty records', () => {
      const capacity = calculateRecommendedCapacity([]);
      expect(capacity).toBe(5); // Default value
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
      expect(formatEnergy(123)).toBe('123.0 kWh');
      expect(formatEnergy(0.5)).toBe('0.5 kWh');
    });

    it('formats large values in MWh', () => {
      expect(formatEnergy(1500)).toBe('1.5 MWh');
      expect(formatEnergy(2345.6)).toBe('2.3 MWh');
    });

    it('respects decimal places parameter', () => {
      expect(formatEnergy(123.456, 2)).toBe('123.46 kWh');
      expect(formatEnergy(1234.5, 0)).toBe('1 MWh');
    });
  });
});
