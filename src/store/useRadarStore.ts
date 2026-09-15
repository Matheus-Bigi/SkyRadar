import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AircraftCategory } from "../lib/aircraft/types";

export type RangeMiles = 3 | 9 | 15 | 30;
export type DisplayMode = "MAP" | "RADAR";

/**
 * Which categories to show. An empty list means every category — there is
 * deliberately no way to express "show nothing", because a scope emptied by
 * its own filter is indistinguishable from a dead feed.
 *
 * It used to be a single value, `"ALL" | AircraftCategory`, which could not
 * say "military and gliders" — a common thing to want and impossible to ask
 * for. Persisted state from that version is migrated below.
 */
export type CategoryFilter = AircraftCategory[];

/** Every category the classifier can assign, in the order the rail lists them. */
export const ALL_CATEGORIES: AircraftCategory[] = [
  "AIRLINE",
  "MILITARY",
  "HELICOPTER",
  "GENERAL_AVIATION",
  "OTHER",
];

/**
 * Whether an aircraft survives the filter.
 *
 * The `Array.isArray` guard is not decoration. This value is persisted, and
 * the shape changed: a stale string slipping through would take the
 * `length === 0` branch as false and then `"ALL".includes("MILITARY")` as
 * false too, hiding every aircraft on screen and looking exactly like a data
 * outage. Failing open costs nothing and fails visibly instead.
 */
export function categoryFilterMatches(
  filter: CategoryFilter,
  category: AircraftCategory
): boolean {
  if (!Array.isArray(filter) || filter.length === 0) return true;
  return filter.includes(category);
}

/** True when no category is singled out, i.e. everything is shown. */
export function showingAllCategories(filter: CategoryFilter): boolean {
  return !Array.isArray(filter) || filter.length === 0;
}

/**
 * Add or remove one category.
 *
 * Two normalisations keep the control honest. Removing the last one shows
 * everything again rather than emptying the scope, so a tap can never lead
 * somewhere there is nothing to see and no obvious way back. And selecting
 * every category collapses to the same empty list as ALL, so two states that
 * behave identically never look different.
 */
export function toggleCategory(
  filter: CategoryFilter,
  category: AircraftCategory
): CategoryFilter {
  // From "everything", the first tap narrows to just that category — which is
  // what picking one thing out of a list means everywhere else.
  if (showingAllCategories(filter)) return [category];

  const next = filter.includes(category)
    ? filter.filter((c) => c !== category)
    : [...filter, category];

  if (next.length === 0 || next.length === ALL_CATEGORIES.length) return [];
  // Keep rail order, so the stored list reads the way the control looks.
  return ALL_CATEGORIES.filter((c) => next.includes(c));
}

interface RadarStore {
  rangeMiles: RangeMiles;
  mode: DisplayMode;
  categoryFilter: CategoryFilter;
  lockCenter: boolean;
  setRange: (r: RangeMiles) => void;
  setMode: (m: DisplayMode) => void;
  /** Add or remove one category; see `toggleCategory` for the rules. */
  toggleCategory: (c: AircraftCategory) => void;
  /** Clear the filter, showing every category. */
  showAllCategories: () => void;
  setLockCenter: (v: boolean) => void;
}

export const RANGE_OPTIONS: RangeMiles[] = [3, 9, 15, 30];

export const useRadarStore = create<RadarStore>()(
  persist(
    (set, get) => ({
      rangeMiles: 9,
      mode: "RADAR",
      categoryFilter: [],
      lockCenter: true,
      setRange: (r) => set({ rangeMiles: r }),
      setMode: (m) => set({ mode: m }),
      toggleCategory: (c) => set({ categoryFilter: toggleCategory(get().categoryFilter, c) }),
      showAllCategories: () => set({ categoryFilter: [] }),
      setLockCenter: (v) => set({ lockCenter: v }),
    }),
    {
      name: "skyradar:radar",
      version: 2,
      /**
       * v1 stored a single `"ALL" | AircraftCategory` string. Anyone who has
       * opened the app before has one in localStorage right now, so it has to
       * be translated rather than trusted: "ALL" becomes the empty list, any
       * other value becomes a list of one, and anything unrecognisable falls
       * back to showing everything.
       */
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          const old = state.categoryFilter;
          state.categoryFilter =
            typeof old === "string" && old !== "ALL" && ALL_CATEGORIES.includes(old as AircraftCategory)
              ? [old as AircraftCategory]
              : [];
        }
        return state as unknown as RadarStore;
      },
    }
  )
);
