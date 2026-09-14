"use client";

import { useEffect, useRef } from "react";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, deriveGeometry, feetToMeters, toRad } from "../lib/geo";
import { fmtAltitude, fmtMiles, fmtSpeed } from "../lib/format";
import { Attitude, apparentTrackDeg, projectSky, searchRadiusDeg } from "../lib/ar/projection";
import { LabelDetail, contactAlpha, contactScale, depthProminence, labelDetailFor } from "../lib/ar/depth";
import { drawSilhouette } from "../lib/render/silhouettes";
import { THEME } from "../lib/render/theme";

/**
 * The head-up display drawn over the camera.
 *
 * A pitch ladder and a horizon, because that is what an aviation instrument
 * looks like and this app is one — but the substance is the *search area*
 * around each aircraft rather than a marker on it. A tight reticle would
 * claim a precision nobody has: a tablet compass is several degrees out, and
 * a 450-knot aircraft has moved a couple of hundred metres since its last
 * position arrived. Pointing someone at a patch of sky and letting their
 * eyes do the rest is both honest and, in practice, how you actually find an
 * aeroplane.
 */

export interface SkyMarker {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SkyViewCanvasProps {
  aircraft: Aircraft[];
  userPosition: LatLon;
  userAltitudeMeters: number;
  attitude: Attitude;
  /** Camera horizontal field of view, degrees. */
  fovDeg: number;
  selectedAircraftId: string | null;
  showLabels: boolean;
  showDistance: boolean;
  /** The range the scope is set to, in miles — the scale the fade works on. */
  rangeMiles: number;
  /**
   * Where the opaque chrome sits. The HUD is painted underneath the top bar
   * and the target card, so an arrow placed in those bands is an arrow
   * nobody sees — and the "it's below you" case is exactly the one that
   * landed behind the card.
   */
  safeInsets: SafeInsets;
  onMarkers: (markers: SkyMarker[]) => void;
}

const LADDER_STEPS = [-30, -15, 0, 15, 30, 45, 60, 75];
const CARDINALS: [number, string][] = [
  [0, "N"], [45, "NE"], [90, "E"], [135, "SE"],
  [180, "S"], [225, "SW"], [270, "W"], [315, "NW"],
];

export default function SkyViewCanvas({
  aircraft,
  userPosition,
  userAltitudeMeters,
  attitude,
  fovDeg,
  selectedAircraftId,
  showLabels,
  showDistance,
  rangeMiles,
  safeInsets,
  onMarkers,
}: SkyViewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * The last direction each contact was seen to be travelling. An aircraft
   * coming straight at you barely moves across the view, so there is nothing
   * to read a direction from; holding the last one it had keeps the icon
   * still instead of letting it spin on noise.
   */
  const lastTrackRef = useRef<Map<string, number>>(new Map());

  // Live values read inside the animation loop, so a stream of orientation
  // events never forces a React render.
  const stateRef = useRef({
    aircraft,
    userPosition,
    userAltitudeMeters,
    attitude,
    fovDeg,
    selectedAircraftId,
    showLabels,
    showDistance,
    rangeMiles,
    safeInsets,
    onMarkers,
  });
  stateRef.current = {
    aircraft,
    userPosition,
    userAltitudeMeters,
    attitude,
    fovDeg,
    selectedAircraftId,
    showLabels,
    showDistance,
    rangeMiles,
    safeInsets,
    onMarkers,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    let raf = 0;
    const frame = () => {
      const s = stateRef.current;
      const viewport = { width, height, horizontalFovDeg: s.fovDeg };
      const focal = width / 2 / Math.tan(toRad(s.fovDeg / 2));
      ctx.clearRect(0, 0, width, height);

      // Everything on this HUD is drawn over a live camera image of the sky,
      // which in daylight is close to white. A dark halo under each stroke
      // and glyph is what keeps it readable without dimming the view itself.
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 4;

      drawHorizonAndLadder(ctx, s.attitude, viewport, focal, s.safeInsets);

      const markers: SkyMarker[] = [];
      const now = Date.now();
      const visible: VisibleContact[] = [];

      for (const a of s.aircraft) {
        const geometry = deriveGeometry(
          s.userPosition,
          s.userAltitudeMeters,
          s.attitude.headingDeg,
          { latitude: a.latitude, longitude: a.longitude },
          feetToMeters(a.altitude ?? 0)
        );

        const projected = projectSky(
          { azimuthDeg: geometry.bearing, elevationDeg: geometry.elevationAngle },
          s.attitude,
          viewport
        );

        const spreadDeg = searchRadiusDeg({
          distanceMeters: geometry.distanceMeters,
          groundSpeedKt: a.groundSpeed,
          dataAgeMs: now - a.lastUpdated,
        });
        const radius = Math.max(26, focal * Math.tan(toRad(spreadDeg)));
        const selected = a.id === s.selectedAircraftId;

        if (projected.behind) {
          if (selected) {
            drawOffScreenCue(ctx, width, height, s.safeInsets, projected, geometry.relativeBearing, a);
          }
          continue;
        }

        // Measured against the clear band rather than the raw canvas: a
        // circle whose every pixel falls under the target card is not on
        // screen in any sense the user cares about, and an arrow serves them
        // far better than a marker they cannot see.
        const inset = s.safeInsets;
        const outside =
          projected.x < inset.left - radius ||
          projected.x > width - inset.right + radius ||
          projected.y < inset.top - radius ||
          projected.y > height - inset.bottom + radius;
        if (outside) {
          if (selected) {
            drawOffScreenCue(ctx, width, height, inset, projected, geometry.relativeBearing, a);
          }
          continue;
        }

        markers.push({ id: a.id, x: projected.x, y: projected.y, radius });

        const seenTrack = apparentTrackDeg(
          { azimuthDeg: geometry.bearing, elevationDeg: geometry.elevationAngle },
          geometry.distanceMeters,
          {
            trackDeg: a.heading,
            groundSpeedKt: a.groundSpeed,
            verticalSpeedFpm: a.verticalSpeed,
          },
          s.attitude,
          viewport
        );
        if (seenTrack !== null) lastTrackRef.current.set(a.id, seenTrack);
        // Nose-up only when nothing is known — no track reported, or an
        // aircraft coming straight at you that has never crossed the view.
        const drawnTrack = seenTrack ?? lastTrackRef.current.get(a.id) ?? 0;
        visible.push({
          aircraft: a,
          x: projected.x,
          y: projected.y,
          radius,
          distanceMiles: geometry.distanceMiles,
          selected,
          prominence: depthProminence(geometry.distanceMiles, s.rangeMiles),
          trackDeg: drawnTrack,
        });
      }

      // The ring belongs behind everything: it marks where to look, and an
      // aircraft is never worth hiding under it. Only the target gets one —
      // half a dozen overlapping dashed circles say nothing except "somewhere
      // in here", and bury the one area the user is being sent to.
      const target = visible.find((c) => c.selected);
      if (target) drawSearchArea(ctx, target.x, target.y, target.radius);

      // Furthest first, so a nearer aircraft always sits on top of a distant
      // one rather than the other way about. Drawing in the order the list
      // happens to arrive in put the far ones on top, which is exactly
      // backwards for reading depth.
      const byDepth = [...visible].sort((a, b) => b.distanceMiles - a.distanceMiles);
      for (const c of byDepth) {
        drawContact(ctx, c.x, c.y, c.aircraft, c.selected, c.trackDeg, c.prominence);
      }

      // Labels last, and only once every silhouette is down: on a busy
      // afternoon half a dozen aircraft sit within a few degrees of each
      // other, and three boxes stacked on the same patch of sky are less
      // readable than one. The target you chose is placed first and always
      // gets its label; the rest take whatever room is left.
      if (s.showLabels) {
        const taken: Box[] = visible.map((c) => ({
          left: c.x - 12,
          top: c.y - 12,
          width: 24,
          height: 24,
        }));
        // The chosen target first, then nearest outwards: when two labels
        // want the same patch of sky, the closer aircraft should be the one
        // that gets to keep its name.
        const order = [...visible].sort(
          (a, b) => Number(b.selected) - Number(a.selected) || a.distanceMiles - b.distanceMiles
        );
        for (const c of order) {
          const box = drawLabel(ctx, c, width, height, s.safeInsets, taken, s.showDistance);
          if (box) taken.push(box);
        }
      }

      // Nothing is remembered about aircraft no longer in the sky.
      if (lastTrackRef.current.size > s.aircraft.length) {
        const present = new Set(s.aircraft.map((a) => a.id));
        for (const id of lastTrackRef.current.keys()) {
          if (!present.has(id)) lastTrackRef.current.delete(id);
        }
      }

      s.onMarkers(markers);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

/** The artificial horizon, its pitch ladder, and the compass along it. */
function drawHorizonAndLadder(
  ctx: CanvasRenderingContext2D,
  attitude: Attitude,
  viewport: { width: number; height: number; horizontalFovDeg: number },
  focal: number,
  inset: SafeInsets
) {
  const { width, height } = viewport;
  const cx = width / 2;
  const cy = height / 2;
  const roll = toRad(attitude.rollDeg);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(roll);

  const halfSpan = Math.max(width, height);
  for (const step of LADDER_STEPS) {
    // Small-angle tangent placement: the ladder is a reference scale, not a
    // projection, so it stays evenly readable rather than bunching up.
    const y = focal * Math.tan(toRad(step - attitude.pitchDeg)) * -1;
    if (!Number.isFinite(y) || Math.abs(y) > halfSpan) continue;

    const isHorizon = step === 0;
    ctx.strokeStyle = isHorizon ? "rgba(51,255,153,0.8)" : "rgba(255,255,255,0.42)";
    ctx.lineWidth = isHorizon ? 1.4 : 1;
    const arm = isHorizon ? halfSpan : 46;

    ctx.beginPath();
    if (isHorizon) {
      ctx.moveTo(-arm, y);
      ctx.lineTo(arm, y);
    } else {
      ctx.moveTo(-arm - 60, y);
      ctx.lineTo(-60, y);
      ctx.moveTo(60, y);
      ctx.lineTo(arm + 60, y);
    }
    ctx.stroke();

    if (!isHorizon) {
      // The ladder itself belongs to the world and turns with it; its numbers
      // belong to the reader and stay the right way up. Text that rolls over
      // with the device is text nobody can read at a glance.
      ctx.save();
      ctx.translate(arm + 66, y);
      ctx.rotate(-roll);
      ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${step > 0 ? "+" : ""}${step}°`, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // Compass marks, placed where each bearing actually falls.
  ctx.save();
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [bearing, label] of CARDINALS) {
    const p = projectSky({ azimuthDeg: bearing, elevationDeg: 0 }, attitude, viewport);
    if (p.behind || p.x < inset.left + 16 || p.x > width - inset.right - 16) continue;
    ctx.fillStyle = label === "N" ? THEME.radarGreen : "rgba(255,255,255,0.78)";
    const y = clamp(p.y - 14, inset.top + 14, height - inset.bottom - 14);
    ctx.fillText(label, p.x, y);
  }
  ctx.restore();

  // Where the device is aimed. Deliberately faint — it marks your aim, not
  // an aircraft, and must never be mistaken for one.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9);
  ctx.stroke();
  ctx.restore();
}

/** The patch of sky the aircraft is somewhere inside. */
function drawSearchArea(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(51,255,153,0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 7]);
  ctx.stroke();

  const glow = ctx.createRadialGradient(x, y, radius * 0.25, x, y, radius);
  glow.addColorStop(0, "rgba(51,255,153,0.14)");
  glow.addColorStop(1, "rgba(51,255,153,0)");
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();
}

function drawContact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: Aircraft,
  selected: boolean,
  headingDeg: number,
  prominence: number
) {
  ctx.save();
  ctx.globalAlpha = contactAlpha(prominence, selected);
  if (selected) {
    ctx.shadowColor = THEME.selectedGlow;
    ctx.shadowBlur = 14;
  }
  // Pointed the way it is seen to be going — down the view as it recedes, up
  // as it comes on, sideways as it crosses. Nose-up regardless was the first
  // attempt, on the grounds that a plan-view icon says nothing about attitude;
  // true, but it left an aircraft passing overhead drawn flying backwards,
  // which reads as a bug however defensible the reasoning.
  drawSilhouette(ctx, a.silhouette, x, y, headingDeg, 13 * contactScale(prominence, selected) + (selected ? 4 : 0), {
    fill: selected ? THEME.selected : a.isMilitary ? THEME.military : THEME.aircraft,
    // A dark outline rather than the radar's soft grey: a pale silhouette on
    // a pale sky needs an edge to exist at all.
    stroke: "rgba(4,12,10,0.85)",
    lineWidth: 2,
  });
  ctx.restore();
}

interface VisibleContact {
  aircraft: Aircraft;
  x: number;
  y: number;
  radius: number;
  distanceMiles: number;
  selected: boolean;
  /** 1 close by, down to a floor at the edge of range. */
  prominence: number;
  /** Which way it is seen to be travelling, in screen degrees. */
  trackDeg: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/**
 * One contact's label, placed where it does not sit on top of anything
 * already drawn. Returns the space it claimed, or null when there was
 * nowhere for it to go — in which case the silhouette speaks for itself
 * rather than the sky filling with overlapping boxes.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  contact: VisibleContact,
  width: number,
  height: number,
  inset: SafeInsets,
  taken: Box[],
  showDistance: boolean
): Box | null {
  const { aircraft: a, x, y, radius, selected, prominence } = contact;
  const detailLevel: LabelDetail = labelDetailFor(prominence, selected);
  // Nothing at all out at the edge of range: the silhouette still says an
  // aircraft is there, and a plate for every distant contact is precisely
  // what was crowding the sky.
  if (detailLevel === "none") return null;

  const identity = a.callsign ?? a.registration ?? a.id.toUpperCase();
  const operator = a.isMilitary ? "MILITARY" : (a.airline ?? a.operator ?? null);
  const detail = [
    fmtAltitude(a.altitude),
    fmtSpeed(a.groundSpeed),
    showDistance ? fmtMiles(contact.distanceMiles) : null,
  ]
    .filter(Boolean)
    .join("  ");

  const lines: { text: string; font: string; color: string }[] = [
    { text: identity, font: "11px ui-monospace, SFMono-Regular, monospace", color: "#ffffff" },
  ];
  if (operator && detailLevel === "full") {
    lines.push({
      text: operator.length > 22 ? `${operator.slice(0, 21)}\u2026` : operator,
      font: "9px ui-monospace, SFMono-Regular, monospace",
      color: a.isMilitary ? THEME.militaryAccent : "rgba(215,230,225,0.85)",
    });
  }
  if (detail && detailLevel === "full") {
    lines.push({
      text: detail,
      font: "9px ui-monospace, SFMono-Regular, monospace",
      color: "rgba(215,230,225,0.7)",
    });
  }

  const lineHeight = 12;
  const boxHeight = lines.length * lineHeight + 8;
  let boxWidth = 0;
  for (const l of lines) {
    ctx.font = l.font;
    boxWidth = Math.max(boxWidth, ctx.measureText(l.text).width);
  }
  boxWidth += 14;

  // Below the contact reads best — it keeps the sky above the aeroplane, which
  // is where you are looking — so the other placements are only fallbacks.
  //
  // Only the target clears the search ring, because only the target draws one.
  // Standing every label off by a ring nobody can see left a distant aircraft's
  // name floating a hundred pixels from the aircraft, with nothing to say which
  // belonged to which.
  const gap = selected ? radius + 8 : 14;
  const candidates: Array<[number, number]> = [
    [x - boxWidth / 2, y + gap],
    [x - boxWidth / 2, y - gap - boxHeight],
    [x + gap, y - boxHeight / 2],
    [x - gap - boxWidth, y - boxHeight / 2],
  ];

  const minLeft = inset.left + 4;
  const maxLeft = width - inset.right - 4 - boxWidth;
  const minTop = inset.top + 4;
  const maxTop = height - inset.bottom - 4 - boxHeight;
  // Nowhere on this screen fits the box at all.
  if (maxLeft < minLeft || maxTop < minTop) return null;

  let placed: Box | null = null;
  for (const [candidateLeft, candidateTop] of candidates) {
    const box = {
      left: Math.max(minLeft, Math.min(maxLeft, candidateLeft)),
      top: Math.max(minTop, Math.min(maxTop, candidateTop)),
      width: boxWidth,
      height: boxHeight,
    };
    if (!taken.some((t) => overlaps(box, t))) {
      placed = box;
      break;
    }
  }
  // The chosen target is never dropped: if every placement is contested it
  // takes the preferred one anyway and is drawn over whatever is there.
  if (!placed && selected) {
    placed = {
      left: Math.max(minLeft, Math.min(maxLeft, candidates[0][0])),
      top: Math.max(minTop, Math.min(maxTop, candidates[0][1])),
      width: boxWidth,
      height: boxHeight,
    };
  }
  if (!placed) return null;

  const { left, top } = placed;

  ctx.save();
  // Faded with distance like everything else, but held well above the
  // silhouette's floor: a label is either readable or it is litter, and a
  // ghost of a callsign helps nobody. Below the threshold it is not drawn at
  // all, which is the honest way to make it quieter.
  ctx.globalAlpha = selected ? 1 : 0.55 + 0.45 * prominence;
  ctx.fillStyle = selected ? "rgba(4,12,10,0.85)" : "rgba(4,12,10,0.62)";
  ctx.strokeStyle = selected ? "rgba(51,255,153,0.5)" : "rgba(51,255,153,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(left, top, boxWidth, boxHeight, 6);
  else ctx.rect(left, top, boxWidth, boxHeight);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, left + boxWidth / 2, top + 4 + i * lineHeight);
  });
  ctx.restore();

  return placed;
}

/**
 * An arrow at the edge for a target that isn't in view yet.
 *
 * Points wherever the target actually is, not just left or right. Aircraft
 * are usually *above* you, so a cue that could only say "turn that way" left
 * the most common case — "it's over your head" — with nothing on screen at
 * all.
 */
function drawOffScreenCue(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  inset: SafeInsets,
  target: { x: number; y: number; behind: boolean; offAimDeg: number },
  relativeBearing: number,
  a: Aircraft
) {
  const cx = width / 2;
  const cy = height / 2;
  const margin = 30;

  // Behind you, the projected point is meaningless — fall back to which
  // shoulder to turn over.
  let dirX: number;
  let dirY: number;
  if (target.behind) {
    dirX = relativeBearing > 0 ? 1 : -1;
    dirY = 0;
  } else {
    dirX = target.x - cx;
    dirY = target.y - cy;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len;
    dirY /= len;
  }

  // Slide out from the aim point until the edge of the band that is actually
  // visible — not the edge of the canvas, which on three sides is covered by
  // chrome painted on top of it.
  const left = inset.left + margin;
  const right = width - inset.right - margin;
  const top = inset.top + margin;
  const bottom = height - inset.bottom - margin;
  const scaleX = dirX === 0 ? Infinity : (dirX > 0 ? right - cx : cx - left) / Math.abs(dirX);
  const scaleY = dirY === 0 ? Infinity : (dirY > 0 ? bottom - cy : cy - top) / Math.abs(dirY);
  const scale = Math.max(0, Math.min(scaleX, scaleY));
  const x = cx + dirX * scale;
  const y = cy + dirY * scale;
  const angle = Math.atan2(dirY, dirX);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = THEME.radarGreen;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-9, -11);
  ctx.lineTo(-9, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // The label stays upright, sits behind the arrow rather than beyond it,
  // and is kept inside the same visible band.
  ctx.save();
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelX = clamp(x - dirX * 34, inset.left + 46, width - inset.right - 46);
  const labelY = clamp(y - dirY * 34, inset.top + 20, height - inset.bottom - 20);
  ctx.fillText(a.callsign ?? a.id.toUpperCase(), labelX, labelY - 7);
  // How far off the aim point it is — the one number that explains why there
  // is an arrow here at all. The compass bearing would read "0\u00b0" for an
  // aircraft dead ahead but far above, which is true and useless.
  ctx.fillText(`${Math.round(target.offAimDeg)}\u00b0 OFF`, labelX, labelY + 7);
  ctx.restore();
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}
