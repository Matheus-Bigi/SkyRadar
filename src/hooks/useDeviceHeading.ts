"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeDegrees } from "../lib/geo";
import { usePreferencesStore } from "../store/usePreferencesStore";

export type HeadingPermission = "unknown" | "granted" | "denied" | "unnecessary";

export interface DeviceHeadingState {
  /** Sensor heading with the user's calibration offset applied — use this. */
  heading: number | null;
  /** Screen-orientation corrected but uncalibrated, for the calibration UI. */
  rawHeading: number | null;
  /** How far the page is rotated from the device's natural orientation. */
  screenAngle: number;
  supported: boolean;
  permission: HeadingPermission;
  needsCalibration: boolean;
  requestPermission: () => Promise<void>;
}

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * How far the page is rotated from the device's natural orientation.
 *
 * Screen Orientation's `angle` and legacy iOS `window.orientation` measure
 * the same rotation in opposite senses, so the legacy value is negated to
 * match.
 */
function currentScreenAngle(): number {
  if (typeof window === "undefined") return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === "number") return normalizeDegrees(angle);
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? normalizeDegrees(-legacy) : 0;
}

/**
 * Device compass heading (0-360, 0 = north), fused from the
 * `deviceorientation`/`deviceorientationabsolute` events the browser derives
 * from the magnetometer + gyroscope + accelerometer (spec #17, #46).
 *
 * This intentionally stays a best-effort compass: if orientation is
 * unavailable, Look Here and Sky View degrade gracefully rather than
 * blocking the rest of the app (spec #48).
 */
export function useDeviceHeading(): DeviceHeadingState {
  const [reading, setReading] = useState<{ heading: number; screenAngle: number } | null>(null);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<HeadingPermission>("unknown");
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const lastHeadingRef = useRef<number | null>(null);
  const jitterWindowRef = useRef<number[]>([]);
  const lastEventAtRef = useRef<number>(0);
  const offset = usePreferencesStore((s) => s.headingOffsetDeg);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    lastEventAtRef.current = Date.now();
    const webkitHeading = (event as unknown as { webkitCompassHeading?: number })
      .webkitCompassHeading;
    const webkitAccuracy = (event as unknown as { webkitCompassAccuracy?: number })
      .webkitCompassAccuracy;

    // Both sources describe where the *device's natural top edge* points.
    let deviceTopHeading: number | null = null;
    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      deviceTopHeading = webkitHeading;
      if (typeof webkitAccuracy === "number" && (webkitAccuracy < 0 || webkitAccuracy > 35)) {
        setNeedsCalibration(true);
      } else {
        setNeedsCalibration(false);
      }
    } else if (event.alpha !== null) {
      deviceTopHeading = normalizeDegrees(360 - event.alpha);
    }

    if (deviceTopHeading === null) return;

    // Hold the iPad in landscape and the natural top edge is no longer the
    // top of what you're looking at — the browser has rotated the page.
    // Without this the compass is a clean 90° out in landscape.
    const screenAngle = currentScreenAngle();
    const value = normalizeDegrees(deviceTopHeading - screenAngle);

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
    setReading({ heading: value, screenAngle });
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
  //
  // Only once we're actually listening, though. iOS withholds orientation
  // events until the user grants motion access through a tap, so silence
  // before that says nothing about the hardware. Treating it as "no sensor"
  // hid the very control the user has to tap to grant access.
  useEffect(() => {
    if (permission !== "unnecessary" && permission !== "granted") return;
    const t = setTimeout(() => {
      if (lastEventAtRef.current === 0) setSupported(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [permission]);

  const rawHeading = reading?.heading ?? null;
  return {
    heading: rawHeading === null ? null : normalizeDegrees(rawHeading + offset),
    rawHeading,
    screenAngle: reading?.screenAngle ?? 0,
    supported,
    permission,
    needsCalibration,
    requestPermission,
  };
}
