"use client";

import clsx from "clsx";
import { AircraftCategory } from "../lib/aircraft/types";
import {
  ALL_CATEGORIES,
  CategoryFilter,
  showingAllCategories,
} from "../store/useRadarStore";

const LABELS: Record<AircraftCategory, { short: string; full: string }> = {
  AIRLINE: { short: "AIRLINE", full: "Airliners" },
  MILITARY: { short: "MILITARY", full: "Military aircraft" },
  HELICOPTER: { short: "HELI", full: "Helicopters" },
  GENERAL_AVIATION: { short: "GA", full: "General aviation" },
  OTHER: { short: "OTHER", full: "Other aircraft" },
};

/**
 * A tick box, drawn rather than native so it matches the rail's weight at a
 * size no checkbox control renders well at. Purely decorative — the button
 * around it carries the state for assistive tech.
 *
 * The check is a drawn path rather than the character ✓ on purpose. As text
 * it lands inside the button's own text content, so every row reads "✓ALL",
 * "✓HELI" and so on — invisible when unticked, but there in anything that
 * reads, matches or copies the label. A path contributes no text at all.
 */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid h-[11px] w-[11px] shrink-0 place-items-center rounded-[3px] border transition-colors",
        on ? "border-radar-green bg-radar-green" : "border-radar-textdim/50"
      )}
    >
      <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]" fill="none" aria-hidden>
        <path
          d="M2 5.2 4 7.2 8 3"
          stroke={on ? "#000" : "transparent"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Which categories are on the scope.
 *
 * This is a multi-select, and the tick boxes are what say so. A row of
 * highlighted pills alone reads as a segmented control — one of these, pick
 * another and the first turns off — which is exactly what it used to be. Tick
 * boxes are the ordinary sign for "several of these at once", so nobody has
 * to discover the behaviour by trying it.
 *
 * ALL sits at the top, above a divider, as the way back to everything. It is
 * ticked precisely when nothing is singled out, so the control always shows
 * one of two readable states: everything, or exactly the categories ticked.
 * The count beside the heading says which without having to scan the list.
 */
export default function CategoryFilterBar({
  value,
  onToggle,
  onShowAll,
}: {
  value: CategoryFilter;
  onToggle: (c: AircraftCategory) => void;
  onShowAll: () => void;
}) {
  const all = showingAllCategories(value);
  const chosen = ALL_CATEGORIES.filter((c) => !all && value.includes(c));

  const row =
    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-mono text-[10px] tracking-wide transition-colors";
  const on = "bg-radar-greendim text-radar-green";
  const off = "text-radar-textdim hover:bg-white/5 hover:text-radar-text";

  return (
    <div
      className="flex w-full flex-col gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/80 p-1 backdrop-blur-sm"
      role="group"
      aria-label="Aircraft categories to show"
    >
      <div className="flex items-baseline justify-between px-1.5 pt-0.5 font-mono text-[9px] leading-none tracking-widest text-radar-textdim">
        <span>SHOW</span>
        {!all && (
          <span className="text-radar-green">
            {chosen.length}/{ALL_CATEGORIES.length}
          </span>
        )}
      </div>

      <button
        onClick={onShowAll}
        aria-pressed={all}
        aria-label="Show every category"
        className={clsx(row, all ? on : off)}
      >
        <Tick on={all} />
        ALL
      </button>

      <div className="mx-1 border-t border-radar-panelborder" />

      {ALL_CATEGORIES.map((c) => {
        const selected = !all && value.includes(c);
        return (
          <button
            key={c}
            onClick={() => onToggle(c)}
            aria-pressed={selected}
            aria-label={`${LABELS[c].full}${selected ? " (showing)" : ""}`}
            className={clsx(row, selected ? on : off)}
          >
            <Tick on={selected} />
            {LABELS[c].short}
          </button>
        );
      })}
    </div>
  );
}
