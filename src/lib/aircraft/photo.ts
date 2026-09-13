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
/** A miss is re-checked sooner: a photo may simply not be uploaded yet. */
const MISS_TTL_MS = 1000 * 60 * 60 * 3;
const FETCH_TIMEOUT_MS = 3500;

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
      const photo = await fetchPhoto(path);
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

/** Test seam: drops every cached lookup. */
export function __clearPhotoCache() {
  cache.clear();
}
