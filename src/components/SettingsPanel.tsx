"use client";

import { usePreferencesStore, Preferences } from "../store/usePreferencesStore";

type BooleanPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-white/5">
      <span className="text-radar-text">{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-radar-green" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-2 font-mono text-[10px] tracking-widest text-radar-textdim">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePreferencesStore();
  const bool = (key: BooleanPrefKey) => ({
    checked: prefs[key],
    onChange: () => prefs.toggle(key),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="animate-card-in max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-radar-panelborder bg-radar-panel/95 p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-widest text-radar-text">SETTINGS</h2>
          <button onClick={onClose} className="text-radar-textdim hover:text-radar-text" aria-label="Close settings">
            ✕
          </button>
        </div>

        <Section title="APPEARANCE">
          <div className="flex gap-2 px-2 py-1">
            {(["dark", "system"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => prefs.set("appearance", mode)}
                className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase ${
                  prefs.appearance === mode ? "bg-radar-green/90 text-black" : "text-radar-textdim hover:text-radar-text"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </Section>

        <Section title="RADAR">
          <ToggleRow label="Radar sweep" {...bool("radarGraphicsEnabled")} />
          <ToggleRow label="Radar sound" {...bool("radarSoundEnabled")} />
          <ToggleRow label="Aircraft trails" {...bool("aircraftTrailsEnabled")} />
        </Section>

        <Section title="MAP">
          <ToggleRow label="Airports" {...bool("airportsEnabled")} />
          <ToggleRow label="City labels" {...bool("citiesEnabled")} />
          <ToggleRow label="Neighborhood labels" {...bool("neighborhoodsEnabled")} />
          <ToggleRow label="Roads" {...bool("roadsEnabled")} />
        </Section>

        <Section title="AIRCRAFT">
          <ToggleRow label="Show callsigns" {...bool("showCallsigns")} />
          <ToggleRow label="Military highlighting" {...bool("militaryHighlighting")} />
          <ToggleRow label="Visual range highlight" {...bool("visualRangeHighlight")} />
        </Section>

        <Section title="SKY VIEW">
          <ToggleRow label="AR labels" {...bool("arLabelsEnabled")} />
          <ToggleRow label="Distance display" {...bool("arDistanceDisplay")} />
        </Section>

        <button
          onClick={() => prefs.reset()}
          className="mt-1 w-full rounded-md border border-radar-panelborder py-2 font-mono text-[11px] text-radar-textdim hover:text-radar-text"
        >
          RESET TO DEFAULTS
        </button>
      </div>
    </div>
  );
}
