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
  bearingDegrees,
  crossTrackDistanceMeters,
  distanceMeters,
  normalizeSignedDegrees,
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
 * Measured against the first reported failure — ASA642 over Portland, which
 * adsb.lol called Seattle→Denver while it was really flying Portland→Newark
 * — a genuine Seattle→LA overflight of Portland costs 17km of detour and a
 * real westward weather deviation 52km, while the bogus Seattle→Denver leg
 * costs 118km. It also catches "behind the origin" and "past the
 * destination" for free: flying backwards adds detour like anything else.
 */
const MAX_DETOUR_METERS = 80_000;

/**
 * Below this, an aircraft is in a terminal area rather than cruising.
 */
const TERMINAL_ALTITUDE_FT = 10_000;
/** Vertical speed that counts as genuinely climbing or descending. */
const CLIMB_RATE_FPM = 250;
/**
 * How far an aircraft at a given altitude can still be from the airport it
 * is descending into (or has just climbed out of).
 *
 * Airliners plan a descent at roughly 3 nautical miles per 1,000 feet — the
 * "3:1 rule" every pilot uses. This allows six times that, plus an 80km
 * floor, so shallow approaches, turboprops and early descents all pass
 * comfortably. What it does *not* allow is the second reported failure:
 * ASA638 at 2,100 feet, descending 704 fpm on final approach to Portland,
 * with adsb.lol claiming a destination 1,777km away in Tucson. No corridor
 * check could ever catch that one — Portland genuinely lies near the
 * Seattle→Tucson path, so the detour was a mere 38km — but the aircraft's
 * own altitude makes it impossible.
 */
function maxTerminalDistanceMeters(altitudeFt: number): number {
  const threeToOneNm = (Math.max(0, altitudeFt) / 1000) * 3;
  return Math.max(80_000, threeToOneNm * 1852 * 6);
}
/**
 * Once genuinely en route — well clear of both airports, so not maneuvering
 * in a terminal area — an aircraft should be pointing broadly at where it is
 * going. Generous, because airways are not straight lines; it exists to
 * catch a route listed back-to-front, not to police minor turns.
 */
const ENROUTE_CLEARANCE_METERS = 150_000;
const MAX_TRACK_ERROR_DEG = 100;
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

/**
 * What the aircraft itself is doing. Altitude and vertical speed pin down
 * the phase of flight, which turns out to be the single most decisive test
 * available — far stronger than corridor geometry.
 */
export interface AircraftState {
  position: LatLon;
  /** Feet above sea level. */
  altitude?: number;
  /** Feet per minute; negative is descending. */
  verticalSpeed?: number;
  /** Degrees true. */
  track?: number;
}

