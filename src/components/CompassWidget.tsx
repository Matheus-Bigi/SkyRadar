"use client";

import { useEffect, useRef } from "react";

export interface CompassWidgetProps {
  heading: number | null;
  compact?: boolean;
}

/**
 * Small always-visible compass (spec #17). Heading updates arrive quite
 * frequently from the device orientation sensor, so the needle rotation is
 * applied directly to the DOM via a ref instead of React state, keeping
 * re-renders out of the hot path.
 */
export default function CompassWidget({ heading, compact }: CompassWidgetProps) {
  const needleRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (needleRef.current) {
      needleRef.current.style.transform = `rotate(${-(heading ?? 0)}deg)`;
    }
    if (readoutRef.current) {
      readoutRef.current.textContent = heading !== null ? `${Math.round(heading)}°` : "--°";
    }
  }, [heading]);

  const size = compact ? 40 : 52;

  // Dial and readout are stacked in normal flow. An earlier version absolutely
  // positioned the readout, which escaped this component entirely (the widget
  // wasn't a positioned ancestor) and landed on top of the controls below it.
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      role="img"
      aria-label={heading !== null ? `Heading ${Math.round(heading)} degrees` : "Compass heading unavailable"}
    >
      <div
        className="flex items-center justify-center rounded-full border border-radar-panelborder bg-radar-panel/70 backdrop-blur-sm"
        style={{ width: size, height: size }}
      >
        <div className="relative" style={{ width: size - 10, height: size - 10 }}>
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] font-mono text-radar-textdim">
            N
          </span>
          <div ref={needleRef} className="absolute inset-0 origin-center transition-none">
            <svg viewBox="0 0 40 40" className="h-full w-full">
              <line x1="20" y1="20" x2="20" y2="4" stroke="#33ff99" strokeWidth="2" strokeLinecap="round" />
              <line x1="20" y1="20" x2="20" y2="32" stroke="#5f8478" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="2" fill="#33ff99" />
            </svg>
          </div>
        </div>
      </div>
      {!compact && (
        <span ref={readoutRef} className="font-mono text-[9px] leading-none text-radar-textdim">
          --°
        </span>
      )}
    </div>
  );
}
