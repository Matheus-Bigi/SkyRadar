"use client";

import { useEffect, useRef, useState } from "react";
import AmbientTraffic, { ClearZone } from "./AmbientTraffic";
import { GeolocationStatus } from "../hooks/useGeolocation";

const PORTLAND: { latitude: number; longitude: number } = { latitude: 45.5152, longitude: -122.6784 };

/**
 * How far the content sits above the screen's centre.
 *
 * Dead-centre left the whole composition bunched in the middle with the
 * traffic pushed to the margins. Lifting it opens the lower half up, and the
 * backdrop is told the same number so its clear zone travels with the block
 * instead of staying behind at the middle.
 */
const CONTENT_LIFT_PX = 44;

/**
 * Tracks where the content actually sits, so the backdrop can keep clear of
 * exactly that area on any screen. Measured rather than assumed: a radius
 * that looked right on a tablet was wider than a phone, which dimmed every
 * contact everywhere and left the backdrop empty.
 */
function useClearZone() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [zone, setZone] = useState<ClearZone | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setZone({
        centerX: r.left + r.width / 2,
        centerY: r.top + r.height / 2,
        halfWidth: r.width / 2,
        halfHeight: r.height / 2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, zone };
}

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
  const { ref: contentRef, zone } = useClearZone();

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-radar-bg px-6">
      {/* Invented aircraft, decorative only — see AmbientTraffic. Nothing
          here is live, and none of it can reach the scope. */}
      <AmbientTraffic clearZone={zone} />

      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-sm text-center"
        style={{ transform: `translateY(-${CONTENT_LIFT_PX}px)` }}
      >
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-radar-panelborder bg-radar-bg/60">
          <svg width="41" height="41" viewBox="0 0 24 24" fill="none" stroke="#33ff99" strokeWidth="1.4">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1.2" fill="#33ff99" />
          </svg>
        </div>
        <h1 className="mb-2 font-mono text-[26px] tracking-[0.22em] text-radar-text">SKYRADAR</h1>

        {!denied ? (
          <>
            <p className="mb-7 text-sm text-radar-textdim">
              See what&rsquo;s flying around you, right now.
            </p>
            <button
              onClick={onRequest}
              className="w-full rounded-xl bg-radar-green/90 px-4 py-4 text-black"
            >
              <span className="block font-mono text-base font-semibold tracking-[0.12em]">
                ENABLE LOCATION
              </span>
              <span className="mt-1 block font-mono text-[11px] tracking-wide text-black/65">
                Uses your current location
              </span>
            </button>
          </>
        ) : (
          <>
            <p className="mb-7 text-sm text-radar-amber">{error}</p>
            <button
              onClick={onRequest}
              className="w-full rounded-xl border border-radar-panelborder px-4 py-4 text-radar-text"
            >
              <span className="block font-mono text-base font-semibold tracking-[0.12em]">
                TRY AGAIN
              </span>
              <span className="mt-1 block font-mono text-[11px] tracking-wide text-radar-textdim">
                Uses your current location
              </span>
            </button>
          </>
        )}

        <button
          onClick={() => onUseDemo(PORTLAND)}
          className="mt-5 font-mono text-[11px] text-radar-textdim underline decoration-dotted hover:text-radar-text"
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
