"use client";

import { useEffect } from "react";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, distanceMeters } from "../lib/geo";
import { photoKey, requestPhoto } from "../lib/aircraft/photoClient";

/**
 * Warms the photos of the aircraft nearest the user, so tapping one shows a
 * picture immediately instead of starting a lookup.
 *
 * Nearest first because those are the ones overhead — the ones this whole
 * app exists to help you identify, and the ones you are actually going to
 * tap. The photo client coalesces these into a single batched request and
 * never asks for the same airframe twice, so the cost is one request per
 * screenful of new traffic.
 */
const PREFETCH_COUNT = 10;

export function usePhotoPrefetch(aircraft: Aircraft[], position: LatLon | null) {
  // Identity of the set we'd prefetch, so this re-runs when the traffic
  // changes rather than on every position update of the same aircraft.
  const fingerprint = aircraft
    .map((a) => a.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!position || aircraft.length === 0) return;

    const nearest = [...aircraft]
      .sort(
        (a, b) =>
          distanceMeters(position, { latitude: a.latitude, longitude: a.longitude }) -
          distanceMeters(position, { latitude: b.latitude, longitude: b.longitude })
      )
      .slice(0, PREFETCH_COUNT);

    for (const a of nearest) {
      // Fire and forget: the cache is the point, not the result here.
      void requestPhoto(photoKey(a.id, a.registration));
    }
    // `aircraft` itself changes identity every poll; the fingerprint is what
    // actually determines whether there is anything new to warm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, position?.latitude, position?.longitude]);
}
