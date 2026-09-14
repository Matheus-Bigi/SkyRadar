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

/** Where a contact crosses the frame, given which edge it comes in from. */
function edgeEntry(edge: number, along: number, margin: number) {
  return [
    { x: along, y: -margin, base: 180 },
    { x: 1 + margin, y: along, base: 270 },
    { x: along, y: 1 + margin, base: 0 },
    { x: -margin, y: along, base: 90 },
  ][edge];
}

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
    weight: 3,
  },
  {
    silhouette: "REGIONAL_JET",
    speed: 0.048,
    size: 12,
    altitudeFt: 28000,
    knots: 404,
    callsign: () => `SKR${digits(4)}`,
    weight: 2,
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

/**
 * These count what can actually be *seen*, not what exists.
 *
 * Capping the raw number aloft was the mistake: on a narrow screen the
 * content covers most of the width, so the pool filled with contacts stuck
 * in the dimmed middle, the cap was reached, and nothing new could spawn —
 * the backdrop went empty on a phone while nine aircraft were technically
 * in the air. Budgeting by visibility instead lets a crowded screen hold
 * more and an open one hold fewer, which is the behaviour actually wanted.
 */
const MIN_VISIBLE = 4;
/**
 * A phone's content block covers most of its width, leaving only bands above
 * and below. Insisting on four there would stack them into those bands and
 * crowd a small screen, so the floor comes down rather than the layout
 * getting worse.
 */
const MIN_VISIBLE_COMPACT = 3;
const COMPACT_EDGE_PX = 500;
const MAX_VISIBLE = 7;
/** Absolute pool limit, purely to bound the per-frame work. */
const HARD_CAP = 18;
/**
 * What counts as visible when budgeting.
 *
 * Silhouettes are drawn at 72% of a contact's opacity, so a contact at 0.2
 * reaches the screen at barely a tenth — present in the model, invisible to
 * a person. Counting those as visible was why the top-up kept deciding the
 * screen was full while it plainly wasn't. This is the opacity at which a
 * contact actually reads.
 */
const VISIBLE_ALPHA = 0.6;

const TRAIL_POINTS = 20;
const TRAIL_SAMPLE_MS = 140;
const FADE_MS = 900;

/** The area the page's own content occupies, in CSS pixels. */
export interface ClearZone {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
}

/** Breathing room kept around the content before traffic reaches full strength. */
const CLEAR_PADDING = 14;
const CLEAR_FALLOFF = 0.28;

/**
 * How visible an aircraft may be at a given point on screen.
 *
 * Everything keeps clear of the mark, the buttons and the byline by dimming
 * as it approaches them, rather than by painting a dark pool over the top.
 * A pool was the obvious approach and it was wrong twice over: it swallowed
 * the traffic, and at these near-black values the gradient banded into
 * visible rings. Fading each contact leaves the background perfectly flat.
 *
 * The zone is measured from the content element itself rather than guessed
 * at in pixels. Guessing meant a radius that was reasonable on a tablet was
 * wider than a phone screen, so on a phone every contact was dimmed
 * everywhere and the backdrop went completely empty.
 */
function clearance(
  px: number,
  py: number,
  height: number,
  zone: ClearZone | null
): number {
  let centre = 1;
  if (zone && zone.halfWidth > 0 && zone.halfHeight > 0) {
    const dx = (px - zone.centerX) / (zone.halfWidth + CLEAR_PADDING);
    const dy = (py - zone.centerY) / (zone.halfHeight + CLEAR_PADDING);
    const d = Math.sqrt(dx * dx + dy * dy);
    centre = Math.max(0, Math.min(1, (d - 1) / CLEAR_FALLOFF));
  }

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
  /** Last frame's computed opacity — what the top-up logic counts. */
  alpha: number;
}

function spawn(
  now: number,
  aloft: Contact[],
  width: number,
  height: number,
  zone: ClearZone | null
): Contact {
  // Keep the mix varied: prefer a kind that isn't already up there.
  const absent = KINDS.filter(
    (k) => aloft.filter((c) => c.kind.silhouette === k.silhouette).length < k.weight
  );
  const kind = pick(absent.length > 0 ? absent : KINDS);

  // Enter from just off one edge, heading broadly across the screen — with
  // enough spread that no two crossings look alike.
  //
  // Just outside the frame. A deep margin meant a contact spent many seconds
  // alive but invisible before it arrived, holding a slot in a pool that is
  // deliberately small — so the screen kept running emptier than the count.
  const margin = 0.06;
  const edge = Math.floor(Math.random() * 4);

  // Pick where along that edge it enters, preferring somewhere it will
  // actually be seen. On a narrow screen the content spans most of the
  // width, so an arrival at mid-height spends its whole crossing dimmed —
  // which is how a phone ended up with contacts in the air and an empty
  // looking screen.
  let along = 0.1 + Math.random() * 0.8;
  let entry = edgeEntry(edge, along, margin);
  for (let attempt = 0; attempt < 12; attempt++) {
    const probe = {
      x: Math.min(0.95, Math.max(0.05, entry.x)),
      y: Math.min(0.95, Math.max(0.05, entry.y)),
    };
    if (clearance(probe.x * width, probe.y * height, height, zone) > 0.8) break;
    along = 0.1 + Math.random() * 0.8;
    entry = edgeEntry(edge, along, margin);
  }

  // Don't arrive on top of someone already there — two contacts in the same
  // patch print their labels through each other and the screen looks untidy
  // rather than sparse.
  const crowded = aloft.some(
    (c) => Math.abs(c.x - entry.x) < 0.2 && Math.abs(c.y - entry.y) < 0.2
  );
  if (crowded) {
    const shift = Math.random() < 0.5 ? -0.34 : 0.34;
    if (edge === 0 || edge === 2) entry.x = Math.min(0.94, Math.max(0.06, entry.x + shift));
    else entry.y = Math.min(0.94, Math.max(0.06, entry.y + shift));
  }

  return {
    kind,
    x: entry.x,
    y: entry.y,
    headingDeg: entry.base + (Math.random() * 70 - 35),
    callsign: kind.callsign(),
    trail: [],
    lastSampleAt: now,
    bornAt: now,
    alpha: 0,
    military:
      kind.silhouette === "FIGHTER" || kind.silhouette === "MILITARY_TRANSPORT",
  };
}

export default function AmbientTraffic({ clearZone = null }: { clearZone?: ClearZone | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Held in a ref so the zone can move with a resize without tearing down
  // and restarting the whole animation.
  const zoneRef = useRef<ClearZone | null>(clearZone);
  zoneRef.current = clearZone;

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

    /**
     * Lay out the opening arrangement.
     *
     * Deferred until the content has been measured. Running it immediately
     * meant the clear zone was still unknown, every position looked free,
     * and on a narrow screen most of the opening contacts were dropped right
     * where the logo was about to be — invisible from the first frame.
     */
    let openingPlaced = false;
    const placeOpening = (now: number) => {
      openingPlaced = true;
      const opening = reduceMotion ? MAX_VISIBLE : MIN_VISIBLE + 2;
      for (let i = 0; i < opening; i++) {
        const c = spawn(now - FADE_MS, aloft, width, height, zoneRef.current);
        for (let attempt = 0; attempt < 32; attempt++) {
          c.x = 0.08 + Math.random() * 0.84;
          c.y = 0.08 + Math.random() * 0.84;
          if (clearance(c.x * width, c.y * height, height, zoneRef.current) > 0.85) break;
        }
        aloft.push(c);
      }
    };

    let raf = 0;
    let last = now0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      // Wait for the measurement, but never longer than a moment.
      if (!openingPlaced && (zoneRef.current !== null || now - now0 > 400)) {
        placeOpening(now);
      }

      if (!reduceMotion && aloft.length < HARD_CAP) {
        // Contacts still fading in count towards the floor, so a gap is
        // filled at once without summoning a crowd that all arrives together
        // — but only partly, because a budget satisfied entirely by aircraft
        // that haven't appeared yet still leaves the screen looking empty
        // for the length of the fade.
        const floor =
          Math.min(width, height) < COMPACT_EDGE_PX ? MIN_VISIBLE_COMPACT : MIN_VISIBLE;
        let heading = 0;
        for (const c of aloft) {
          if (c.alpha > VISIBLE_ALPHA) heading += 1;
          else if (now - c.bornAt < FADE_MS * 1.6) heading += 0.6;
        }
        // No random trickle on top: the floor alone regulates this. Adding a
        // steady drip as well pushed a wide screen up to nine at once, which
        // reads as busy rather than alive.
        if (heading < floor) {
          aloft.push(spawn(now, aloft, width, height, zoneRef.current));
        }
      }

      for (let i = aloft.length - 1; i >= 0; i--) {
        const c = aloft[i];
        if (!reduceMotion) {
          const rad = ((c.headingDeg - 90) * Math.PI) / 180;
          c.x += Math.cos(rad) * c.kind.speed * dt;
          c.y += Math.sin(rad) * c.kind.speed * dt * (width / Math.max(1, height));
        }

        // Retire it as soon as it is past the visible band, rather than
        // tracking it far off-frame where it can only occupy a slot.
        if (c.x < -0.08 || c.x > 1.08 || c.y < -0.08 || c.y > 1.08) {
          c.alpha = 0;
          aloft.splice(i, 1);
          continue;
        }

        if (now - c.lastSampleAt > TRAIL_SAMPLE_MS) {
          c.trail.push({ x: c.x, y: c.y });
          if (c.trail.length > TRAIL_POINTS) c.trail.shift();
          c.lastSampleAt = now;
        }

        // Fade in on arrival, and out again as it nears the edge, so nothing
        // ever pops into or out of existence. Gone well before it reaches the
        // frame: a contact still bright at the very edge had its label sliced
        // in half by it.
        const age = now - c.bornAt;
        const edgeDistance = Math.min(c.x, 1 - c.x, c.y, 1 - c.y);
        const fadeIn = Math.min(1, age / FADE_MS);
        const fadeOut = Math.max(0, Math.min(1, (edgeDistance - 0.02) / 0.08));
        const px = c.x * width;
        const py = c.y * height;
        const alpha = fadeIn * fadeOut * clearance(px, py, height, zoneRef.current);
        c.alpha = alpha;
        if (alpha <= 0.01) continue;

        // The radar's own trail falloff, at a quieter level.
        ctx.save();
        for (let t = 1; t < c.trail.length; t++) {
          const ax = c.trail[t].x * width;
          const ay = c.trail[t].y * height;
          // Each segment is faded where it lies, so a track can't streak
          // across the wordmark just because its aircraft is clear of it.
          const a =
            (t / c.trail.length) * 0.34 * fadeIn * fadeOut * clearance(ax, ay, height, zoneRef.current);
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
