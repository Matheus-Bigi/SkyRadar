"use client";

import clsx from "clsx";
import { RANGE_OPTIONS, RangeMiles } from "../store/useRadarStore";

export interface RangeSelectorProps {
  value: RangeMiles;
  onChange: (v: RangeMiles) => void;
}

export default function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Radar range"
      className="flex w-full flex-col gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/80 p-1 backdrop-blur-sm"
    >
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={clsx(
            "rounded-md px-2 py-1 font-mono text-[11px] tracking-wide transition-colors",
            value === r
              ? "bg-radar-green/90 text-black shadow-glow"
              : "text-radar-textdim hover:text-radar-text"
          )}
        >
          {r} MI
        </button>
      ))}
    </div>
  );
}
