"use client";

import { DataStatus } from "../store/useAircraftStore";

export default function DataStatusBanner({ status, source }: { status: DataStatus; source?: string }) {
  // A permanent, impossible-to-miss watermark whenever the local simulator
  // is somehow active (only reachable via an explicit AIRCRAFT_PROVIDER=mock
  // opt-in — never the default) — this data must never be mistaken for real
  // traffic at the user's real location.
  if (source === "simulated") {
    return (
      <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2">
        <div className="rounded-md border border-radar-amber/60 bg-radar-amber/15 px-3 py-1.5 font-mono text-[10px] tracking-widest text-radar-amber backdrop-blur-sm">
          SIMULATED DATA — NOT REAL AIRCRAFT
        </div>
      </div>
    );
  }

  if (status !== "offline" && status !== "error") return null;

  const message =
    status === "offline" ? "LIVE DATA UNAVAILABLE" : "Aircraft data temporarily unavailable";

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2">
      <div className="rounded-md border border-radar-amber/40 bg-radar-panel/85 px-3 py-1.5 font-mono text-[10px] tracking-widest text-radar-amber backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
}
