"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { Aircraft } from "../lib/aircraft/types";
import { LatLon, deriveGeometry, distanceMeters, feetToMeters, milesToMeters, toRad } from "../lib/geo";
import { drawSilhouette } from "../lib/render/silhouettes";
import { interpolateAircraftFrame } from "../lib/render/interpolate";
import { useAircraftStore } from "../store/useAircraftStore";
import { RangeMiles, DisplayMode, CategoryFilter } from "../store/useRadarStore";
import { THEME, VISUALLY_RELEVANT_MILES } from "../lib/render/theme";
import { playRadarBlip } from "../lib/audio/radarBeep";

const SWEEP_PERIOD_MS = 6500;
const HIT_RADIUS_PX = 16;

export interface RadarCanvasPrefs {
  radarGraphicsEnabled: boolean;
  aircraftTrailsEnabled: boolean;
  showCallsigns: boolean;
  militaryHighlighting: boolean;
  visualRangeHighlight: boolean;
  radarSoundEnabled: boolean;
}

export interface RadarCanvasProps {
  map: MapLibreMap | null;
  userPosition: LatLon;
  userAltitudeMeters: number;
  userHeading: number | null;
  mode: DisplayMode;
  rangeMiles: RangeMiles;
  categoryFilter: CategoryFilter;
  selectedAircraftId: string | null;
  prefs: RadarCanvasPrefs;
  onSelect: (id: string | null) => void;
  onOverlapChoices: (ids: string[]) => void;
}

interface DrawnMarker {
  id: string;
  x: number;
  y: number;
}

function bearingToScreenRad(bearingDeg: number): number {
  return toRad(bearingDeg - 90);
}

function categoryMatches(filter: CategoryFilter, aircraft: Aircraft): boolean {
  return filter === "ALL" || aircraft.category === filter;
}

