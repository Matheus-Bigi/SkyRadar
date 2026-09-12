import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AircraftCategory } from "../lib/aircraft/types";

export type RangeMiles = 3 | 9 | 15 | 30;
export type DisplayMode = "MAP" | "RADAR";
export type CategoryFilter = "ALL" | AircraftCategory;

interface RadarStore {
  rangeMiles: RangeMiles;
  mode: DisplayMode;
  categoryFilter: CategoryFilter;
  lockCenter: boolean;
  setRange: (r: RangeMiles) => void;
  setMode: (m: DisplayMode) => void;
  setCategoryFilter: (f: CategoryFilter) => void;
  setLockCenter: (v: boolean) => void;
}

export const RANGE_OPTIONS: RangeMiles[] = [3, 9, 15, 30];

export const useRadarStore = create<RadarStore>()(
  persist(
    (set) => ({
      rangeMiles: 9,
      mode: "RADAR",
      categoryFilter: "ALL",
      lockCenter: true,
      setRange: (r) => set({ rangeMiles: r }),
      setMode: (m) => set({ mode: m }),
      setCategoryFilter: (f) => set({ categoryFilter: f }),
      setLockCenter: (v) => set({ lockCenter: v }),
    }),
    { name: "skyradar:radar", version: 1 }
  )
);
