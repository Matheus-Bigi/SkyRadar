"use client";

/**
 * Browser-side photo pipeline: cache, priority queue, and the two routes a
 * photo can arrive by.
 *
 * **Why the browser asks first.** Planespotters' photo API is built to be
 * called from a page — tar1090 does exactly that — so SkyRadar tries it
 * directly from the device before falling back to its own server. Going
 * direct uses the viewer's own address and their browser's own user agent,
 * instead of a serverless function's shared address and a custom agent
 * string, which is the difference between being served and being throttled.
 * It is also simply faster: no hop through our server at all. If the browser
 * route turns out to be blocked (CORS), the very first failure latches that
 * off for the session and everything goes through the server batch instead.
 *
 * **Why there is a queue.** There are usually far more aircraft overhead
 * than anyone will ever tap, and the ones worth having ready are not a
 * random sample: airliners and military aircraft are what people point at
 * and ask about. So photos are fetched in priority order, nearest first
 * within each band, rather than all at once.
 *
 * **Why a miss is not final.** An empty answer can mean "this airframe has
 * no photo" or "that service was having a moment", and those look identical.
 * Each aircraft gets several rounds, spaced out, before the app is willing
 * to say a photo isn't available.
 */

export type PhotoStatus = "idle" | "pending" | "found" | "unavailable";

export interface PhotoState {
  status: PhotoStatus;
  imageUrl: string | null;
  attribution: string | null;
  attempts: number;
}

/** Airliners and military first — the aircraft people actually tap. */
export const PHOTO_PRIORITY = {
  SELECTED: 0,
  AIRLINE_OR_MILITARY: 1,
  ROTORCRAFT: 2,
  OTHER: 3,
} as const;

/** Rounds tried before a photo is declared unavailable. */
const MAX_ATTEMPTS = 3;
/** Spacing between rounds, so a struggling service gets time to recover. */
const RETRY_DELAYS_MS = [2500, 7000];
/** Requests in flight at once. Free, volunteer-funded APIs. */
const MAX_IN_FLIGHT = 4;
/** Server-batch size; matches the API route's own cap. */
const MAX_PER_BATCH = 12;
const COALESCE_MS = 25;
const DIRECT_TIMEOUT_MS = 4000;

const PLANESPOTTERS = "https://api.planespotters.net/pub/photos";

interface Entry extends PhotoState {
  key: string;
  priority: number;
  distance: number;
  /** When this key may next be attempted. */
  nextAttemptAt: number;
  inFlight: boolean;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<(s: PhotoState) => void>>();

/** Latched off after the first sign the browser can't call the API directly. */
let directBlocked = false;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = 0;

export function photoKey(icao24?: string, registration?: string): string {
  return `${icao24?.trim().toLowerCase() ?? ""}|${registration?.trim().toUpperCase() ?? ""}`;
}

const IDLE: PhotoState = { status: "idle", imageUrl: null, attribution: null, attempts: 0 };

export function photoState(key: string): PhotoState {
  const e = entries.get(key);
  if (!e) return IDLE;
  return { status: e.status, imageUrl: e.imageUrl, attribution: e.attribution, attempts: e.attempts };
}

export function subscribe(key: string, fn: (s: PhotoState) => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

function emit(entry: Entry) {
  const snapshot = photoState(entry.key);
  listeners.get(entry.key)?.forEach((fn) => fn(snapshot));
}

/**
 * Queue an aircraft's photo. Safe to call repeatedly — an aircraft already
 * known, already queued, or already resolved is never fetched twice, except
 * that raising its priority (tapping it) moves it to the front.
 */
export function requestPhoto(key: string, priority: number, distance = 0): PhotoState {
  if (key === "|") return IDLE;

  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      priority,
      distance,
      status: "pending",
      imageUrl: null,
      attribution: null,
      attempts: 0,
      nextAttemptAt: 0,
      inFlight: false,
    };
    entries.set(key, entry);
  } else {
    // Tapping an aircraft promotes it past everything still waiting.
    if (priority < entry.priority) entry.priority = priority;
    entry.distance = Math.min(entry.distance, distance);
    // A user asking directly is worth one more round even after we'd given up.
    if (entry.status === "unavailable" && priority === PHOTO_PRIORITY.SELECTED) {
      entry.status = "pending";
      entry.attempts = Math.max(0, MAX_ATTEMPTS - 1);
      entry.nextAttemptAt = 0;
    }
  }

  pump();
  return photoState(entry.key);
}

/** Forces a fresh round for one aircraft, ignoring any recorded verdict. */
export function retryPhoto(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entry.status = "pending";
  entry.attempts = 0;
  entry.nextAttemptAt = 0;
  emit(entry);
  pump();
}

function pump() {
  if (pumpTimer) return;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    drain();
  }, COALESCE_MS);
}

