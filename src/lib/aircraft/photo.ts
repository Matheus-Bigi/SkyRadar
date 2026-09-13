/**
 * Aircraft photo lookup. Runs server-side only, from an API route.
 *
 * Every photo shown is a photo of that exact airframe, identified by its
 * ICAO 24-bit address or its registration — never a stock image of the type.
 *
 * Three things decide whether a photo actually turns up, and all three were
 * getting in the way:
 *
 *  1. **Which identifier is asked for.** The hex is broadcast by the
 *     aircraft itself and is always known; the registration depends on a
 *     database lookup the feed may never have made. Hex goes first.
 *  2. **Which field the answer is read from.** Planespotters does not
 *     guarantee a `thumbnail_large` on every photo, and reading only that
 *     field turns a perfectly good photo into "none on file".
 *  3. **How many sources are tried.** One API having a bad moment — or
 *     simply not holding that airframe — used to be the end of it.
 */

export interface AircraftPhoto {
  imageUrl?: string;
  attribution?: string;
  /** Where the photo page lives, for credit/attribution links. */
  link?: string;
}

interface CacheEntry extends AircraftPhoto {
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
/**
 * A miss is re-checked far sooner than a hit. A photo may not be uploaded
 * yet, but more importantly an empty answer is sometimes just a bad moment
 * upstream, and remembering it for hours would turn a blip into a lasting
 * hole where a photo should be.
 */
const MISS_TTL_MS = 1000 * 60 * 20;
/**
 * Generous on purpose. This lookup is nowhere near the radar's critical path
 * — nothing waits on it — while a cold serverless instance calling a free
 * API is exactly the case a tight deadline turns into a missing photo.
 */
const FETCH_TIMEOUT_MS = 7000;
/** One retry, because a single transient failure shouldn't cost the photo. */
const ATTEMPTS_PER_SOURCE = 2;

const USER_AGENT = "SkyRadar/1.0 (personal aviation radar; non-commercial)";

export interface PhotoQuery {
  /** ICAO 24-bit address, e.g. "a1b2c3" — broadcast by the aircraft itself. */
  icao24?: string;
  /** Tail number, e.g. "N487AS". */
  registration?: string;
}

interface PhotoSource {
  /** Stable cache key fragment. */
  id: string;
  url: string;
  parse: (body: unknown) => AircraftPhoto;
}

/**
 * Every place worth asking, in the order worth asking. Hex before
 * registration within each service, since the hex is the identifier the
 * aircraft actually transmits.
 */
function sourcesFor(icao24?: string, registration?: string): PhotoSource[] {
  const sources: PhotoSource[] = [];
  if (icao24) {
    const hex = icao24.toLowerCase();
    sources.push({
      id: `planespotters:hex:${hex}`,
      url: `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`,
      parse: parsePlanespotters,
    });
  }
  if (registration) {
    sources.push({
      id: `planespotters:reg:${registration}`,
      url: `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`,
      parse: parsePlanespotters,
    });
  }
  if (icao24) {
    sources.push({
      id: `airport-data:hex:${icao24}`,
      url: `https://api.airport-data.com/api/ac_thumb.json?m=${encodeURIComponent(icao24)}&n=1`,
      parse: parseAirportData,
    });
  }
  if (registration) {
    sources.push({
      id: `airport-data:reg:${registration}`,
      url: `https://api.airport-data.com/api/ac_thumb.json?r=${encodeURIComponent(registration)}&n=1`,
      parse: parseAirportData,
    });
  }
  return sources;
}

export async function lookupAircraftPhoto(query: PhotoQuery): Promise<AircraftPhoto> {
  const icao24 = normalize(query.icao24);
  const registration = normalize(query.registration);
  const sources = sourcesFor(icao24, registration);
  if (sources.length === 0) return {};

  for (const source of sources) {
    const cached = cache.get(source.id);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.imageUrl) return stripExpiry(cached);
      continue; // known-empty for this identifier — try the next one
    }

    try {
      const photo = await fetchWithRetry(source);
      cache.set(source.id, {
        ...photo,
        expiresAt: Date.now() + (photo.imageUrl ? CACHE_TTL_MS : MISS_TTL_MS),
      });
      if (photo.imageUrl) return photo;
    } catch {
      // Network/timeout: deliberately not cached. Recording a blip as "this
      // aircraft has no photo" would hide a real one for hours.
    }
  }

  return {};
}

interface PlanespottersPhoto {
  thumbnail?: { src?: string };
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

function parsePlanespotters(body: unknown): AircraftPhoto {
  const data = body as { photos?: PlanespottersPhoto[] };
  const photo = data?.photos?.[0];
  // Large first for quality, but never let a missing large size mean "no
  // photo" — the regular thumbnail is a real photo of the real airframe.
  const imageUrl = str(photo?.thumbnail_large?.src) ?? str(photo?.thumbnail?.src);
  if (!imageUrl) return {};
  return {
    imageUrl,
    link: str(photo?.link),
    attribution: photo?.photographer
      ? `Photo: ${photo.photographer} / Planespotters.net`
      : "Photo: Planespotters.net",
  };
}

interface AirportDataPhoto {
  image?: string;
  link?: string;
  photographer?: string;
}

function parseAirportData(body: unknown): AircraftPhoto {
  const data = body as { status?: number; data?: AirportDataPhoto[] | null };
  const photo = Array.isArray(data?.data) ? data.data[0] : undefined;
  const imageUrl = str(photo?.image);
  if (!imageUrl) return {};
  return {
    imageUrl,
    link: str(photo?.link),
    attribution: photo?.photographer
      ? `Photo: ${photo.photographer} / airport-data.com`
      : "Photo: airport-data.com",
  };
}

async function fetchWithRetry(source: PhotoSource): Promise<AircraftPhoto> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS_PER_SOURCE; attempt++) {
    try {
      const { body } = await fetchJson(source.url);
      return source.parse(body);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown; raw: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timed out")), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 120)}`);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`non-JSON response: ${raw.slice(0, 120)}`);
    }
    return { status: res.status, body, raw };
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(v?: string | null): string | undefined {
  const t = v?.trim().toUpperCase();
  return t && t.length > 0 ? t : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function stripExpiry(entry: CacheEntry): AircraftPhoto {
  const { expiresAt: _expiresAt, ...photo } = entry;
  return photo;
}

/**
 * What every source actually says right now — status codes, response
 * excerpts and all. Used only by the diagnostics endpoint, and deliberately
 * bypassing the cache: when a photo is missing on a real device, the
 * question is what these services are returning at this moment, and whether
 * "no photo" means an empty list or a response we failed to read.
 */
export async function probeAircraftPhoto(query: PhotoQuery) {
  const icao24 = normalize(query.icao24);
  const registration = normalize(query.registration);
  const sources = sourcesFor(icao24, registration);

  const attempts = [];
  for (const source of sources) {
    const startedAt = Date.now();
    try {
      const { status, body, raw } = await fetchJson(source.url);
      const photo = source.parse(body);
      attempts.push({
        source: source.id,
        url: source.url,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        httpStatus: status,
        foundPhoto: Boolean(photo.imageUrl),
        imageUrl: photo.imageUrl ?? null,
        // The raw answer, so "no photo" can be told apart from "a photo we
        // failed to parse" without guessing.
        responseExcerpt: raw.slice(0, 400),
      });
    } catch (err) {
      attempts.push({
        source: source.id,
        url: source.url,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { icao24: icao24 ?? null, registration: registration ?? null, attempts };
}

/** Test seam: drops every cached lookup. */
export function __clearPhotoCache() {
  cache.clear();
}
