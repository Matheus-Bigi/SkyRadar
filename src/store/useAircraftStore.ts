import { create } from "zustand";
import { Aircraft } from "../lib/aircraft/types";

export type DataStatus = "idle" | "loading" | "ready" | "error" | "offline";

const TRAIL_MAX_POINTS = 8;
const REMOVED_FADE_MS = 900;

export interface TrailPoint {
  latitude: number;
  longitude: number;
}

interface AircraftStore {
  previous: Aircraft[];
  current: Aircraft[];
  previousAt: number;
  currentAt: number;
  /**
   * The provider's own clock when the newest snapshot was built. Paired with
   * each aircraft's `lastUpdated` it gives that aircraft's position age — how
   * stale the fix already was when it was fetched. Both readings come from
   * the server, so the difference is an age and no clock skew leaks into it.
   */
  fetchedAt?: number;
  /**
   * The device's clock when that snapshot was *first* seen. The provider
   * caches for five seconds and we poll every four, so roughly every other
   * response replays a snapshot we already hold. A replay arrives later but
   * still describes the instant it was built, so the anchor must not move
   * with it — otherwise each replay reads as the aircraft standing still,
   * and the next fresh snapshot as it lurching to catch up.
   */
  fetchedAtClient?: number;
  trails: Record<string, TrailPoint[]>;
  removed: Record<string, number>;
  status: DataStatus;
  error?: string;
  source?: string;

  applySnapshot: (aircraft: Aircraft[], source: string, fetchedAt?: number) => void;
  setStatus: (status: DataStatus, error?: string) => void;
}

export const useAircraftStore = create<AircraftStore>()((set, get) => ({
  previous: [],
  current: [],
  previousAt: 0,
  currentAt: 0,
  trails: {},
  removed: {},
  status: "idle",

  applySnapshot: (aircraft, source, fetchedAt) => {
    const state = get();
    const now = Date.now();
    const prevIds = new Set(state.current.map((a) => a.id));
    const newIds = new Set(aircraft.map((a) => a.id));

    const trails: Record<string, TrailPoint[]> = { ...state.trails };
    for (const a of aircraft) {
      const existing = trails[a.id] ?? [];
      const next = [...existing, { latitude: a.latitude, longitude: a.longitude }];
      trails[a.id] = next.slice(-TRAIL_MAX_POINTS);
    }
    for (const id of Object.keys(trails)) {
      if (!newIds.has(id)) delete trails[id];
    }

    const removed: Record<string, number> = {};
    for (const id of prevIds) {
      if (!newIds.has(id)) removed[id] = now;
    }
    for (const [id, at] of Object.entries(state.removed)) {
      if (now - at < REMOVED_FADE_MS && !newIds.has(id)) removed[id] = at;
    }

    // A replayed snapshot describes the same instant as the one before it,
    // however much later it arrives.
    const isReplay = fetchedAt !== undefined && fetchedAt === state.fetchedAt;

    set({
      previous: state.current,
      current: aircraft,
      previousAt: state.currentAt || now,
      currentAt: now,
      fetchedAt,
      fetchedAtClient: isReplay ? state.fetchedAtClient ?? now : now,
      trails,
      removed,
      status: "ready",
      error: undefined,
      source,
    });
  },

  setStatus: (status, error) =>
    set((state) => {
      // Going offline has to clear the scope, not just change a banner.
      //
      // Leaving the last snapshot in place meant aircraft kept being drawn
      // — and, because positions are interpolated forward between polls,
      // kept *moving* on dead reckoning — long after the feed stopped
      // answering. A marker gliding across the map from a position nobody
      // has confirmed in minutes is exactly the thing this app promises
      // never to show. An empty scope under a "LIVE DATA UNAVAILABLE"
      // banner is the honest picture.
      if (status === "offline" && state.current.length > 0) {
        return {
          status,
          error,
          previous: [],
          current: [],
          previousAt: 0,
          currentAt: 0,
          trails: {},
          removed: {},
        };
      }
      return { status, error };
    }),
}));
