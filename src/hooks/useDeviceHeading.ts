"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeDegrees } from "../lib/geo";

export type HeadingPermission = "unknown" | "granted" | "denied" | "unnecessary";

export interface DeviceHeadingState {
  heading: number | null;
  supported: boolean;
  permission: HeadingPermission;
  needsCalibration: boolean;
  requestPermission: () => Promise<void>;
}

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * Device compass heading (0-360, 0 = true/magnetic north), fused from the
 * `deviceorientation`/`deviceorientationabsolute` events the browser derives
 * from the magnetometer + gyroscope + accelerometer (spec #17, #46).
 *
 * This intentionally stays a best-effort compass: if orientation is
 * unavailable, Look Here and Sky View degrade gracefully rather than
 * blocking the rest of the app (spec #48).
 */
export function useDeviceHeading(): DeviceHeadingState {
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<HeadingPermission>("unknown");
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const lastHeadingRef = useRef<number | null>(null);
  const jitterWindowRef = useRef<number[]>([]);
  const lastEventAtRef = useRef<number>(0);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    lastEventAtRef.current = Date.now();
    const webkitHeading = (event as unknown as { webkitCompassHeading?: number })
      .webkitCompassHeading;
    const webkitAccuracy = (event as unknown as { webkitCompassAccuracy?: number })
      .webkitCompassAccuracy;

    let value: number | null = null;
    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      value = webkitHeading;
      if (typeof webkitAccuracy === "number" && (webkitAccuracy < 0 || webkitAccuracy > 35)) {
        setNeedsCalibration(true);
      } else {
        setNeedsCalibration(false);
      }
    } else if (event.alpha !== null) {
      const screenAngle =
        typeof window !== "undefined" && window.screen?.orientation
          ? window.screen.orientation.angle
          : 0;
      value = normalizeDegrees(360 - event.alpha + screenAngle);
    }

    if (value === null) return;

    if (lastHeadingRef.current !== null) {
      let delta = value - lastHeadingRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const window_ = jitterWindowRef.current;
      window_.push(Math.abs(delta));
      if (window_.length > 12) window_.shift();
      const avgJitter = window_.reduce((a, b) => a + b, 0) / window_.length;
      if (window_.length >= 8 && avgJitter > 8) {
        setNeedsCalibration(true);
      }
    }
    lastHeadingRef.current = value;
    setHeading(value);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setSupported(false);
      return;
    }

    const iosEvent = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEvent;
    const needsExplicitPermission = typeof iosEvent.requestPermission === "function";
    if (needsExplicitPermission) {
      setPermission((p) => (p === "unknown" ? "unknown" : p));
    } else {
      setPermission("unnecessary");
      const eventName =
        "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
      window.addEventListener(eventName, handleOrientation as EventListener, true);
      return () => window.removeEventListener(eventName, handleOrientation as EventListener, true);
    }
  }, [handleOrientation]);

  useEffect(() => {
    if (permission !== "granted") return;
    const eventName =
      typeof window !== "undefined" && "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";
    window.addEventListener(eventName, handleOrientation as EventListener, true);
    return () => window.removeEventListener(eventName, handleOrientation as EventListener, true);
  }, [permission, handleOrientation]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    const iosEvent = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEvent;
    if (typeof iosEvent.requestPermission === "function") {
      try {
        const result = await iosEvent.requestPermission();
        setPermission(result === "granted" ? "granted" : "denied");
      } catch {
        setPermission("denied");
      }
    } else {
      setPermission("unnecessary");
    }
  }, []);

  // If we haven't received an orientation event in a while, we may be on a
  // desktop / non-sensor device — don't leave the UI thinking heading is
  // "loading" forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (lastEventAtRef.current === 0) setSupported(false);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return { heading, supported, permission, needsCalibration, requestPermission };
}
