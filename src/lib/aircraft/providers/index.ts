import { AircraftDataProvider } from "../types";
import { Flightradar24Provider } from "./flightradar24";
import { OpenSkyProvider } from "./opensky";
import { MockAircraftProvider } from "./mockProvider";

/**
 * Provider factory. This is the one place that decides which live-data
 * backend powers the app. Swapping providers (or adding a new one) never
 * touches the UI — see spec #42/#65.
 *
 * SkyRadar's rule: never show an aircraft, number, or value that isn't
 * real and at the user's real location. That means the local simulator
 * must never be selected silently — it only ever runs if AIRCRAFT_PROVIDER
 * is explicitly set to "mock" (local development/testing only; never set
 * this in a real deployment). With no FR24 key configured, SkyRadar
 * defaults to the free OpenSky Network provider — real ADS-B data, no key
 * required — rather than falling back to fabricated traffic.
 */
let cached: AircraftDataProvider | null = null;

export function getAircraftProvider(): AircraftDataProvider {
  if (cached) return cached;

  if (process.env.AIRCRAFT_PROVIDER === "mock") {
    cached = new MockAircraftProvider();
    return cached;
  }

  const fr24Key = process.env.FR24_API_KEY;
  if (fr24Key) {
    const baseUrl = process.env.FR24_API_BASE_URL || undefined;
    cached = new Flightradar24Provider(fr24Key, baseUrl);
    return cached;
  }

  cached = new OpenSkyProvider(
    process.env.OPENSKY_USERNAME,
    process.env.OPENSKY_PASSWORD,
    process.env.OPENSKY_API_BASE_URL || undefined
  );
  return cached;
}
