"use client";

import { useEffect } from "react";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, distanceMeters } from "../lib/geo";
import { PHOTO_PRIORITY, photoKey, requestPhoto } from "../lib/aircraft/photoClient";

/**
 * Queues photos for the aircraft on the scope, so tapping one shows a
 * picture immediately instead of starting a lookup.
 *
 * Order matters more than volume here. On a typical scope most contacts are
 * general aviation, but the ones people actually tap are the airliners and
 * the military traffic — so those are fetched first, rotorcraft next, and
 * everything else last, nearest first within each band. Every aircraft is
 * queued, so a GA contact still gets its photo; it just waits behind the
 * ones more likely to be wanted.
 *
 * Aircraft entering range are picked up on the next poll and queued then.
 * The photo client keeps its own record, so nothing is ever fetched twice
 * however often this runs.
 */
function priorityFor(a: Aircraft): number {
  if (a.isMilitary || a.category === "MILITARY" || a.category === "AIRLINE") {
    return PHOTO_PRIORITY.AIRLINE_OR_MILITARY;
  }
  if (a.category === "HELICOPTER") return PHOTO_PRIORITY.ROTORCRAFT;
  return PHOTO_PRIORITY.OTHER;
}

export function usePhotoPrefetch(aircraft: Aircraft[], position: LatLon | null) {
  // Identity of the traffic, so this re-runs when aircraft come and go rather
  // than on every position update of the same ones.
  const fingerprint = aircraft
    .map((a) => a.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!position || aircraft.length === 0) return;
    for (const a of aircraft) {
      const distance = distanceMeters(position, {
        latitude: a.latitude,
        longitude: a.longitude,
      });
      requestPhoto(photoKey(a.id, a.registration), priorityFor(a), distance);
    }
    // `aircraft` changes identity every poll; the fingerprint is what decides
    // whether there is anything new to queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, position?.latitude, position?.longitude]);
}
