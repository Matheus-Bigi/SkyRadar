"use client";

import clsx from "clsx";
import { DataStatus } from "../store/useAircraftStore";

export default function TopBar({
  status,
  aircraftCount,
}: {
  status: DataStatus;
  /** How many aircraft are on the scope right now, filters and range applied. */
  aircraftCount: number;
}) {
  const live = status === "ready";
  return (
    /*
     * One column down the left, under the wordmark, rather than a bar thrown
     * across to the right edge. On a tablet in full screen the right edge is
     * where the system draws the battery and wifi, and these kept ending up
     * underneath it.
     *
     * The gear is not here — it lives in the opposite corner, above the
     * control rail it can reconfigure. See SettingsButton.
     */
    <div className="pointer-events-none flex flex-col items-start gap-2">
      <div className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/70 px-3.5 py-2 backdrop-blur-sm">
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-radar-text">SKYRADAR</span>
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
          {/*
            How many aircraft are on the scope, next to the word that says the
            data is current — the two belong together, and here it survives the
            control rail being folded away, which is exactly when the rail's own
            per-category counts are not on screen to add up.

            Only while the feed is live: a count left standing during an outage
            would describe a scope that has already been cleared.
          */}
          {live && (
            <>
              <span aria-hidden className="text-radar-panelborder">
                |
              </span>
              <span
                className="font-mono text-[10px] tabular-nums tracking-widest text-radar-text"
                aria-label={`${aircraftCount} aircraft shown`}
              >
                {aircraftCount}
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => window.location.reload()}
          aria-label="Refresh SkyRadar"
          className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/70 p-2 text-radar-textdim backdrop-blur-sm hover:text-radar-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
