// Centralized application constants

/**
 * Length of one measurement interval in minutes.
 * ČEZ data is in 15-minute intervals.
 */
export const INTERVAL_MINUTES = 15;

/**
 * Number of measurement intervals in one hour (15 min → 4).
 * Conversion from power to energy: energy_kWh = power_kW / INTERVALS_PER_HOUR.
 */
export const INTERVALS_PER_HOUR = 60 / INTERVAL_MINUTES; // = 4

/**
 * Maximum number of raw points rendered in chart before sampling kicks in.
 */
export const MAX_RAW_CHART_POINTS = 10_000;

/**
 * Threshold below which daily grid import is considered "off-grid" (in kWh).
 * 10 Wh tolerates rounding noise from the simulation.
 */
export const OFF_GRID_THRESHOLD_KWH = 0.01;

/**
 * Default day/night manual window times (HH:mm).
 */
export const DEFAULT_DAY_START = '06:00';
export const DEFAULT_DAY_END = '20:00';

/**
 * Percentile used to pick a recommended battery capacity from daily useful storage.
 */
export const RECOMMENDED_CAPACITY_PERCENTILE = 0.8;

/**
 * Bounds (kWh) and rounding step for recommended battery capacity.
 */
export const RECOMMENDED_CAPACITY_MIN_KWH = 2;
export const RECOMMENDED_CAPACITY_MAX_KWH = 30;
export const RECOMMENDED_CAPACITY_DEFAULT_KWH = 5;
