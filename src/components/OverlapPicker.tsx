"use client";

import { Aircraft } from "../lib/aircraft/types";

export default function OverlapPicker({
  aircraft,
  onPick,
  onDismiss,
}: {
  aircraft: Aircraft[];
  onPick: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onDismiss}>
      <div
        className="animate-card-in mb-4 w-full max-w-xs rounded-xl border border-radar-panelborder bg-radar-panel/95 p-3 shadow-2xl sm:mb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 px-1 font-mono text-[10px] tracking-widest text-radar-textdim">
          {aircraft.length} AIRCRAFT HERE
        </div>
        <ul className="flex flex-col gap-1">
          {aircraft.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onPick(a.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-white/5"
              >
                <span className="font-mono text-radar-text">{a.callsign ?? a.id}</span>
                <span className="text-xs text-radar-textdim">{a.aircraftModel ?? a.category}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
