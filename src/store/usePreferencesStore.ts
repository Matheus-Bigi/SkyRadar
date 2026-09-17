import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AircraftCategory } from "../lib/aircraft/types";

/**
 * All user-adjustable, locally-persisted preferences — Layers panel and
 * Settings panel both read/write this single store (spec #31, #51, #64).
 */
export interface Preferences {
  // Layers
  radarGraphicsEnabled: boolean;
  aircraftTrailsEnabled: boolean;
  airportsEnabled: boolean;
  skyViewEnabled: boolean;
  radarSoundEnabled: boolean;

  /**
   * Which aircraft categories raise the on-screen alarm when they come
   * within three miles. Empty means the alarm is off — there is no separate
   * enable switch, because "warn me about nothing" and "do not warn me" are
   * the same instruction and two controls for one idea is one too many.
   */
  proximityAlertCategories: AircraftCategory[];

  // Aircraft
  showCallsigns: boolean;
  militaryHighlighting: boolean;
  visualRangeHighlight: boolean;

  // Orientation — false (default): map/radar stay north-up, fixed. true: the
  // map and radar plot rotate to keep the device's current heading pointing
  // "up" on screen, following you as you turn.
  headingUpMode: boolean;
  /**
   * Manual compass correction, degrees added to the sensor heading. Phone and
   * tablet magnetometers drift and are thrown off by cases and nearby metal,
   * so the user gets to nudge it until the radar matches what they can see.
   */
  headingOffsetDeg: number;

  // Sky View
  arLabelsEnabled: boolean;
  arDistanceDisplay: boolean;

  /**
   * Whether the right-hand control rail is tucked away. On a phone the rail
   * is a quarter of the screen's width, and the map underneath it is the
   * point of the app — so it folds out of the way and stays that way until
   * it is asked back.
   */
  controlRailCollapsed: boolean;

  // Appearance
  appearance: "dark" | "system";
}

const defaults: Preferences = {
  radarGraphicsEnabled: true,
  aircraftTrailsEnabled: true,
  airportsEnabled: true,
  skyViewEnabled: true,
  radarSoundEnabled: false,

  proximityAlertCategories: ["MILITARY", "OTHER"],

  showCallsigns: true,
  militaryHighlighting: true,
  visualRangeHighlight: true,
  headingUpMode: false,
  headingOffsetDeg: 0,

  arLabelsEnabled: true,
  arDistanceDisplay: true,

  controlRailCollapsed: false,

  appearance: "dark",
};

type BooleanPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

interface PreferencesStore extends Preferences {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  toggle: (key: BooleanPrefKey) => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      ...defaults,
      set: (key, value) => set({ [key]: value } as Partial<Preferences>),
      toggle: (key) => set({ [key]: !get()[key] } as Partial<Preferences>),
      reset: () => set({ ...defaults }),
    }),
    {
      name: "skyradar:preferences",
      version: 2,
      /**
       * v1 had a single `proximityAlertEnabled` boolean, when the alarm was
       * hard-wired to military and unidentified traffic. Anyone who has
       * opened the app since that shipped has one in localStorage, so it is
       * translated rather than dropped: on becomes exactly the two categories
       * it used to watch, off becomes an empty list.
       */
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          const wasOn = state.proximityAlertEnabled;
          state.proximityAlertCategories =
            wasOn === false ? [] : (["MILITARY", "OTHER"] as AircraftCategory[]);
          delete state.proximityAlertEnabled;
        }
        return state as unknown as PreferencesStore;
      },
    }
  )
);
