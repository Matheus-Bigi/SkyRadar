"use client";

import { useEffect, useMemo, useState } from "react";
import { Aircraft, AircraftCategory } from "../lib/aircraft/types";
import { LatLon, distanceMeters, milesToMeters } from "../lib/geo";

/** How close a contact has to get. Fixed, not the selected radar range. */
export const ALERT_RADIUS_MILES = 3;

/** The categories worth interrupting for. */
export const ALERT_CATEGORIES: AircraftCategory[] = ["MILITARY", "OTHER"];

export interface ProximityContact {
  aircraft: Aircraft;
  distanceMeters: number;
}

export interface ProximityAlertState {
  /** Everything inside the ring right now, acknowledged or not, nearest first. */
  contacts: ProximityContact[];
  /** Whether the alarm should be showing. */
  active: boolean;
  /** Silence the contacts currently inside, until they leave and return. */
  acknowledge: () => void;
}

/**
 * Watches for military or unclassified traffic coming within three miles.
 *
 * Written for a tablet left running as a screensaver: the point is to be
 * noticed from across the room, and then to get out of the way. Three things
 * end an alarm and all of them are deliberate —
 *
 * - **The aircraft leaves.** The condition is recomputed from live positions
 *   every time a snapshot lands, so nothing has to be cleared by hand.
 * - **Sky View opens, or the alert is switched off.** Passed in as
 *   `suppressed` and `enabled`; the caller owns those.
 * - **It is acknowledged.** That silences the contacts inside *at that
 *   moment*, by id. A different aircraft arriving raises a fresh alarm, and
 *   so does the same one coming back after leaving — an acknowledgement is
 *   for the thing you looked at, not a mute button on the next hour.
 *
 * It deliberately ignores the category filter. Ticking AIRLINE is a statement
 * about what you want drawn on the scope, not about what is worth being
 * warned of, and an alarm silently disabled by an unrelated control is worse
 * than no alarm. The banner names the contact so a warning is never
 * mysterious, even when that aircraft is filtered off the plot.
 *
 * Positions are the last ones actually reported, not the carried-forward ones
 * the canvas draws. The difference is a few seconds of travel; raising an
 * alarm off a measurement rather than off a prediction is the right trade.
 */
export function useProximityAlert({
  aircraft,
  position,
  enabled,
  suppressed,
}: {
  aircraft: Aircraft[];
  position: LatLon | null;
  enabled: boolean;
  suppressed: boolean;
}): ProximityAlertState {
  const contacts = useMemo<ProximityContact[]>(() => {
    if (!position) return [];
    const limit = milesToMeters(ALERT_RADIUS_MILES);
    return aircraft
      .filter((a) => ALERT_CATEGORIES.includes(a.category))
      .map((a) => ({
        aircraft: a,
        distanceMeters: distanceMeters(position, {
          latitude: a.latitude,
          longitude: a.longitude,
        }),
      }))
      .filter((c) => c.distanceMeters <= limit)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [aircraft, position]);

  // A stable description of who is inside, so the effect below runs when the
  // membership changes rather than on every snapshot.
  const insideKey = contacts.map((c) => c.aircraft.id).join(",");

  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  // Forget the acknowledgement for anything that has left, so the same
  // aircraft coming back raises the alarm again rather than staying silent.
  useEffect(() => {
    const inside = new Set(insideKey ? insideKey.split(",") : []);
    setAcknowledged((prev) => {
      const next = prev.filter((id) => inside.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [insideKey]);

  const unacknowledged = contacts.filter(
    (c) => !acknowledged.includes(c.aircraft.id)
  );

  return {
    contacts,
    active: enabled && !suppressed && unacknowledged.length > 0,
    acknowledge: () => setAcknowledged(contacts.map((c) => c.aircraft.id)),
  };
}
