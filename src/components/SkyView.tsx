"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, deriveGeometry, feetToMeters } from "../lib/geo";
import { fmtAltitude, fmtMiles } from "../lib/format";
import { useDeviceHeading } from "../hooks/useDeviceHeading";
import { useDevicePitch } from "../hooks/useDevicePitch";
import SilhouetteIcon from "./SilhouetteIcon";

const HALF_HFOV_DEG = 32;
const HALF_VFOV_DEG = 24;
const CENTERED_THRESHOLD_DEG = 4;

type CameraStatus = "idle" | "granted" | "denied" | "unsupported";

function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  useEffect(() => {
    let stream: MediaStream | null = null;
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
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => undefined);
        }
        setStatus("granted");
      })
      .catch(() => setStatus("denied"));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
  onSelect: (id: string) => void;
  onExit: () => void;
  prefs: SkyViewPrefs;
}

export default function SkyView({
  aircraft,
  userPosition,
  userAltitudeMeters,
  selectedAircraftId,
  onSelect,
  onExit,
  prefs,
}: SkyViewProps) {
  const { videoRef, status } = useCameraStream();
  const heading = useDeviceHeading();
  const { pitch } = useDevicePitch();

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-black">
      {status === "granted" ? (
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d2233] via-[#081722] to-[#05080a]" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/10" />

      <div className="pointer-events-none absolute inset-x-0 top-3 text-center font-mono text-[9px] tracking-[0.2em] text-white/50">
        AR DIRECTION GUIDE — NOT AN OPTICAL VIEW
      </div>

      {status !== "granted" && (
        <div className="pointer-events-none absolute inset-x-0 top-9 text-center font-mono text-[10px] text-radar-amber/80">
          {status === "denied"
            ? "Camera unavailable — showing direction only"
            : status === "unsupported"
            ? "Camera not supported — showing direction only"
            : ""}
        </div>
      )}

      {heading.needsCalibration && (
        <div className="pointer-events-none absolute inset-x-4 top-16 rounded-lg bg-black/60 px-4 py-2 text-center font-mono text-[11px] text-white/85">
          Move your device in a small figure-eight to calibrate the compass.
        </div>
      )}

      {(() => {
        let leftCount = 0;
        let rightCount = 0;
        return aircraft.map((a) => {
        const geometry = deriveGeometry(
          userPosition,
          userAltitudeMeters,
          heading.heading ?? 0,
          { latitude: a.latitude, longitude: a.longitude },
          feetToMeters(a.altitude ?? 0)
        );
        const rel = geometry.relativeBearing;
        const selected = a.id === selectedAircraftId;
        const centered = Math.abs(rel) < CENTERED_THRESHOLD_DEG;
        const inFov = Math.abs(rel) <= HALF_HFOV_DEG;

        if (inFov) {
          const xFrac = 0.5 + (rel / HALF_HFOV_DEG) * 0.5;
          const elevDiff = geometry.elevationAngle - (pitch ?? 0);
          const yFrac = Math.max(0.05, Math.min(0.9, 0.5 - (elevDiff / HALF_VFOV_DEG) * 0.5));

          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              style={{ left: `${xFrac * 100}%`, top: `${yFrac * 100}%` }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            >
              <div
                className={clsx(
                  "rounded-full transition-transform",
                  (selected || centered) && "scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.6)]"
                )}
              >
                <SilhouetteIcon type={a.silhouette} military={a.isMilitary} size={selected || centered ? 44 : 30} />
              </div>
              {prefs.arLabelsEnabled && (
                <div className="mt-1 max-w-[140px] rounded bg-black/55 px-1.5 py-0.5 text-center backdrop-blur-sm">
                  <div className="truncate font-mono text-[10px] text-white">
                    {a.callsign ?? a.registration ?? "—"}
                  </div>
                  {centered && <div className="font-mono text-[9px] text-radar-green">CENTERED</div>}
                  {prefs.arDistanceDisplay && (
                    <div className="font-mono text-[8px] text-white/70">
                      {[fmtMiles(geometry.distanceMiles), fmtAltitude(a.altitude)].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        }

        const onRight = rel > 0;
        const edgeIndex = onRight ? rightCount++ : leftCount++;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={{ top: `${38 + edgeIndex * 8}%`, [onRight ? "right" : "left"]: "10px" }}
            className="absolute flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur-sm"
          >
            {onRight ? (
              <>
                {a.callsign ?? ""} {Math.round(Math.abs(rel))}° →
              </>
            ) : (
              <>
                ← {a.callsign ?? ""} {Math.round(Math.abs(rel))}°
              </>
            )}
          </button>
        );
        });
      })()}

      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <button
          onClick={onExit}
          className="rounded-lg border border-radar-panelborder bg-radar-panel/85 px-6 py-2.5 font-mono text-xs tracking-widest text-radar-text backdrop-blur-sm"
        >
          RADAR
        </button>
      </div>

      {heading.permission === "unknown" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-6 text-center">
          <div>
            <p className="mb-4 text-sm text-radar-text">Enable motion &amp; orientation access for Sky View.</p>
            <button
              onClick={heading.requestPermission}
              className="rounded-lg bg-radar-green/90 px-5 py-2 font-mono text-sm text-black"
            >
              ENABLE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
