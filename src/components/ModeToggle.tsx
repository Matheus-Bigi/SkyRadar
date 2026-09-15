"use client";

import clsx from "clsx";
import { DisplayMode } from "../store/useRadarStore";

/**
 * How you are looking at the traffic: on a map, on the scope, or out of the
 * window. Sky View sits here with the other two because it is a third way of
 * viewing the same aircraft, not a feature to switch on — it just happens to
 * open as an overlay rather than change a mode. It is listed only when the
 * Sky View setting is on, and hidden entirely on a device with no camera.
 */
export default function ModeToggle({
  value,
  onChange,
  skyViewAvailable = false,
  skyViewActive = false,
  onSkyView,
}: {
  value: DisplayMode;
  onChange: (m: DisplayMode) => void;
  skyViewAvailable?: boolean;
  skyViewActive?: boolean;
  onSkyView?: () => void;
}) {
  const selected =
    "bg-radar-green/90 text-black shadow-glow";
  const unselected = "text-radar-textdim hover:text-radar-text";
  const base =
    "rounded-md px-2 py-1 font-mono text-[11px] tracking-wide transition-colors";

  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/80 p-1 backdrop-blur-sm">
      {(["MAP", "RADAR"] as DisplayMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={!skyViewActive && value === m}
          className={clsx(base, !skyViewActive && value === m ? selected : unselected)}
        >
          {m}
        </button>
      ))}

      {skyViewAvailable && onSkyView && (
        <button
          onClick={onSkyView}
          aria-pressed={skyViewActive}
          className={clsx(base, "whitespace-nowrap", skyViewActive ? selected : unselected)}
        >
          SKY VIEW
        </button>
      )}
    </div>
  );
}
