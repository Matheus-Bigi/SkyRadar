/**
 * Aircraft photo lookup. Uses the public Planespotters.net photo API
 * (no key required) keyed by registration. This runs server-side only
 * (called from an API route) and is looked up on demand — see spec #24,
 * #22 ("additional information can load asynchronously").
 */

interface PlanespottersPhoto {
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

interface CacheEntry {
  imageUrl?: string;
  attribution?: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const FETCH_TIMEOUT_MS = 3500;

export async function lookupAircraftPhoto(
  registration: string
): Promise<{ imageUrl?: string; attribution?: string }> {
  const key = registration.trim().toUpperCase();
  if (!key) return {};

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { imageUrl: cached.imageUrl, attribution: cached.attribution };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(key)}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`planespotters ${res.status}`);
    const data = (await res.json()) as { photos?: PlanespottersPhoto[] };
    const photo = data.photos?.[0];
    const result = {
      imageUrl: photo?.thumbnail_large?.src,
      attribution: photo?.photographer
        ? `Photo: ${photo.photographer} / Planespotters.net`
        : undefined,
    };
    cache.set(key, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    // No photo available, or the lookup failed/timed out — never block
    // aircraft data on this, and never surface a broken-image state.
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS / 4 });
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
