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
 * Bounds (kWh) and step of the capacity curve that drives the recommendation.
 * The curve simulates every capacity in this range and reports what each one
 * would save, so the recommendation can be explained rather than asserted.
 */
export const RECOMMENDED_CAPACITY_MIN_KWH = 2;
export const RECOMMENDED_CAPACITY_MAX_KWH = 30;
export const RECOMMENDED_CAPACITY_DEFAULT_KWH = 5;
export const CAPACITY_CURVE_STEP_KWH = 0.5;

/**
 * Days used to normalise totals to a single year. Loaded data can cover any
 * number of days, so "per year" figures are always scaled to this length.
 */
export const DAYS_PER_YEAR = 365;

/**
 * Years bundled in `public/sample-data/` and loaded by "Vyzkoušet s ukázkovými
 * daty". Real ČEZ exports of one meter, ascending, deliberately covering every
 * variant the portal produces: the `a+`/`a-` header (2022) and `+A/… [kW]`
 * (2023–2025), timestamps without seconds (2022, 2023) and with them including
 * `24:00:00` (2024, 2025), a decimal point (2022, 2023) and a comma (2024, 2025).
 */
export const SAMPLE_DATA_YEARS = [2022, 2023, 2024, 2025] as const;

/**
 * Defaults for the physical parameters of a real battery.
 *
 * `ROUND_TRIP_EFFICIENCY` – share of the stored energy that comes back out;
 * a typical home lithium system with its inverter lands around 90 %.
 * `FEED_IN_PRICE` – what the surplus would have earned if it had been exported
 * instead of stored, in CZK/kWh. Storing surplus therefore has an opportunity
 * cost that has to be subtracted from the savings.
 */
export const DEFAULT_ROUND_TRIP_EFFICIENCY = 90;
export const DEFAULT_FEED_IN_PRICE = 1.5;
