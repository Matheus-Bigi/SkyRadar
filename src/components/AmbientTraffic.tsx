"use client";

import { useEffect, useRef } from "react";
import { SilhouetteType } from "../lib/aircraft/types";
import { drawSilhouette } from "../lib/render/silhouettes";
import { fmtAltitude, fmtSpeed } from "../lib/format";
import { THEME } from "../lib/render/theme";

/**
 * The entry screen's moving backdrop: aircraft crossing the dark, each
 * trailing a fading track and carrying a callsign, an altitude and a speed.
 *
 * It is drawn with the radar's own parts — the same silhouette sprites, the
 * same trail falloff, the same label treatment and the same green — so the
 * first thing anyone sees is the instrument itself rather than a splash
 * screen bolted onto one. A fighter crosses in seconds; a helicopter takes
 * most of a minute. That spread is the point: it shows, before a single
 * permission is granted, that this app knows the difference.
 *
 * **Nothing here is real.** These are invented aircraft on a decorative
 * canvas, shown only on the entry screen, before any location is known and
 * where no radar exists to confuse them with. They can never appear on the
 * scope — that surface draws only from live ADS-B.
 */

interface Kind {
  silhouette: SilhouetteType;
  /** Screen widths crossed per second — a fighter really is faster. */
  speed: number;
  size: number;
  altitudeFt: number;
  knots: number;
  callsign: () => string;
  /** How many of this kind may be aloft at once. */
  weight: number;
}

const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * Callsigns are deliberately invented. SKR is not an assigned ICAO
 * designator, and the military-style ones are generic — nothing here should
 * read as a real operator's flight.
 */
const KINDS: Kind[] = [
  {
    silhouette: "JET_AIRLINER",
    speed: 0.055,
    size: 15,
    altitudeFt: 35000,
    knots: 462,
    callsign: () => `SKR${digits(3)}`,
    weight: 2,
  },
  {
    silhouette: "REGIONAL_JET",
    speed: 0.048,
    size: 12,
    altitudeFt: 28000,
    knots: 404,
    callsign: () => `SKR${digits(4)}`,
    weight: 1,
  },
  {
    silhouette: "TURBOPROP",
    speed: 0.032,
    size: 11,
    altitudeFt: 14500,
    knots: 268,
    callsign: () => `N${digits(3)}${pick(["AK", "TJ", "QX", "BV"])}`,
    weight: 1,
  },
  {
    silhouette: "GENERAL_AVIATION",
    speed: 0.022,
    size: 9,
    altitudeFt: 4500,
    knots: 124,
    callsign: () => `N${digits(3)}${pick(["LF", "HC", "SP", "MR"])}`,
    weight: 1,
  },
  {
    silhouette: "HELICOPTER",
    speed: 0.014,
    size: 10,
    altitudeFt: 1200,
    knots: 92,
    callsign: () => `N${digits(3)}${pick(["HX", "AM", "PD"])}`,
    weight: 1,
  },
  {
    silhouette: "FIGHTER",
    speed: 0.135,
    size: 10,
    altitudeFt: 41000,
    knots: 548,
    callsign: () => `${pick(["TALON", "SABRE", "VIPER"])}${digits(2)}`,
    weight: 1,
  },
  {
    silhouette: "MILITARY_TRANSPORT",
    speed: 0.04,
    size: 14,
    altitudeFt: 24000,
    knots: 332,
    callsign: () => `${pick(["ANVIL", "ATLAS"])}${digits(2)}`,
    weight: 1,
  },
];

/** Sparse on purpose: the scope is the subject, not the traffic over it. */
const MAX_ALOFT = 6;
const TRAIL_POINTS = 20;
const TRAIL_SAMPLE_MS = 140;
const FADE_MS = 1400;

/**
 * How visible an aircraft may be at a given point on screen.
 *
 * Everything keeps clear of the mark, the buttons and the byline by dimming
 * as it approaches them, rather than by painting a dark pool over the top.
 * A pool was the obvious approach and it was wrong twice over: it swallowed
 * the traffic, and at these near-black values the gradient banded into
 * visible rings. Fading each contact leaves the background perfectly flat.
 */
function clearance(px: number, py: number, width: number, height: number): number {
  // Elliptical, because the content block is wider than it is tall.
  const dx = (px - width / 2) / Math.min(240, width * 0.42);
  const dy = (py - height / 2) / Math.min(210, height * 0.34);
  const d = Math.sqrt(dx * dx + dy * dy);
  const centre = Math.max(0, Math.min(1, (d - 1) / 0.55));

  // And a clean strip along the bottom, where the byline sits.
  const fromFloor = height - py;
  const floor = Math.max(0, Math.min(1, (fromFloor - 40) / 55));

  return Math.min(centre, floor);
}

interface Contact {
  kind: Kind;
  /** Position in normalized screen space, so it survives a resize. */
  x: number;
  y: number;
  headingDeg: number;
  callsign: string;
  trail: Array<{ x: number; y: number }>;
  lastSampleAt: number;
  bornAt: number;
  military: boolean;
}

