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
 *
 * Each row carries how many aircraft are in that category within the current
 * range, so the list answers "what do I get if I tick this?" before you tick
 * it — and a category with nothing in it says so rather than looking like a
 * button that does nothing. The numbers are of what is in range, not of the
 * whole feed: a promise of twenty airliners that turns into six as soon as
 * you tick it would be worse than no number at all. They do not depend on
 * what is currently ticked, because the question they answer does not.
 */
export default function CategoryFilterBar({
  value,
  counts,
  totalInRange,
  onToggle,
  onShowAll,
}: {
  value: CategoryFilter;
  /** How many aircraft of each category are within the selected range. */
  counts: Record<AircraftCategory, number>;
  /** All of them added up — what ALL stands for. */
  totalInRange: number;
  onToggle: (c: AircraftCategory) => void;
  onShowAll: () => void;
}) {
  const all = showingAllCategories(value);
  const chosen = ALL_CATEGORIES.filter((c) => !all && value.includes(c));

  // Tighter below sm, where the rail is a whole ring-width narrower: the
  // count still has to fit beside the longest label without clipping.
  const row =
    "flex w-full items-center gap-1 rounded-md px-1 py-1 text-left font-mono text-[9px] tracking-normal transition-colors sm:gap-1.5 sm:px-1.5 sm:text-[10px] sm:tracking-wide";
  // A count column that does not shift as digits come and go, and dims when
  // there is nothing there — an empty category should read as empty at a
  // glance rather than as a zero to be parsed.
  const tally = (n: number, lit: boolean) => (
    <span
      className={clsx(
        "ml-auto shrink-0 tabular-nums text-[9px]",
        n === 0 ? "text-radar-textdim/40" : lit ? "text-radar-green" : "text-radar-textdim"
      )}
    >
      {n}
    </span>
  );
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
        aria-label={`Show every category, ${totalInRange} in range`}
        className={clsx(row, all ? on : off)}
      >
        <Tick on={all} />
        ALL
        {tally(totalInRange, all)}
      </button>

      <div className="mx-1 border-t border-radar-panelborder" />

      {ALL_CATEGORIES.map((c) => {
        const selected = !all && value.includes(c);
        return (
          <button
            key={c}
            onClick={() => onToggle(c)}
            aria-pressed={selected}
            aria-label={`${LABELS[c].full}, ${counts[c] ?? 0} in range${selected ? ", showing" : ""}`}
            className={clsx(row, selected ? on : off)}
          >
            <Tick on={selected} />
            {LABELS[c].short}
            {tally(counts[c] ?? 0, selected)}
          </button>
        );
      })}
    </div>
  );
}
