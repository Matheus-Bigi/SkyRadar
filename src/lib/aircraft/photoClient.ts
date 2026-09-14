"use client";

/**
 * Browser-side photo cache and request coalescer.
 *
 * Two things make photos feel instant rather than merely arriving:
 *
 *  - **Nothing is ever looked up twice.** A photo of a given airframe is the
 *    same photo for the life of the session, so it is kept here and handed
 *    back synchronously. Re-selecting an aircraft, or re-opening a card, is
 *    immediate with no request at all.
 *  - **Requests are coalesced.** Calls made in the same tick — the card you
 *    just tapped, plus the prefetch warming everything else on the scope —
 *    leave as a single batched request instead of one per aircraft.
 *
 * Failures are not cached: a blip must never become a permanently missing
 * photo. A genuine "no photo on file" answer *is* cached, since asking again
 * would only get the same answer.
 */

export interface CachedPhoto {
  imageUrl: string | null;
  attribution: string | null;
}

const cache = new Map<string, CachedPhoto>();
const inFlight = new Map<string, Promise<CachedPhoto | null>>();

/** Requests waiting to be sent as one batch. */
let pending: Array<{
  key: string;
  resolve: (v: CachedPhoto | null) => void;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** How long to wait for more requests before sending the batch. */
const COALESCE_MS = 30;
/** Matches the server's own per-request cap. */
const MAX_PER_BATCH = 12;

export function photoKey(icao24?: string, registration?: string): string {
  return `${icao24?.trim().toLowerCase() ?? ""}|${registration?.trim().toUpperCase() ?? ""}`;
}

/** The photo if we already have it, without touching the network. */
export function cachedPhoto(key: string): CachedPhoto | undefined {
  return cache.get(key);
}

export function requestPhoto(key: string): Promise<CachedPhoto | null> {
  if (key === "|") return Promise.resolve(null);

  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = new Promise<CachedPhoto | null>((resolve) => {
    pending.push({ key, resolve });
    if (!flushTimer) flushTimer = setTimeout(flush, COALESCE_MS);
  });
  inFlight.set(key, promise);
  return promise;
}

async function flush() {
  flushTimer = null;
  const batch = pending.splice(0, MAX_PER_BATCH);
  // Anything over the cap goes out in the next batch rather than being dropped.
  if (pending.length > 0 && !flushTimer) flushTimer = setTimeout(flush, COALESCE_MS);
  if (batch.length === 0) return;

  const params = new URLSearchParams({ ac: batch.map((b) => b.key).join(",") });

  try {
    const res = await fetch(`/api/aircraft/photo?${params.toString()}`);
    if (!res.ok) throw new Error(`photo lookup ${res.status}`);
    const data = (await res.json()) as { photos?: Record<string, CachedPhoto> };

    for (const { key, resolve } of batch) {
      const photo = data.photos?.[key];
      if (photo) {
        // Cached whether or not a photo was found: a confirmed absence is a
        // real answer, and asking again would only repeat it.
        cache.set(key, photo);
        resolve(photo);
      } else {
        resolve(null);
      }
      inFlight.delete(key);
    }
  } catch {
    // Deliberately uncached, so the next attempt genuinely retries.
    for (const { key, resolve } of batch) {
      inFlight.delete(key);
      resolve(null);
    }
  }
}

/** Test seam. */
export function __clearPhotoClientCache() {
  cache.clear();
  inFlight.clear();
  pending = [];
}
