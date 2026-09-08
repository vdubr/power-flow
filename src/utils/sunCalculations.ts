import SunCalc from 'suncalc';
import { LocationConfig } from '../types/energy';

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/**
 * Get sunrise and sunset times for a specific date and location
 */
export function getSunTimes(date: Date, location: LocationConfig): SunTimes {
  const times = SunCalc.getTimes(date, location.latitude, location.longitude);
  
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
  };
}

/**
 * Check if a given time is during daytime based on location
 */
export function isDaytime(
  timestamp: Date,
  location: LocationConfig
): boolean {
  const { sunrise, sunset } = getSunTimes(timestamp, location);
  return timestamp >= sunrise && timestamp < sunset;
}

/**
 * Check if a given time is during daytime based on manual settings
 */
export function isDaytimeManual(
  timestamp: Date,
  dayStart: string, // HH:mm format
  dayEnd: string // HH:mm format
): boolean {
  const [startHour, startMinute] = dayStart.split(':').map(Number);
  const [endHour, endMinute] = dayEnd.split(':').map(Number);
  
  const hour = timestamp.getHours();
  const minute = timestamp.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  const startInMinutes = startHour * 60 + startMinute;
  const endInMinutes = endHour * 60 + endMinute;
  
  return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
}

/**
 * Get default location (Prague, Czech Republic)
 */
export function getDefaultLocation(): LocationConfig {
  return {
    latitude: 50.0755,
    longitude: 14.4378,
    name: 'Praha',
  };
}

/**
 * Predefined locations in Czech Republic
 */
export const CZECH_LOCATIONS: LocationConfig[] = [
  { latitude: 50.0755, longitude: 14.4378, name: 'Praha' },
  { latitude: 49.1951, longitude: 16.6068, name: 'Brno' },
  { latitude: 49.8209, longitude: 18.2625, name: 'Ostrava' },
  { latitude: 49.7384, longitude: 13.3736, name: 'Plzeň' },
  { latitude: 50.7663, longitude: 15.0543, name: 'Liberec' },
  { latitude: 50.2092, longitude: 15.8328, name: 'Hradec Králové' },
  { latitude: 49.5955, longitude: 17.2518, name: 'Olomouc' },
  { latitude: 50.6607, longitude: 14.0323, name: 'Ústí nad Labem' },
  { latitude: 48.9745, longitude: 14.4744, name: 'České Budějovice' },
  { latitude: 49.4500, longitude: 18.0000, name: 'Zlín' },
];
