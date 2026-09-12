"use client";

import { useEffect, useState } from "react";

export interface DevicePitchState {
  /** Degrees of tilt away from "pointing at the horizon", used only by Sky View. */
  pitch: number | null;
}

/**
 * Derives an approximate camera pitch from the raw device orientation
 * (beta/gamma), compensating for portrait vs. landscape. This is a
 * practical approximation for AR marker placement, not a precision
 * instrument (spec #19, #35).
 */
export function useDevicePitch(): DevicePitchState {
  const [pitch, setPitch] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    const handler = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event;
      if (beta === null || gamma === null) return;
      const angle =
        typeof window.screen?.orientation?.angle === "number" ? window.screen.orientation.angle : 0;
      const value = angle === 0 || angle === 180 ? beta - 90 : gamma;
      setPitch(Math.max(-89, Math.min(89, value)));
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, []);

  return { pitch };
}
