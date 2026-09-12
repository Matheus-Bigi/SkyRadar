"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LatLon } from "../lib/geo";

export type GeolocationStatus =
  | "idle"
  | "prompt"
  | "locating"
  | "granted"
  | "denied"
  | "unavailable";

export interface GeolocationState {
  position: LatLon | null;
  altitudeMeters: number | null;
  accuracyMeters: number | null;
  status: GeolocationStatus;
  error: string | null;
  request: () => void;
  /** Explicitly use a fixed demo location instead of real GPS. */
  useDemoLocation: (loc: LatLon) => void;
}

/**
 * Wraps the Geolocation API. Requests only the accuracy the current
 * experience needs (spec #45) — the caller passes `highAccuracy` for
 * Sky View, otherwise we use the platform default cadence.
 */
export function useGeolocation(highAccuracy = false): GeolocationState {
  const [position, setPosition] = useState<LatLon | null>(null);
  const [altitudeMeters, setAltitudeMeters] = useState<number | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const demoRef = useRef(false);

  const startWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("Location services are not available on this device.");
      return;
    }
    setStatus("locating");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        demoRef.current = false;
        setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setAltitudeMeters(pos.coords.altitude);
        setAccuracyMeters(pos.coords.accuracy);
        setStatus("granted");
        setError(null);
      },
      (err) => {
        if (demoRef.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setError("Location unavailable. Enable Location Services to see aircraft around you.");
        } else {
          setStatus("unavailable");
          setError("Location unavailable. Enable Location Services to see aircraft around you.");
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 1000 : 5000,
        timeout: 15000,
      }
    );
  }, [highAccuracy]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      setStatus("prompt");
      return;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        if (result.state === "granted") {
          startWatch();
        } else if (result.state === "denied") {
          setStatus("denied");
          setError("Location unavailable. Enable Location Services to see aircraft around you.");
        } else {
          setStatus("prompt");
        }
      })
      .catch(() => setStatus("prompt"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const useDemoLocation = useCallback((loc: LatLon) => {
    demoRef.current = true;
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setPosition(loc);
    setAltitudeMeters(0);
    setAccuracyMeters(500);
    setStatus("granted");
    setError(null);
  }, []);

  return {
    position,
    altitudeMeters,
    accuracyMeters,
    status,
    error,
    request: startWatch,
    useDemoLocation,
  };
}
