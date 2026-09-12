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
  trails: Record<string, TrailPoint[]>;
  removed: Record<string, number>;
  status: DataStatus;
  error?: string;
  source?: string;

  applySnapshot: (aircraft: Aircraft[], source: string) => void;
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

  applySnapshot: (aircraft, source) => {
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

    set({
      previous: state.current,
      current: aircraft,
      previousAt: state.currentAt || now,
      currentAt: now,
      trails,
      removed,
      status: "ready",
      error: undefined,
      source,
    });
  },

  setStatus: (status, error) => set({ status, error }),
}));
