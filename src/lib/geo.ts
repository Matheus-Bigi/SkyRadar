/**
 * Geospatial calculation engine.
 *
 * Pure functions only — this module has no knowledge of the map, the radar,
 * or React. Every positioning system in the app (radar overlay, Look Here,
 * Sky View) is built on top of these primitives.
 */

const EARTH_RADIUS_M = 6371000;
const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;
const MPS_PER_KNOT = 0.514444;
const KMH_PER_KNOT = 1.852;
const MPH_PER_KNOT = 1.150779;

export interface LatLon {
  latitude: number;
  longitude: number;
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalize an angle to [0, 360). */
export function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Normalize an angle to (-180, 180], used for relative bearings. */
export function normalizeSignedDegrees(deg: number): number {
  let d = normalizeDegrees(deg);
  if (d > 180) d -= 360;
  return d;
}

/** Great-circle distance between two points, in meters (haversine). */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/** Initial compass bearing (0-360, 0 = true north) from a to b. */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

/**
 * Relative bearing: how far the target is from the observer's current
 * heading, signed so negative = turn left, positive = turn right.
 * Range: (-180, 180].
 */
export function relativeBearing(
  targetBearing: number,
  observerHeading: number
): number {
  return normalizeSignedDegrees(targetBearing - observerHeading);
}

/**
 * Approximate elevation angle (degrees above the horizon) from the
 * observer to a target at a given altitude difference and ground distance.
 * This intentionally ignores atmospheric refraction and earth curvature —
 * it's a practical visual aid, not a precision instrument (see spec #19).
 */
export function elevationAngleDegrees(
  groundDistanceMeters: number,
  altitudeDiffMeters: number
): number {
  if (groundDistanceMeters <= 0) return altitudeDiffMeters > 0 ? 90 : 0;
  return toDeg(Math.atan2(altitudeDiffMeters, groundDistanceMeters));
}

/** Destination point given a start point, bearing (deg) and distance (m). */
export function destinationPoint(
  start: LatLon,
  bearingDeg: number,
  distanceM: number
): LatLon {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearingDeg);
  const lat1 = toRad(start.latitude);
  const lon1 = toRad(start.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) +
      Math.cos(lat1) * Math.sin(delta) * Math.cos(theta)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: toDeg(lat2),
    longitude: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/** Build a closed polygon ring (lon/lat pairs) approximating a circle. */
export function circlePolygon(
  center: LatLon,
  radiusMeters: number,
  steps = 72
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (360 * i) / steps;
    const pt = destinationPoint(center, bearing, radiusMeters);
    coords.push([pt.longitude, pt.latitude]);
  }
  return coords;
}

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}
export function milesToMeters(mi: number): number {
  return mi * METERS_PER_MILE;
}
export function metersToFeet(m: number): number {
  return m / METERS_PER_FOOT;
}
export function feetToMeters(ft: number): number {
  return ft * METERS_PER_FOOT;
}
export function knotsToMps(kt: number): number {
  return kt * MPS_PER_KNOT;
}
export function mpsToKnots(mps: number): number {
  return mps / MPS_PER_KNOT;
}
export function knotsToKmh(kt: number): number {
  return kt * KMH_PER_KNOT;
}
export function knotsToMph(kt: number): number {
  return kt * MPH_PER_KNOT;
}
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export interface GeoDerived {
  distanceMeters: number;
  distanceMiles: number;
  bearing: number;
  relativeBearing: number;
  elevationAngle: number;
}

/**
 * Compute everything the UI needs to describe the spatial relationship
 * between the observer (user) and a target (aircraft).
 */
export function deriveGeometry(
  observer: LatLon,
  observerAltitudeMeters: number,
  observerHeading: number,
  target: LatLon,
  targetAltitudeMeters: number
): GeoDerived {
  const distanceMeters_ = distanceMeters(observer, target);
  const bearing = bearingDegrees(observer, target);
  const relBearing = relativeBearing(bearing, observerHeading);
  const elevationAngle = elevationAngleDegrees(
    distanceMeters_,
    targetAltitudeMeters - observerAltitudeMeters
  );
  return {
    distanceMeters: distanceMeters_,
    distanceMiles: metersToMiles(distanceMeters_),
    bearing,
    relativeBearing: relBearing,
    elevationAngle,
  };
}

/** Linear interpolation between two lat/lon points (fine for short hops). */
export function interpolateLatLon(a: LatLon, b: LatLon, t: number): LatLon {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** Shortest-path interpolation between two headings/angles in degrees. */
export function interpolateAngle(a: number, b: number, t: number): number {
  const diff = normalizeSignedDegrees(b - a);
  return normalizeDegrees(a + diff * t);
}

/**
 * How far a point lies to the side of the great-circle path from `start` to
 * `end`, in meters. Signed: negative is left of the path, positive right.
 *
 * This is what lets SkyRadar check a claimed flight route against where the
 * aircraft actually is. A route database keyed only on callsign can hand
 * back a stale or simply wrong leg, and the only way to tell is geometry:
 * an aircraft over Portland is not flying Seattle→Denver, whatever the
 * database says.
 */
export function crossTrackDistanceMeters(point: LatLon, start: LatLon, end: LatLon): number {
  const d13 = distanceMeters(start, point) / EARTH_RADIUS_M;
  const theta13 = toRad(bearingDegrees(start, point));
  const theta12 = toRad(bearingDegrees(start, end));
  return Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12)) * EARTH_RADIUS_M;
}

/**
 * How far along the `start`→`end` path a point sits, in meters. Negative
 * means it hasn't reached `start` yet; greater than the path length means it
 * has passed `end`.
 */
export function alongTrackDistanceMeters(point: LatLon, start: LatLon, end: LatLon): number {
  const d13 = distanceMeters(start, point) / EARTH_RADIUS_M;
  const xt = crossTrackDistanceMeters(point, start, end) / EARTH_RADIUS_M;
  // Guard the domain: floating point can push the ratio a hair past ±1 when
  // the point sits essentially on top of `start`.
  const ratio = Math.cos(d13) / Math.cos(xt);
  const magnitude = Math.acos(Math.max(-1, Math.min(1, ratio))) * EARTH_RADIUS_M;

  // acos only ever yields a magnitude, so it cannot say "behind the start" —
  // and that is precisely the case worth catching: an aircraft over Portland
  // is *before* Seattle on a Seattle→Denver path, not 37km along it. The
  // bearing spread settles the sign: more than a right angle off the path's
  // initial heading means the point is behind the start.
  const spread = normalizeSignedDegrees(
    bearingDegrees(start, point) - bearingDegrees(start, end)
  );
  return Math.abs(spread) > 90 ? -magnitude : magnitude;
}
