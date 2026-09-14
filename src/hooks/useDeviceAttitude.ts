"use client";

import { useEffect, useState } from "react";
import { Attitude2D, attitudeFromAngles } from "../lib/ar/attitude";
import { normalizeDegrees } from "../lib/geo";

export interface DeviceAttitudeState extends Attitude2D {
  /** False until the device has actually reported a tilt. */
  available: boolean;
}

function currentScreenAngle(): number {
  if (typeof window === "undefined") return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === "number") return normalizeDegrees(angle);
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? normalizeDegrees(-legacy) : 0;
}

/**
 * Where the device's camera is aimed, and how far the picture is tilted.
 *
 * Yaw deliberately isn't here: the compass hook already owns it, complete
 * with the user's calibration offset, and deriving a second, uncalibrated
 * yaw from the same events would quietly disagree with the radar.
 *
 * Readings are smoothed, because raw orientation is noisy enough to make an
 * AR horizon visibly shiver while a tablet sits still on a table.
 */
const SMOOTHING = 0.25;

export function useDeviceAttitude(): DeviceAttitudeState {
  const [state, setState] = useState<DeviceAttitudeState>({
    pitchDeg: 0,
    rollDeg: 0,
    available: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    let pitch: number | null = null;
    let roll: number | null = null;

    const handler = (event: DeviceOrientationEvent) => {
      const next = attitudeFromAngles({
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        screenAngle: currentScreenAngle(),
      });
      if (!next) return;

      // Roll wraps at ±180, so blend the short way round rather than
      // sweeping the horizon all the way through zero.
      pitch = pitch === null ? next.pitchDeg : pitch + (next.pitchDeg - pitch) * SMOOTHING;
      if (roll === null) roll = next.rollDeg;
      else {
        const delta = ((((next.rollDeg - roll) % 360) + 540) % 360) - 180;
        roll = roll + delta * SMOOTHING;
      }

      setState({ pitchDeg: pitch, rollDeg: roll, available: true });
    };

    // Same preference as the compass: the absolute event where it exists.
    const useAbsolute = "ondeviceorientationabsolute" in window;
    const name = useAbsolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(name, handler as EventListener, true);
    return () => window.removeEventListener(name, handler as EventListener, true);
  }, []);

  return state;
}
