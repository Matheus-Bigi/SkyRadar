"use client";

import { useEffect, useRef, useState } from "react";
import { LatLon, distanceMeters } from "../lib/geo";

const MOVE_THRESHOLD_METERS = 800;
const MIN_QUERY_INTERVAL_MS = 60000;

/**
 * Resolves a small "you are here" place name (neighborhood/suburb/city) for
 * the user's current position — lets the user visually confirm SkyRadar has
 * their real location, independent of whether the map's background tiles
 * are showing. Only re-queries when the user has actually moved a
 * meaningful distance, respecting the reverse-geocoding service's
 * low-frequency usage policy.
 */
export function useReverseGeocode(position: LatLon | null): string | null {
  const [name, setName] = useState<string | null>(null);
  const lastQueriedAtRef = useRef<{ position: LatLon; time: number } | null>(null);

  useEffect(() => {
    if (!position) return;

    const last = lastQueriedAtRef.current;
    const now = Date.now();
    if (
      last &&
      now - last.time < MIN_QUERY_INTERVAL_MS &&
      distanceMeters(last.position, position) < MOVE_THRESHOLD_METERS
    ) {
      return;
    }

    let cancelled = false;
    lastQueriedAtRef.current = { position, time: now };

    fetch(`/api/geocode/reverse?lat=${position.latitude.toFixed(5)}&lon=${position.longitude.toFixed(5)}`)
      .then((res) => res.json())
      .then((data: { name: string | null }) => {
        if (!cancelled && data.name) setName(data.name);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [position]);

  return name;
}
