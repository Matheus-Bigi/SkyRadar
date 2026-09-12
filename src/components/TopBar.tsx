"use client";

import clsx from "clsx";
import { DataStatus } from "../store/useAircraftStore";

export default function TopBar({
  status,
  onOpenSettings,
}: {
  status: DataStatus;
  onOpenSettings: () => void;
}) {
  const live = status === "ready";
  return (
    <div className="pointer-events-none flex items-start justify-between">
      <div className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/70 px-3 py-1.5 backdrop-blur-sm">
        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-radar-text">SKYRADAR</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-radar-panelborder bg-radar-panel/70 px-2.5 py-1.5 backdrop-blur-sm">
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              live ? "bg-radar-green shadow-glow" : status === "offline" || status === "error" ? "bg-radar-amber" : "bg-radar-textdim"
            )}
          />
          <span className="font-mono text-[10px] tracking-widest text-radar-textdim">
            {live ? "LIVE" : status === "offline" ? "OFFLINE" : status === "error" ? "DATA ERROR" : "..."}
          </span>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/70 p-2 text-radar-textdim backdrop-blur-sm hover:text-radar-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
