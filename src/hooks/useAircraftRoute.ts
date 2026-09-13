"use client";

import { useEffect, useState } from "react";
import { isAirlineFlightId } from "../lib/aircraft/airlines";

export interface RouteResult {
  origin: string | null;
  originName: string | null;
  destination: string | null;
  destinationName: string | null;
  /** Operator name, when the route database identifies it. */
  airline: string | null;
  loading: boolean;
  /** A lookup ran and no route could be confirmed for this flight. */
  unconfirmed: boolean;
}

const EMPTY: RouteResult = {
  origin: null,
  originName: null,
  destination: null,
  destinationName: null,
  airline: null,
  loading: false,
  unconfirmed: false,
};

/**
 * Looks up where a flight came from and where it's headed.
 *
 * Keyed on the callsign, with the aircraft's position, altitude, vertical
 * speed and track sent along — that is what the server checks any candidate
 * route against, and altitude matters most: an aircraft descending through
 * 2,000 feet is minutes from a runway, whatever a callsign database claims
 * about a destination a thousand miles away.
 *
 * Only an airline flight ID can be looked up — a bare tail number has no
 * published route — so this stays idle for GA traffic rather than firing a
 * request that can only miss.
 *
 * State resets on every callsign change: one aircraft's route must never be
 * left on screen over another's.
 */
export interface RouteQueryAircraft {
  callsign?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  verticalSpeed?: number;
  heading?: number;
}

export function useAircraftRoute(aircraft: RouteQueryAircraft): RouteResult {
  const [state, setState] = useState<RouteResult>(EMPTY);

  const flightId = aircraft.callsign?.trim().toUpperCase();
  const key = isAirlineFlightId(flightId) ? flightId : undefined;

  // Everything the server checks the route against. Rounded, and folded into
  // a single dependency, so the lookup re-runs when the aircraft has actually
  // moved or changed phase — not on every poll's worth of jitter.
  const query = [
    aircraft.latitude.toFixed(3),
    aircraft.longitude.toFixed(3),
    aircraft.altitude !== undefined ? Math.round(aircraft.altitude / 500) * 500 : "",
    aircraft.verticalSpeed !== undefined ? Math.round(aircraft.verticalSpeed / 500) * 500 : "",
    aircraft.heading !== undefined ? Math.round(aircraft.heading / 10) * 10 : "",
  ].join("|");

  useEffect(() => {
    if (!key) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    const [lat, lon, alt, vs, trk] = query.split("|");
    const params = new URLSearchParams({ callsign: key, lat, lon });
    if (alt) params.set("altitude", alt);
    if (vs) params.set("verticalSpeed", vs);
    if (trk) params.set("track", trk);

    fetch(`/api/aircraft/flightroute?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          origin: data.origin ?? null,
          originName: data.originName ?? null,
          destination: data.destination ?? null,
          destinationName: data.destinationName ?? null,
          airline: data.airline ?? null,
          loading: false,
          unconfirmed: !data.origin && !data.destination,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, unconfirmed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, query]);

  return state;
}
