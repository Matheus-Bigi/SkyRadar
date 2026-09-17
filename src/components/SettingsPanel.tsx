"use client";

import { usePreferencesStore, Preferences } from "../store/usePreferencesStore";
import { ALL_CATEGORIES } from "../store/useRadarStore";
import { CATEGORY_LABELS, URGENT_CATEGORIES } from "../lib/aircraft/categories";
import { ALERT_RADIUS_MILES } from "../hooks/useProximityAlert";

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
        </Section>

        <Section title="ALERTS">
          {/*
            The alarm fires on the real world, not on what is currently
            plotted: filtering the scope down to airliners is a statement
            about the display, not about what is worth being warned of. So
            what to be warned about gets its own list, here.

            No separate on/off switch — ticking nothing is the same
            instruction as switching it off, and two controls for one idea is
            one too many. The caption below says so rather than leaving an
            empty list looking broken.
          */}
          <div className="px-2 pb-1 text-[11px] leading-snug text-radar-textdim">
            Warn me when these come within {ALERT_RADIUS_MILES} miles
          </div>
          {ALL_CATEGORIES.map((c) => (
            <ToggleRow
              key={c}
              label={CATEGORY_LABELS[c].full}
              checked={prefs.proximityAlertCategories.includes(c)}
              onChange={() =>
                prefs.set(
                  "proximityAlertCategories",
                  prefs.proximityAlertCategories.includes(c)
                    ? prefs.proximityAlertCategories.filter((x) => x !== c)
                    : ALL_CATEGORIES.filter(
                        (x) => x === c || prefs.proximityAlertCategories.includes(x)
                      )
                )
              }
            />
          ))}
          <div className="px-2 pt-1 text-[11px] leading-snug text-radar-textdim">
            {prefs.proximityAlertCategories.length === 0
              ? "Nothing selected — the alarm is off."
              : prefs.proximityAlertCategories.some((c) => URGENT_CATEGORIES.includes(c))
                ? "Military and other aircraft flash red; the rest flash green."
                : "These flash green. Military and other aircraft would flash red."}
          </div>
        </Section>

        <Section title="AIRCRAFT">
          <ToggleRow label="Show callsigns" {...bool("showCallsigns")} />
          <ToggleRow label="Military highlighting" {...bool("militaryHighlighting")} />
          <ToggleRow label="Visual range highlight" {...bool("visualRangeHighlight")} />
        </Section>

        <Section title="SKY VIEW">
          {/*
            The master switch, moved here when the Layers panel was folded
            into Settings. It was the only thing Layers offered that this
            panel did not already carry — radar sweep, radar sound, trails and
            airports all appear above, and listing them twice would have meant
            two controls for one setting. Turning this off takes Sky View out
            of the view list beside MAP and RADAR.
          */}
          <ToggleRow label="Sky View mode" {...bool("skyViewEnabled")} />
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
