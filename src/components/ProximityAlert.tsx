"use client";

import clsx from "clsx";
import { ProximityContact, ALERT_RADIUS_MILES } from "../hooks/useProximityAlert";
import { AlertTone, CATEGORY_LABELS } from "../lib/aircraft/categories";
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
 * the category and how far out it is, because a red screen that does not say
 * why is just alarming.
 *
 * Colour carries the rest. Red is kept for military and unidentified traffic;
 * everything else you asked to be told about arrives in green. If every alarm
 * were red the colour would only mean "an alarm", and the one that matters
 * would look like all the others.
 */
export default function ProximityAlert({
  contacts,
  tone,
  onAcknowledge,
}: {
  contacts: ProximityContact[];
  tone: AlertTone;
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
        className={clsx(
          "proximity-alert pointer-events-none absolute inset-0 z-40",
          tone === "red" ? "proximity-alert--red" : "proximity-alert--green"
        )}
        aria-hidden
        data-testid="proximity-vignette"
        data-tone={tone}
      />

      <div
        className="pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 justify-center px-3"
        style={{ top: "calc(var(--chrome-top, 0.75rem) + 2.75rem)" }}
      >
        <div
          role="alert"
          data-testid="proximity-banner"
          data-tone={tone}
          className={clsx(
            "animate-card-in pointer-events-auto flex items-center gap-3 rounded-lg border bg-radar-panel/90 px-3 py-1.5 backdrop-blur-sm",
            tone === "red" ? "border-red-400/50" : "border-radar-green/50"
          )}
        >
          <div className="text-left">
            <div
              className={clsx(
                "font-mono text-[10px] tracking-widest",
                tone === "red" ? "text-red-300" : "text-radar-green"
              )}
            >
              {CATEGORY_LABELS[nearest.aircraft.category].alert} WITHIN{" "}
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
