import { distanceMeters, LatLon } from "./geo";

export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Rough size tier — used to decide what to show at large ranges. */
  size: "major" | "regional" | "small";
}

// A curated reference set of airports worldwide, weighted toward major hubs
// plus a denser cluster of Pacific Northwest fields (a common development
// location for this project) so smaller ranges still have local context.
// This is geographic reference data, not live data — it never changes at
// runtime and ships with the app.
export const AIRPORTS: Airport[] = [
  { icao: "KPDX", iata: "PDX", name: "Portland Intl", latitude: 45.5887, longitude: -122.5969, size: "major" },
  { icao: "KHIO", iata: "HIO", name: "Hillsboro", latitude: 45.5404, longitude: -122.9496, size: "regional" },
  { icao: "KVUO", iata: "VUO", name: "Pearson Field", latitude: 45.6199, longitude: -122.6544, size: "small" },
  { icao: "KTTD", iata: "TTD", name: "Troutdale", latitude: 45.5495, longitude: -122.4001, size: "small" },
  { icao: "KUAO", iata: "UAO", name: "Aurora State", latitude: 45.2468, longitude: -122.7701, size: "small" },
  { icao: "KSEA", iata: "SEA", name: "Seattle-Tacoma Intl", latitude: 47.4502, longitude: -122.3088, size: "major" },
  { icao: "KBFI", iata: "BFI", name: "Boeing Field", latitude: 47.5300, longitude: -122.3019, size: "regional" },
  { icao: "KPAE", iata: "PAE", name: "Paine Field", latitude: 47.9063, longitude: -122.2817, size: "regional" },
  { icao: "KRNT", iata: "RNT", name: "Renton Municipal", latitude: 47.4931, longitude: -122.2160, size: "small" },
  { icao: "KOLM", iata: "OLM", name: "Olympia Regional", latitude: 46.9694, longitude: -122.9028, size: "small" },
  { icao: "KEUG", iata: "EUG", name: "Eugene", latitude: 44.1246, longitude: -123.2120, size: "regional" },
  { icao: "KSFO", iata: "SFO", name: "San Francisco Intl", latitude: 37.6213, longitude: -122.3790, size: "major" },
  { icao: "KOAK", iata: "OAK", name: "Oakland Intl", latitude: 37.7126, longitude: -122.2197, size: "regional" },
  { icao: "KSJC", iata: "SJC", name: "San Jose Intl", latitude: 37.3626, longitude: -121.9291, size: "regional" },
  { icao: "KLAX", iata: "LAX", name: "Los Angeles Intl", latitude: 33.9416, longitude: -118.4085, size: "major" },
  { icao: "KSAN", iata: "SAN", name: "San Diego Intl", latitude: 32.7338, longitude: -117.1933, size: "major" },
  { icao: "KLAS", iata: "LAS", name: "Harry Reid Intl", latitude: 36.0840, longitude: -115.1537, size: "major" },
  { icao: "KPHX", iata: "PHX", name: "Phoenix Sky Harbor", latitude: 33.4373, longitude: -112.0078, size: "major" },
  { icao: "KDEN", iata: "DEN", name: "Denver Intl", latitude: 39.8561, longitude: -104.6737, size: "major" },
  { icao: "KSLC", iata: "SLC", name: "Salt Lake City Intl", latitude: 40.7899, longitude: -111.9791, size: "major" },
  { icao: "KORD", iata: "ORD", name: "Chicago O'Hare Intl", latitude: 41.9742, longitude: -87.9073, size: "major" },
  { icao: "KMDW", iata: "MDW", name: "Chicago Midway", latitude: 41.7868, longitude: -87.7522, size: "regional" },
  { icao: "KDFW", iata: "DFW", name: "Dallas/Fort Worth Intl", latitude: 32.8998, longitude: -97.0403, size: "major" },
  { icao: "KIAH", iata: "IAH", name: "George Bush Intercontinental", latitude: 29.9902, longitude: -95.3368, size: "major" },
  { icao: "KATL", iata: "ATL", name: "Hartsfield-Jackson Atlanta Intl", latitude: 33.6407, longitude: -84.4277, size: "major" },
  { icao: "KMIA", iata: "MIA", name: "Miami Intl", latitude: 25.7959, longitude: -80.2870, size: "major" },
  { icao: "KJFK", iata: "JFK", name: "John F. Kennedy Intl", latitude: 40.6413, longitude: -73.7781, size: "major" },
  { icao: "KLGA", iata: "LGA", name: "LaGuardia", latitude: 40.7769, longitude: -73.8740, size: "regional" },
  { icao: "KEWR", iata: "EWR", name: "Newark Liberty Intl", latitude: 40.6895, longitude: -74.1745, size: "major" },
  { icao: "KBOS", iata: "BOS", name: "Boston Logan Intl", latitude: 42.3656, longitude: -71.0096, size: "major" },
  { icao: "KDCA", iata: "DCA", name: "Reagan National", latitude: 38.8512, longitude: -77.0402, size: "regional" },
  { icao: "KIAD", iata: "IAD", name: "Washington Dulles Intl", latitude: 38.9531, longitude: -77.4565, size: "major" },
  { icao: "KADW", name: "Joint Base Andrews", latitude: 38.8109, longitude: -76.8669, size: "regional" },
  { icao: "CYVR", iata: "YVR", name: "Vancouver Intl", latitude: 49.1947, longitude: -123.1792, size: "major" },
  { icao: "CYYZ", iata: "YYZ", name: "Toronto Pearson Intl", latitude: 43.6777, longitude: -79.6248, size: "major" },
  { icao: "EGLL", iata: "LHR", name: "London Heathrow", latitude: 51.4700, longitude: -0.4543, size: "major" },
  { icao: "EGKK", iata: "LGW", name: "London Gatwick", latitude: 51.1537, longitude: -0.1821, size: "major" },
  { icao: "LFPG", iata: "CDG", name: "Paris Charles de Gaulle", latitude: 49.0097, longitude: 2.5479, size: "major" },
  { icao: "EDDF", iata: "FRA", name: "Frankfurt am Main", latitude: 50.0379, longitude: 8.5622, size: "major" },
  { icao: "EHAM", iata: "AMS", name: "Amsterdam Schiphol", latitude: 52.3105, longitude: 4.7683, size: "major" },
  { icao: "LEMD", iata: "MAD", name: "Madrid-Barajas", latitude: 40.4936, longitude: -3.5668, size: "major" },
  { icao: "LIRF", iata: "FCO", name: "Rome Fiumicino", latitude: 41.8003, longitude: 12.2389, size: "major" },
  { icao: "EDDM", iata: "MUC", name: "Munich", latitude: 48.3538, longitude: 11.7861, size: "major" },
  { icao: "LSZH", iata: "ZRH", name: "Zurich", latitude: 47.4647, longitude: 8.5492, size: "major" },
  { icao: "EKCH", iata: "CPH", name: "Copenhagen Kastrup", latitude: 55.6180, longitude: 12.6560, size: "major" },
  { icao: "ESSA", iata: "ARN", name: "Stockholm Arlanda", latitude: 59.6519, longitude: 17.9186, size: "major" },
  { icao: "EIDW", iata: "DUB", name: "Dublin", latitude: 53.4213, longitude: -6.2701, size: "major" },
  { icao: "OMDB", iata: "DXB", name: "Dubai Intl", latitude: 25.2532, longitude: 55.3657, size: "major" },
  { icao: "RJTT", iata: "HND", name: "Tokyo Haneda", latitude: 35.5494, longitude: 139.7798, size: "major" },
  { icao: "RJAA", iata: "NRT", name: "Tokyo Narita", latitude: 35.7720, longitude: 140.3929, size: "major" },
  { icao: "RKSI", iata: "ICN", name: "Seoul Incheon", latitude: 37.4602, longitude: 126.4407, size: "major" },
  { icao: "VHHH", iata: "HKG", name: "Hong Kong Intl", latitude: 22.3080, longitude: 113.9185, size: "major" },
  { icao: "WSSS", iata: "SIN", name: "Singapore Changi", latitude: 1.3644, longitude: 103.9915, size: "major" },
  { icao: "YSSY", iata: "SYD", name: "Sydney Kingsford Smith", latitude: -33.9399, longitude: 151.1753, size: "major" },
  { icao: "YMML", iata: "MEL", name: "Melbourne", latitude: -37.6690, longitude: 144.8410, size: "major" },
  { icao: "SBGR", iata: "GRU", name: "Sao Paulo Guarulhos", latitude: -23.4356, longitude: -46.4731, size: "major" },
  { icao: "MMMX", iata: "MEX", name: "Mexico City Intl", latitude: 19.4363, longitude: -99.0721, size: "major" },
  { icao: "FACT", iata: "CPT", name: "Cape Town Intl", latitude: -33.9715, longitude: 18.6021, size: "major" },
];

export function nearbyAirports(center: LatLon, radiusMeters: number): (Airport & { distanceMeters: number })[] {
  return AIRPORTS.map((a) => ({
    ...a,
    distanceMeters: distanceMeters(center, { latitude: a.latitude, longitude: a.longitude }),
  }))
    .filter((a) => a.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
