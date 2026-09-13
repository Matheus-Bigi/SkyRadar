/** Formatting helpers — every one returns null for missing data so callers can hide the field entirely (spec #8). */

import { celsiusToFahrenheit, feetToMeters, knotsToKmh, knotsToMph } from "./geo";

export function fmtMiles(mi: number | null | undefined): string | null {
  if (mi === null || mi === undefined || !Number.isFinite(mi)) return null;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} MI`;
}

export function fmtAltitude(ft: number | null | undefined): string | null {
  if (ft === null || ft === undefined || !Number.isFinite(ft)) return null;
  return `${Math.round(ft).toLocaleString()} FT`;
}

/** Altitude in meters only — pairs alongside `fmtAltitude` (feet) as the metric unit. */
export function fmtAltitudeMeters(ft: number | null | undefined): string | null {
  if (ft === null || ft === undefined || !Number.isFinite(ft)) return null;
  return `${Math.round(feetToMeters(ft)).toLocaleString()} M`;
}

export function fmtSpeed(kt: number | null | undefined): string | null {
  if (kt === null || kt === undefined || !Number.isFinite(kt)) return null;
  return `${Math.round(kt)} KT`;
}

/** Speed in km/h + mph — pairs alongside `fmtSpeed` (knots) as the metric/imperial units. */
export function fmtSpeedMetric(kt: number | null | undefined): string | null {
  if (kt === null || kt === undefined || !Number.isFinite(kt)) return null;
  return `${Math.round(knotsToKmh(kt))} KM/H · ${Math.round(knotsToMph(kt))} MPH`;
}

/** Outside air temperature, Celsius + Fahrenheit — hidden entirely when unavailable. */
export function fmtTemp(c: number | null | undefined): string | null {
  if (c === null || c === undefined || !Number.isFinite(c)) return null;
  return `${Math.round(c)}°C · ${Math.round(celsiusToFahrenheit(c))}°F`;
}

export function fmtHeading(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return null;
  return `${Math.round(deg).toString().padStart(3, "0")}°`;
}

export function fmtVerticalSpeed(fpm: number | null | undefined): string | null {
  if (fpm === null || fpm === undefined || !Number.isFinite(fpm) || Math.abs(fpm) < 50) return null;
  const sign = fpm > 0 ? "+" : "";
  return `${sign}${Math.round(fpm)} FPM`;
}

export function fmtRelativeTime(epochMs: number | null | undefined): string | null {
  if (!epochMs) return null;
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}
