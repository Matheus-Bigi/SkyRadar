"use client";

import { useCallback, useEffect, useState } from "react";
import { CachedPhoto, cachedPhoto, photoKey, requestPhoto } from "../lib/aircraft/photoClient";

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

function fromCache(key: string) {
  const hit: CachedPhoto | undefined = key === "|" ? undefined : cachedPhoto(key);
  if (!hit) return null;
  return { ...hit, loading: false, empty: !hit.imageUrl, failed: false };
}

/**
 * The photo of one specific airframe.
 *
 * Both identifiers are passed through: the ICAO 24-bit address is broadcast
 * by every aircraft, so it finds a photo even when the feed couldn't resolve
 * a registration.
 *
 * Anything already in the browser cache — very often the case, because the
 * radar warms the photos of nearby aircraft as they appear — is returned on
 * the first render with no request and no loading flash.
 *
 * "No photo exists" and "the lookup failed" are tracked separately. They
 * look identical on screen but mean opposite things: one is final, the other
 * is worth retrying, and collapsing them is how a blip becomes a card that
 * quietly never shows a picture.
 */
export function useAircraftPhoto(
  icao24: string | undefined,
  registration: string | undefined
): PhotoResult {
  const key = photoKey(icao24, registration);
  // Seeded straight from the cache so an already-known photo paints on the
  // very first render rather than after a round trip.
  const [state, setState] = useState(() => fromCache(key) ?? IDLE);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (key === "|") {
      setState(IDLE);
      return;
    }

    const known = fromCache(key);
    if (known && attempt === 0) {
      setState(known);
      return;
    }

    let cancelled = false;
    setState({ ...IDLE, loading: true });

    requestPhoto(key).then((photo) => {
      if (cancelled) return;
      if (!photo) {
        setState({ ...IDLE, failed: true });
        return;
      }
      setState({
        imageUrl: photo.imageUrl,
        attribution: photo.attribution,
        loading: false,
        empty: !photo.imageUrl,
        failed: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  return { ...state, retry };
}
