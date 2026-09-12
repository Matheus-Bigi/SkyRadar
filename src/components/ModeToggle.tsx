"use client";

import clsx from "clsx";
import { DisplayMode } from "../store/useRadarStore";

export default function ModeToggle({
  value,
  onChange,
}: {
  value: DisplayMode;
  onChange: (m: DisplayMode) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/80 p-1 backdrop-blur-sm">
      {(["MAP", "RADAR"] as DisplayMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={clsx(
            "min-w-[64px] rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors",
            value === m ? "bg-radar-green/90 text-black shadow-glow" : "text-radar-textdim hover:text-radar-text"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