export interface RouteVerdict {
  accepted: boolean;
  /** Why it was rejected, for the diagnostics endpoint. */
  reason?: string;
  /** Extra distance flown by going via the aircraft. */
  detourKm?: number;
  /** Distance to the claimed origin / destination, in km. */
  toOriginKm?: number;
  toDestinationKm?: number;
  /** What the aircraft's altitude and vertical speed say it is doing. */
  phase?: "arriving" | "departing" | "enroute";
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
  aircraft?: AircraftState
): RouteVerdict {
  if (!aircraft) {
    return { accepted: false, reason: "no aircraft position to check against" };
  }
  const { originPosition, destinationPosition } = candidate;
  if (!originPosition || !destinationPosition) {
    // Unverifiable is treated as unusable: showing an unchecked route is how
    // a wrong one reaches the screen in the first place.
    return { accepted: false, reason: "source gave no airport coordinates" };
  }

  const { position, altitude, verticalSpeed, track } = aircraft;
  const routeLength = distanceMeters(originPosition, destinationPosition);
  if (routeLength < 1000) {
    return { accepted: false, reason: "origin and destination are the same place" };
  }

  const toOrigin = distanceMeters(originPosition, position);
  const toDestination = distanceMeters(position, destinationPosition);
  const crossTrack = Math.abs(
    crossTrackDistanceMeters(position, originPosition, destinationPosition)
  );
  const alongTrack = alongTrackDistanceMeters(position, originPosition, destinationPosition);
  const detour = toOrigin + toDestination - routeLength;

  const lowAndSlowEnoughToBeTerminal =
    altitude !== undefined && altitude < TERMINAL_ALTITUDE_FT;
  const descending = (verticalSpeed ?? 0) < -CLIMB_RATE_FPM;
  const climbing = (verticalSpeed ?? 0) > CLIMB_RATE_FPM;
  const phase: RouteVerdict["phase"] =
    lowAndSlowEnoughToBeTerminal && descending
      ? "arriving"
      : lowAndSlowEnoughToBeTerminal && climbing
        ? "departing"
        : "enroute";

  const verdict: RouteVerdict = {
    accepted: false,
    phase,
    detourKm: Math.round(detour / 1000),
    crossTrackKm: Math.round(crossTrack / 1000),
    alongTrackKm: Math.round(alongTrack / 1000),
    routeLengthKm: Math.round(routeLength / 1000),
    toOriginKm: Math.round(toOrigin / 1000),
    toDestinationKm: Math.round(toDestination / 1000),
  };

  // --- Phase of flight. The strongest test there is, and the only one that
  // catches a wrong route which happens to lie along the right corridor. ---
  if (phase === "arriving" && altitude !== undefined) {
    const reach = maxTerminalDistanceMeters(altitude);
    if (toDestination > reach) {
      return {
        ...verdict,
        reason: `descending through ${Math.round(altitude)}ft but the claimed destination is ${Math.round(
          toDestination / 1000
        )}km away — it is landing somewhere else`,
      };
    }
  }
  if (phase === "departing" && altitude !== undefined) {
    const reach = maxTerminalDistanceMeters(altitude);
    if (toOrigin > reach) {
      return {
        ...verdict,
        reason: `climbing through ${Math.round(altitude)}ft but the claimed origin is ${Math.round(
          toOrigin / 1000
        )}km away — it took off somewhere else`,
      };
    }
  }

  // --- Corridor geometry. Catches a route the aircraft is nowhere near. ---
  if (detour > MAX_DETOUR_METERS) {
    return {
      ...verdict,
      reason: `flying this route via the aircraft's position would add ${Math.round(
        detour / 1000
      )}km`,
    };
  }
  if (crossTrack > MAX_CORRIDOR_METERS) {
    return {
      ...verdict,
      reason: `${Math.round(crossTrack / 1000)}km to the side of the direct path`,
    };
  }

  // --- Direction of travel. Only once clear of both terminal areas, where
  // an aircraft genuinely should be pointing at its destination. ---
  if (
    track !== undefined &&
    toOrigin > ENROUTE_CLEARANCE_METERS &&
    toDestination > ENROUTE_CLEARANCE_METERS
  ) {
    const wanted = bearingDegrees(position, destinationPosition);
    const error = Math.abs(normalizeSignedDegrees(track - wanted));
    if (error > MAX_TRACK_ERROR_DEG) {
      return {
        ...verdict,
        reason: `tracking ${Math.round(track)}° but its claimed destination is ${Math.round(
          wanted
        )}° away — flying the wrong way for this route`,
      };
    }
  }

  return { ...verdict, accepted: true };
}

export async function lookupFlightRoute(
  callsign: string,
  aircraft?: AircraftState
): Promise<FlightRouteInfo> {
  const key = callsign.trim().toUpperCase();
  // A tail number has no published route; asking these databases for one only
  // spends someone else's free quota on a guaranteed miss.
  if (!isAirlineFlightId(key)) return {};

  const position = aircraft?.position;

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
      if (!verifyRouteAgainstPosition(candidate, aircraft).accepted) continue;

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
export async function probeFlightRoute(callsign: string, aircraft?: AircraftState) {
  const key = callsign.trim().toUpperCase();
  const position = aircraft?.position;
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
        verdict: candidate ? verifyRouteAgainstPosition(candidate, aircraft) : null,
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
