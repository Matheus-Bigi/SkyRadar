"use client";

import { Aircraft } from "../lib/aircraft/types";
import { GeoDerived } from "../lib/geo";
import {
  categoryLabel,
  fmtAltitude,
  fmtAltitudeMeters,
  fmtHeading,
  fmtMiles,
  fmtRelativeTime,
  fmtSpeed,
  fmtSpeedMetric,
  fmtTemp,
  fmtVerticalSpeed,
} from "../lib/format";
import SilhouetteIcon from "./SilhouetteIcon";
import { useAircraftPhoto } from "../hooks/useAircraftPhoto";
import { useAircraftRoute } from "../hooks/useAircraftRoute";

export interface AircraftCardProps {
  aircraft: Aircraft;
  geometry: GeoDerived;
  expanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onLookHere: () => void;
}

function Field({ label, value, secondary }: { label: string; value: string | null; secondary?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-wider text-radar-textdim">{label}</span>
      <span className="text-sm text-radar-text">{value}</span>
      {secondary && <span className="font-mono text-[9px] leading-tight text-radar-textdim">{secondary}</span>}
    </div>
  );
}

export default function AircraftCard({ aircraft, geometry, expanded, onToggleExpand, onClose, onLookHere }: AircraftCardProps) {
  // Both lookups start as soon as the card opens — not on expand — so the
  // photo and route are already there by the time anyone taps MORE. Each is
  // keyed on this aircraft's own identity and clears when the selection
  // changes, so one aircraft's details can never linger over another's.
  const photo = useAircraftPhoto(aircraft.id, aircraft.registration);
  const route = useAircraftRoute(aircraft.callsign, aircraft.latitude, aircraft.longitude);
  const isMilitary = aircraft.isMilitary;

  // The route database names the operating carrier; the callsign's ICAO
  // designator is the offline fallback. Both are published facts about this
  // flight — nothing is inferred from the aircraft's appearance or owner.
  const airline = route.airline ?? aircraft.airline ?? null;
  const routeLine =
    route.origin && route.destination
      ? `${route.origin} → ${route.destination}`
      : route.origin
        ? `FROM ${route.origin}`
        : route.destination
          ? `TO ${route.destination}`
          : null;
  const routeNames =
    route.originName && route.destinationName
      ? `${route.originName} → ${route.destinationName}`
      : route.originName ?? route.destinationName ?? null;

  return (
    <div
      className="animate-card-in pointer-events-auto w-full max-w-md rounded-xl border border-radar-panelborder bg-radar-panel/95 shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-label="Aircraft details"
    >
      <div className="flex items-start gap-3 p-3">
        <SilhouetteIcon type={aircraft.silhouette} military={isMilitary} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Falls back to the ICAO 24-bit address — always broadcast, always
                real — rather than an unhelpful "UNKNOWN". */}
            <span className="truncate font-mono text-sm font-semibold text-radar-text">
              {aircraft.callsign ?? aircraft.registration ?? aircraft.id.toUpperCase()}
            </span>
            {isMilitary && (
              <span className="rounded border border-radar-mil/40 px-1 py-0.5 font-mono text-[8px] tracking-widest text-radar-mil">
                MIL
              </span>
            )}
          </div>
          {airline && <div className="truncate text-xs text-radar-text">{airline}</div>}
          {aircraft.aircraftModel && (
            <div className="truncate text-[11px] leading-tight text-radar-textdim">{aircraft.aircraftModel}</div>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {routeLine && (
              <span className="truncate font-mono text-[10px] tracking-wider text-radar-green">{routeLine}</span>
            )}
            <span className="font-mono text-[9px] tracking-widest text-radar-textdim">
              {categoryLabel(aircraft.category)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={onClose} aria-label="Close" className="text-radar-textdim hover:text-radar-text">
            ✕
          </button>
          {photo.imageUrl && (
            // A photo of this exact airframe, not a stock shot of the type.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.imageUrl}
              alt={`${aircraft.registration ?? aircraft.aircraftModel ?? "Aircraft"} photo`}
              className="h-11 w-16 rounded border border-radar-panelborder object-cover"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 px-3 pb-3">
        <Field label="Dist" value={fmtMiles(geometry.distanceMiles)} />
        <Field label="Alt" value={fmtAltitude(aircraft.altitude)} secondary={fmtAltitudeMeters(aircraft.altitude)} />
        <Field label="Speed" value={fmtSpeed(aircraft.groundSpeed)} secondary={fmtSpeedMetric(aircraft.groundSpeed)} />
        <Field label="Hdg" value={fmtHeading(aircraft.heading)} />
      </div>

      <div className="flex gap-2 border-t border-radar-panelborder p-3">
        <button
          onClick={onLookHere}
          className="flex-1 rounded-lg bg-radar-green/90 py-2 font-mono text-xs tracking-widest text-black"
        >
          LOOK HERE
        </button>
        <button
          onClick={onToggleExpand}
          className="flex-1 rounded-lg border border-radar-panelborder py-2 font-mono text-xs tracking-widest text-radar-text"
        >
          {expanded ? "LESS" : "MORE"}
        </button>
      </div>

      {expanded && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-radar-panelborder p-3">
          {photo.imageUrl && (
            <div className="mb-3 overflow-hidden rounded-lg border border-radar-panelborder">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.imageUrl} alt={`${aircraft.aircraftModel ?? "Aircraft"} photo`} className="w-full object-cover" />
              {photo.attribution && (
                <div className="bg-black/40 px-2 py-1 text-[9px] text-radar-textdim">{photo.attribution}</div>
              )}
            </div>
          )}

          <div className="mb-3">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-radar-textdim">AIRCRAFT</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Model" value={aircraft.aircraftModel ?? null} />
              <Field label="Type" value={aircraft.aircraftType ?? null} />
              <Field label="Registration" value={aircraft.registration ?? null} />
              <Field label="Owner/Operator" value={aircraft.operator ?? null} />
            </div>
          </div>

          {(aircraft.flightNumber || airline || routeLine) && (
            <div className="mb-3">
              <div className="mb-1 font-mono text-[10px] tracking-widest text-radar-textdim">FLIGHT</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Airline" value={airline} />
                <Field label="Flight #" value={aircraft.flightNumber ?? null} />
                <Field label="Route" value={routeLine} secondary={routeNames} />
              </div>
            </div>
          )}

          <div className="mb-3">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-radar-textdim">POSITION</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Distance" value={fmtMiles(geometry.distanceMiles)} />
              <Field label="Altitude" value={fmtAltitude(aircraft.altitude)} secondary={fmtAltitudeMeters(aircraft.altitude)} />
              <Field label="Ground speed" value={fmtSpeed(aircraft.groundSpeed)} secondary={fmtSpeedMetric(aircraft.groundSpeed)} />
              <Field label="Heading" value={fmtHeading(aircraft.heading)} />
              <Field label="Vertical speed" value={fmtVerticalSpeed(aircraft.verticalSpeed)} />
              <Field label="Bearing" value={fmtHeading(geometry.bearing)} />
              <Field label="Outside air temp" value={fmtTemp(aircraft.outsideAirTempC)} />
              <Field label="Updated" value={fmtRelativeTime(aircraft.lastUpdated)} />
            </div>
          </div>

          <div>
            <div className="mb-1 font-mono text-[10px] tracking-widest text-radar-textdim">IDENTIFICATION</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ICAO address" value={aircraft.id.toUpperCase()} />
              <Field label="Category" value={categoryLabel(aircraft.category)} />
              <Field label="Military/Gov" value={isMilitary ? "Yes" : null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
