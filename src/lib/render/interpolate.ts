import { Aircraft } from "../aircraft/types";
import { interpolateAngle, interpolateLatLon } from "../geo";

const FADE_IN_MS = 500;
const FADE_OUT_MS = 900;
const MAX_EXTRAPOLATE_FACTOR = 1.6;

export interface RenderedAircraft {
  aircraft: Aircraft;
  opacity: number;
  isNew: boolean;
  isDeparting: boolean;
}

export interface InterpolationInput {
  previous: Aircraft[];
  current: Aircraft[];
  previousAt: number;
  currentAt: number;
}

/**
 * Computes each aircraft's live, smoothly-interpolated position at time
 * `now`, decoupled from how often fresh data actually arrives (spec #12,
 * #27, #67). Called once per animation frame — must stay allocation-light.
 */
export function interpolateAircraftFrame(
  { previous, current, previousAt, currentAt }: InterpolationInput,
  removed: Record<string, number>,
  now: number
): RenderedAircraft[] {
  const previousById = new Map(previous.map((a) => [a.id, a]));
  const span = currentAt - previousAt;
  const rawT = span > 0 ? (now - previousAt) / span : 1;
  const t = Math.max(0, Math.min(rawT, MAX_EXTRAPOLATE_FACTOR));

  const result: RenderedAircraft[] = [];

  for (const curr of current) {
    const prev = previousById.get(curr.id);
    if (!prev) {
      const opacity = Math.max(0, Math.min(1, (now - currentAt) / FADE_IN_MS));
      result.push({ aircraft: curr, opacity, isNew: true, isDeparting: false });
      continue;
    }

    const pos = interpolateLatLon(
      { latitude: prev.latitude, longitude: prev.longitude },
      { latitude: curr.latitude, longitude: curr.longitude },
      t
    );
    const heading =
      typeof prev.heading === "number" && typeof curr.heading === "number"
        ? interpolateAngle(prev.heading, curr.heading, Math.min(t, 1))
        : curr.heading;
    const altitude =
      typeof prev.altitude === "number" && typeof curr.altitude === "number"
        ? prev.altitude + (curr.altitude - prev.altitude) * Math.min(t, 1)
        : curr.altitude;

    result.push({
      aircraft: { ...curr, latitude: pos.latitude, longitude: pos.longitude, heading, altitude },
      opacity: 1,
      isNew: false,
      isDeparting: false,
    });
  }

  for (const [id, removedAt] of Object.entries(removed)) {
    if (current.some((a) => a.id === id)) continue;
    const lastKnown = previousById.get(id);
    if (!lastKnown) continue;
    const opacity = Math.max(0, 1 - (now - removedAt) / FADE_OUT_MS);
    if (opacity <= 0) continue;
    result.push({ aircraft: lastKnown, opacity, isNew: false, isDeparting: true });
  }

  return result;
}
