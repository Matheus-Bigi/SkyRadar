"use client";

import { DataStatus } from "../store/useAircraftStore";

export default function DataStatusBanner({ status }: { status: DataStatus }) {
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
