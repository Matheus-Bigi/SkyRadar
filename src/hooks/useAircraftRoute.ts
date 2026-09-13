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
}

const EMPTY: RouteResult = {
  origin: null,
  originName: null,
  destination: null,
  destinationName: null,
  airline: null,
  loading: false,
};

/**
 * Looks up where a flight came from and where it's headed.
 *
 * Keyed on the callsign, with the aircraft's position passed along so the
 * upstream database can confirm the route is plausible for where the
 * aircraft actually is. Only an airline flight ID can be looked up — a bare
 * tail number has no published route — so this stays idle for GA traffic
 * rather than firing a request that can only miss.
 *
 * State resets on every callsign change: one aircraft's route must never be
 * left on screen over another's.
 */
export function useAircraftRoute(
  callsign: string | undefined,
  latitude: number | undefined,
  longitude: number | undefined
): RouteResult {
  const [state, setState] = useState<RouteResult>(EMPTY);
  const flightId = callsign?.trim().toUpperCase();
  const key = isAirlineFlightId(flightId) ? flightId : undefined;

  useEffect(() => {
    if (!key) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    const params = new URLSearchParams({ callsign: key });
    if (latitude !== undefined) params.set("lat", latitude.toFixed(4));
    if (longitude !== undefined) params.set("lon", longitude.toFixed(4));

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
        });
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY);
      });

    return () => {
      cancelled = true;
    };
    // Position is an input to the plausibility check, not a trigger: it
    // changes every poll, and re-running the lookup each time would hammer a
    // free database for an answer that cannot have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
