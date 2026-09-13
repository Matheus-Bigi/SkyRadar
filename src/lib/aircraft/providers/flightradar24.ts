import { classifyAircraft } from "../classify";
import {
  Aircraft,
  AircraftDataProvider,
  AircraftProviderResult,
  AircraftQuery,
} from "../types";
import { metersToMiles } from "../../geo";

/**
 * Live provider backed by the official Flightradar24 API
 * (https://fr24api.flightradar24.com). This calls out with server-side
 * credentials only — it must never run in the browser (see spec #43).
 *
 * FR24 exposes flight positions as a bounding box query. We derive the box
 * from the requested center + radius so we only ever ask for the geographic
 * area the user actually needs (spec #8 — no worldwide polling).
 *
 * The exact response schema can vary by FR24 API plan/version. Field access
 * below is defensive (every field optional, multiple aliases checked) so a
 * minor schema difference degrades gracefully instead of throwing — but if
 * you wire up a real account, double check field names against your plan's
 * docs and adjust `parseFlight` if needed.
 */
export class Flightradar24Provider implements AircraftDataProvider {
  readonly name = "flightradar24";

  constructor(
    private readonly apiKey: string,
    private readonly apiBaseUrl: string = "https://fr24api.flightradar24.com"
  ) {}

  async fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult> {
    const bounds = boundingBoxFromRadius(query);
    const url = `${this.apiBaseUrl}/api/live/flight-positions/full?bounds=${bounds}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Accept-Version": "v1",
        },
        // Live radar data — never let a CDN/browser cache serve stale flights.
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Flightradar24 API error ${res.status}`);
      }

      const body = (await res.json()) as { data?: unknown[] };
      const rawFlights = Array.isArray(body.data) ? body.data : [];

      const aircraft = rawFlights
        .map(parseFlight)
        .filter((a): a is Aircraft => a !== null && a.isAirborne);

      return { aircraft, source: this.name, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function boundingBoxFromRadius(query: AircraftQuery): string {
  const { centerLatitude, centerLongitude, radiusMeters } = query;
  const latDelta = radiusMeters / 111320; // ~meters per degree latitude
  const lonDelta =
    radiusMeters / (111320 * Math.max(0.15, Math.cos((centerLatitude * Math.PI) / 180)));

  const latMax = centerLatitude + latDelta;
  const latMin = centerLatitude - latDelta;
  const lonMax = centerLongitude + lonDelta;
  const lonMin = centerLongitude - lonDelta;
  // FR24 bounds format: north,south,west,east
  return `${latMax},${latMin},${lonMin},${lonMax}`;
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

function parseFlight(raw: unknown): Aircraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const latitude = num(r.lat ?? r.latitude);
  const longitude = num(r.lon ?? r.lng ?? r.longitude);
  if (latitude === undefined || longitude === undefined) return null;

  const id = str(r.fr24_id ?? r.hex ?? r.id) ?? `${latitude},${longitude}`;
  const onGround = Boolean(r.on_ground ?? r.ground ?? r.onGround ?? false);
  const altitude = num(r.alt ?? r.altitude);
  const isAirborne = !onGround && (altitude === undefined || altitude > 0);

  const callsign = str(r.callsign);
  const registration = str(r.reg ?? r.registration);
  const aircraftType = str(r.type ?? r.aircraft_type);
  const operator = str(r.operating_as ?? r.operator);
  const airline = str(r.painted_as ?? r.airline ?? operator);

  const classification = classifyAircraft({
    aircraftType,
    operator,
    airline,
    callsign,
    registration,
  });

  return {
    id,
    callsign,
    flightNumber: str(r.flight ?? r.flight_number),
    registration,
    aircraftType,
    aircraftModel: aircraftType,
    operator,
    airline,
    category: classification.category,
    silhouette: classification.silhouette,
    isMilitary: classification.isMilitary,
    latitude,
    longitude,
    altitude,
    groundSpeed: num(r.gspeed ?? r.speed ?? r.ground_speed),
    heading: num(r.track ?? r.heading),
    verticalSpeed: num(r.vspeed ?? r.vertical_speed),
    // Outside air temperature (Celsius) — not exposed by every FR24 plan;
    // wired defensively so it lights up automatically if yours reports it.
    outsideAirTempC: num(r.oat ?? r.outside_air_temp ?? r.temperature ?? r.temp),
    lastUpdated: (() => {
      const ts = num(r.timestamp);
      return ts ? (ts > 1e12 ? ts : ts * 1000) : Date.now();
    })(),
    origin: str(r.orig_iata ?? r.origin),
    destination: str(r.dest_iata ?? r.destination),
    isAirborne,
  };
}

// Re-exported for tests/tools that want the miles-based radius helper.
export const _internal = { boundingBoxFromRadius, metersToMiles };