export default function RadarCanvas(props: RadarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestRef = useRef(props);
  latestRef.current = props;

  const sweepAngleRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const drawnMarkersRef = useRef<DrawnMarker[]>([]);
  const dprRef = useRef(1);

  // Canvas sizing, DPR-aware, tracks the shared map/canvas container.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      dprRef.current = dpr;
      const { clientWidth, clientHeight } = container;
      canvas.width = Math.max(1, Math.round(clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(clientHeight * dpr));
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Aircraft hit-testing via the underlying map's click event (our canvas
  // stays pointer-events:none so map panning/gestures work uninterrupted).
  useEffect(() => {
    const map = props.map;
    if (!map) return;
    const handleClick = (e: MapMouseEvent) => {
      const markers = drawnMarkersRef.current;
      const hits = markers
        .map((m) => ({ ...m, d: Math.hypot(m.x - e.point.x, m.y - e.point.y) }))
        .filter((m) => m.d <= HIT_RADIUS_PX)
        .sort((a, b) => a.d - b.d);

      if (hits.length === 0) {
        latestRef.current.onSelect(null);
      } else if (hits.length === 1) {
        latestRef.current.onSelect(hits[0].id);
      } else {
        latestRef.current.onOverlapChoices(hits.map((h) => h.id));
      }
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.map]);

  useEffect(() => {
    let rafId: number;

    const render = (time: number) => {
      rafId = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const { map, userPosition, userAltitudeMeters, userHeading, mode, rangeMiles, categoryFilter, selectedAircraftId, prefs } =
        latestRef.current;
      if (!canvas || !map) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = dprRef.current;
      const widthCss = canvas.width / dpr;
      const heightCss = canvas.height / dpr;

      const dt = lastFrameTimeRef.current ? (time - lastFrameTimeRef.current) / 1000 : 0;
      lastFrameTimeRef.current = time;
      sweepAngleRef.current = (sweepAngleRef.current + (360 / (SWEEP_PERIOD_MS / 1000)) * dt) % 360;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, widthCss, heightCss);

      const centerPt = map.project([userPosition.longitude, userPosition.latitude]);
      const edgePt = map.project([
        userPosition.longitude,
        userPosition.latitude + milesToMeters(rangeMiles) / 111320,
      ]);
      const radiusPx = Math.max(20, Math.hypot(edgePt.x - centerPt.x, edgePt.y - centerPt.y));

      const radarOn = mode === "RADAR" && prefs.radarGraphicsEnabled;

      if (radarOn) {
        drawRings(ctx, centerPt.x, centerPt.y, radiusPx);
        drawSweep(ctx, centerPt.x, centerPt.y, radiusPx, sweepAngleRef.current);
      }

      // Aircraft store read (non-reactive) — animation stays independent
      // of React re-renders and of the data-poll cadence (spec #67).
      const store = useAircraftStore.getState();
      const now = Date.now();
      const frame = interpolateAircraftFrame(
        { previous: store.previous, current: store.current, previousAt: store.previousAt, currentAt: store.currentAt },
        store.removed,
        now
      );

      const rangeMetersLimit = milesToMeters(rangeMiles) * 1.05;
      const visible = frame.filter(
        (r) =>
          categoryMatches(categoryFilter, r.aircraft) &&
          distanceMeters(userPosition, { latitude: r.aircraft.latitude, longitude: r.aircraft.longitude }) <=
            rangeMetersLimit
      );


      const placedLabelRects: { x: number; y: number; w: number; h: number }[] = [];
      const markers: DrawnMarker[] = [];
      const prevSweep = sweepAngleRef.current - (360 / (SWEEP_PERIOD_MS / 1000)) * dt;

      for (const rendered of visible) {
        const a = rendered.aircraft;
        const pt = map.project([a.longitude, a.latitude]);
        markers.push({ id: a.id, x: pt.x, y: pt.y });

        if (prefs.aircraftTrailsEnabled) {
          const trail = store.trails[a.id];
          if (trail && trail.length > 1) {
            const pts = trail.map((p) => map.project([p.longitude, p.latitude]));
            drawTrail(ctx, pts);
          }
        }

        const distM = distanceMeters(userPosition, { latitude: a.latitude, longitude: a.longitude });
        const isVisuallyRelevant =
          prefs.visualRangeHighlight && distM <= milesToMeters(VISUALLY_RELEVANT_MILES);
        const isSelected = a.id === selectedAircraftId;

        drawAircraftMarker(ctx, pt.x, pt.y, rendered, {
          selected: isSelected,
          visuallyRelevant: isVisuallyRelevant,
          militaryHighlighting: prefs.militaryHighlighting,
          showLabel: prefs.showCallsigns,
          placedLabelRects,
        });

        if (radarOn && prefs.radarSoundEnabled && rendered.opacity > 0.5) {
          const bearing = deriveGeometry(
            userPosition,
            userAltitudeMeters,
            userHeading ?? 0,
            { latitude: a.latitude, longitude: a.longitude },
            feetToMeters(a.altitude ?? 0)
          ).bearing;
          if (sweepCrossed(prevSweep, sweepAngleRef.current, bearing)) {
            playRadarBlip();
          }
        }
      }

      drawnMarkersRef.current = markers;

      // User marker always drawn last within the base layer so it never
      // gets visually buried under aircraft symbology.
      drawUserMarker(ctx, centerPt.x, centerPt.y, mode === "RADAR");
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
}

function sweepCrossed(prev: number, curr: number, bearing: number): boolean {
  const p = ((prev % 360) + 360) % 360;
  const c = ((curr % 360) + 360) % 360;
  if (c >= p) return bearing > p && bearing <= c;
  return bearing > p || bearing <= c;
}

function drawRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.save();
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * frac, 0, Math.PI * 2);
    ctx.strokeStyle = frac === 1 ? THEME.ringStrong : THEME.ring;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  for (let deg = 0; deg < 360; deg += 45) {
    const rad = bearingToScreenRad(deg);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(rad), cy + radius * Math.sin(rad));
    ctx.strokeStyle = THEME.ring;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const labels: [number, string][] = [
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
  ];
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = THEME.compass;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [deg, label] of labels) {
    const rad = bearingToScreenRad(deg);
    const x = cx + (radius + 13) * Math.cos(rad);
    const y = cy + (radius + 13) * Math.sin(rad);
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

function drawSweep(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, angleDeg: number) {
  ctx.save();
  const trailDeg = 55;
  const steps = 44;
  for (let i = 0; i < steps; i++) {
    const frac = i / steps;
    const a = angleDeg - trailDeg * (1 - frac);
    const rad = bearingToScreenRad(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(rad), cy + radius * Math.sin(rad));
    ctx.strokeStyle = `rgba(51,255,153,${(0.2 * frac * frac).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const rad = bearingToScreenRad(angleDeg);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.cos(rad), cy + radius * Math.sin(rad));
  ctx.strokeStyle = THEME.sweepCore;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = THEME.radarGreen;
  ctx.shadowBlur = 7;
  ctx.stroke();
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  ctx.save();
  for (let i = 1; i < points.length; i++) {
    const alpha = (i / points.length) * 0.32;
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = `rgba(51,255,153,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawUserMarker(ctx: CanvasRenderingContext2D, x: number, y: number, radarMode: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radarMode ? 8 : 6, 0, Math.PI * 2);
  ctx.strokeStyle = THEME.radarGreen;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = THEME.radarGreen;
  ctx.shadowColor = THEME.radarGreen;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();
}

interface MarkerDrawOptions {
  selected: boolean;
  visuallyRelevant: boolean;
  militaryHighlighting: boolean;
  showLabel: boolean;
  placedLabelRects: { x: number; y: number; w: number; h: number }[];
}

function drawAircraftMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rendered: { aircraft: Aircraft; opacity: number },
  opts: MarkerDrawOptions
) {
  const a = rendered.aircraft;
  const isMil = a.isMilitary && opts.militaryHighlighting;
  const size = opts.selected ? 15 : 11;

  ctx.save();
  ctx.globalAlpha = rendered.opacity;

  if (opts.selected) {
    ctx.shadowColor = THEME.selectedGlow;
    ctx.shadowBlur = 16;
  } else if (opts.visuallyRelevant) {
    ctx.shadowColor = THEME.visuallyRelevantGlow;
    ctx.shadowBlur = 9;
  } else if (isMil) {
    ctx.shadowColor = "rgba(143,176,201,0.4)";
    ctx.shadowBlur = 5;
  }

  drawSilhouette(ctx, a.silhouette, x, y, a.heading ?? 0, size, {
    fill: opts.selected ? THEME.selected : isMil ? THEME.military : THEME.aircraft,
    stroke: isMil ? THEME.militaryAccent : THEME.aircraftStroke,
    lineWidth: 1,
  });
  ctx.shadowBlur = 0;

  if (isMil) {
    const dx = x;
    const dy = y + size + 7;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 3);
    ctx.lineTo(dx + 3, dy);
    ctx.lineTo(dx, dy + 3);
    ctx.lineTo(dx - 3, dy);
    ctx.closePath();
    ctx.fillStyle = THEME.militaryAccent;
    ctx.fill();
  }

  if (opts.showLabel && a.callsign) {
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    const width = ctx.measureText(a.callsign).width;
    const candidates = [
      { x: x - width / 2, y: y - size - 18 },
      { x: x - width / 2, y: y + size + (isMil ? 16 : 6) },
    ];
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: width, h: 12 };
      const collides = opts.placedLabelRects.some(
        (r) => !(rect.x + rect.w < r.x || rect.x > r.x + r.w || rect.y + rect.h < r.y || rect.y > r.y + r.h)
      );
      if (!collides) {
        opts.placedLabelRects.push(rect);
        ctx.fillStyle = opts.selected ? THEME.selected : THEME.label;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(a.callsign, c.x, c.y);
        break;
      }
    }
  }

  ctx.restore();
}
