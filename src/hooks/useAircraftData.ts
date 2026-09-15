"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAircraftStore } from "../store/useAircraftStore";
import { LatLon } from "../lib/geo";

const POLL_INTERVAL_MS = 4000;
const OFFLINE_AFTER_FAILURES = 2;

/**
 * Polls the secure backend proxy for airborne aircraft near `position`
 * within `rangeMiles`, and feeds snapshots into the aircraft store. Kept
 * independent from rendering (spec #67) — this hook only ever updates
 * data, never touches the canvas or the map directly.
 */
export function useAircraftData(position: LatLon | null, rangeMiles: number) {
  const applySnapshot = useAircraftStore((s) => s.applySnapshot);
  const setStatus = useAircraftStore((s) => s.setStatus);
  const failuresRef = useRef(0);
  // Lets the caller bring the next poll forward — used by the idle refresh
  // cycle, so recovering from an outage doesn't wait out the interval.
  const pollNowRef = useRef<(() => void) | null>(null);

  // Snap to ~110m before this drives any fetching. `watchPosition` reports
  // constant small GPS jitter, and keying the poll loop off raw coordinates
  // tore it down and restarted it on every wobble — a request storm against
  // rate-limited feeds. This precision is far finer than a 3-30 mile radar.
  const lat = position ? Math.round(position.latitude * 1000) / 1000 : null;
  const lon = position ? Math.round(position.longitude * 1000) / 1000 : null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const params = new URLSearchParams({
          lat: lat.toFixed(5),
          lon: lon.toFixed(5),
          rangeMiles: String(rangeMiles),
        });
        const res = await fetch(`/api/aircraft?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(body?.detail || `status ${res.status}`);
        }
        const data = (await res.json()) as {
          aircraft: unknown;
          source: string;
          fetchedAt?: number;
        };
        if (cancelled) return;
        failuresRef.current = 0;
        // `fetchedAt` is the provider's clock when the snapshot was built.
        // Rendering needs it to tell how old each position already was on
        // arrival; see `interpolateAircraftFrame`.
        applySnapshot(data.aircraft as never, data.source, data.fetchedAt);
      } catch (err) {
        if (cancelled) return;
        failuresRef.current += 1;
        setStatus(
          failuresRef.current >= OFFLINE_AFTER_FAILURES ? "offline" : "error",
          err instanceof Error ? err.message : "Aircraft data temporarily unavailable"
        );
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    pollNowRef.current = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    poll();

    return () => {
      cancelled = true;
      pollNowRef.current = null;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, rangeMiles]);

  return useCallback(() => pollNowRef.current?.(), []);
}
