import { airlineFromCallsign } from "../airlines";
import { classifyAircraft } from "../classify";
import {
  Aircraft,
  AircraftDataProvider,
  AircraftProviderResult,
  AircraftQuery,
} from "../types";

/**
 * Community ADS-B aggregators (adsb.lol, airplanes.live, adsb.fi). All three
 * expose the same readsb/tar1090 JSON shape over a *radius* query, need no
 * API key or account, and — unlike OpenSky's anonymous tier — don't quota by
 * source IP in a way that a shared serverless address blows through
 * instantly. They also report far more real detail than OpenSky's free tier:
 * registration, ICAO type, a human-readable model, owner/operator, and a
 * military flag, all straight off the aircraft's own transmissions.
 *
 * Values arrive in aviation units already (feet, knots, ft/min), so nothing
 * here converts or derives anything — a field is either reported by the
 * aircraft or left undefined for the UI to hide.
 */

const CACHE_TTL_MS = 5000;
const REQUEST_TIMEOUT_MS = 3500;
const METERS_PER_NAUTICAL_MILE = 1852;
/** Positions older than this are ghosts — a real aircraft, but not really there any more. */
const MAX_POSITION_AGE_S = 60;
/** The aggregators cap radius requests; stay inside it. */
const MAX_RADIUS_NM = 250;

export interface AdsbEndpoint {
  name: string;
  buildUrl: (lat: string, lon: string, radiusNm: number) => string;
}

export const ADSB_ENDPOINTS: AdsbEndpoint[] = [
  {
    name: "adsb.lol",
    buildUrl: (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
  },
  {
    name: "airplanes.live",
    buildUrl: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
  },
  {
    name: "adsb.fi",
    buildUrl: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
  },
];

export class AdsbAggregatorProvider implements AircraftDataProvider {
  readonly name: string;

  constructor(private readonly endpoint: AdsbEndpoint) {
    this.name = endpoint.name;
  }

  async fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult> {
    const key = `${this.name}|${cacheKey(query)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return { aircraft: hit.aircraft, source: this.name, fetchedAt: hit.fetchedAt };
    }

    const radiusNm = Math.min(
      MAX_RADIUS_NM,
      Math.max(5, Math.ceil((query.radiusMeters / METERS_PER_NAUTICAL_MILE) * 1.3))
    );
    const url = this.endpoint.buildUrl(
      query.centerLatitude.toFixed(4),
      query.centerLongitude.toFixed(4),
      radiusNm
    );

    const deadline = withDeadline(REQUEST_TIMEOUT_MS, query.signal);
    try {
      const res = await fetch(url, {
        signal: deadline.signal,
        headers: {
          Accept: "application/json",
          // These are volunteer-run feeds; identify ourselves honestly.
          "User-Agent": "SkyRadar/1.0 (personal aviation radar; non-commercial)",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = (await res.json()) as { ac?: unknown[] };
      const rows = Array.isArray(body.ac) ? body.ac : [];

      const aircraft = rows
        .map(parseAircraft)
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

function cacheKey(query: AircraftQuery): string {
  // ~1.1km grid — repeated polls from a roughly-stationary viewer collapse
  // onto one upstream request instead of each triggering a new one.
  return `${query.centerLatitude.toFixed(2)},${query.centerLongitude.toFixed(2)},${Math.round(
    query.radiusMeters / 1000
  )}`;
}

/**
 * An AbortSignal that fires on our own timeout *or* when the caller's overall
 * budget runs out, so a failover chain can't overrun its request deadline.
 */
export function withDeadline(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);
  const onExternalAbort = () => controller.abort(external?.reason);
  if (external?.aborted) controller.abort(external.reason);
  else external?.addEventListener("abort", onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function parseAircraft(raw: unknown): Aircraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const latitude = num(r.lat);
  const longitude = num(r.lon);
  if (latitude === undefined || longitude === undefined) return null;

  const hex = str(r.hex);
  if (!hex) return null;

  // A stale position would put a real aircraft in a place it has already left.
  const seenPos = num(r.seen_pos);
  if (seenPos !== undefined && seenPos > MAX_POSITION_AGE_S) return null;

  // `alt_baro` is feet, or the literal string "ground".
  const onGround = r.alt_baro === "ground" || r.ground === true;
  const altitude = num(r.alt_geom) ?? num(r.alt_baro);

  const callsign = str(r.flight);
  const registration = str(r.r);
  const aircraftType = str(r.t);
  const aircraftModel = str(r.desc);
  const operator = str(r.ownOp);
  // The callsign of a commercial flight *is* the operator's registered ICAO
  // designator plus a flight number, so naming it states a published fact
  // rather than guessing. `operator` above is the airframe's registered
  // owner, which is often a leasing company or a regional partner — the two
  // are genuinely different things, and both are shown as such.
  const airline = airlineFromCallsign(callsign)?.name;
  // Bit 0 of dbFlags marks military in the aggregators' shared aircraft DB.
  const dbFlags = num(r.dbFlags) ?? 0;

  const classification = classifyAircraft({
    aircraftType,
    aircraftModel,
    operator,
    airline,
    callsign,
    registration,
    providerFlaggedMilitary: (dbFlags & 1) === 1,
    emitterCategory: str(r.category),
  });

  return {
    id: hex.toLowerCase(),
    callsign,
    registration,
    aircraftType,
    aircraftModel,
    operator,
    airline,
    category: classification.category,
    silhouette: classification.silhouette,
    isMilitary: classification.isMilitary,
    latitude,
    longitude,
    altitude,
    groundSpeed: num(r.gs),
    heading: num(r.track) ?? num(r.true_heading) ?? num(r.mag_heading),
    verticalSpeed: num(r.baro_rate) ?? num(r.geom_rate),
    lastUpdated: seenPos !== undefined ? Date.now() - seenPos * 1000 : Date.now(),
    isAirborne: !onGround,
  };
}
