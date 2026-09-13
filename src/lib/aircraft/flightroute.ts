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
 * Two free, keyless sources are tried: adsb.lol's `routeset` (the endpoint
 * tar1090 uses) and adsbdb, which also names the operator.
 *
 * **Every candidate is checked against where the aircraft actually is.**
 * These databases are keyed on callsign alone, and a callsign is reused —
 * across days, and across completely different legs — so a lookup can hand
 * back a route the aircraft is demonstrably not flying. Geometry is the only
 * way to tell, and it's decisive: an aircraft over Portland climbing east is
 * not flying Seattle→Denver, whatever the database says. A candidate that
 * fails the check is discarded and the next source tried; if none survives,
 * the card shows no route at all rather than a plausible-looking lie.
 */

import {
  LatLon,
  alongTrackDistanceMeters,
  crossTrackDistanceMeters,
  distanceMeters,
} from "../geo";
import { isAirlineFlightId } from "./airlines";

export interface FlightRouteInfo {
  /** Airport code (IATA where known, otherwise ICAO). */
  origin?: string;
  /** Human-readable origin, e.g. "Portland". */
  originName?: string;
  destination?: string;
  destinationName?: string;
  /** Operator name, when the source identifies it. */
  airline?: string;
  /** Which database answered. */
  source?: string;
}

