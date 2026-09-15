import { Aircraft } from "../aircraft/types";
import { LatLon, destinationPoint, knotsToMps } from "../geo";

const FADE_IN_MS = 500;
const FADE_OUT_MS = 900;

/**
 * How long a position may be carried forward before the aircraft is simply
 * held where it was last measured.
 *
 * The budget is set by the chain the position travels down: it is already a
 * few seconds old when the provider fetches it, the provider then serves that
 * snapshot from a five-second cache, and the browser polls every four. So a
 * perfectly healthy fix can be ten or twelve seconds old by the time the last
 * frame is drawn from it, and a cap that bites there would reintroduce the
 * stall this engine exists to remove. Twenty seconds clears that with room to
 * spare while still refusing to fly an aeroplane across the county on the
 * strength of one old report.
 */
const MAX_CARRY_MS = 20000;

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
  /**
   * The provider's own clock reading when the newest snapshot was built.
   * Each aircraft's `lastUpdated` comes from the same clock, so the
   * difference between them is that aircraft's position age — a real
   * reported figure (ADS-B `seen_pos`) rather than an assumption, and
   * immune to any skew between the server's clock and the device's.
   */
  fetchedAt?: number;
  /**
   * The device's clock when that snapshot was *first* received. Not the same
   * as `currentAt`: the provider caches for five seconds and we poll every
   * four, so roughly every other response is a replay of one we already have.
   * A replay arrives later but describes the same instant, and anchoring to
   * when it first landed is what stops each replay looking like time passing.
   *
   * Without both this and `fetchedAt` there is no way to date a position, and
   * the engine holds each aircraft where it was reported rather than guessing.
   */
  fetchedAtClient?: number;
}

/**
 * Computes each aircraft's live position at time `now`, decoupled from how
 * often data actually arrives (spec #12, #27, #67). Called once per
 * animation frame — must stay allocation-light.
 *
 * Each aircraft is carried forward from its own last measured position,
 * along its own reported ground track, at its own reported ground speed,
 * for the time that has actually passed since that position was measured.
 * Every input is a figure the aircraft itself reported.
 *
 * It used to work differently, and the difference is worth recording. The
 * old engine took the last two snapshots, treated the gap between their
 * *arrival times* as the time between them, and slid each aircraft along
 * the line from one to the other — running past the newer one by a fixed
 * factor to keep things moving between polls.
 *
 * That assumed the feed advances in step with our polling. It does not. A
 * response carries whatever the aggregator last heard, which might be half
 * a second old or three seconds old, varying poll to poll. So the implied
 * speed was the true speed times a randomly varying factor, and running
 * past the newest fix multiplied that error rather than averaging it out.
 * Every arriving fix then corrected the overshoot, in full, in one frame.
 *
 * On screen that is a fleet of aircraft edging forward and twitching back
 * together, four seconds apart, however steadily they are really flying —
 * and, whenever the estimate came in low, freezing until the next fix. The
 * lockstep is the tell: the error came from a clock every aircraft shared,
 * not from any of their positions.
 *
 * Carrying each aircraft forward on its own reported velocity removes the
 * shared clock. What is left at each fix is the genuine prediction error —
 * a few metres of manoeuvre over four seconds — instead of several seconds
 * of phantom travel.
 */
export function interpolateAircraftFrame(
  { previous, current, previousAt, currentAt, fetchedAt, fetchedAtClient }: InterpolationInput,
  removed: Record<string, number>,
  now: number
): RenderedAircraft[] {
  const previousById = new Map(previous.map((a) => [a.id, a]));
  const result: RenderedAircraft[] = [];

  for (const curr of current) {
    const prev = previousById.get(curr.id);
    const aircraft = carryForward(curr, fetchedAt, fetchedAtClient, now);

    if (!prev) {
      const opacity = Math.max(0, Math.min(1, (now - currentAt) / FADE_IN_MS));
      result.push({ aircraft, opacity, isNew: true, isDeparting: false });
      continue;
    }

    result.push({ aircraft, opacity: 1, isNew: false, isDeparting: false });
  }

  for (const [id, removedAt] of Object.entries(removed)) {
    if (current.some((a) => a.id === id)) continue;
    const lastKnown = previousById.get(id);
    if (!lastKnown) continue;
    const opacity = Math.max(0, 1 - (now - removedAt) / FADE_OUT_MS);
    if (opacity <= 0) continue;
    result.push({ aircraft: lastKnown, opacity, isNew: false, isDeparting: true });
  }

  // Neither timestamp is part of the position maths any more — positions are
  // dated by the provider's clock, not by when a response happened to land.
  // `currentAt` still drives the fade-in above; `previousAt` is read here so
  // that dropping it reads as deliberate rather than as an oversight.
  void previousAt;

  return result;
}

/**
 * Where a reported aircraft is now, given where it said it was and how it
 * said it was moving. Returns the aircraft untouched when it reported no
 * usable speed or track — an unknown velocity is not a reason to guess.
 */
function carryForward(
  aircraft: Aircraft,
  fetchedAt: number | undefined,
  fetchedAtClient: number | undefined,
  now: number
): Aircraft {
  const speed = aircraft.groundSpeed;
  const track = aircraft.heading;
  if (typeof speed !== "number" || typeof track !== "number") return aircraft;
  if (!Number.isFinite(speed) || !Number.isFinite(track) || speed <= 0) return aircraft;

  // An undatable position is held exactly where it was reported. Guessing how
  // far it has travelled needs to start from when it was measured, and
  // without both clocks that is not something we know.
  if (typeof fetchedAt !== "number" || typeof fetchedAtClient !== "number") return aircraft;
  if (!Number.isFinite(aircraft.lastUpdated)) return aircraft;

  // When this aircraft's position was measured, on the device's clock.
  // `fetchedAt` and `lastUpdated` are both the provider's clock, so their
  // difference is an age and no skew between the two clocks leaks into it.
  const ageMs = Math.max(0, fetchedAt - aircraft.lastUpdated);
  const measuredAt = fetchedAtClient - ageMs;

  const elapsedMs = Math.min(Math.max(now - measuredAt, 0), MAX_CARRY_MS);
  if (elapsedMs <= 0) return aircraft;

  const start: LatLon = { latitude: aircraft.latitude, longitude: aircraft.longitude };
  const moved = destinationPoint(start, track, knotsToMps(speed) * (elapsedMs / 1000));

  return { ...aircraft, latitude: moved.latitude, longitude: moved.longitude };
}
