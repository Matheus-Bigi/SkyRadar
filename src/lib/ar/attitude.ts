/**
 * Turning raw `deviceorientation` angles into "where is the camera aimed,
 * and which way up is the picture".
 *
 * Separated from the hook so it can be checked against known device poses
 * without a browser — the arithmetic here is all sign conventions, and a
 * sign error puts the horizon on the wrong slant or the sky upside down.
 */

import { normalizeDegrees, toDeg, toRad } from "../geo";

export interface DeviceAngles {
  /** `alpha` — rotation about the screen normal. Unused: the compass owns yaw. */
  alpha: number | null;
  /** `beta` — front-to-back tilt. */
  beta: number | null;
  /** `gamma` — left-to-right tilt. */
  gamma: number | null;
  /** What the browser says the page is rotated by. Treated as a hint — see below. */
  screenAngle: number;
  /** The rotation settled on last time, so the answer doesn't flicker. */
  previousScreenAngle?: number | null;
}

export interface Attitude2D {
  /** Degrees above the horizon the back camera is aimed. */
  pitchDeg: number;
  /** How far the picture is rotated; positive means the horizon tilts clockwise. */
  rollDeg: number;
  /** The page rotation actually applied, whatever the browser claimed. */
  screenAngleUsed: number;
}

/**
 * Below this much sideways gravity the screen is within ~17° of horizontal —
 * aimed at the zenith or at your feet — and gravity has nothing to say about
 * which way round the page is.
 */
const MIN_TILT = 0.3;
/**
 * Past this, the browser's angle is claiming the reader is holding the device
 * nearly on its side while looking at it. Possible, but far likelier that the
 * angle answers a different question than the one asked here.
 */
const MAX_PLAUSIBLE_ROLL_DEG = 60;
/** Held a little past the halfway point so a device near 45° doesn't flip about. */
const QUADRANT_HYSTERESIS_DEG = 12;

/** To (-180, 180]. */
function signed180(deg: number): number {
  return ((((deg % 360) + 540) % 360) - 180);
}

/** To the nearest quarter turn, in [0, 360). */
function quarterTurn(deg: number): number {
  return normalizeDegrees(Math.round(deg / 90) * 90);
}

/**
 * Pitch is a physical fact about where the back of the device points, so it
 * does not depend on which way the page happens to be rotated. Roll does —
 * it is about the picture, not the device.
 *
 * **Why the browser's screen angle is only a hint.** `screen.orientation.angle`
 * measures the page against the device's *natural* orientation, and on some
 * tablets that is landscape; `beta`/`gamma` are reported in a portrait-fixed
 * frame regardless. On such a device the two disagree by a quarter turn and
 * the horizon is drawn vertical — which is exactly what happened on an iPad
 * held in landscape, reporting `beta 0, gamma -90` with an angle of 0.
 *
 * Gravity settles it. The browser rotates the page to whichever quarter turn
 * leaves it most upright, and that decision is *made from gravity* — so
 * gravity can be asked directly instead of taken on trust. The browser's
 * number is still used wherever it agrees, which keeps the rare case of a
 * reader who has locked rotation and turned the device on its side honest.
 */
export function attitudeFromAngles({
  beta,
  gamma,
  screenAngle,
  previousScreenAngle = null,
}: DeviceAngles): Attitude2D | null {
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

  // World "up", expressed in the device's own screen plane.
  const upX = -cB * sG;
  const upY = sB;
  const tilt = Math.hypot(upX, upY);

  // How far the horizon would lean if the page were not rotated at all.
  const deviceRollDeg = tilt === 0 ? 0 : toDeg(Math.atan2(upX, upY));
  const claimed = normalizeDegrees(screenAngle);

  let screenAngleUsed: number;
  if (tilt < MIN_TILT) {
    // Aimed at the zenith: nothing to measure, so keep what we had.
    screenAngleUsed = previousScreenAngle ?? claimed;
  } else if (
    previousScreenAngle !== null &&
    Math.abs(signed180(deviceRollDeg + previousScreenAngle)) <= 45 + QUADRANT_HYSTERESIS_DEG
  ) {
    // Whatever we settled on still leaves the page upright, so keep it. This
    // comes before the browser's own answer on purpose: letting that take over
    // partway through a lean would snap the horizon round by a quarter turn
    // while the device had barely moved.
    screenAngleUsed = previousScreenAngle;
  } else if (Math.abs(signed180(deviceRollDeg + claimed)) <= MAX_PLAUSIBLE_ROLL_DEG) {
    screenAngleUsed = claimed;
  } else {
    screenAngleUsed = quarterTurn(-deviceRollDeg);
  }

  return { pitchDeg, rollDeg: signed180(deviceRollDeg + screenAngleUsed), screenAngleUsed };
}
