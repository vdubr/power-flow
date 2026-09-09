import { DayNightConfig, LocationConfig } from '../types/energy';
import { getSunTimes, getDefaultLocation } from './sunCalculations';
import { formatLocalDateKey } from './dateUtils';

/**
 * One decision, used everywhere: was the sun up at this moment?
 *
 * The chart's day/night bars, the night bands on the time axis and the
 * "ve dne / v noci" statistics all ask this module, so they can never disagree.
 * Previously the bands only understood sunrise/sunset while the statistics also
 * understood the manual window, and the caching lived in the aggregation layer.
 */

/** The day window of a single local calendar day. */
export interface DayBounds {
  dayStart: Date;
  dayEnd: Date;
}

export type IsDayPredicate = (timestamp: Date) => boolean;

/**
 * Fills in the location for sun mode.
 *
 * Sun mode without a city is a configuration gap, not a reason to fall back to
 * clock hours — the UI already shows Praha as the default, so the calculation
 * uses it too.
 */
export function resolveDayNightConfig(
  config: DayNightConfig,
  location?: LocationConfig
): DayNightConfig {
  if (config.mode !== 'sun') return config;
  return { ...config, location: location ?? config.location ?? getDefaultLocation() };
}

/**
 * Sunrise/sunset (or the manual window) changes at most once per day, so it is
 * computed once per day and configuration instead of once per 15-minute record
 * (~35 000 per year).
 */
const boundsCache = new Map<string, DayBounds>();

function cacheKey(dateKey: string, config: DayNightConfig): string {
  if (config.mode === 'sun') {
    const { latitude, longitude } = config.location ?? getDefaultLocation();
    return `${dateKey}|sun|${latitude}|${longitude}`;
  }
  return `${dateKey}|manual|${config.manualDayStart}|${config.manualDayEnd}`;
}

function parseHhMm(value: string, fallbackHour: number): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hour: fallbackHour, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { hour: fallbackHour, minute: 0 };
  return { hour, minute };
}

/**
 * Day window of the local calendar day named by `dateKey` ("YYYY-MM-DD").
 *
 * Both bounds are absolute instants, so a daylight-saving transition inside the
 * day cannot shift the comparison.
 */
export function getDayBounds(dateKey: string, config: DayNightConfig): DayBounds {
  const key = cacheKey(dateKey, config);
  let bounds = boundsCache.get(key);
  if (bounds) return bounds;

  const [year, month, day] = dateKey.split('-').map(Number);

  if (config.mode === 'sun') {
    const location = config.location ?? getDefaultLocation();
    // Noon is a safe representative instant for the whole local day.
    const { sunrise, sunset } = getSunTimes(new Date(year, month - 1, day, 12, 0, 0), location);
    bounds = { dayStart: sunrise, dayEnd: sunset };
  } else {
    const start = parseHhMm(config.manualDayStart, 6);
    const end = parseHhMm(config.manualDayEnd, 20);
    bounds = {
      dayStart: new Date(year, month - 1, day, start.hour, start.minute, 0),
      dayEnd: new Date(year, month - 1, day, end.hour, end.minute, 0),
    };
  }

  boundsCache.set(key, bounds);
  return bounds;
}

/**
 * Builds the day/night test for a configuration. Create it once per pass and
 * call it per record: each call is a date key plus a map lookup.
 *
 * Sunrise counts as day, sunset counts as night. A window that would run past
 * midnight (for example 22:00–06:00) is not supported and marks the whole day
 * as night, which is the same limitation the manual mode always had.
 */
export function createIsDayPredicate(
  config: DayNightConfig,
  location?: LocationConfig
): IsDayPredicate {
  const resolved = resolveDayNightConfig(config, location);
  return (timestamp: Date) => {
    const { dayStart, dayEnd } = getDayBounds(formatLocalDateKey(timestamp), resolved);
    return timestamp >= dayStart && timestamp < dayEnd;
  };
}

/** Test helper: forget every cached day window. */
export function clearDayBoundsCache(): void {
  boundsCache.clear();
}
