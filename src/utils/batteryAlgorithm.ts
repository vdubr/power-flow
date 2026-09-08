import {
  EnergyRecord,
  BatteryConfig,
  BatterySimulationResult,
  MonthlyBatteryAnalysis,
  DailyGridImport,
  DailyAverageLevel,
  CapacityCurvePoint,
  CapacityRecommendation,
} from '../types/energy';
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './dateUtils';
import {
  OFF_GRID_THRESHOLD_KWH,
  RECOMMENDED_CAPACITY_DEFAULT_KWH,
  RECOMMENDED_CAPACITY_MAX_KWH,
  RECOMMENDED_CAPACITY_MIN_KWH,
  CAPACITY_CURVE_STEP_KWH,
  DAYS_PER_YEAR,
} from '../constants';

/**
 * Charge window of a battery for a given configuration.
 *
 * `maxDischargePercent` and `minReserve` both raise the floor the battery may
 * never go below; the stricter of the two wins (they are not cumulative).
 * `minReserve` above the nominal capacity would make the floor unreachable, so
 * it is clamped — an unusable battery is a configuration error, not a result.
 */
export function chargeWindow(config: BatteryConfig): {
  minChargeLevel: number;
  usableEnergy: number;
} {
  const capacity = Math.max(0, config.capacity);
  const depthOfDischarge = Math.min(100, Math.max(0, config.maxDischargePercent)) / 100;
  const reserve = Math.min(Math.max(0, config.minReserve), capacity);
  const minChargeLevel = Math.max(capacity * (1 - depthOfDischarge), reserve);
  return { minChargeLevel, usableEnergy: Math.max(0, capacity - minChargeLevel) };
}

/** Fraction of stored energy that comes back out (0–1). */
function efficiencyFactor(config: BatteryConfig): number {
  const percent = Number.isFinite(config.roundTripEfficiency)
    ? config.roundTripEfficiency
    : 100;
  return Math.min(100, Math.max(1, percent)) / 100;
}

/**
 * Core energy accounting, shared by the full simulation and the capacity curve.
 *
 * Walks the records once and tracks what the battery would absorb and return.
 * Round-trip losses are taken on the way in: storing `x` kWh of surplus puts
 * `x * efficiency` kWh into the battery, and what comes out later is used 1:1.
 *
 * `onInterval` lets the caller collect per-interval detail (daily and monthly
 * breakdowns) without paying for it when only the totals are needed.
 */
function runBattery(
  records: EnergyRecord[],
  config: BatteryConfig,
  onInterval?: (
    record: EnergyRecord,
    state: {
      charged: number;
      discharged: number;
      gridImport: number;
      gridExport: number;
      originalGridImport: number;
      chargeLevel: number;
    }
  ) => void
) {
  const { minChargeLevel } = chargeWindow(config);
  const capacity = Math.max(0, config.capacity);
  const efficiency = efficiencyFactor(config);

  // Start empty (at the floor) so the first measurable effect is real charging,
  // not energy the battery was assumed to already hold.
  let chargeLevel = minChargeLevel;

  let energyStored = 0; // what entered the battery, after losses
  let energyUsed = 0; // what came back out
  let surplusAbsorbed = 0; // surplus kept out of the grid, before losses
  let gridImportOriginal = 0;
  let gridImportWithBattery = 0;
  let gridExportOriginal = 0;
  let gridExportWithBattery = 0;

  for (const record of records) {
    const netEnergy = record.production - record.consumption;
    const originalGridImport = netEnergy < 0 ? -netEnergy : 0;
    const originalGridExport = netEnergy > 0 ? netEnergy : 0;

    gridImportOriginal += originalGridImport;
    gridExportOriginal += originalGridExport;

    let charged = 0;
    let discharged = 0;
    let gridImport = originalGridImport;
    let gridExport = originalGridExport;

    if (netEnergy > 0) {
      const room = capacity - chargeLevel;
      // Surplus is limited both by what is left over and by the room in the
      // battery; the room is expressed in stored kWh, the surplus in kWh taken
      // from the roof, hence the division by efficiency.
      const absorbed = Math.min(netEnergy, room > 0 ? room / efficiency : 0);
      if (absorbed > 0) {
        charged = absorbed * efficiency;
        chargeLevel += charged;
        energyStored += charged;
        surplusAbsorbed += absorbed;
        gridExport = netEnergy - absorbed;
      }
    } else if (netEnergy < 0) {
      const deficit = -netEnergy;
      const available = Math.max(0, chargeLevel - minChargeLevel);
      const used = Math.min(deficit, available);
      if (used > 0) {
        discharged = used;
        chargeLevel -= used;
        energyUsed += used;
        gridImport = deficit - used;
      }
    }

    gridImportWithBattery += gridImport;
    gridExportWithBattery += gridExport;

    onInterval?.(record, {
      charged,
      discharged,
      gridImport,
      gridExport,
      originalGridImport,
      chargeLevel,
    });
  }

  return {
    energyStored,
    energyUsed,
    surplusAbsorbed,
    gridImportOriginal,
    gridImportWithBattery,
    gridExportOriginal,
    gridExportWithBattery,
    gridImportReduction: gridImportOriginal - gridImportWithBattery,
    gridExportReduction: gridExportOriginal - gridExportWithBattery,
  };
}

