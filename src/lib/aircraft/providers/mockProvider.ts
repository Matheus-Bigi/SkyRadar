import { classifyAircraft } from "../classify";
import { Aircraft, AircraftDataProvider, AircraftProviderResult, AircraftQuery } from "../types";
import {
  LatLon,
  destinationPoint,
  distanceMeters,
  knotsToMps,
  normalizeDegrees,
  milesToMeters,
} from "../../geo";
import { nearbyAirports } from "../../airports";

/**
 * Local traffic simulator used whenever a real Flightradar24 credential
 * isn't configured (see providers/index.ts). It is a *live simulation*,
 * not random per-request noise: each aircraft is a stateful kinematic
 * track that moves continuously between calls, gains/loses altitude
 * gradually, drifts heading slightly, and eventually "lands" (is removed)
 * — so the rest of the app (interpolation, trails, Look Here, Sky View)
 * exercises exactly the same code paths it would against live data.
 */

const WORLD_RADIUS_MILES = 40;
const TARGET_POPULATION = 20;
const RESEED_DISTANCE_MILES = 60;
const MIN_LIFETIME_MS = 4 * 60 * 1000;
const MAX_LIFETIME_MS = 13 * 60 * 1000;
const SPAWN_INTERVAL_MS = 9000;

interface SimTrack {
  aircraft: Aircraft;
  headingRateDegPerSec: number;
  speedKt: number;
  targetAltitudeFt: number;
  altitudeRateFtPerSec: number;
  oatJitterC: number;
  expiresAt: number;
}

interface WorldState {
  center: LatLon;
  tracks: Map<string, SimTrack>;
  lastTick: number;
  lastSpawn: number;
  nextId: number;
}

let world: WorldState | null = null;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomRegistration(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "N";
  const len = Math.floor(rand(3, 6));
  for (let i = 0; i < len; i++) {
    s += Math.random() < 0.55 ? choice(chars.split("")) : Math.floor(rand(0, 10));
  }
  return s;
}
function randomMilTail(): string {
  return `${Math.floor(rand(10, 24))}-${Math.floor(rand(10000, 99999))}`;
}

const ISA_SEA_LEVEL_C = 15;
const ISA_LAPSE_RATE_C_PER_FT = 1.98 / 1000;
const ISA_TROPOPAUSE_FT = 36089;
const ISA_TROPOPAUSE_C = -56.5;

/** International Standard Atmosphere temperature estimate for a given altitude, plus a little per-aircraft noise so it isn't a bare lookup table. */
function estimateOutsideAirTempC(altitudeFt: number, jitterC: number): number {
  const base =
    altitudeFt <= ISA_TROPOPAUSE_FT
      ? ISA_SEA_LEVEL_C - ISA_LAPSE_RATE_C_PER_FT * altitudeFt
      : ISA_TROPOPAUSE_C;
  return base + jitterC;
}

const AIRLINES: { icao: string; name: string; types: [string, string][] }[] = [
  {
    icao: "UAL",
    name: "United",
    types: [
      ["B738", "Boeing 737-800"],
      ["A320", "Airbus A320"],
      ["B772", "Boeing 777-200"],
    ],
  },
  {
    icao: "DAL",
    name: "Delta",
    types: [
      ["A321", "Airbus A321"],
      ["B739", "Boeing 737-900"],
      ["A359", "Airbus A350-900"],
    ],
  },
  {
    icao: "SWA",
    name: "Southwest",
    types: [
      ["B737", "Boeing 737-700"],
      ["B38M", "Boeing 737 MAX 8"],
    ],
  },
  {
    icao: "ASA",
    name: "Alaska",
    types: [
      ["B739", "Boeing 737-900"],
      ["E175", "Embraer E175"],
    ],
  },
  {
    icao: "AAL",
    name: "American",
    types: [
      ["A321", "Airbus A321"],
      ["B772", "Boeing 777-200"],
    ],
  },
  {
    icao: "FDX",
    name: "FedEx",
    types: [["MD11", "McDonnell Douglas MD-11F"], ["B763", "Boeing 767-300F"]],
  },
  {
    icao: "UPS",
    name: "UPS",
    types: [["A306", "Airbus A300-600F"], ["B748", "Boeing 747-8F"]],
  },
];

const GA_TYPES: [string, string][] = [
  ["C172", "Cessna 172 Skyhawk"],
  ["C182", "Cessna 182 Skylane"],
  ["SR22", "Cirrus SR22"],
  ["PA28", "Piper Cherokee"],
  ["BE36", "Beechcraft Bonanza"],
  ["DA40", "Diamond DA40"],
  ["PC12", "Pilatus PC-12"],
  ["TBM9", "Daher TBM 900"],
  ["GLF6", "Gulfstream G650"],
];

const HELI_TYPES: [string, string][] = [
  ["R44", "Robinson R44"],
  ["EC35", "Airbus H135"],
  ["B407", "Bell 407"],
  ["S76", "Sikorsky S-76"],
  ["H125", "Airbus H125"],
];
const HELI_OPERATORS = [
  "Life Flight Air Ambulance",
  "Metro News Air 8",
  "Regional Police Air Unit",
  "Coastal Helicopter Tours",
  "Mercy Air Medical",
];

