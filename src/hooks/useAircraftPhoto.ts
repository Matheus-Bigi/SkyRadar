"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PHOTO_PRIORITY,
  PhotoStatus,
  photoKey,
  photoState,
  requestPhoto,
  retryPhoto,
  subscribe,
} from "../lib/aircraft/photoClient";

export interface PhotoResult {
  imageUrl: string | null;
  attribution: string | null;
  /** Still being looked for — show the frame and the spinner. */
  pending: boolean;
  /** Every source, several rounds: there is no photo of this airframe. */
  unavailable: boolean;
  retry: () => void;
}

/**
 * The photo of one specific airframe.
 *
 * Selecting an aircraft promotes it to the front of the prefetch queue, so
 * even an aircraft the queue hadn't reached yet is fetched immediately — and
 * one it already reached is simply there, with no request at all.
 *
 * `pending` stays true across every retry round, so the card can keep showing
 * that a photo is on its way. Only once the queue has exhausted its rounds
 * does `unavailable` become true and the card say so.
 */
export function useAircraftPhoto(
  icao24: string | undefined,
  registration: string | undefined
): PhotoResult {
  const key = photoKey(icao24, registration);
  const [state, setState] = useState(() => photoState(key));

  useEffect(() => {
    if (key === "|") return;
    // Subscribe before requesting, so a synchronous cache hit isn't missed.
    const unsubscribe = subscribe(key, setState);
    setState(requestPhoto(key, PHOTO_PRIORITY.SELECTED));
    return unsubscribe;
  }, [key]);

  const retry = useCallback(() => retryPhoto(key), [key]);

  const status: PhotoStatus = key === "|" ? "unavailable" : state.status;
  return {
    imageUrl: state.imageUrl,
    attribution: state.attribution,
    pending: status === "pending" || status === "idle",
    unavailable: status === "unavailable",
    retry,
  };
}
