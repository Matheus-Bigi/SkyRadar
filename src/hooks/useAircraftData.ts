"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!position) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const params = new URLSearchParams({
          lat: position.latitude.toFixed(5),
          lon: position.longitude.toFixed(5),
          rangeMiles: String(rangeMiles),
        });
        const res = await fetch(`/api/aircraft?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { aircraft: unknown; source: string };
        if (cancelled) return;
        failuresRef.current = 0;
        applySnapshot(data.aircraft as never, data.source);
      } catch {
        if (cancelled) return;
        failuresRef.current += 1;
        setStatus(
          failuresRef.current >= OFFLINE_AFTER_FAILURES ? "offline" : "error",
          "Aircraft data temporarily unavailable"
        );
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.latitude, position?.longitude, rangeMiles]);
}
