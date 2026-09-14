"use client";

import AmbientTraffic from "./AmbientTraffic";
import { GeolocationStatus } from "../hooks/useGeolocation";

const PORTLAND: { latitude: number; longitude: number } = { latitude: 45.5152, longitude: -122.6784 };

export default function LocationGate({
  status,
  error,
  onRequest,
  onUseDemo,
}: {
  status: GeolocationStatus;
  error: string | null;
  onRequest: () => void;
  onUseDemo: (loc: { latitude: number; longitude: number }) => void;
}) {
  const denied = status === "denied" || status === "unavailable";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-radar-bg px-6">
      {/* Invented aircraft, decorative only — see AmbientTraffic. Nothing
          here is live, and none of it can reach the scope. */}
      <AmbientTraffic />

      <div className="relative z-10 max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-radar-panelborder bg-radar-bg/60">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#33ff99" strokeWidth="1.4">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1.2" fill="#33ff99" />
          </svg>
        </div>
        <h1 className="mb-1 font-mono text-[22px] tracking-[0.22em] text-radar-text">SKYRADAR</h1>

        {!denied ? (
          <>
            <p className="mb-5 text-sm text-radar-textdim">
              SkyRadar uses your location to show aircraft around you.
            </p>
            <button
              onClick={onRequest}
              className="w-full rounded-lg bg-radar-green/90 py-2.5 font-mono text-sm tracking-wide text-black"
            >
              ENABLE LOCATION
            </button>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-radar-amber">{error}</p>
            <button
              onClick={onRequest}
              className="mb-2 w-full rounded-lg border border-radar-panelborder py-2.5 font-mono text-sm tracking-wide text-radar-text"
            >
              TRY AGAIN
            </button>
          </>
        )}

        <button
          onClick={() => onUseDemo(PORTLAND)}
          className="mt-3 font-mono text-[11px] text-radar-textdim underline decoration-dotted hover:text-radar-text"
        >
          Use demo location instead
        </button>
      </div>

      {/* Sits low and quiet, like the maker's plate on an instrument. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center">
        <span className="font-mono text-[10px] tracking-[0.18em] text-radar-textdim/70">
          DESIGNED BY M. BIGI
        </span>
      </div>
    </div>
  );
}
