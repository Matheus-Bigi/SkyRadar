/**
 * Flight route lookup: where the aircraft overhead came from, and where
 * it's going.
 *
 * ADS-B carries no route — an aircraft broadcasts its identity, position and
 * movement, nothing about its schedule. The route has to be looked up by
 * callsign against a flight database, which is why it can't ride along with
 * the radar poll: it's a separate, per-aircraft request made only when a
 * card is opened.
 *
 * Two free, keyless sources are tried in order:
 *
 *  1. adsb.lol's `routeset` — the same endpoint tar1090 uses. It takes the
 *     aircraft's current position along with the callsign and reports back
 *     whether the route is *plausible* for where the aircraft actually is,
 *     which is the closest thing to verification available here.
 *  2. adsbdb — a callsign→route database that also names the operator.
 *
 * A route we can't confirm is not shown. "Unknown", an implausible match, or
 * a failed lookup all return nothing, and the card simply omits the field.
 */

import { isAirlineFlightId } from "./airlines";

export interface FlightRouteInfo {
  /** Airport code (IATA where known, otherwise ICAO). */
  origin?: string;
  /** Human-readable origin, e.g. "Portland" or "Portland Intl". */
  originName?: string;
  destination?: string;
  destinationName?: string;
  /** Operator name, when the source identifies it. */
  airline?: string;
  /** Which database answered. */
  source?: string;
}

interface CacheEntry {
  route: FlightRouteInfo;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** A callsign maps to one leg for the duration of that leg. */
const CACHE_TTL_MS = 1000 * 60 * 20;
/** Misses expire sooner: a route may simply not be in the DB *yet*. */
const MISS_TTL_MS = 1000 * 60 * 5;
const FETCH_TIMEOUT_MS = 3500;

export async function lookupFlightRoute(
  callsign: string,
  latitude?: number,
  longitude?: number
): Promise<FlightRouteInfo> {
  const key = callsign.trim().toUpperCase();
  // A tail number has no published route; asking these databases for one only
  // spends someone else's free quota on a guaranteed miss.
  if (!isAirlineFlightId(key)) return {};

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;

  for (const source of [fetchFromAdsbLol, fetchFromAdsbdb]) {
    try {
      const route = await source(key, latitude, longitude);
      if (route && (route.origin || route.destination)) {
        cache.set(key, { route, expiresAt: Date.now() + CACHE_TTL_MS });
        return route;
      }
    } catch {
      // Try the next source; a route is a nice-to-have, never a blocker.
    }
  }

  cache.set(key, { route: {}, expiresAt: Date.now() + MISS_TTL_MS });
  return {};
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timed out")), FETCH_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

interface AdsbLolAirport {
  iata?: string;
  icao?: string;
  name?: string;
  location?: string;
}

interface AdsbLolRoute {
  airport_codes?: string;
  _airport_codes_iata?: string;
  _airports?: AdsbLolAirport[];
  plausible?: boolean | number;
  callsign?: string;
}

async function fetchFromAdsbLol(
  callsign: string,
  latitude?: number,
  longitude?: number
): Promise<FlightRouteInfo | null> {
  // The endpoint wants a position to judge plausibility against; without one
  // there is nothing to check the route against, so we skip straight to the
  // database that doesn't need it.
  if (latitude === undefined || longitude === undefined) return null;

  const body = JSON.stringify({
    planes: [{ callsign, lat: latitude, lng: longitude }],
  });

  const data = await withTimeout(async (signal) => {
    const res = await fetch("https://api.adsb.lol/api/0/routeset", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "SkyRadar/1.0 (personal aviation radar; non-commercial)",
      },
      body,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`adsb.lol routeset ${res.status}`);
    return (await res.json()) as AdsbLolRoute[] | AdsbLolRoute;
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const codes = row.airport_codes?.trim();
  // The API says so itself when it has no route for a callsign.
  if (!codes || codes.toLowerCase() === "unknown") return null;
  // An explicit "this route doesn't fit where the aircraft is" is a rejection.
  if (row.plausible !== undefined && !row.plausible) return null;

  const airports = Array.isArray(row._airports) ? row._airports : [];
  // A codeshare/multi-leg entry lists every stop; the first and last are the
  // ends of the journey, which is what "from → to" means to someone looking up.
  const first = airports[0];
  const last = airports.length > 1 ? airports[airports.length - 1] : undefined;
  const fallback = codes.split("-").map((c) => c.trim()).filter(Boolean);

  const origin = airportCode(first) ?? fallback[0];
  const destination = airportCode(last) ?? (fallback.length > 1 ? fallback[fallback.length - 1] : undefined);
  if (!origin && !destination) return null;

  return {
    origin,
    originName: airportName(first),
    destination,
    destinationName: airportName(last),
    source: "adsb.lol",
  };
}

function airportCode(a?: AdsbLolAirport): string | undefined {
  return trimmed(a?.iata) ?? trimmed(a?.icao);
}

function airportName(a?: AdsbLolAirport): string | undefined {
  return trimmed(a?.location) ?? trimmed(a?.name);
}

interface AdsbdbAirport {
  iata_code?: string;
  icao_code?: string;
  name?: string;
  municipality?: string;
}

interface AdsbdbResponse {
  response?: {
    flightroute?: {
      airline?: { name?: string };
      origin?: AdsbdbAirport;
      destination?: AdsbdbAirport;
    };
  };
}

async function fetchFromAdsbdb(callsign: string): Promise<FlightRouteInfo | null> {
  const data = await withTimeout(async (signal) => {
    const res = await fetch(
      `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
      {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SkyRadar/1.0 (personal aviation radar; non-commercial)",
        },
        cache: "no-store",
      }
    );
    // 404 simply means "no route on file for this callsign".
    if (!res.ok) throw new Error(`adsbdb ${res.status}`);
    return (await res.json()) as AdsbdbResponse;
  });

  const route = data.response?.flightroute;
  if (!route) return null;

  const origin = adsbdbCode(route.origin);
  const destination = adsbdbCode(route.destination);
  if (!origin && !destination) return null;

  return {
    origin,
    originName: adsbdbName(route.origin),
    destination,
    destinationName: adsbdbName(route.destination),
    airline: trimmed(route.airline?.name),
    source: "adsbdb",
  };
}

function adsbdbCode(a?: AdsbdbAirport): string | undefined {
  return trimmed(a?.iata_code) ?? trimmed(a?.icao_code);
}

function adsbdbName(a?: AdsbdbAirport): string | undefined {
  return trimmed(a?.municipality) ?? trimmed(a?.name);
}

function trimmed(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Test seam: drops every cached lookup. */
export function __clearFlightRouteCache() {
  cache.clear();
}
