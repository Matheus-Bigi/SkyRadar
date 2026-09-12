/** Formatting helpers — every one returns null for missing data so callers can hide the field entirely (spec #8). */

export function fmtMiles(mi: number | null | undefined): string | null {
  if (mi === null || mi === undefined || !Number.isFinite(mi)) return null;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} MI`;
}

export function fmtAltitude(ft: number | null | undefined): string | null {
  if (ft === null || ft === undefined || !Number.isFinite(ft)) return null;
  return `${Math.round(ft).toLocaleString()} FT`;
}

export function fmtSpeed(kt: number | null | undefined): string | null {
  if (kt === null || kt === undefined || !Number.isFinite(kt)) return null;
  return `${Math.round(kt)} KT`;
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
