import {
  EnergyRecord,
  BatteryConfig,
  BatterySimulationResult,
  MonthlyBatteryAnalysis,
  DailyGridImport,
  DailyAverageLevel,
} from '../types/energy';
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './dateUtils';
import {
  OFF_GRID_THRESHOLD_KWH,
  RECOMMENDED_CAPACITY_DEFAULT_KWH,
  RECOMMENDED_CAPACITY_MAX_KWH,
  RECOMMENDED_CAPACITY_MIN_KWH,
  RECOMMENDED_CAPACITY_PERCENTILE,
} from '../constants';

/**
 * Simulates battery operation over a period of energy data
 * 
 * Algorithm:
 * For each 15-minute interval:
 * 1. Calculate net energy = production - consumption
 * 2. If net > 0 (surplus): charge battery up to capacity
 * 3. If net < 0 (deficit): discharge battery (respecting min reserve)
 * 4. Track grid import/export with and without battery
 */
export function simulateBattery(
  records: EnergyRecord[],
  config: BatteryConfig
): BatterySimulationResult {
  const { capacity, maxDischargePercent, minReserve, electricityPrice } = config;
  
  // Calculate usable capacity (respecting max discharge)
  const usableCapacity = capacity * (maxDischargePercent / 100);
  const minChargeLevel = Math.max(capacity - usableCapacity, minReserve);
  
  // Start battery at minimum charge level (empty state, just above reserve)
  // This ensures the first measurable effect is real charging, not using pre-existing energy
  let currentCharge = minChargeLevel;
  
  let totalEnergyStored = 0;
  let totalEnergyUsedFromBattery = 0;
  let totalGridImportWithBattery = 0;
  let totalGridExportWithBattery = 0;
  let totalGridImportOriginal = 0;
  let totalGridExportOriginal = 0;
  
  // Monthly tracking (running sum + count instead of full chargeLevels array)
  const monthlyData = new Map<string, {
    energyStored: number;
    energyUsed: number;
    chargeSum: number;
    chargeCount: number;
  }>();

  // Daily tracking for battery charge averages
  const dailyChargeData = new Map<string, { chargeSum: number; count: number }>();

  // Daily tracking for grid import analysis
  const dailyData = new Map<string, {
    gridImport: number;
    gridImportOriginal: number;
    gridExport: number;
    totalConsumption: number;
    totalProduction: number;
  }>();
  
  for (const record of records) {
    // Net energy flow: positive = surplus (can charge), negative = deficit (need to discharge)
    const netEnergy = record.production - record.consumption;
    
    // Original grid flows (without battery)
    // If net > 0: we have surplus, export to grid
    // If net < 0: we have deficit, import from grid
    const originalGridImport = netEnergy < 0 ? Math.abs(netEnergy) : 0;
    const originalGridExport = netEnergy > 0 ? netEnergy : 0;
    
    totalGridImportOriginal += originalGridImport;
    totalGridExportOriginal += originalGridExport;
    
    let charged = 0;
    let discharged = 0;
    let gridImport = originalGridImport;
    let gridExport = originalGridExport;
    
    if (netEnergy > 0) {
      // We have surplus energy from FVE - try to charge battery
      const availableToCharge = Math.min(netEnergy, capacity - currentCharge);
      
      if (availableToCharge > 0) {
        charged = availableToCharge;
        currentCharge += charged;
        totalEnergyStored += charged;
        
        // Reduce export to grid by amount stored in battery
        gridExport = netEnergy - charged;
      }
    } else if (netEnergy < 0) {
      // We have deficit - need energy from grid or battery
      const deficit = Math.abs(netEnergy);
      
      // Try to cover deficit from battery
      const availableFromBattery = Math.max(0, currentCharge - minChargeLevel);
      const dischargeAmount = Math.min(deficit, availableFromBattery);
      
      if (dischargeAmount > 0) {
        discharged = dischargeAmount;
        currentCharge -= discharged;
        totalEnergyUsedFromBattery += discharged;
        
        // Reduce import from grid by amount taken from battery
        gridImport = deficit - discharged;
      }
    }
    
    totalGridImportWithBattery += gridImport;
    totalGridExportWithBattery += gridExport;
    
    // Track daily data
    const dayKey = formatLocalDateKey(record.timestamp);
    const dayData = dailyData.get(dayKey) || {
      gridImport: 0,
      gridImportOriginal: 0,
      gridExport: 0,
      totalConsumption: 0,
      totalProduction: 0,
    };
    dayData.gridImport += gridImport;
    dayData.gridImportOriginal += originalGridImport;
    dayData.gridExport += gridExport;
    dayData.totalConsumption += record.consumption;
    dayData.totalProduction += record.production;
    dailyData.set(dayKey, dayData);
    
    // Track monthly data (running sum avoids large intermediate arrays)
    const monthKey = formatLocalMonthKey(record.timestamp);
    const monthData = monthlyData.get(monthKey) || {
      energyStored: 0,
      energyUsed: 0,
      chargeSum: 0,
      chargeCount: 0,
    };
    monthData.energyStored += charged;
    monthData.energyUsed += discharged;
    monthData.chargeSum += currentCharge;
    monthData.chargeCount += 1;
    monthlyData.set(monthKey, monthData);

    // Track daily charge averages (used by BatteryAnalysis chart)
    const dayChargeData = dailyChargeData.get(dayKey) || { chargeSum: 0, count: 0 };
    dayChargeData.chargeSum += currentCharge;
    dayChargeData.count += 1;
    dailyChargeData.set(dayKey, dayChargeData);
  }
  
  // Calculate savings
  const gridImportReduction = totalGridImportOriginal - totalGridImportWithBattery;
  const gridExportReduction = totalGridExportOriginal - totalGridExportWithBattery;
  const annualSavings = gridImportReduction * electricityPrice;
  
  // Calculate average daily charge cycles (guard against capacity = 0)
  const totalDays = dailyChargeData.size;
  const averageDailyChargeCycles =
    totalDays > 0 && capacity > 0
      ? (totalEnergyStored / capacity) / totalDays
      : 0;
  
  // Build monthly analysis (using pre-computed running sums)
  const monthlyAnalysis: MonthlyBatteryAnalysis[] = [];
  for (const [key, data] of monthlyData) {
    const [year, month] = key.split('-').map(Number);
    const avgCharge = data.chargeCount > 0 ? data.chargeSum / data.chargeCount : 0;

    // Calculate monthly savings (energy used from battery * price)
    const monthlySavings = data.energyUsed * electricityPrice;

    monthlyAnalysis.push({
      month,
      year,
      energyStored: data.energyStored,
      energyUsed: data.energyUsed,
      savings: monthlySavings,
      averageChargeLevel: avgCharge,
    });
  }
  
  // Sort monthly analysis by date
  monthlyAnalysis.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  
  // Build daily grid import analysis
  const dailyGridImport: DailyGridImport[] = [];
  let offGridDays = 0;
  
  for (const [dateStr, data] of dailyData) {
    const isOffGrid = data.gridImport < OFF_GRID_THRESHOLD_KWH;
    
    // NOTE: data.totalConsumption is grid import (ČEZ data), not household consumption
    // "Self-sufficiency" here means: what percentage of the original grid import
    // was avoided thanks to the battery (virtually covered from stored surplus)
    const originalImport = data.gridImportOriginal;
    const coveredByBattery = originalImport - data.gridImport;
    const selfSufficiencyPercent = originalImport > 0 
      ? Math.min(100, (coveredByBattery / originalImport) * 100)
      : 100;
    
    if (isOffGrid) {
      offGridDays++;
    }
    
    dailyGridImport.push({
      date: parseLocalDateKey(dateStr),
      gridImport: data.gridImport,
      gridImportOriginal: data.gridImportOriginal,
      gridExport: data.gridExport,
      isOffGrid,
      selfSufficiencyPercent,
    });
  }
  
  // Sort daily data by date
  dailyGridImport.sort((a, b) => a.date.getTime() - b.date.getTime());

  const offGridDaysPercent = totalDays > 0 ? (offGridDays / totalDays) * 100 : 0;

  // Build pre-aggregated daily average charge levels (replaces full batteryStates array)
  const dailyAverageLevels: DailyAverageLevel[] = Array.from(dailyChargeData.entries())
    .map(([date, data]) => ({
      date,
      avgCharge: data.count > 0 ? data.chargeSum / data.count : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Calculate recommended capacity
  const recommendedCapacity = calculateRecommendedCapacity(records);

  return {
    config,
    recommendedCapacity,
    annualSavings,
    totalEnergyStored,
    totalEnergyUsedFromBattery,
    gridExportReduction,
    gridImportReduction,
    averageDailyChargeCycles,
    dailyAverageLevels,
    monthlyAnalysis,
    dailyGridImport,
    offGridDays,
    offGridDaysPercent,
  };
}

/**
 * Calculate recommended battery capacity based on energy patterns
 * 
 * Strategy: Find the capacity that maximizes daily self-consumption
 * by analyzing daily surplus patterns
 */
export function calculateRecommendedCapacity(records: EnergyRecord[]): number {
  // Group by day
  const dailyData = new Map<string, { surplus: number; deficit: number }>();
  
  for (const record of records) {
    const dayKey = formatLocalDateKey(record.timestamp);
    const existing = dailyData.get(dayKey) || { surplus: 0, deficit: 0 };
    
    const net = record.production - record.consumption;
    if (net > 0) {
      existing.surplus += net;
    } else {
      existing.deficit += Math.abs(net);
    }
    
    dailyData.set(dayKey, existing);
  }
  
  // Calculate average daily surplus that could be stored
  const surpluses: number[] = [];
  for (const data of dailyData.values()) {
    // The useful storage is the minimum of surplus and deficit
    // (can only use stored energy if there's a deficit to cover)
    const usefulStorage = Math.min(data.surplus, data.deficit);
    surpluses.push(usefulStorage);
  }
  
  if (surpluses.length === 0) {
    return RECOMMENDED_CAPACITY_DEFAULT_KWH;
  }

  // Sort and pick the configured percentile as the recommendation.
  // The percentile picks a value that is comfortably above most days but
  // not driven by extreme outliers.
  surpluses.sort((a, b) => a - b);
  const idx = Math.floor(surpluses.length * RECOMMENDED_CAPACITY_PERCENTILE);
  const recommended = surpluses[idx];

  // Round to nearest 0.5 kWh and clamp to reasonable bounds
  return Math.max(
    RECOMMENDED_CAPACITY_MIN_KWH,
    Math.min(RECOMMENDED_CAPACITY_MAX_KWH, Math.round(recommended * 2) / 2)
  );
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format energy value for display
 */
export function formatEnergy(value: number, decimals: number = 1): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(decimals)} MWh`;
  }
  return `${value.toFixed(decimals)} kWh`;
}
