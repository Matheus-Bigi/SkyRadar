"use client";

import { DataStatus } from "../store/useAircraftStore";

export default function DataStatusBanner({
  status,
  source,
  error,
}: {
  status: DataStatus;
  source?: string;
  error?: string;
}) {
  // A permanent, impossible-to-miss watermark whenever the local simulator
  // is somehow active (only reachable via an explicit AIRCRAFT_PROVIDER=mock
  // opt-in — never the default) — this data must never be mistaken for real
  // traffic at the user's real location.
  if (source === "simulated") {
    return (
      <div className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
        style={{ top: "calc(var(--chrome-top, 0.75rem) + 2.75rem)" }}>
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
    <div className="pointer-events-none absolute left-1/2 z-20 w-[min(92vw,26rem)] -translate-x-1/2"
      style={{ top: "calc(var(--chrome-top, 0.75rem) + 2.75rem)" }}>
      <div className="rounded-md border border-radar-amber/40 bg-radar-panel/85 px-3 py-1.5 text-center backdrop-blur-sm">
        <div className="font-mono text-[10px] tracking-widest text-radar-amber">{message}</div>
        {/* The provider's own words — so a rate limit, an outage and a bug
            are all distinguishable from the device, without a console. */}
        {error && (
          <div className="mt-0.5 break-words font-mono text-[9px] leading-tight text-radar-textdim">
            {error.length > 200 ? `${error.slice(0, 200)}…` : error}
          </div>
        )}
      </div>
    </div>
  );
}