const MIL_HELI_TYPES: [string, string][] = [
  ["H60", "Sikorsky UH-60 Black Hawk"],
  ["HH60", "Sikorsky HH-60W Jolly Green II"],
  ["AH64", "Boeing AH-64 Apache"],
  ["CH47", "Boeing CH-47 Chinook"],
];
const MIL_FIGHTER_TYPES: [string, string][] = [
  ["F16", "General Dynamics F-16 Fighting Falcon"],
  ["F15", "McDonnell Douglas F-15 Eagle"],
  ["F35", "Lockheed Martin F-35 Lightning II"],
  ["F18", "Boeing F/A-18 Hornet"],
];
const MIL_TRANSPORT_TYPES: [string, string][] = [
  ["C130", "Lockheed C-130 Hercules"],
  ["KC135", "Boeing KC-135 Stratotanker"],
  ["C17", "Boeing C-17 Globemaster III"],
  ["P8", "Boeing P-8 Poseidon"],
];
const MIL_OPERATORS = [
  "United States Air Force",
  "United States Navy",
  "United States Army",
  "United States Coast Guard",
  "Air National Guard",
];
const MIL_CALLSIGN_PREFIX = ["REACH", "EAGLE", "HAWK", "VIPER", "GUARD", "SAM", "CONVOY"];

function spawnTrack(id: string, center: LatLon, edgeSpawn: boolean): SimTrack {
  const roll = Math.random();
  const category: "AIRLINE" | "GENERAL_AVIATION" | "HELICOPTER" | "MILITARY" | "OTHER" =
    roll < 0.52
      ? "AIRLINE"
      : roll < 0.74
      ? "GENERAL_AVIATION"
      : roll < 0.88
      ? "HELICOPTER"
      : roll < 0.97
      ? "MILITARY"
      : "OTHER";

  // Spawn position: either scattered across the world disk (initial seed)
  // or at the outer edge, heading roughly inward (ongoing traffic flow).
  const distanceMi = edgeSpawn ? rand(30, WORLD_RADIUS_MILES) : Math.sqrt(rand(0, 1)) * WORLD_RADIUS_MILES * 0.9 + 2;
  const spawnBearing = rand(0, 360);
  const position = destinationPoint(center, spawnBearing, milesToMeters(distanceMi));
  const inwardBearing = normalizeDegrees(spawnBearing + 180 + rand(-70, 70));
  const heading = edgeSpawn ? inwardBearing : rand(0, 360);

  const nearestAirport = nearbyAirports(position, milesToMeters(18))[0];
  const nearAirport = Boolean(nearestAirport);

  let callsign: string | undefined;
  let flightNumber: string | undefined;
  let registration: string | undefined;
  let aircraftType: string | undefined;
  let aircraftModel: string | undefined;
  let operator: string | undefined;
  let airline: string | undefined;
  let altitudeFt: number;
  let speedKt: number;
  let origin: string | undefined;
  let destination: string | undefined;

  if (category === "AIRLINE") {
    const al = choice(AIRLINES);
    const [type, model] = choice(al.types);
    flightNumber = String(Math.floor(rand(100, 2999)));
    callsign = `${al.icao}${flightNumber}`;
    aircraftType = type;
    aircraftModel = model;
    airline = al.name;
    operator = al.name;
    altitudeFt = nearAirport ? rand(1500, 9000) : rand(15000, 39000);
    speedKt = nearAirport ? rand(180, 260) : rand(310, 470);
    const other = choice([...new Set(["PDX", "SEA", "SFO", "LAX", "DEN", "ORD", "JFK"])]);
    origin = nearAirport ? nearestAirport?.iata ?? nearestAirport?.icao : other;
    destination = nearAirport ? other : nearestAirport?.iata ?? nearestAirport?.icao;
  } else if (category === "GENERAL_AVIATION") {
    const [type, model] = choice(GA_TYPES);
    registration = randomRegistration();
    callsign = registration;
    aircraftType = type;
    aircraftModel = model;
    altitudeFt = type.startsWith("PC1") || type.startsWith("TBM") ? rand(6000, 18000) : rand(1000, 9500);
    speedKt = type.startsWith("PC1") || type.startsWith("TBM") ? rand(180, 260) : rand(90, 170);
  } else if (category === "HELICOPTER") {
    const [type, model] = choice(HELI_TYPES);
    registration = randomRegistration();
    operator = choice(HELI_OPERATORS);
    callsign = operator.split(" ")[0].toUpperCase() + Math.floor(rand(1, 9));
    aircraftType = type;
    aircraftModel = model;
    altitudeFt = rand(400, 2600);
    speedKt = rand(80, 145);
  } else if (category === "MILITARY") {
    const kind = Math.random();
    const [type, model] =
      kind < 0.4 ? choice(MIL_HELI_TYPES) : kind < 0.75 ? choice(MIL_TRANSPORT_TYPES) : choice(MIL_FIGHTER_TYPES);
    operator = choice(MIL_OPERATORS);
    registration = randomMilTail();
    callsign = `${choice(MIL_CALLSIGN_PREFIX)}${Math.floor(rand(10, 99))}`;
    aircraftType = type;
    aircraftModel = model;
    const isFighter = MIL_FIGHTER_TYPES.some(([t]) => t === type);
    const isHeli = MIL_HELI_TYPES.some(([t]) => t === type);
    altitudeFt = isFighter ? rand(6000, 26000) : isHeli ? rand(300, 3000) : rand(4000, 27000);
    speedKt = isFighter ? rand(280, 480) : isHeli ? rand(90, 150) : rand(210, 320);
  } else {
    registration = randomRegistration();
    callsign = registration;
    altitudeFt = rand(800, 5000);
    speedKt = rand(20, 70);
  }

  const classification = classifyAircraft({
    aircraftType,
    aircraftModel,
    operator,
    airline,
    callsign,
    registration,
  });

  const oatJitterC = rand(-2, 2);
  const now = Date.now();
  const aircraft: Aircraft = {
    id,
    callsign,
    flightNumber,
    registration,
    aircraftType,
    aircraftModel,
    operator,
    airline,
    category: classification.category,
    silhouette: classification.silhouette,
    isMilitary: classification.isMilitary,
    latitude: position.latitude,
    longitude: position.longitude,
    altitude: Math.round(altitudeFt),
    groundSpeed: Math.round(speedKt),
    heading,
    verticalSpeed: 0,
    outsideAirTempC: Math.round(estimateOutsideAirTempC(altitudeFt, oatJitterC) * 10) / 10,
    lastUpdated: now,
    origin,
    destination,
    isAirborne: true,
  };

  return {
    aircraft,
    headingRateDegPerSec: rand(-0.03, 0.03),
    speedKt,
    targetAltitudeFt: altitudeFt + rand(-1500, 1500),
    altitudeRateFtPerSec: rand(-1.5, 1.5),
    oatJitterC,
    expiresAt: now + rand(MIN_LIFETIME_MS, MAX_LIFETIME_MS),
  };
}

