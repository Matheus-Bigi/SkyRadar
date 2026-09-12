"use client";

import { useEffect, useState } from "react";

export interface DeviceMotionState {
  rotationRateAlpha: number | null;
  supported: boolean;
}

/**
 * Raw rotation-rate readings (gyroscope, via DeviceMotionEvent). Sky View
 * uses this only to smooth heading between compass samples — the compass
 * (useDeviceHeading) remains the source of truth (spec #46).
 */
export function useDeviceMotion(): DeviceMotionState {
  const [rotationRateAlpha, setRotationRateAlpha] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setSupported(false);
      return;
    }
    let seen = false;
    const handler = (event: DeviceMotionEvent) => {
      seen = true;
      const alpha = event.rotationRate?.alpha;
      if (typeof alpha === "number") setRotationRateAlpha(alpha);
    };
    window.addEventListener("devicemotion", handler, true);
    const t = setTimeout(() => {
      if (!seen) setSupported(false);
    }, 3000);
    return () => {
      window.removeEventListener("devicemotion", handler, true);
      clearTimeout(t);
    };
  }, []);

  return { rotationRateAlpha, supported };
}
