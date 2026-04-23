import {
  EnergyRecord,
  BatteryConfig,
  BatteryState,
  BatterySimulationResult,
  MonthlyBatteryAnalysis,
  DailyGridImport,
} from '../types/energy';
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './dateUtils';

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
  
  const batteryStates: BatteryState[] = [];
  // Start battery at minimum charge level (empty state, just above reserve)
  // This ensures the first measurable effect is real charging, not using pre-existing energy
  let currentCharge = minChargeLevel;
  
  let totalEnergyStored = 0;
  let totalEnergyUsedFromBattery = 0;
  let totalGridImportWithBattery = 0;
  let totalGridExportWithBattery = 0;
  let totalGridImportOriginal = 0;
  let totalGridExportOriginal = 0;
  
  // Monthly tracking
  const monthlyData = new Map<string, {
    energyStored: number;
    energyUsed: number;
    chargeLevels: number[];
  }>();
  
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
    
    // Track monthly data
    const monthKey = formatLocalMonthKey(record.timestamp);
    const monthData = monthlyData.get(monthKey) || {
      energyStored: 0,
      energyUsed: 0,
      chargeLevels: [],
    };
    monthData.energyStored += charged;
    monthData.energyUsed += discharged;
    monthData.chargeLevels.push(currentCharge);
    monthlyData.set(monthKey, monthData);
    
    batteryStates.push({
      timestamp: record.timestamp,
      chargeLevel: currentCharge,
      charged,
      discharged,
      gridImport,
      gridExport,
      originalGridImport,
      originalGridExport,
    });
  }
  
  // Calculate savings
  const gridImportReduction = totalGridImportOriginal - totalGridImportWithBattery;
  const gridExportReduction = totalGridExportOriginal - totalGridExportWithBattery;
  const annualSavings = gridImportReduction * electricityPrice;
  
  // Calculate average daily charge cycles
  const daysSet = new Set(records.map(r => formatLocalDateKey(r.timestamp)));
  const totalDays = daysSet.size;
  const averageDailyChargeCycles = totalDays > 0 
    ? (totalEnergyStored / capacity) / totalDays 
    : 0;
  
  // Build monthly analysis
  const monthlyAnalysis: MonthlyBatteryAnalysis[] = [];
  for (const [key, data] of monthlyData) {
    const [year, month] = key.split('-').map(Number);
    const avgCharge = data.chargeLevels.length > 0
      ? data.chargeLevels.reduce((a, b) => a + b, 0) / data.chargeLevels.length
      : 0;
    
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
    const isOffGrid = data.gridImport < 0.01; // Less than 10Wh is considered off-grid
    
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
    batteryStates,
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
    return 5; // Default recommendation
  }
  
  // Sort and get 80th percentile as recommendation
  surpluses.sort((a, b) => a - b);
  const percentile80Index = Math.floor(surpluses.length * 0.8);
  const recommended = surpluses[percentile80Index];
  
  // Round to nearest 0.5 kWh and ensure reasonable bounds
  return Math.max(2, Math.min(30, Math.round(recommended * 2) / 2));
}

/**
 * Analyze optimal battery capacity by running simulations
 * with different capacities
 */
export function analyzeBatteryCapacities(
  records: EnergyRecord[],
  baseConfig: Omit<BatteryConfig, 'capacity'>,
  capacities: number[] = [5, 7.5, 10, 12.5, 15, 20]
): Array<{ capacity: number; savings: number; utilization: number }> {
  return capacities.map(capacity => {
    const config: BatteryConfig = { ...baseConfig, capacity };
    const result = simulateBattery(records, config);
    
    // Calculate utilization as percentage of capacity actually used
    const utilization = (result.totalEnergyUsedFromBattery / (capacity * 365)) * 100;
    
    return {
      capacity,
      savings: result.annualSavings,
      utilization: Math.min(100, utilization),
    };
  });
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