function ensureWorld(center: LatLon): WorldState {
  if (!world) {
    world = { center, tracks: new Map(), lastTick: Date.now(), lastSpawn: Date.now(), nextId: 1 };
  } else if (distanceMeters(world.center, center) > milesToMeters(RESEED_DISTANCE_MILES)) {
    world = { center, tracks: new Map(), lastTick: Date.now(), lastSpawn: Date.now(), nextId: 1 };
  }
  if (world.tracks.size === 0) {
    for (let i = 0; i < TARGET_POPULATION; i++) {
      const id = `SIM${world.nextId++}`;
      world.tracks.set(id, spawnTrack(id, world.center, false));
    }
  }
  return world;
}

function tickWorld(w: WorldState) {
  const now = Date.now();
  const dt = Math.max(0, Math.min(30, (now - w.lastTick) / 1000));
  w.lastTick = now;

  for (const [id, track] of w.tracks) {
    const a = track.aircraft;
    const newHeading = normalizeDegrees(a.heading! + track.headingRateDegPerSec * dt);
    const distance = knotsToMps(track.speedKt) * dt;
    const newPos = destinationPoint({ latitude: a.latitude, longitude: a.longitude }, a.heading!, distance);

    let newAltitude = (a.altitude ?? 0) + track.altitudeRateFtPerSec * dt;
    const altDelta = track.targetAltitudeFt - newAltitude;
    if (Math.abs(altDelta) < 200) {
      track.altitudeRateFtPerSec = 0;
      newAltitude = track.targetAltitudeFt;
    }

    a.latitude = newPos.latitude;
    a.longitude = newPos.longitude;
    a.heading = newHeading;
    a.altitude = Math.max(0, Math.round(newAltitude));
    a.verticalSpeed = Math.round(track.altitudeRateFtPerSec * 60);
    a.outsideAirTempC = Math.round(estimateOutsideAirTempC(a.altitude, track.oatJitterC) * 10) / 10;
    a.lastUpdated = now;

    const distFromCenter = distanceMeters(w.center, { latitude: a.latitude, longitude: a.longitude });
    if (now > track.expiresAt || distFromCenter > milesToMeters(WORLD_RADIUS_MILES + 6)) {
      w.tracks.delete(id);
    }
  }

  if (now - w.lastSpawn > SPAWN_INTERVAL_MS && w.tracks.size < TARGET_POPULATION) {
    w.lastSpawn = now;
    const id = `SIM${w.nextId++}`;
    w.tracks.set(id, spawnTrack(id, w.center, true));
  }
}

export class MockAircraftProvider implements AircraftDataProvider {
  readonly name = "simulated";

  async fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult> {
    const center: LatLon = { latitude: query.centerLatitude, longitude: query.centerLongitude };
    const w = ensureWorld(center);
    tickWorld(w);

    const aircraft = Array.from(w.tracks.values())
      .map((t) => t.aircraft)
      .filter(
        (a) =>
          distanceMeters(center, { latitude: a.latitude, longitude: a.longitude }) <= query.radiusMeters
      )
      .map((a) => ({ ...a }));

    return { aircraft, source: this.name, fetchedAt: Date.now() };
  }
}
