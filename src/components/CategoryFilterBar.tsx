"use client";

import clsx from "clsx";
import { CategoryFilter } from "../store/useRadarStore";

const FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "AIRLINE", label: "AIRLINE" },
  { value: "MILITARY", label: "MILITARY" },
  { value: "HELICOPTER", label: "HELI" },
  { value: "GENERAL_AVIATION", label: "GA" },
];

export default function CategoryFilterBar({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (f: CategoryFilter) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/80 p-1 backdrop-blur-sm">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          aria-pressed={value === f.value}
          className={clsx(
            "whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
            value === f.value ? "bg-radar-greendim text-radar-green" : "text-radar-textdim hover:text-radar-text"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
