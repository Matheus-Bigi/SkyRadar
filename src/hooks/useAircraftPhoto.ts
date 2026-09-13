"use client";

import { useEffect, useState } from "react";

export interface PhotoResult {
  imageUrl: string | null;
  attribution: string | null;
  loading: boolean;
}

const EMPTY: PhotoResult = { imageUrl: null, attribution: null, loading: false };

/**
 * Fetches the photo of one specific airframe.
 *
 * Both identifiers are passed through: the ICAO 24-bit address is broadcast
 * by every aircraft, so it finds a photo even when the feed couldn't resolve
 * a registration.
 *
 * The result is cleared the instant the identity changes — showing the
 * previous aircraft's photo on the new one's card would be showing something
 * that isn't real.
 */
export function useAircraftPhoto(icao24: string | undefined, registration: string | undefined): PhotoResult {
  const [state, setState] = useState<PhotoResult>(EMPTY);

  useEffect(() => {
    if (!icao24 && !registration) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    const params = new URLSearchParams();
    if (icao24) params.set("hex", icao24);
    if (registration) params.set("registration", registration);

    fetch(`/api/aircraft/photo?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          imageUrl: data.imageUrl ?? null,
          attribution: data.attribution ?? null,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [icao24, registration]);

  return state;
}