/**
 * Net savings for one run.
 *
 * Buying less electricity is the gain; the surplus that went into the battery
 * instead of the grid no longer earns the feed-in tariff, which is the cost.
 */
function netSavings(
  gridImportReduction: number,
  gridExportReduction: number,
  config: BatteryConfig
): { total: number; avoidedPurchase: number; lostFeedIn: number } {
  const avoidedPurchase = gridImportReduction * config.electricityPrice;
  const lostFeedIn = gridExportReduction * (config.feedInPrice ?? 0);
  return { total: avoidedPurchase - lostFeedIn, avoidedPurchase, lostFeedIn };
}

/** Distinct calendar days present in the records. */
function countDays(records: EnergyRecord[]): number {
  const days = new Set<string>();
  for (const record of records) days.add(formatLocalDateKey(record.timestamp));
  return days.size;
}

/**
 * Simulates battery operation over a period of energy data.
 *
 * ČEZ data is a grid balance, so `production` is surplus exported to the grid
 * and `consumption` is energy drawn from it. In each interval the battery
 * absorbs surplus and covers deficit, and the result reports what that would
 * have changed. All "per year" figures are normalised by the number of days
 * actually covered, so loading two years does not double them.
 */
export function simulateBattery(
  records: EnergyRecord[],
  config: BatteryConfig
): BatterySimulationResult {
  const { usableEnergy } = chargeWindow(config);

  const monthlyData = new Map<
    string,
    { energyStored: number; energyUsed: number; chargeSum: number; chargeCount: number }
  >();
  const dailyChargeData = new Map<string, { chargeSum: number; count: number }>();
  const dailyData = new Map<
    string,
    { gridImport: number; gridImportOriginal: number; gridExport: number }
  >();

  const totals = runBattery(records, config, (record, state) => {
    const dayKey = formatLocalDateKey(record.timestamp);

    const dayData = dailyData.get(dayKey);
    if (dayData) {
      dayData.gridImport += state.gridImport;
      dayData.gridImportOriginal += state.originalGridImport;
      dayData.gridExport += state.gridExport;
    } else {
      dailyData.set(dayKey, {
        gridImport: state.gridImport,
        gridImportOriginal: state.originalGridImport,
        gridExport: state.gridExport,
      });
    }

    const monthKey = formatLocalMonthKey(record.timestamp);
    const monthData = monthlyData.get(monthKey);
    if (monthData) {
      monthData.energyStored += state.charged;
      monthData.energyUsed += state.discharged;
      monthData.chargeSum += state.chargeLevel;
      monthData.chargeCount += 1;
    } else {
      monthlyData.set(monthKey, {
        energyStored: state.charged,
        energyUsed: state.discharged,
        chargeSum: state.chargeLevel,
        chargeCount: 1,
      });
    }

    const dayCharge = dailyChargeData.get(dayKey);
    if (dayCharge) {
      dayCharge.chargeSum += state.chargeLevel;
      dayCharge.count += 1;
    } else {
      dailyChargeData.set(dayKey, { chargeSum: state.chargeLevel, count: 1 });
    }
  });

  const daysSimulated = dailyChargeData.size;
  const yearScale = daysSimulated > 0 ? DAYS_PER_YEAR / daysSimulated : 0;

  const savings = netSavings(totals.gridImportReduction, totals.gridExportReduction, config);

  // Cycles count against what the battery may actually use, not its nameplate
  // capacity: at 80 % depth of discharge a full cycle is 8 kWh, not 10.
  const averageDailyChargeCycles =
    daysSimulated > 0 && usableEnergy > 0
      ? totals.energyStored / usableEnergy / daysSimulated
      : 0;

  const monthlyAnalysis: MonthlyBatteryAnalysis[] = [];
  for (const [key, data] of monthlyData) {
    const [year, month] = key.split('-').map(Number);
    monthlyAnalysis.push({
      month,
      year,
      energyStored: data.energyStored,
      energyUsed: data.energyUsed,
      savings: netSavings(data.energyUsed, data.energyStored, config).total,
      averageChargeLevel: data.chargeCount > 0 ? data.chargeSum / data.chargeCount : 0,
    });
  }
  monthlyAnalysis.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  const dailyGridImport: DailyGridImport[] = [];
  let offGridDays = 0;
  let baselineOffGridDays = 0;

  for (const [dateStr, data] of dailyData) {
    const isOffGrid = data.gridImport < OFF_GRID_THRESHOLD_KWH;
    // A summer day may need no grid import even without a battery. Counting
    // those as an achievement of the battery overstated what it does.
    const wasAlreadyOffGrid = data.gridImportOriginal < OFF_GRID_THRESHOLD_KWH;

    const covered = data.gridImportOriginal - data.gridImport;
    const importCoveredPercent =
      data.gridImportOriginal > 0
        ? Math.min(100, (covered / data.gridImportOriginal) * 100)
        : 0;

    if (isOffGrid) offGridDays++;
    if (wasAlreadyOffGrid) baselineOffGridDays++;

    dailyGridImport.push({
      date: parseLocalDateKey(dateStr),
      gridImport: data.gridImport,
      gridImportOriginal: data.gridImportOriginal,
      gridExport: data.gridExport,
      isOffGrid,
      wasAlreadyOffGrid,
      importCoveredPercent,
    });
  }
  dailyGridImport.sort((a, b) => a.date.getTime() - b.date.getTime());

  const dailyAverageLevels: DailyAverageLevel[] = Array.from(dailyChargeData.entries())
    .map(([date, data]) => ({
      date,
      avgCharge: data.count > 0 ? data.chargeSum / data.count : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Energy-weighted, so a sunny day with almost no import cannot count as much
  // as a winter day that needed 40 kWh.
  const importCoveragePercent =
    totals.gridImportOriginal > 0
      ? (totals.gridImportReduction / totals.gridImportOriginal) * 100
      : 0;

  return {
    config,
    daysSimulated,

    totalSavings: savings.total,
    savingsPerYear: savings.total * yearScale,
    avoidedPurchasePerYear: savings.avoidedPurchase * yearScale,
    lostFeedInPerYear: savings.lostFeedIn * yearScale,

    totalEnergyStored: totals.energyStored,
    totalEnergyUsedFromBattery: totals.energyUsed,
    gridExportReduction: totals.gridExportReduction,
    gridImportReduction: totals.gridImportReduction,
    importCoveragePercent,

    averageDailyChargeCycles,
    dailyAverageLevels,
    monthlyAnalysis,
    dailyGridImport,

    offGridDays,
    offGridDaysPercent: daysSimulated > 0 ? (offGridDays / daysSimulated) * 100 : 0,
    baselineOffGridDays,
    offGridDaysGained: offGridDays - baselineOffGridDays,
  };
}

/**
 * Simulates a range of capacities and reports what each one would save.
 *
 * This is the evidence behind the recommendation: savings rise steeply for the
 * first few kWh and then flatten, and the user can see where that happens
 * instead of being handed a number.
 */
export function buildCapacityCurve(
  records: EnergyRecord[],
  config: BatteryConfig,
  options?: { minKwh?: number; maxKwh?: number; stepKwh?: number }
): CapacityCurvePoint[] {
  const min = options?.minKwh ?? RECOMMENDED_CAPACITY_MIN_KWH;
  const max = options?.maxKwh ?? RECOMMENDED_CAPACITY_MAX_KWH;
  const step = options?.stepKwh ?? CAPACITY_CURVE_STEP_KWH;

  if (records.length === 0 || step <= 0 || max < min) return [];

  const days = countDays(records);
  const yearScale = days > 0 ? DAYS_PER_YEAR / days : 0;

  const curve: CapacityCurvePoint[] = [];

  for (let capacity = min; capacity <= max + 1e-9; capacity += step) {
    const candidate: BatteryConfig = { ...config, capacity };

    // Off-grid days need a per-day tally, which is cheap enough to collect here.
    const dailyImport = new Map<string, number>();

    const run = runBattery(records, candidate, (record, state) => {
      const key = formatLocalDateKey(record.timestamp);
      dailyImport.set(key, (dailyImport.get(key) ?? 0) + state.gridImport);
    });

    let offGridDays = 0;
    for (const value of dailyImport.values()) {
      if (value < OFF_GRID_THRESHOLD_KWH) offGridDays++;
    }

    const savings = netSavings(run.gridImportReduction, run.gridExportReduction, candidate);

    curve.push({
      capacity: Math.round(capacity * 100) / 100,
      savingsPerYear: savings.total * yearScale,
      gridImportReductionPerYear: run.gridImportReduction * yearScale,
      offGridDaysPerYear: offGridDays * yearScale,
    });
  }

  return curve;
}

/**
 * Recommends a battery size from the capacity curve.
 *
 * Rule: the knee of the curve — the capacity where the steep early gains give
 * way to a flat tail. Both axes are normalised to 0–1 and the chord from the
 * smallest to the largest simulated battery is drawn; because the curve is
 * concave it bulges above that chord, and the point that bulges furthest is
 * the knee. On the normalised axes the chord is the diagonal, so the distance
 * reduces to `y - x`.
 *
 * The knee has no arbitrary threshold to tune and lands where the money stops
 * working: past it another kWh of battery buys a few tens of crowns a year,
 * which no home battery pays back.
 *
 * This replaces a percentile of daily surplus, which ignored the depth of
 * discharge and the order of events within a day, and could not be explained
 * to the person deciding what to buy.
 */
export function recommendCapacity(
  records: EnergyRecord[],
  config: BatteryConfig,
  curve?: CapacityCurvePoint[]
): CapacityRecommendation {
  const points = curve ?? buildCapacityCurve(records, config);

  if (points.length === 0) {
    return {
      capacity: RECOMMENDED_CAPACITY_DEFAULT_KWH,
      savingsPerYear: 0,
      benefitShare: 0,
      marginalSavingsPerKwh: 0,
      curve: points,
    };
  }

  const best = points.reduce((max, p) => Math.max(max, p.savingsPerYear), 0);

  if (best <= 0) {
    // Nothing to gain (no surplus, or a battery that cannot cycle).
    const first = points[0];
    return {
      capacity: first.capacity,
      savingsPerYear: first.savingsPerYear,
      benefitShare: 0,
      marginalSavingsPerKwh: 0,
      curve: points,
    };
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const capacitySpan = lastPoint.capacity - firstPoint.capacity;
  const savingsSpan = lastPoint.savingsPerYear - firstPoint.savingsPerYear;

  let chosenIndex = 0;
  if (capacitySpan > 0 && savingsSpan > 0) {
    let bestBulge = -Infinity;
    points.forEach((point, index) => {
      const x = (point.capacity - firstPoint.capacity) / capacitySpan;
      const y = (point.savingsPerYear - firstPoint.savingsPerYear) / savingsSpan;
      const bulge = y - x;
      if (bulge > bestBulge) {
        bestBulge = bulge;
        chosenIndex = index;
      }
    });
  }

  const chosen = points[chosenIndex];
  const next = points[chosenIndex + 1];

  const marginalSavingsPerKwh =
    next && next.capacity > chosen.capacity
      ? (next.savingsPerYear - chosen.savingsPerYear) / (next.capacity - chosen.capacity)
      : 0;

  return {
    capacity: chosen.capacity,
    savingsPerYear: chosen.savingsPerYear,
    benefitShare: chosen.savingsPerYear / best,
    marginalSavingsPerKwh,
    curve: points,
  };
}
