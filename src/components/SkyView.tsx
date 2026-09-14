"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, deriveGeometry, feetToMeters } from "../lib/geo";
import { categoryLabel, fmtAltitude, fmtMiles, fmtSpeed } from "../lib/format";
import { useDeviceHeading } from "../hooks/useDeviceHeading";
import { useDeviceAttitude } from "../hooks/useDeviceAttitude";
import { turnToward } from "../lib/ar/projection";
import SkyViewCanvas, { SkyMarker } from "./SkyViewCanvas";

/**
 * Sky View: hold the device up, follow the guidance, find the aeroplane.
 *
 * The whole design rests on one decision — **it points at an area, never at
 * a dot.** A tablet compass is several degrees out on a good day, and an
 * airliner has moved a few hundred metres since the position now on screen
 * was measured. A tight marker would be wrong more often than right, and
 * wrong in the most annoying way: confidently. So the app marks a patch of
 * sky, says how far to turn and tilt to bring it into view, and leaves the
 * last step to the eyes — which are far better at it.
 */

/**
 * Typical horizontal field of view for a tablet or phone rear camera.
 * Cameras don't report this, so it is an estimate; the search area is wide
 * enough that a few degrees either way changes nothing in practice.
 */
const CAMERA_FOV_DEG = 63;
/** Within this much of the aim point, the target counts as in view. */
const ON_TARGET_DEG = 12;
/**
 * The opaque top bar — close button, heading badge, and the line reminding
 * you this is an area rather than a spot. The HUD is painted below it, so
 * nothing useful may be drawn inside this band.
 */
const TOP_CHROME_PX = 96;
/** Breathing room at the sides, clear of rounded corners and safe areas. */
const SIDE_CHROME_PX = 16;
/** Used until the target card has been measured. */
const FALLBACK_BOTTOM_CHROME_PX = 150;

type CameraStatus = "idle" | "granted" | "denied" | "unsupported";

function useCameraStream(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let acquired: MediaStream | null = null;
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = s;
        setStream(s);
        setStatus("granted");
      })
      .catch(() => setStatus("denied"));

    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  /**
   * Hand the stream to the <video> only once that element exists.
   *
   * It is rendered conditionally on the camera being granted, so at the
   * moment the permission promise resolves there is still nothing to attach
   * to — doing it there acquires the camera, throws the stream away, and
   * leaves a permanently black "camera view" that looks exactly like a
   * camera that was never granted.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [stream, status]);

  return { videoRef, status };
}

export interface SkyViewPrefs {
  arLabelsEnabled: boolean;
  arDistanceDisplay: boolean;
}

export interface SkyViewProps {
  aircraft: Aircraft[];
  userPosition: LatLon;
  userAltitudeMeters: number;
  selectedAircraftId: string | null;
  /** The range the scope is set to — Sky View fades contacts against it. */
  rangeMiles: number;
  /** null clears the target — Sky View can be flown with nothing chosen. */
  onSelect: (id: string | null) => void;
  onExit: () => void;
  prefs: SkyViewPrefs;
}

/**
 * One axis of the guidance. Rounding is what the user reads, so it also
 * decides the wording: "TURN LEFT 0°" is a direction that isn't one, and
 * asking someone to turn left by nothing is worse than telling them they are
 * already lined up.
 */
function axisInstruction(value: number, positive: string, negative: string, aligned: string): string {
  const magnitude = Math.round(Math.abs(value));
  if (magnitude === 0) return aligned;
  return `${value >= 0 ? positive : negative} ${magnitude}\u00b0`;
}

