/**
 * Normalized internal aircraft model. Every data provider (Flightradar24,
 * future providers, the local simulator) maps its raw response into this
 * shape. The UI never touches a provider's raw payload directly.
 */

export type AircraftCategory =
  | "AIRLINE"
  | "MILITARY"
  | "HELICOPTER"
  | "GENERAL_AVIATION"
  | "OTHER";

export type SilhouetteType =
  | "JET_AIRLINER"
  | "REGIONAL_JET"
  | "TURBOPROP"
  | "GENERAL_AVIATION"
  | "HELICOPTER"
  | "MILITARY_HELICOPTER"
  | "FIGHTER"
  | "MILITARY_TRANSPORT"
  | "OTHER";

export interface Aircraft {
  id: string;

  // Basic identification
  callsign?: string;
  flightNumber?: string;
  registration?: string;
  aircraftType?: string; // ICAO type designator, e.g. "B738"
  aircraftModel?: string; // Human readable, e.g. "Boeing 737-800"
  operator?: string;
  airline?: string;
  category: AircraftCategory;
  silhouette: SilhouetteType;
  isMilitary: boolean;

  // Position
  latitude: number;
  longitude: number;
  altitude?: number; // feet, above sea level
  groundSpeed?: number; // knots
  heading?: number; // degrees true, 0-360
  verticalSpeed?: number; // feet per minute
  outsideAirTempC?: number; // Celsius, when a provider reports (or estimates) it
  lastUpdated: number; // epoch ms

  // Route
  origin?: string;
  destination?: string;

  // Media
  imageUrl?: string;
  imageAttribution?: string;

  // Lifecycle
  isAirborne: boolean;
}

/** Query describing what a provider should fetch. */
export interface AircraftQuery {
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number;
  /**
   * Optional cancellation shared across a failover chain, so trying several
   * providers in turn still fits inside one serverless request budget.
   */
  signal?: AbortSignal;
}

export interface AircraftProviderResult {
  aircraft: Aircraft[];
  source: string;
  fetchedAt: number;
}

/**
 * Contract every live-data provider implements. Consumers (the API route)
 * depend only on this interface, never on a provider's wire format —
 * see spec #42/#65 (provider abstraction).
 */
export interface AircraftDataProvider {
  readonly name: string;
  fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult>;
}
