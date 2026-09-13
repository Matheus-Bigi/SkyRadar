/**
 * ICAO airline designators.
 *
 * An airliner's ADS-B callsign is its ATC flight identification, and for a
 * commercial flight that is (by ICAO Doc 8585 convention) the operator's
 * three-letter designator followed by the flight number: DAL2411 is
 * "Delta 2411". The designator is a published, registered identifier — not
 * an inference — so resolving it to the operator's name shows the user a
 * real fact about the aircraft overhead, which is exactly what the raw
 * callsign already told them in code form.
 *
 * This table is deliberately conservative: only designators that are
 * published and current are listed. An unrecognised prefix returns nothing
 * and the UI shows nothing, rather than a guess.
 *
 * Note this is *not* the same as the aircraft's owner: a DAL-callsign flight
 * may be operated by a regional partner. The owner/operator field from the
 * aircraft's own database entry is shown separately.
 */

export interface AirlineIdentity {
  /** The ICAO three-letter designator, e.g. "DAL". */
  icao: string;
  /** The operator's name, e.g. "Delta Air Lines". */
  name: string;
}

const AIRLINE_NAMES: Record<string, string> = {
  // ---- United States: mainline ----
  AAL: "American Airlines",
  AAY: "Allegiant Air",
  ASA: "Alaska Airlines",
  DAL: "Delta Air Lines",
  FFT: "Frontier Airlines",
  HAL: "Hawaiian Airlines",
  JBU: "JetBlue Airways",
  MXY: "Breeze Airways",
  NKS: "Spirit Airlines",
  SCX: "Sun Country Airlines",
  SWA: "Southwest Airlines",
  UAL: "United Airlines",
  VXP: "Avelo Airlines",

  // ---- United States: regional ----
  ASH: "Mesa Airlines",
  AWI: "Air Wisconsin",
  EDV: "Endeavor Air",
  ENY: "Envoy Air",
  GJS: "GoJet Airlines",
  JIA: "PSA Airlines",
  KAP: "Cape Air",
  PDT: "Piedmont Airlines",
  QXE: "Horizon Air",
  RPA: "Republic Airways",
  SKW: "SkyWest Airlines",

  // ---- Cargo ----
  ABX: "ABX Air",
  AJT: "Amerijet International",
  AMF: "Ameriflight",
  ATN: "Air Transport International",
  BOX: "AeroLogic",
  CJT: "Cargojet",
  CKS: "Kalitta Air",
  CLX: "Cargolux",
  FDX: "FedEx Express",
  GEC: "Lufthansa Cargo",
  GTI: "Atlas Air",
  NAC: "Northern Air Cargo",
  NCA: "Nippon Cargo Airlines",
  PAC: "Polar Air Cargo",
  UPS: "UPS Airlines",

  // ---- Business / fractional ----
  EJA: "NetJets",
  EJM: "Executive Jet Management",
  LXJ: "Flexjet",
  VJT: "VistaJet",

  // ---- Canada ----
  ACA: "Air Canada",
  FLE: "Flair Airlines",
  JZA: "Jazz Aviation",
  POE: "Porter Airlines",
  ROU: "Air Canada Rouge",
  TSC: "Air Transat",
  WJA: "WestJet",

  // ---- Latin America ----
  AMX: "Aeroméxico",
  ARG: "Aerolíneas Argentinas",
  AVA: "Avianca",
  AZU: "Azul Brazilian Airlines",
  CMP: "Copa Airlines",
  GLO: "GOL Linhas Aéreas",
  LAN: "LATAM Airlines",
  TAM: "LATAM Brasil",
  VIV: "Viva Aerobus",
  VOI: "Volaris",

  // ---- Europe ----
  AEE: "Aegean Airlines",
  AFR: "Air France",
  AUA: "Austrian Airlines",
  AZA: "ITA Airways",
  BAW: "British Airways",
  BEL: "Brussels Airlines",
  CSA: "Czech Airlines",
  DLH: "Lufthansa",
  EIN: "Aer Lingus",
  EZY: "easyJet",
  FIN: "Finnair",
  IBE: "Iberia",
  ICE: "Icelandair",
  KLM: "KLM Royal Dutch Airlines",
  LOT: "LOT Polish Airlines",
  NAX: "Norwegian Air Shuttle",
  RYR: "Ryanair",
  SAS: "Scandinavian Airlines",
  SWR: "Swiss International Air Lines",
  TAP: "TAP Air Portugal",
  THY: "Turkish Airlines",
  TVF: "Transavia France",
  VIR: "Virgin Atlantic",
  VLG: "Vueling",
  WZZ: "Wizz Air",

  // ---- Middle East / Africa ----
  ELY: "El Al",
  ETD: "Etihad Airways",
  ETH: "Ethiopian Airlines",
  KQA: "Kenya Airways",
  MSR: "EgyptAir",
  QTR: "Qatar Airways",
  RAM: "Royal Air Maroc",
  SVA: "Saudia",
  UAE: "Emirates",

  // ---- Asia / Pacific ----
  AAR: "Asiana Airlines",
  AIC: "Air India",
  ANA: "All Nippon Airways",
  ANZ: "Air New Zealand",
  CAL: "China Airlines",
  CCA: "Air China",
  CES: "China Eastern Airlines",
  CPA: "Cathay Pacific",
  CSN: "China Southern Airlines",
  EVA: "EVA Air",
  GIA: "Garuda Indonesia",
  IGO: "IndiGo",
  JAL: "Japan Airlines",
  JST: "Jetstar Airways",
  KAL: "Korean Air",
  KZR: "Air Astana",
  MAS: "Malaysia Airlines",
  QFA: "Qantas",
  SIA: "Singapore Airlines",
  THA: "Thai Airways International",
  UZB: "Uzbekistan Airways",
  VOZ: "Virgin Australia",

  // ---- Manufacturer / test ----
  BOE: "Boeing",
};

/**
 * A commercial flight identification: three letters, then the flight number.
 * Requiring a digit keeps registrations used as callsigns (N462QX, C-GJZA)
 * and bare tail numbers out — those are not airline designators.
 */
const FLIGHT_ID = /^([A-Z]{3})\d/;

/**
 * Whether a callsign is a commercial flight identification at all.
 *
 * Deliberately pattern-based rather than table-based: a route database knows
 * vastly more callsigns than this file names operators for, so an
 * unrecognised designator is still worth a route lookup. A tail number
 * (N462QX, C-GJZA) is not — it has no published route, and asking would be a
 * request that can only miss.
 */
export function isAirlineFlightId(callsign?: string): boolean {
  return callsign !== undefined && FLIGHT_ID.test(callsign.trim().toUpperCase());
}

/**
 * Resolves the operator behind a callsign, or `undefined` when the callsign
 * isn't an airline flight ID or the designator isn't one we can name.
 */
export function airlineFromCallsign(callsign?: string): AirlineIdentity | undefined {
  if (!callsign) return undefined;
  const match = FLIGHT_ID.exec(callsign.trim().toUpperCase());
  if (!match) return undefined;
  const icao = match[1];
  const name = AIRLINE_NAMES[icao];
  return name ? { icao, name } : undefined;
}

/** Exposed for tests — the number of designators we can currently name. */
export const AIRLINE_DESIGNATOR_COUNT = Object.keys(AIRLINE_NAMES).length;
