"use client";

import { Aircraft } from "../lib/aircraft/types";
import { GeoDerived } from "../lib/geo";
import { fmtAltitude, fmtMiles } from "../lib/format";
import SilhouetteIcon from "./SilhouetteIcon";

const CENTERED_THRESHOLD_DEG = 5;

export default function LookHereOverlay({
  aircraft,
  geometry,
  onClose,
}: {
  aircraft: Aircraft;
  geometry: GeoDerived;
  onClose: () => void;
}) {
  const centered = Math.abs(geometry.relativeBearing) <= CENTERED_THRESHOLD_DEG;
  const direction = geometry.relativeBearing > 0 ? "RIGHT" : "LEFT";
  const turnAmount = Math.round(Math.abs(geometry.relativeBearing));
  const elevAbs = Math.round(Math.abs(geometry.elevationAngle));
  const elevDir = geometry.elevationAngle >= 0 ? "UP" : "DOWN";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4">
      <div className="animate-card-in pointer-events-auto w-full max-w-xs rounded-2xl border border-radar-panelborder bg-radar-panel/92 px-6 py-4 text-center shadow-2xl backdrop-blur-md">
        <div className="flex justify-center">
          <SilhouetteIcon type={aircraft.silhouette} size={40} military={aircraft.isMilitary} />
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-widest text-radar-textdim">
          {aircraft.callsign ?? aircraft.registration ?? "AIRCRAFT"}
        </div>

        {centered ? (
          <div className="mt-2 font-mono text-2xl tracking-widest text-radar-green">CENTERED</div>
        ) : (
          <div className="mt-2 font-mono text-xl tracking-widest text-radar-text">
            TURN {turnAmount}° {direction}
          </div>
        )}
        <div className="mt-1 font-mono text-sm tracking-wide text-radar-textdim">
          LOOK {elevAbs}° {elevDir}
        </div>

        <div className="mt-3 flex justify-center gap-4 font-mono text-xs text-radar-textdim">
          {fmtMiles(geometry.distanceMiles) && <span>{fmtMiles(geometry.distanceMiles)}</span>}
          {fmtAltitude(aircraft.altitude) && <span>{fmtAltitude(aircraft.altitude)}</span>}
        </div>

        <button
          onClick={onClose}
          className="mt-4 rounded-lg border border-radar-panelborder px-4 py-1.5 font-mono text-[11px] text-radar-textdim hover:text-radar-text"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
