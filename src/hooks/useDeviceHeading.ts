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
  /** Dismiss the calibration notice until the compass settles and slips again. */
  acknowledgeCalibration: () => void;
  requestPermission: () => Promise<void>;
}

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * Above this much unexplained wander per reading, in degrees, the compass is
 * calling its own answer into question; below the lower figure it has
 * settled. Two thresholds rather than one, so the notice cannot flicker on
 * and off around a single boundary.
 */
const JITTER_RAISE_DEG = 8;
const JITTER_CLEAR_DEG = 4;
/** Readings weighed at once — a fraction of a second of movement. */
const JITTER_WINDOW = 12;
/**
 * Above this reported accuracy, iOS is telling us the fix is poor. A
 * *negative* figure is not a poor fix: it means iOS has no opinion, which
 * plenty of iPads report for an entire session while pointing perfectly
 * straight. Treating that as a fault pinned the notice on forever.
 */
const ACCURACY_LIMIT_DEG = 35;
/** A pause longer than this makes the next delta a jump, not a rate. */
const JITTER_GAP_MS = 1000;

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
  const [unsteady, setUnsteady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const lastHeadingRef = useRef<number | null>(null);
  const jitterWindowRef = useRef<number[]>([]);
  const lastEventAtRef = useRef<number>(0);
  // Two independent opinions on the compass, each remembered between events
  // so that neither silently overrules the other. The old code let the jitter
  // check set the flag and never clear it, which is why the notice, once up,
  // stayed up for good.
  const accuracyPoorRef = useRef(false);
  const wanderPoorRef = useRef(false);
  const offset = usePreferencesStore((s) => s.headingOffsetDeg);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const now = Date.now();
    const sinceLastEvent = lastEventAtRef.current === 0 ? 0 : now - lastEventAtRef.current;
    lastEventAtRef.current = now;
    const webkitHeading = (event as unknown as { webkitCompassHeading?: number })
      .webkitCompassHeading;
    const webkitAccuracy = (event as unknown as { webkitCompassAccuracy?: number })
      .webkitCompassAccuracy;

    // Both sources describe where the *device's natural top edge* points.
    let deviceTopHeading: number | null = null;
    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      deviceTopHeading = webkitHeading;
      // Only an actual figure counts. See ACCURACY_LIMIT_DEG: a negative
      // reading is "no opinion", not "bad".
      if (typeof webkitAccuracy === "number" && webkitAccuracy >= 0) {
        accuracyPoorRef.current = webkitAccuracy > ACCURACY_LIMIT_DEG;
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

    // A gap in the stream — the page was hidden, or the sensor paused — makes
    // the next difference a jump rather than a rate. Start the window again.
    if (sinceLastEvent > JITTER_GAP_MS) {
      jitterWindowRef.current = [];
      lastHeadingRef.current = null;
    }

    if (lastHeadingRef.current !== null) {
      let delta = value - lastHeadingRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      // Signed, deliberately. Turning the device is not the compass
      // misbehaving: a turn is sustained in one direction and survives the
      // average, while noise alternates and cancels out of it. What is left
      // after taking the turn away is the part that isn't going anywhere.
      //
      // Measuring plain movement instead made the notice self-defeating —
      // it asked for a figure-eight, and performing one was exactly what
      // kept it on screen.
      const window_ = jitterWindowRef.current;
      window_.push(delta);
      if (window_.length > JITTER_WINDOW) window_.shift();

      if (window_.length >= JITTER_WINDOW) {
        const movement = window_.reduce((a, b) => a + Math.abs(b), 0) / window_.length;
        const turning = Math.abs(window_.reduce((a, b) => a + b, 0) / window_.length);
        const wander = movement - turning;
        if (wander > JITTER_RAISE_DEG) wanderPoorRef.current = true;
        else if (wander < JITTER_CLEAR_DEG) wanderPoorRef.current = false;
      }
    }
    lastHeadingRef.current = value;
    setUnsteady(accuracyPoorRef.current || wanderPoorRef.current);
    setReading({ heading: value, screenAngle });
  }, []);

  // A notice that has been dismissed stays dismissed until the compass has
  // actually settled — then it is free to speak up again if things slip. That
  // way acknowledging it is not the same as switching it off for good.
  useEffect(() => {
    if (!unsteady) setAcknowledged(false);
  }, [unsteady]);

  const acknowledgeCalibration = useCallback(() => setAcknowledged(true), []);

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
    needsCalibration: unsteady && !acknowledged,
    acknowledgeCalibration,
    requestPermission,
  };
}
