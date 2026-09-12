import { AircraftDataProvider } from "../types";
import { Flightradar24Provider } from "./flightradar24";
import { MockAircraftProvider } from "./mockProvider";

/**
 * Provider factory. This is the one place that decides which live-data
 * backend powers the app. Swapping providers (or adding a new one) never
 * touches the UI — see spec #42/#65.
 */
let cached: AircraftDataProvider | null = null;

export function getAircraftProvider(): AircraftDataProvider {
  if (cached) return cached;

  const apiKey = process.env.FR24_API_KEY;
  if (apiKey) {
    const baseUrl = process.env.FR24_API_BASE_URL || undefined;
    cached = new Flightradar24Provider(apiKey, baseUrl);
  } else {
    cached = new MockAircraftProvider();
  }
  return cached;
}
