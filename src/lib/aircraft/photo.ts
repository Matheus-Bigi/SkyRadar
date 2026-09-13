/**
 * Aircraft photo lookup, via the public Planespotters.net photo API (no key
 * required). Runs server-side only, from an API route.
 *
 * Planespotters can be asked by *either* identifier, and the difference
 * matters: the ICAO 24-bit address is broadcast by the aircraft itself and
 * is therefore always known, while the registration comes from a database
 * lookup the feed may not have made. Asking by hex first is what makes a
 * photo appear for most aircraft instead of only the ones whose tail number
 * the feed happened to resolve.
 *
 * Every photo shown is a photo of that exact airframe — never a stock image
 * of the type.
 */

interface PlanespottersPhoto {
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

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
const ATTEMPTS_PER_IDENTIFIER = 2;

export interface PhotoQuery {
  /** ICAO 24-bit address, e.g. "a1b2c3" — broadcast by the aircraft itself. */
  icao24?: string;
  /** Tail number, e.g. "N462QX". */
  registration?: string;
}

export async function lookupAircraftPhoto(query: PhotoQuery): Promise<AircraftPhoto> {
  const icao24 = normalize(query.icao24);
  const registration = normalize(query.registration);

  // Hex first: it identifies the airframe directly, with no database hop in
  // between that could come back empty or wrong.
  const attempts: Array<[string, string]> = [];
  if (icao24) attempts.push([`hex:${icao24}`, `hex/${encodeURIComponent(icao24.toLowerCase())}`]);
  if (registration) attempts.push([`reg:${registration}`, `reg/${encodeURIComponent(registration)}`]);
  if (attempts.length === 0) return {};

  for (const [key, path] of attempts) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.imageUrl) return stripExpiry(cached);
      continue; // known-empty for this identifier — try the next one
    }

    try {
      const photo = await fetchPhotoWithRetry(path);
      cache.set(key, {
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

async function fetchPhotoWithRetry(path: string): Promise<AircraftPhoto> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS_PER_IDENTIFIER; attempt++) {
    try {
      return await fetchPhoto(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchPhoto(path: string): Promise<AircraftPhoto> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timed out")), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "SkyRadar/1.0 (personal aviation radar; non-commercial)",
      },
    });
    if (!res.ok) throw new Error(`planespotters ${res.status}`);
    const data = (await res.json()) as { photos?: PlanespottersPhoto[] };
    const photo = data.photos?.[0];
    const imageUrl = photo?.thumbnail_large?.src;
    if (!imageUrl) return {};
    return {
      imageUrl,
      link: photo?.link,
      attribution: photo?.photographer
        ? `Photo: ${photo.photographer} / Planespotters.net`
        : "Photo: Planespotters.net",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(v?: string | null): string | undefined {
  const t = v?.trim().toUpperCase();
  return t && t.length > 0 ? t : undefined;
}

function stripExpiry(entry: CacheEntry): AircraftPhoto {
  const { expiresAt: _expiresAt, ...photo } = entry;
  return photo;
}

/**
 * What each identifier's lookup actually does right now — status codes and
 * all. Used only by the diagnostics endpoint, and deliberately bypassing the
 * cache: when a photo is missing on a real device, the question is what
 * Planespotters is saying at this moment, not what it said earlier.
 */
export async function probeAircraftPhoto(query: PhotoQuery) {
  const icao24 = normalize(query.icao24);
  const registration = normalize(query.registration);
  const attempts: Array<[string, string]> = [];
  if (icao24) attempts.push(["hex", `hex/${encodeURIComponent(icao24.toLowerCase())}`]);
  if (registration) attempts.push(["registration", `reg/${encodeURIComponent(registration)}`]);

  const results = [];
  for (const [kind, path] of attempts) {
    const startedAt = Date.now();
    try {
      const photo = await fetchPhoto(path);
      results.push({
        lookup: kind,
        url: `https://api.planespotters.net/pub/photos/${path}`,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        foundPhoto: Boolean(photo.imageUrl),
        imageUrl: photo.imageUrl ?? null,
      });
    } catch (err) {
      results.push({
        lookup: kind,
        url: `https://api.planespotters.net/pub/photos/${path}`,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { icao24: icao24 ?? null, registration: registration ?? null, attempts: results };
}

/** Test seam: drops every cached lookup. */
export function __clearPhotoCache() {
  cache.clear();
}