function drain() {
  const now = Date.now();
  const ready = [...entries.values()]
    .filter((e) => e.status === "pending" && !e.inFlight && e.nextAttemptAt <= now)
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance);

  if (ready.length === 0) {
    scheduleNextWake();
    return;
  }

  const slots = Math.max(0, MAX_IN_FLIGHT - inFlight);
  if (slots === 0) return;

  if (!directBlocked) {
    // Straight from the device, one aircraft per slot.
    for (const entry of ready.slice(0, slots)) void runDirect(entry);
  } else {
    // Through our own server, several aircraft per request.
    const batch = ready.slice(0, MAX_PER_BATCH);
    void runBatch(batch);
  }
}

function scheduleNextWake() {
  const waiting = [...entries.values()].filter((e) => e.status === "pending" && !e.inFlight);
  if (waiting.length === 0) return;
  const soonest = Math.min(...waiting.map((e) => e.nextAttemptAt));
  const delay = Math.max(250, soonest - Date.now());
  if (!pumpTimer) {
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      drain();
    }, delay);
  }
}

function settle(entry: Entry, photo: { imageUrl: string; attribution: string | null } | null) {
  entry.inFlight = false;
  inFlight = Math.max(0, inFlight - 1);
  entry.attempts += 1;

  if (photo) {
    entry.status = "found";
    entry.imageUrl = photo.imageUrl;
    entry.attribution = photo.attribution;
  } else if (entry.attempts >= MAX_ATTEMPTS) {
    // Every source, several times over. Now it's fair to say so.
    entry.status = "unavailable";
  } else {
    entry.status = "pending";
    entry.nextAttemptAt =
      Date.now() + (RETRY_DELAYS_MS[entry.attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!);
  }

  emit(entry);
  pump();
}

async function runDirect(entry: Entry) {
  entry.inFlight = true;
  inFlight += 1;
  const [hex, reg] = entry.key.split("|");

  try {
    const urls = [
      hex ? `${PLANESPOTTERS}/hex/${encodeURIComponent(hex)}` : null,
      reg ? `${PLANESPOTTERS}/reg/${encodeURIComponent(reg)}` : null,
    ].filter(Boolean) as string[];

    // Both identifiers at once: one round trip, not two.
    const results = await Promise.all(urls.map(fetchPlanespottersDirect));
    const hit = results.find((r) => r?.imageUrl);
    if (hit) {
      settle(entry, hit);
      return;
    }
    // Planespotters genuinely has nothing under either identifier. The server
    // knows about a second service, so let it have a go before giving up.
    void runBatch([entry], true);
  } catch {
    // A CORS rejection means this route is closed to us for good; stop
    // paying for it on every aircraft and let the server take over.
    directBlocked = true;
    entry.inFlight = false;
    inFlight = Math.max(0, inFlight - 1);
    pump();
  }
}

async function fetchPlanespottersDirect(
  url: string
): Promise<{ imageUrl: string; attribution: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      // A refusal is an upstream answer, not a broken route — retry later
      // rather than latching the direct path off.
      if (res.status === 403 || res.status === 429) return null;
      throw new Error(`planespotters ${res.status}`);
    }
    const data = (await res.json()) as {
      photos?: Array<{
        thumbnail?: { src?: string };
        thumbnail_large?: { src?: string };
        photographer?: string;
      }>;
    };
    const photo = data.photos?.[0];
    const imageUrl = photo?.thumbnail_large?.src ?? photo?.thumbnail?.src;
    if (!imageUrl) return null;
    return {
      imageUrl,
      attribution: photo?.photographer
        ? `Photo: ${photo.photographer} / Planespotters.net`
        : "Photo: Planespotters.net",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The server route: knows about a second photo service, and about retries. */
async function runBatch(batch: Entry[], alreadyCounted = false) {
  for (const entry of batch) {
    if (!alreadyCounted) {
      entry.inFlight = true;
      inFlight += 1;
    }
  }

  const params = new URLSearchParams({ ac: batch.map((b) => b.key).join(",") });
  // Later rounds must not be answered from a cached miss, or retrying is
  // just asking the same cache the same question.
  if (batch.some((b) => b.attempts > 0)) params.set("refresh", "1");

  try {
    const res = await fetch(`/api/aircraft/photo?${params.toString()}`);
    if (!res.ok) throw new Error(`photo lookup ${res.status}`);
    const data = (await res.json()) as {
      photos?: Record<string, { imageUrl: string | null; attribution: string | null }>;
    };
    for (const entry of batch) {
      const photo = data.photos?.[entry.key];
      settle(entry, photo?.imageUrl ? { imageUrl: photo.imageUrl, attribution: photo.attribution } : null);
    }
  } catch {
    for (const entry of batch) settle(entry, null);
  }
}

/** Test seam. */
export function __resetPhotoClient() {
  entries.clear();
  listeners.clear();
  directBlocked = false;
  inFlight = 0;
  if (pumpTimer) clearTimeout(pumpTimer);
  pumpTimer = null;
}

/** Test/diagnostic seam: is the browser-direct route still in use? */
export function __directBlocked() {
  return directBlocked;
}
