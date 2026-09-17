"use client";

import { ProximityContact, ALERT_RADIUS_MILES } from "../hooks/useProximityAlert";
import { metersToMiles } from "../lib/geo";

/**
 * The proximity alarm, as seen.
 *
 * Two parts, and the split is the whole design. The vignette is the thing
 * that catches your eye from across the room: it takes the whole screen, so
 * it cannot be missed, and it is transparent everywhere that matters, so it
 * hides nothing. It never takes pointer events, so the map underneath still
 * pans and aircraft are still selectable while it is going.
 *
 * The banner is the thing that answers "what?" once you have looked. It names
 * the contact and how far out it is, because a red screen that does not say
 * why is just alarming. It sits top-centre, clear of the chrome on the left
 * and the rail on the right, and it is the only part that can be clicked.
 */
export default function ProximityAlert({
  contacts,
  onAcknowledge,
}: {
  contacts: ProximityContact[];
  onAcknowledge: () => void;
}) {
  if (contacts.length === 0) return null;

  const nearest = contacts[0];
  const name =
    nearest.aircraft.callsign?.trim() ||
    nearest.aircraft.registration?.trim() ||
    nearest.aircraft.id.toUpperCase();
  const miles = metersToMiles(nearest.distanceMeters);

  return (
    <>
      <div
        className="proximity-alert pointer-events-none absolute inset-0 z-40"
        aria-hidden
        data-testid="proximity-vignette"
      />

      <div
        className="pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 justify-center px-3"
        style={{ top: "calc(var(--chrome-top, 0.75rem) + 2.75rem)" }}
      >
        <div
          role="alert"
          data-testid="proximity-banner"
          className="animate-card-in pointer-events-auto flex items-center gap-3 rounded-lg border border-red-400/50 bg-radar-panel/90 px-3 py-1.5 backdrop-blur-sm"
        >
          <div className="text-left">
            <div className="font-mono text-[10px] tracking-widest text-red-300">
              {nearest.aircraft.category === "MILITARY" ? "MILITARY" : "UNIDENTIFIED"} WITHIN{" "}
              {ALERT_RADIUS_MILES} MI
            </div>
            <div className="font-mono text-[10px] tracking-wide text-radar-textdim">
              {name} · {miles.toFixed(1)} MI
              {contacts.length > 1 && ` · +${contacts.length - 1} more`}
            </div>
          </div>
          <button
            onClick={onAcknowledge}
            className="shrink-0 rounded-md border border-radar-panelborder px-2 py-1 font-mono text-[10px] tracking-widest text-radar-textdim hover:text-radar-text"
          >
            GOT IT
          </button>
        </div>
      </div>
    </>
  );
}