export default function SkyView({
  aircraft,
  userPosition,
  userAltitudeMeters,
  selectedAircraftId,
  rangeMiles,
  onSelect,
  onExit,
  prefs,
}: SkyViewProps) {
  const heading = useDeviceHeading();
  const attitude = useDeviceAttitude();
  const needsPermission = heading.permission === "unknown";
  const { videoRef, status } = useCameraStream(!needsPermission);
  const markersRef = useRef<SkyMarker[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [bottomChromePx, setBottomChromePx] = useState(FALLBACK_BOTTOM_CHROME_PX);

  // Sorted nearest-first: the aircraft overhead is the one you want.
  const targets = useMemo(() => {
    return [...aircraft]
      .map((a) => ({
        aircraft: a,
        geometry: deriveGeometry(
          userPosition,
          userAltitudeMeters,
          heading.heading ?? 0,
          { latitude: a.latitude, longitude: a.longitude },
          feetToMeters(a.altitude ?? 0)
        ),
      }))
      .sort((x, y) => x.geometry.distanceMiles - y.geometry.distanceMiles);
    // Heading only affects relativeBearing, which the guidance recomputes live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, userPosition, userAltitudeMeters]);

  const selectedIndex = targets.findIndex((t) => t.aircraft.id === selectedAircraftId);
  // No quiet fall back to the nearest aircraft: "nothing chosen" is a state
  // the user can ask for, and pretending something is still selected would
  // leave the card describing an aircraft they had just let go of.
  const target = selectedIndex >= 0 ? targets[selectedIndex] : null;

  /**
   * Opening Sky View with nothing chosen should still be useful, so the
   * nearest aircraft becomes the target — but only once, on the way in.
   * Re-running it every time the selection emptied made letting go of an
   * aircraft impossible: the tap cleared it and the effect immediately chose
   * another.
   */
  const openingPickMade = useRef(false);
  useEffect(() => {
    if (openingPickMade.current) return;
    if (selectedAircraftId) {
      // Arrived with a choice already made on the radar. Leave it alone.
      openingPickMade.current = true;
      return;
    }
    if (targets.length > 0) {
      openingPickMade.current = true;
      onSelect(targets[0].aircraft.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraftId, targets.length]);

  // The card grows and shrinks with the aircraft it describes, so the band it
  // covers is measured rather than assumed.
  useEffect(() => {
    const el = cardRef.current;
    const host = containerRef.current;
    if (!el || !host) {
      setBottomChromePx(FALLBACK_BOTTOM_CHROME_PX);
      return;
    }
    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      setBottomChromePx(Math.round(Math.max(0, hostRect.bottom - rect.top)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(host);
    return () => observer.disconnect();
  }, [target?.aircraft.id, targets.length]);

  const safeInsets = useMemo(
    () => ({
      top: TOP_CHROME_PX,
      right: SIDE_CHROME_PX,
      bottom: bottomChromePx,
      left: SIDE_CHROME_PX,
    }),
    [bottomChromePx]
  );

  const cycle = useCallback(
    (step: number) => {
      if (targets.length === 0) return;
      const from = selectedIndex >= 0 ? selectedIndex : 0;
      const next = (from + step + targets.length) % targets.length;
      onSelect(targets[next].aircraft.id);
    },
    [targets, selectedIndex, onSelect]
  );

  const handleTap = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let best: { id: string; d: number } | null = null;
      for (const m of markersRef.current) {
        const d = Math.hypot(m.x - x, m.y - y);
        if (d <= m.radius && (!best || d < best.d)) best = { id: m.id, d };
      }
      // Tapping empty sky lets the current aircraft go, and so does tapping
      // the one already being followed — the same gesture the radar uses, and
      // the way into looking around with nothing singled out.
      onSelect(!best || best.id === selectedAircraftId ? null : best.id);
    },
    [onSelect, selectedAircraftId]
  );

  // Live guidance for the current target.
  const guidance = useMemo(() => {
    if (!target || heading.heading === null) return null;
    const turn = turnToward(heading.heading, target.geometry.bearing);
    const tilt = target.geometry.elevationAngle - attitude.pitchDeg;
    const onTarget = Math.abs(turn) <= ON_TARGET_DEG && Math.abs(tilt) <= ON_TARGET_DEG;
    return { turn, tilt, onTarget };
  }, [target, heading.heading, attitude.pitchDeg]);

  const liveAircraft = useMemo(() => targets.map((t) => t.aircraft), [targets]);

  return (
    <div ref={containerRef} onClick={handleTap} className="absolute inset-0 z-40 overflow-hidden bg-black">
      {status === "granted" ? (
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          data-testid="skyview-camera"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b2438] via-[#081722] to-[#05080a]" />
      )}
      {/* Just enough to keep the HUD legible against a bright sky, plus a
          little more where the chrome sits — in daylight the camera image is
          close to white, and white-on-white is unreadable. */}
      <div className="pointer-events-none absolute inset-0 bg-black/20" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/75 to-transparent" />

      {heading.heading !== null && (
        <SkyViewCanvas
          aircraft={liveAircraft}
          userPosition={userPosition}
          userAltitudeMeters={userAltitudeMeters}
          attitude={{
            headingDeg: heading.heading,
            pitchDeg: attitude.pitchDeg,
            rollDeg: attitude.rollDeg,
          }}
          fovDeg={CAMERA_FOV_DEG}
          selectedAircraftId={target?.aircraft.id ?? null}
          showLabels={prefs.arLabelsEnabled}
          showDistance={prefs.arDistanceDisplay}
          rangeMiles={rangeMiles}
          safeInsets={safeInsets}
          onMarkers={(m) => {
            markersRef.current = m;
          }}
        />
      )}

      {/* ---------- top chrome ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          aria-label="Close Sky View"
          className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/80 px-3 py-1.5 font-mono text-[11px] tracking-widest text-radar-text backdrop-blur-sm"
        >
          ← RADAR
        </button>

        <div className="rounded-lg border border-radar-panelborder bg-radar-panel/80 px-3 py-1.5 text-center backdrop-blur-sm">
          <div className="font-mono text-sm tracking-widest text-radar-green">
            {heading.heading === null ? "—" : `${Math.round(heading.heading)}°`}
          </div>
          <div className="font-mono text-[8px] tracking-[0.15em] text-radar-textdim">SKY VIEW</div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-16 text-center">
        <span className="rounded bg-black/45 px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] text-white/60">
          SHOWS THE AREA TO SEARCH — NOT THE EXACT SPOT
        </span>
      </div>

      {status !== "granted" && !needsPermission && (
        <div className="pointer-events-none absolute inset-x-0 top-24 text-center font-mono text-[10px] text-radar-amber/90">
          {status === "denied"
            ? "Camera off — guidance still works"
            : status === "unsupported"
              ? "No camera on this device — guidance still works"
              : ""}
        </div>
      )}

      {/*
        Worth saying once, not worth nagging about — the heading may well be
        fine, and the reader can see for themselves whether the sky lines up.
        The container stays transparent to taps so an aircraft behind it can
        still be selected; only the button takes them.
      */}
      {heading.needsCalibration && (
        <div className="pointer-events-none absolute inset-x-6 top-32 z-10 flex items-center justify-center gap-3 rounded-lg bg-black/70 px-4 py-2 font-mono text-[10px] text-white/85">
          <span>Compass may be off — a figure-eight usually settles it.</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              heading.acknowledgeCalibration();
            }}
            aria-label="Dismiss compass notice"
            className="pointer-events-auto shrink-0 rounded border border-white/25 px-2 py-0.5 tracking-widest text-white/70 hover:text-white"
          >
            GOT IT
          </button>
        </div>
      )}

      {/* ---------- the target ---------- */}
      {target && (
        <div
          ref={cardRef}
          data-testid="skyview-card"
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-3 bottom-3 z-10"
        >
          <div className="rounded-xl border border-radar-panelborder bg-radar-panel/92 p-3 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cycle(-1);
                }}
                aria-label="Previous aircraft"
                disabled={targets.length < 2}
                className="shrink-0 rounded-lg border border-radar-panelborder px-2.5 py-2 font-mono text-xs text-radar-textdim disabled:opacity-30"
              >
                ‹
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm font-semibold text-radar-text">
                    {target.aircraft.callsign ??
                      target.aircraft.registration ??
                      target.aircraft.id.toUpperCase()}
                  </span>
                  {target.aircraft.isMilitary && (
                    <span className="rounded border border-radar-mil/40 px-1 py-0.5 font-mono text-[8px] tracking-widest text-radar-mil">
                      MIL
                    </span>
                  )}
                  <span className="font-mono text-[9px] tracking-widest text-radar-textdim">
                    {selectedIndex >= 0 ? selectedIndex + 1 : 1}/{targets.length}
                  </span>
                </div>

                {(target.aircraft.airline ?? target.aircraft.operator) && (
                  <div className="truncate text-xs text-radar-text">
                    {target.aircraft.airline ?? target.aircraft.operator}
                  </div>
                )}
                <div className="truncate font-mono text-[9px] tracking-widest text-radar-textdim">
                  {target.aircraft.aircraftModel ?? categoryLabel(target.aircraft.category)}
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-radar-textdim">
                  <span>{fmtAltitude(target.aircraft.altitude) ?? "ALT —"}</span>
                  <span>{fmtSpeed(target.aircraft.groundSpeed) ?? "SPD —"}</span>
                  <span>{fmtMiles(target.geometry.distanceMiles)}</span>
                  <span>{Math.round(target.geometry.elevationAngle)}° up</span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cycle(1);
                }}
                aria-label="Next aircraft"
                disabled={targets.length < 2}
                className="shrink-0 rounded-lg border border-radar-panelborder px-2.5 py-2 font-mono text-xs text-radar-textdim disabled:opacity-30"
              >
                ›
              </button>
            </div>

            <div
              data-testid="skyview-guidance"
              className={clsx(
                "mt-2.5 flex items-center justify-center gap-4 rounded-lg px-3 py-2 font-mono text-xs tracking-widest",
                guidance?.onTarget
                  ? "bg-radar-green/15 text-radar-green"
                  : "bg-black/35 text-radar-text"
              )}
            >
              {!guidance ? (
                <span className="text-radar-amber">WAITING FOR COMPASS</span>
              ) : guidance.onTarget ? (
                <span>IN VIEW — LOOK INSIDE THE CIRCLE</span>
              ) : Math.abs(guidance.turn) > 150 ? (
                <span>TURN AROUND — IT&rsquo;S BEHIND YOU</span>
              ) : (
                <>
                  <span>
                    {axisInstruction(guidance.turn, "TURN RIGHT", "TURN LEFT", "ON BEARING")}
                  </span>
                  <span className="text-radar-textdim">·</span>
                  <span>
                    {axisInstruction(guidance.tilt, "LOOK UP", "LOOK DOWN", "ON ELEVATION")}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        Nothing chosen, but there is traffic up there. The card's whole band
        is given back to the sky — that is the point of looking around — and
        the one line left says how to start following something again.
        Measured like the card so the HUD knows how much room it just gained.
      */}
      {!target && targets.length > 0 && (
        <div ref={cardRef} className="absolute inset-x-3 bottom-3 z-10">
          <div
            data-testid="skyview-exploring"
            className="rounded-xl border border-radar-panelborder bg-radar-panel/92 px-4 py-3 text-center font-mono text-[11px] tracking-widest text-radar-textdim backdrop-blur-md"
          >
            LOOKING AROUND — TAP AN AIRCRAFT TO FOLLOW IT
          </div>
        </div>
      )}

      {targets.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
          <div className="font-mono text-[11px] tracking-[0.25em] text-radar-textdim">CLEAR SKY</div>
          <div className="mt-1 font-mono text-[10px] text-radar-textdim/70">
            Nothing in range to point you at
          </div>
        </div>
      )}

      {needsPermission && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-6 text-center"
        >
          <div className="max-w-xs">
            <div className="mb-2 font-mono text-sm tracking-widest text-radar-text">SKY VIEW</div>
            <p className="mb-5 text-sm text-radar-textdim">
              Sky View needs the compass to know which way you&rsquo;re facing, and the camera to
              show you the sky behind the guidance.
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void heading.requestPermission();
              }}
              className="w-full rounded-xl bg-radar-green/90 px-4 py-3 text-black"
            >
              <span className="block font-mono text-sm font-semibold tracking-[0.12em]">
                ENABLE SENSORS
              </span>
              <span className="mt-0.5 block font-mono text-[10px] text-black/65">
                Compass and camera
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExit();
              }}
              className="mt-3 font-mono text-[11px] text-radar-textdim underline decoration-dotted"
            >
              Back to radar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
