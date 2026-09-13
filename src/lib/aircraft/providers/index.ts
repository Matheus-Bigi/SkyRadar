import { AircraftDataProvider } from "../types";
import { Flightradar24Provider } from "./flightradar24";
import { AdsbAggregatorProvider, ADSB_ENDPOINTS } from "./adsb";
import { OpenSkyProvider } from "./opensky";
import { FailoverAircraftProvider } from "./failover";
import { MockAircraftProvider } from "./mockProvider";

/**
 * Provider factory. This is the one place that decides which live-data
 * backend powers the app. Swapping providers (or adding a new one) never
 * touches the UI — see spec #42/#65.
 *
 * SkyRadar's rule: never show an aircraft, number, or value that isn't real
 * and at the user's real location. So the local simulator is never selected
 * silently — it only runs when AIRCRAFT_PROVIDER is explicitly "mock" (local
 * development; never set this in a real deployment). Everything else in the
 * chain is a real feed, tried in turn until one answers; if they all fail the
 * app reports live data as unavailable rather than inventing traffic.
 *
 * Order is deliberate: the keyless community ADS-B aggregators come first
 * because they need no account, answer a radius query directly, and report
 * the most real detail (registration, type, model, operator, military flag).
 * OpenSky trails them — its anonymous tier quotas by source IP, which a
 * shared serverless address tends to exhaust.
 */
let cached: AircraftDataProvider | null = null;

/** The real-data providers, in the order they're tried. Also used by the diagnostics route. */
export function listAircraftProviders(): AircraftDataProvider[] {
  const providers: AircraftDataProvider[] = [];

  const fr24Key = process.env.FR24_API_KEY;
  if (fr24Key) {
    providers.push(new Flightradar24Provider(fr24Key, process.env.FR24_API_BASE_URL || undefined));
  }

  for (const endpoint of ADSB_ENDPOINTS) {
    providers.push(new AdsbAggregatorProvider(endpoint));
  }

  providers.push(
    new OpenSkyProvider(
      process.env.OPENSKY_USERNAME,
      process.env.OPENSKY_PASSWORD,
      process.env.OPENSKY_API_BASE_URL || undefined
    )
  );

  return providers;
}

export function getAircraftProvider(): AircraftDataProvider {
  if (cached) return cached;

  if (process.env.AIRCRAFT_PROVIDER === "mock") {
    cached = new MockAircraftProvider();
    return cached;
  }

  cached = new FailoverAircraftProvider(listAircraftProviders());
  return cached;
}
