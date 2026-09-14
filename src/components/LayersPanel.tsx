"use client";

import { usePreferencesStore, Preferences } from "../store/usePreferencesStore";

type BooleanPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

const LAYER_ITEMS: { key: BooleanPrefKey; label: string }[] = [
  { key: "radarGraphicsEnabled", label: "Radar" },
  { key: "aircraftTrailsEnabled", label: "Aircraft Trails" },
  { key: "airportsEnabled", label: "Airports" },
  { key: "skyViewEnabled", label: "Sky View" },
  { key: "radarSoundEnabled", label: "Radar Sound" },
];

export default function LayersPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePreferencesStore();

  // Anchored to the viewport rather than to the LAYERS button: the button
  // lives in a scrollable rail, which would clip a panel positioned inside it.
  return (
    <div
      className="animate-card-in absolute bottom-3 right-[var(--rail-inset,7rem)] z-30 w-56 rounded-xl border border-radar-panelborder bg-radar-panel/95 p-3 shadow-2xl backdrop-blur-md transition-[right] duration-200 ease-out motion-reduce:transition-none"
      role="dialog"
      aria-label="Layers"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-widest text-radar-textdim">LAYERS</span>
        <button onClick={onClose} className="text-radar-textdim hover:text-radar-text" aria-label="Close layers">
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {LAYER_ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white/5">
              <span className="text-radar-text">{item.label}</span>
              <input
                type="checkbox"
                checked={prefs[item.key]}
                onChange={() => prefs.toggle(item.key)}
                className="h-4 w-4 accent-radar-green"
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
