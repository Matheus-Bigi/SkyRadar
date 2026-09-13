import { airlineFromCallsign } from "../airlines";
import { classifyAircraft } from "../classify";
import {
  Aircraft,
  AircraftDataProvider,
  AircraftProviderResult,
  AircraftQuery,
} from "../types";
import { metersToFeet, mpsToKnots } from "../../geo";
import { withDeadline } from "./adsb";

/**
 * Live provider backed by the free OpenSky Network REST API
 * (https://opensky-network.org/apidoc) — real ADS-B/Mode-S state vectors,
 * no API key required. This is SkyRadar's default provider whenever no
 * FR24 credentials are configured, so a fresh deployment shows genuine
 * live traffic out of the box rather than the local simulator.
 *
 * Anonymous access is rate-limited (OpenSky's published anonymous quota is
 * ~400 requests/day at ~10s resolution — check their current docs, this
 * can change). Optional Basic Auth credentials for a free registered
 * OpenSky account raise that quota; see OPENSKY_USERNAME/OPENSKY_PASSWORD
 * in .env.example. A short server-side cache (see `cache` below) keeps
 * actual outbound requests well under either limit regardless of how
 * often the client polls.
 *
 * OpenSky's free tier reports only position/callsign/speed/altitude/
 * heading/vertical-rate — no registration, aircraft type, model, or
 * operator/airline. Those fields are left undefined rather than guessed:
 * every consumer (format.ts, AircraftCard, classify.ts) already treats
 * missing fields as "hide it", never as "fabricate it".
 */
export class OpenSkyProvider implements AircraftDataProvider {
  readonly name = "opensky";

  constructor(
    private readonly username?: string,
    private readonly password?: string,
    private readonly baseUrl: string = "https://opensky-network.org/api"
  ) {}

  async fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult> {
    const key = cacheKey(query);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return { aircraft: hit.aircraft, source: this.name, fetchedAt: hit.fetchedAt };
    }

    const bounds = boundingBoxFromRadius(query);
    const url =
      `${this.baseUrl}/states/all?lamin=${bounds.latMin}&lomin=${bounds.lonMin}` +
      `&lamax=${bounds.latMax}&lomax=${bounds.lonMax}`;

    const deadline = withDeadline(4000, query.signal);

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (this.username && this.password) {
        const basic = Buffer.from(`${this.username}:${this.password}`).toString("base64");
        headers.Authorization = `Basic ${basic}`;
      }

      const res = await fetch(url, {
        signal: deadline.signal,
        headers,
        // Live radar data — never let a CDN/browser cache serve stale flights;
        // our own short-lived cache above is the only staleness we allow.
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = (await res.json()) as { states?: unknown[][] | null };
      const rows = Array.isArray(body.states) ? body.states : [];

      const aircraft = rows
        .map(parseState)
        .filter((a): a is Aircraft => a !== null && a.isAirborne);

      const fetchedAt = Date.now();
      cache.set(key, { aircraft, fetchedAt });
      return { aircraft, source: this.name, fetchedAt };
    } finally {
      deadline.cleanup();
    }
  }
}

interface CacheEntry {
  aircraft: Aircraft[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15000;

function cacheKey(query: AircraftQuery): string {
  // ~1.1km grid — repeated polls from a roughly-stationary viewer collapse
  // onto the same OpenSky request instead of each triggering a new one.
  const radiusBucketKm = Math.round(query.radiusMeters / 1000);
  return `${query.centerLatitude.toFixed(2)},${query.centerLongitude.toFixed(2)},${radiusBucketKm}`;
}

function boundingBoxFromRadius(query: AircraftQuery) {
  const { centerLatitude, centerLongitude, radiusMeters } = query;
  const latDelta = radiusMeters / 111320;
  const lonDelta =
    radiusMeters / (111320 * Math.max(0.15, Math.cos((centerLatitude * Math.PI) / 180)));
  return {
    latMax: centerLatitude + latDelta,
    latMin: centerLatitude - latDelta,
    lonMax: centerLongitude + lonDelta,
    lonMin: centerLongitude - lonDelta,
  };
}

// OpenSky state vector array indices — see the response schema at
// https://openskynetwork.github.io/opensky-api/rest.html#response
const IDX = {
  ICAO24: 0,
  CALLSIGN: 1,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
  GEO_ALTITUDE: 13,
} as const;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseState(row: unknown): Aircraft | null {
  if (!Array.isArray(row)) return null;

  const latitude = num(row[IDX.LATITUDE]);
  const longitude = num(row[IDX.LONGITUDE]);
  if (latitude === undefined || longitude === undefined) return null;

  const icao24 = typeof row[IDX.ICAO24] === "string" ? (row[IDX.ICAO24] as string) : undefined;
  if (!icao24) return null;

  const rawCallsign = typeof row[IDX.CALLSIGN] === "string" ? (row[IDX.CALLSIGN] as string).trim() : "";
  const callsign = rawCallsign.length > 0 ? rawCallsign : undefined;
  const onGround = Boolean(row[IDX.ON_GROUND]);

  // Prefer GPS-derived geometric altitude; fall back to barometric — both
  // are meters above sea level per OpenSky's schema.
  const altitudeMeters = num(row[IDX.GEO_ALTITUDE]) ?? num(row[IDX.BARO_ALTITUDE]);
  const velocityMps = num(row[IDX.VELOCITY]);
  const verticalRateMps = num(row[IDX.VERTICAL_RATE]);

  // OpenSky's free tier reports no operator at all, but a commercial
  // callsign carries its operator's registered ICAO designator in its first
  // three letters — a published fact, not an inference.
  const airline = airlineFromCallsign(callsign)?.name;
  const classification = classifyAircraft({ callsign, airline });
  const lastContact = num(row[IDX.LAST_CONTACT]);

  return {
    id: icao24,
    callsign,
    airline,
    category: classification.category,
    silhouette: classification.silhouette,
    isMilitary: classification.isMilitary,
    latitude,
    longitude,
    altitude: altitudeMeters !== undefined ? Math.round(metersToFeet(altitudeMeters)) : undefined,
    groundSpeed: velocityMps !== undefined ? Math.round(mpsToKnots(velocityMps)) : undefined,
    heading: num(row[IDX.TRUE_TRACK]),
    verticalSpeed: verticalRateMps !== undefined ? Math.round(metersToFeet(verticalRateMps) * 60) : undefined,
    // The real time this transponder was last heard, not just when we
    // happened to fetch — more honest than stamping "now" on stale data.
    lastUpdated: lastContact !== undefined ? lastContact * 1000 : Date.now(),
    isAirborne: !onGround,
  };
}
