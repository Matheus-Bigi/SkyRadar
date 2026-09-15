"use client";

import { usePreferencesStore } from "../store/usePreferencesStore";
import { normalizeDegrees } from "../lib/geo";
import { DeviceHeadingState } from "../hooks/useDeviceHeading";

const NUDGES = [-45, -10, -1, 1, 10, 45];

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[9px] tracking-widest text-radar-textdim">{label}</span>
      <span className="font-mono text-[11px] text-radar-text">{value}</span>
    </div>
  );
}

/**
 * Manual compass correction. A tablet's magnetometer is easily thrown off by
 * its case, a nearby speaker, or the car it's sitting in, so rather than
 * pretend the sensor is right, let the user line the radar up with something
 * they can actually see and keep that offset.
 */
export default function CompassCalibration({
  heading,
  onClose,
}: {
  heading: DeviceHeadingState;
  onClose: () => void;
}) {
  const offset = usePreferencesStore((s) => s.headingOffsetDeg);
  const setPref = usePreferencesStore((s) => s.set);

  const nudge = (delta: number) =>
    setPref("headingOffsetDeg", Math.round(normalizeDegrees(offset + delta)));

  const fmt = (v: number | null) => (v === null ? "--°" : `${Math.round(v)}°`);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v) || 0}°`;

  return (
    <div
      className="animate-card-in absolute right-[var(--rail-inset,8rem)] top-16 z-30 w-60 rounded-xl border border-radar-panelborder bg-radar-panel/95 p-3 shadow-2xl backdrop-blur-md transition-[right] duration-200 ease-out motion-reduce:transition-none"
      role="dialog"
      aria-label="Compass calibration"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-widest text-radar-textdim">COMPASS</span>
        <button onClick={onClose} aria-label="Close compass calibration" className="text-radar-textdim hover:text-radar-text">
          ✕
        </button>
      </div>

      {!heading.supported ? (
        <p className="text-xs text-radar-textdim">This device has no compass, so the radar stays north-up.</p>
      ) : heading.permission === "unknown" ? (
        <div>
          <p className="mb-2 text-xs text-radar-textdim">
            Allow motion &amp; orientation access to use the compass.
          </p>
          <button
            onClick={heading.requestPermission}
            className="w-full rounded-lg bg-radar-green/90 py-2 font-mono text-[11px] tracking-widest text-black"
          >
            ENABLE
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-snug text-radar-textdim">
            Turn on HDG UP, then nudge until the map lines up with what&apos;s actually in front of
            you.
          </p>

          <div className="mb-2 flex flex-col gap-0.5 rounded-md border border-radar-panelborder/60 p-2">
            <Readout label="SENSOR" value={fmt(heading.rawHeading)} />
            <Readout label="SCREEN" value={`${heading.screenAngle}°`} />
            <Readout label="OFFSET" value={signed(offset)} />
            <Readout label="SHOWN" value={fmt(heading.heading)} />
          </div>

          <div className="grid grid-cols-6 gap-1">
            {NUDGES.map((d) => (
              <button
                key={d}
                onClick={() => nudge(d)}
                aria-label={`Adjust compass by ${d} degrees`}
                className="rounded-md border border-radar-panelborder py-1 font-mono text-[10px] text-radar-textdim hover:text-radar-text"
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPref("headingOffsetDeg", 0)}
            className="mt-2 w-full rounded-md border border-radar-panelborder py-1.5 font-mono text-[10px] tracking-widest text-radar-textdim hover:text-radar-text"
          >
            RESET
          </button>
          {heading.needsCalibration && (
            <p className="mt-2 text-[10px] leading-snug text-radar-amber">
              Sensor reading is unsteady — move the iPad in a figure-eight to settle it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
