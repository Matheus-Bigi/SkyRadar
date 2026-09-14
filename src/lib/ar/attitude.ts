/**
 * Turning raw `deviceorientation` angles into "where is the camera aimed,
 * and which way up is the picture".
 *
 * Separated from the hook so it can be checked against known device poses
 * without a browser — the arithmetic here is all sign conventions, and a
 * sign error puts the horizon on the wrong slant or the sky upside down.
 */

import { toDeg, toRad } from "../geo";

export interface DeviceAngles {
  /** `alpha` — rotation about the screen normal. Unused: the compass owns yaw. */
  alpha: number | null;
  /** `beta` — front-to-back tilt. */
  beta: number | null;
  /** `gamma` — left-to-right tilt. */
  gamma: number | null;
  /** How far the page itself is rotated from the device's natural orientation. */
  screenAngle: number;
}

export interface Attitude2D {
  /** Degrees above the horizon the back camera is aimed. */
  pitchDeg: number;
  /** How far the picture is rotated; positive means the horizon tilts clockwise. */
  rollDeg: number;
}

/**
 * Pitch is a physical fact about where the back of the device points, so it
 * does not depend on which way the page happens to be rotated. Roll does —
 * it is about the picture, not the device.
 */
export function attitudeFromAngles({ beta, gamma, screenAngle }: DeviceAngles): Attitude2D | null {
  if (beta === null || gamma === null) return null;

  const b = toRad(beta);
  const g = toRad(gamma);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  // The back camera looks along the device's -Z. Its height in the world
  // works out as -cos(beta)cos(gamma): flat on a table (beta 0) that is -1,
  // camera at the floor; held upright (beta 90) it is 0, camera at the
  // horizon; tilted back past upright it climbs towards the sky.
  const pitchDeg = toDeg(Math.asin(Math.max(-1, Math.min(1, -cB * cG))));

  // World "up", expressed in the screen's own frame. Its angle away from the
  // screen's up direction is exactly the tilt of the horizon.
  const theta = toRad(screenAngle);
  const upX = -cB * sG;
  const upY = sB;
  const alongScreenRight = upX * Math.cos(theta) + upY * Math.sin(theta);
  const alongScreenUp = -upX * Math.sin(theta) + upY * Math.cos(theta);

  const rollDeg =
    alongScreenRight === 0 && alongScreenUp === 0
      ? 0
      : toDeg(Math.atan2(alongScreenRight, alongScreenUp));

  return { pitchDeg, rollDeg };
}