/** A candidate carries the coordinates the verification step needs. */
interface RouteCandidate extends FlightRouteInfo {
  originPosition?: LatLon;
  destinationPosition?: LatLon;
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
const FETCH_TIMEOUT_MS = 7000;

/**
 * How much further the aircraft would have to fly, going via where it
 * actually is, than the direct origin→destination distance.
 *
 * This is the primary test, and it separates real cases from wrong ones far
 * more cleanly than raw distance-from-the-path does. Measured against the
 * reported failure — ASA642 over Portland, which adsb.lol called Seattle→
 * Denver while it was really flying Portland→Newark — a genuine Seattle→LA
 * overflight of Portland costs 17km of detour and a real westward weather
 * deviation 52km, while the bogus Seattle→Denver leg costs 118km. It also
 * catches "behind the origin" and "past the destination" for free: flying
 * backwards adds detour like anything else does.
 */
const MAX_DETOUR_METERS = 80_000;
/**
 * How far to the side of the direct path an aircraft may sit.
 *
 * A backstop for the one case detour is blind to: on a very long leg, a
 * large perpendicular offset barely lengthens the journey at all (200km off
 * the middle of a transpacific route adds about 10km), so detour alone would
 * wave it through. Deliberately generous, since detour is doing the real
 * work — and a fixed distance, never a fraction of route length, because
 * scaling it would widen the corridor exactly as the bogus route got longer.
 */
const MAX_CORRIDOR_METERS = 150_000;

export interface RouteVerdict {
  accepted: boolean;
  /** Why it was rejected, for the diagnostics endpoint. */
  reason?: string;
  /** Extra distance flown by going via the aircraft — the primary test. */
  detourKm?: number;
  crossTrackKm?: number;
  alongTrackKm?: number;
  routeLengthKm?: number;
}

/**
 * Does this route actually fit where the aircraft is? Exported so the
 * diagnostics endpoint can show the working rather than just a verdict.
 */
export function verifyRouteAgainstPosition(
  candidate: RouteCandidate,
  position?: LatLon
): RouteVerdict {
  if (!position) {
    return { accepted: false, reason: "no aircraft position to check against" };
  }
  const { originPosition, destinationPosition } = candidate;
  if (!originPosition || !destinationPosition) {
    // Unverifiable is treated as unusable: showing an unchecked route is how
    // a wrong one reaches the screen in the first place.
    return { accepted: false, reason: "source gave no airport coordinates" };
  }

  const routeLength = distanceMeters(originPosition, destinationPosition);
  if (routeLength < 1000) {
    return { accepted: false, reason: "origin and destination are the same place" };
  }

  const crossTrack = Math.abs(
    crossTrackDistanceMeters(position, originPosition, destinationPosition)
  );
  const alongTrack = alongTrackDistanceMeters(position, originPosition, destinationPosition);
  const viaAircraft =
    distanceMeters(originPosition, position) + distanceMeters(position, destinationPosition);
  const detour = viaAircraft - routeLength;

  const verdict: RouteVerdict = {
    accepted: false,
    detourKm: Math.round(detour / 1000),
    crossTrackKm: Math.round(crossTrack / 1000),
    alongTrackKm: Math.round(alongTrack / 1000),
    routeLengthKm: Math.round(routeLength / 1000),
  };

  if (detour > MAX_DETOUR_METERS) {
    return {
      ...verdict,
      reason: `flying this route via the aircraft's position would add ${Math.round(
        detour / 1000
      )}km`,
    };
  }
  if (crossTrack > MAX_CORRIDOR_METERS) {
    return { ...verdict, reason: `${Math.round(crossTrack / 1000)}km to the side of the direct path` };
  }

  return { ...verdict, accepted: true };
}

export async function lookupFlightRoute(
  callsign: string,
  latitude?: number,
  longitude?: number
): Promise<FlightRouteInfo> {
  const key = callsign.trim().toUpperCase();
  // A tail number has no published route; asking these databases for one only
  // spends someone else's free quota on a guaranteed miss.
  if (!isAirlineFlightId(key)) return {};

  const position =
    latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;

  // Cache on callsign *and* rough position: the same callsign genuinely maps
  // to different legs on different days, and a route accepted over Portland
  // must not be reused for an aircraft somewhere else entirely.
  const cacheKey = position
    ? `${key}|${position.latitude.toFixed(0)},${position.longitude.toFixed(0)}`
    : key;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.route;

  for (const source of [fetchFromAdsbLol, fetchFromAdsbdb]) {
    try {
      const candidate = await source(key, position);
      if (!candidate || (!candidate.origin && !candidate.destination)) continue;
      if (!verifyRouteAgainstPosition(candidate, position).accepted) continue;

      const route: FlightRouteInfo = {
        origin: candidate.origin,
        originName: candidate.originName,
        destination: candidate.destination,
        destinationName: candidate.destinationName,
        airline: candidate.airline,
        source: candidate.source,
      };
      cache.set(cacheKey, { route, expiresAt: Date.now() + CACHE_TTL_MS });
      return route;
    } catch {
      // Try the next source; a route is a nice-to-have, never a blocker.
    }
  }

  cache.set(cacheKey, { route: {}, expiresAt: Date.now() + MISS_TTL_MS });
  return {};
}

/**
 * Every candidate each source offers, with its verdict. Used only by the
 * diagnostics endpoint — it deliberately bypasses the cache so it always
 * reports what the databases are saying right now.
 */
export async function probeFlightRoute(callsign: string, position?: LatLon) {
  const key = callsign.trim().toUpperCase();
  const results = [];
  for (const [name, source] of [
    ["adsb.lol", fetchFromAdsbLol],
    ["adsbdb", fetchFromAdsbdb],
  ] as const) {
    const startedAt = Date.now();
    try {
      const candidate = await source(key, position);
      results.push({
        source: name,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        candidate: candidate
          ? {
              origin: candidate.origin ?? null,
              destination: candidate.destination ?? null,
              airline: candidate.airline ?? null,
            }
          : null,
        verdict: candidate ? verifyRouteAgainstPosition(candidate, position) : null,
      });
    } catch (err) {
      results.push({
        source: name,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    callsign: key,
    lookedUp: isAirlineFlightId(key),
    sources: results,
  };
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
  lat?: number;
  lon?: number;
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
  position?: LatLon
): Promise<RouteCandidate | null> {
  // The endpoint wants a position to judge plausibility against; without one
  // there is nothing to check the route against, so we skip straight to the
  // database that doesn't need it.
  if (!position) return null;

  const body = JSON.stringify({
    planes: [{ callsign, lat: position.latitude, lng: position.longitude }],
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
  // Its own plausibility flag, when present, is taken as a veto — but never
  // as approval: the geometry check below is what actually decides.
  if (row.plausible !== undefined && !row.plausible) return null;

  const airports = Array.isArray(row._airports) ? row._airports : [];
  // A codeshare/multi-leg entry lists every stop; the first and last are the
  // ends of the journey, which is what "from → to" means to someone looking up.
  const first = airports[0];
  const last = airports.length > 1 ? airports[airports.length - 1] : undefined;
  const fallback = codes.split("-").map((c) => c.trim()).filter(Boolean);

  const origin = airportCode(first) ?? fallback[0];
  const destination =
    airportCode(last) ?? (fallback.length > 1 ? fallback[fallback.length - 1] : undefined);
  if (!origin && !destination) return null;

  return {
    origin,
    originName: airportName(first),
    originPosition: coords(first?.lat, first?.lon),
    destination,
    destinationName: airportName(last),
    destinationPosition: coords(last?.lat, last?.lon),
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
  latitude?: number;
  longitude?: number;
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

async function fetchFromAdsbdb(callsign: string): Promise<RouteCandidate | null> {
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
    originPosition: coords(route.origin?.latitude, route.origin?.longitude),
    destination,
    destinationName: adsbdbName(route.destination),
    destinationPosition: coords(route.destination?.latitude, route.destination?.longitude),
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

function coords(lat?: unknown, lon?: unknown): LatLon | undefined {
  const latitude = typeof lat === "number" && Number.isFinite(lat) ? lat : undefined;
  const longitude = typeof lon === "number" && Number.isFinite(lon) ? lon : undefined;
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitude === 0 && longitude === 0) return undefined; // null island, not an airport
  return { latitude, longitude };
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