function spawn(now: number, aloft: Contact[]): Contact {
  // Keep the mix varied: prefer a kind that isn't already up there.
  const absent = KINDS.filter(
    (k) => aloft.filter((c) => c.kind.silhouette === k.silhouette).length < k.weight
  );
  const kind = pick(absent.length > 0 ? absent : KINDS);

  // Enter from just off one edge, heading broadly across the screen — with
  // enough spread that no two crossings look alike.
  const edge = Math.floor(Math.random() * 4);
  const along = 0.1 + Math.random() * 0.8;
  const margin = 0.12;
  const entry = [
    { x: along, y: -margin, base: 180 },
    { x: 1 + margin, y: along, base: 270 },
    { x: along, y: 1 + margin, base: 0 },
    { x: -margin, y: along, base: 90 },
  ][edge];

  return {
    kind,
    x: entry.x,
    y: entry.y,
    headingDeg: entry.base + (Math.random() * 70 - 35),
    callsign: kind.callsign(),
    trail: [],
    lastSampleAt: now,
    bornAt: now,
    military:
      kind.silhouette === "FIGHTER" || kind.silhouette === "MILITARY_TRANSPORT",
  };
}

export default function AmbientTraffic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const now0 = performance.now();
    const aloft: Contact[] = [];
    // Start mid-crossing rather than empty, so the screen is already alive.
    // With motion off nothing ever arrives, so the opening arrangement is the
    // whole composition — lay out a fuller one and leave it be.
    const opening = reduceMotion ? MAX_ALOFT : 3;
    for (let i = 0; i < opening; i++) {
      const c = spawn(now0 - FADE_MS, aloft);
      c.x = 0.12 + Math.random() * 0.76;
      c.y = 0.12 + Math.random() * 0.76;
      aloft.push(c);
    }

    let raf = 0;
    let last = now0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      if (!reduceMotion && aloft.length < MAX_ALOFT && Math.random() < dt * 0.9) {
        aloft.push(spawn(now, aloft));
      }

      for (let i = aloft.length - 1; i >= 0; i--) {
        const c = aloft[i];
        if (!reduceMotion) {
          const rad = ((c.headingDeg - 90) * Math.PI) / 180;
          c.x += Math.cos(rad) * c.kind.speed * dt;
          c.y += Math.sin(rad) * c.kind.speed * dt * (width / Math.max(1, height));
        }

        // Well clear of every edge — retire it and let something new come.
        if (c.x < -0.25 || c.x > 1.25 || c.y < -0.25 || c.y > 1.25) {
          aloft.splice(i, 1);
          continue;
        }

        if (now - c.lastSampleAt > TRAIL_SAMPLE_MS) {
          c.trail.push({ x: c.x, y: c.y });
          if (c.trail.length > TRAIL_POINTS) c.trail.shift();
          c.lastSampleAt = now;
        }

        // Fade in on arrival, and out again as it nears the edge, so nothing
        // ever pops into or out of existence.
        const age = now - c.bornAt;
        const edgeDistance = Math.min(c.x, 1 - c.x, c.y, 1 - c.y);
        const fadeIn = Math.min(1, age / FADE_MS);
        const fadeOut = Math.max(0, Math.min(1, (edgeDistance + 0.12) / 0.16));
        const px = c.x * width;
        const py = c.y * height;
        const alpha = fadeIn * fadeOut * clearance(px, py, width, height);
        if (alpha <= 0.01) continue;

        // The radar's own trail falloff, at a quieter level.
        ctx.save();
        for (let t = 1; t < c.trail.length; t++) {
          const ax = c.trail[t].x * width;
          const ay = c.trail[t].y * height;
          // Each segment is faded where it lies, so a track can't streak
          // across the wordmark just because its aircraft is clear of it.
          const a =
            (t / c.trail.length) * 0.34 * fadeIn * fadeOut * clearance(ax, ay, width, height);
          if (a <= 0.004) continue;
          ctx.beginPath();
          ctx.moveTo(c.trail[t - 1].x * width, c.trail[t - 1].y * height);
          ctx.lineTo(ax, ay);
          ctx.strokeStyle = `rgba(51,255,153,${a.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha * 0.72;
        drawSilhouette(ctx, c.kind.silhouette, px, py, c.headingDeg, c.kind.size, {
          fill: c.military ? THEME.military : THEME.aircraftDim,
          stroke: c.military ? THEME.militaryAccent : THEME.aircraftStroke,
          lineWidth: 0,
        });
        ctx.restore();

        // Callsign over altitude and speed — the scope's exact label stack.
        ctx.save();
        ctx.globalAlpha = alpha * 0.55;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = THEME.labelDim;
        ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
        ctx.fillText(c.callsign, px, py - c.kind.size - 9);
        ctx.font = "8px ui-monospace, SFMono-Regular, monospace";
        ctx.fillText(
          [fmtAltitude(c.kind.altitudeFt), fmtSpeed(c.kind.knots)].filter(Boolean).join("  "),
          px,
          py - c.kind.size - 1
        );
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
