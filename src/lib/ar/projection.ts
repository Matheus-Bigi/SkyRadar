/**
 * Sky View's projection: turning "this aircraft is at bearing 072°, 14°
 * above the horizon" into a point on the screen of a device being waved
 * around at the sky.
 *
 * Kept as pure functions, separate from the component, because this is the
 * part that is easy to get subtly and invisibly wrong — a sign error shows
 * up as an aircraft on the wrong side of the sky, which looks plausible
 * until you actually go outside and look.
 */

import { toDeg, toRad } from "../geo";

export interface Vec3 {
  x: number; // east
  y: number; // north
  z: number; // up
}

export interface Attitude {
  /** Compass bearing the back of the device points at, 0-360. */
  headingDeg: number;
  /** Degrees above the horizon the device is aimed, -90 (down) to +90 (up). */
  pitchDeg: number;
  /** Rotation about the viewing axis; positive tilts the screen clockwise. */
  rollDeg: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Horizontal field of view of the camera, in degrees. */
  horizontalFovDeg: number;
}

export interface SkyTarget {
  /** Compass bearing to the target, 0-360. */
  azimuthDeg: number;
  /** Degrees above the horizon. */
  elevationDeg: number;
}

export interface Projection {
  x: number;
  y: number;
  /** True when the target is behind the device and the point is meaningless. */
  behind: boolean;
  /** Angle between where the device points and the target — how far off aim. */
  offAimDeg: number;
}

/** Unit vector in east/north/up for a compass bearing and elevation. */
export function skyVector({ azimuthDeg, elevationDeg }: SkyTarget): Vec3 {
  const az = toRad(azimuthDeg);
  const el = toRad(elevationDeg);
  const horizontal = Math.cos(el);
  return {
    x: Math.sin(az) * horizontal,
    y: Math.cos(az) * horizontal,
    z: Math.sin(el),
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Where the device is looking, as three perpendicular directions: straight
 * out of the back of it, out of its right edge, and out of its top.
 *
 * Roll is deliberately absent here — it is a rotation *about* the viewing
 * axis, so it leaves all three unchanged as directions in the world and only
 * turns the picture. It is applied after projection instead, which is both
 * equivalent and far easier to reason about.
 */
export function cameraBasis(headingDeg: number, pitchDeg: number) {
  const forward = skyVector({ azimuthDeg: headingDeg, elevationDeg: pitchDeg });
  // The device's right edge stays level with the ground: 90° clockwise of
  // where it's aimed, with no vertical component of its own.
  const az = toRad(headingDeg);
  const right: Vec3 = { x: Math.cos(az), y: -Math.sin(az), z: 0 };
  const up = cross(right, forward);
  return { forward, right, up };
}

/**
 * Projects a direction in the sky onto the screen, pinhole-style.
 *
 * A flat "degrees off to the side maps to pixels across" mapping is fine for
 * something near the horizon and wrong for an aircraft passing overhead,
 * where bearing changes violently for very little actual movement across the
 * sky. Aircraft pass overhead constantly, so the projection is done properly
 * in three dimensions instead.
 */
export function projectSky(target: SkyTarget, attitude: Attitude, viewport: Viewport): Projection {
  const { forward, right, up } = cameraBasis(attitude.headingDeg, attitude.pitchDeg);
  const t = skyVector(target);

  const depth = dot(t, forward);
  const offAimDeg = toDeg(Math.acos(Math.max(-1, Math.min(1, depth))));

  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const focal = cx / Math.tan(toRad(viewport.horizontalFovDeg / 2));

  if (depth <= 0.0001) {
    return { x: cx, y: cy, behind: true, offAimDeg };
  }

  // Tangent-plane coordinates, then rolled into the screen's own frame.
  const sx = (dot(t, right) / depth) * focal;
  const sy = -(dot(t, up) / depth) * focal;

  const roll = toRad(attitude.rollDeg);
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);

  return {
    x: cx + sx * cos - sy * sin,
    y: cy + sx * sin + sy * cos,
    behind: false,
    offAimDeg,
  };
}

/**
 * How big an area of sky the aircraft could actually be in, in degrees.
 *
 * Sky View deliberately never claims to know exactly where an aircraft is,
 * and this is the number behind that promise. Two things blur it:
 *
 *  - **The compass.** A tablet magnetometer is a handful of degrees out on a
 *    good day, and worse near metal or a case with a magnet in it.
 *  - **The clock.** A position is a snapshot. A 450-knot aircraft covers
 *    about 230 metres a second, so by the time a fix is a few seconds old it
 *    is meaningfully somewhere else — and the closer it is, the more degrees
 *    of sky that translates to.
 *
 * Added in quadrature because they are independent errors, then floored so
 * the marked area never implies more confidence than anyone should have.
 */
export function searchRadiusDeg(opts: {
  distanceMeters: number;
  groundSpeedKt?: number;
  dataAgeMs: number;
  compassErrorDeg?: number;
}): number {
  const compass = opts.compassErrorDeg ?? 8;
  const metresPerSecond = ((opts.groundSpeedKt ?? 250) * 1852) / 3600;
  const driftMetres = metresPerSecond * Math.max(0, opts.dataAgeMs) / 1000;
  const distance = Math.max(1, opts.distanceMeters);
  const motion = toDeg(Math.atan2(driftMetres, distance));
  const combined = Math.sqrt(compass * compass + motion * motion);
  return Math.max(5, Math.min(45, combined));
}

/** Shortest signed turn, in degrees, from one bearing to another. */
export function turnToward(fromDeg: number, toDeg_: number): number {
  return ((((toDeg_ - fromDeg) % 360) + 540) % 360) - 180;
}
