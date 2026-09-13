"use client";

import { useCallback, useEffect, useState } from "react";

export interface PhotoResult {
  imageUrl: string | null;
  attribution: string | null;
  loading: boolean;
  /** The lookup ran and came back with nothing — this airframe has no photo. */
  empty: boolean;
  /** The lookup itself failed (offline, timeout, upstream error) — retryable. */
  failed: boolean;
  retry: () => void;
}

const IDLE = { imageUrl: null, attribution: null, loading: false, empty: false, failed: false };

/**
 * Fetches the photo of one specific airframe.
 *
 * Both identifiers are passed through: the ICAO 24-bit address is broadcast
 * by every aircraft, so it finds a photo even when the feed couldn't resolve
 * a registration.
 *
 * "No photo exists" and "the lookup failed" are tracked separately. They look
 * identical from the outside but mean opposite things — one is final, the
 * other is worth trying again — and collapsing them is how a transient blip
 * turns into a card that just quietly never shows a picture.
 *
 * The result is cleared the instant the identity changes: showing the
 * previous aircraft's photo on the new one's card would be showing something
 * that isn't real.
 */
export function useAircraftPhoto(
  icao24: string | undefined,
  registration: string | undefined
): PhotoResult {
  const [state, setState] = useState(IDLE);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!icao24 && !registration) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState({ ...IDLE, loading: true });

    const params = new URLSearchParams();
    if (icao24) params.set("hex", icao24);
    if (registration) params.set("registration", registration);

    fetch(`/api/aircraft/photo?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`photo lookup ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const imageUrl = data.imageUrl ?? null;
        setState({
          imageUrl,
          attribution: data.attribution ?? null,
          loading: false,
          empty: !imageUrl,
          failed: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ ...IDLE, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [icao24, registration, attempt]);

  return { ...state, retry };
}
