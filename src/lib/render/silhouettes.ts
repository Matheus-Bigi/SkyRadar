import { SilhouetteType } from "../aircraft/types";

/**
 * Vector aircraft silhouettes, drawn top-down with the nose pointing "up"
 * (negative Y) in a normalized [-1, 1] box. The renderer translates,
 * rotates (by heading) and scales the canvas context before calling the
 * draw function, so every silhouette here is unit-agnostic.
 *
 * These are deliberately simple, recognizable shapes rather than detailed
 * illustrations — legible at 20-30px on a radar is the goal, not fine
 * draftsmanship (spec #10).
 */

export interface SilhouetteStyle {
  fill: string;
  stroke: string;
  lineWidth: number;
}

type DrawFn = (ctx: CanvasRenderingContext2D, style: SilhouetteStyle) => void;

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function fillStroke(ctx: CanvasRenderingContext2D, style: SilhouetteStyle) {
  ctx.fillStyle = style.fill;
  ctx.fill();
  if (style.lineWidth > 0) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.stroke();
  }
}

function mirrored(pts: [number, number][]): [number, number][] {
  return pts.map(([x, y]) => [-x, y]);
}

function drawFuselage(ctx: CanvasRenderingContext2D, pts: [number, number][], style: SilhouetteStyle) {
  poly(ctx, pts);
  fillStroke(ctx, style);
}

function drawWingPair(ctx: CanvasRenderingContext2D, right: [number, number][], style: SilhouetteStyle) {
  poly(ctx, right);
  fillStroke(ctx, style);
  poly(ctx, mirrored(right));
  fillStroke(ctx, style);
}

const jetAirliner: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -1],
      [0.07, -0.72],
      [0.09, -0.1],
      [0.07, 0.58],
      [0.05, 0.85],
      [-0.05, 0.85],
      [-0.07, 0.58],
      [-0.09, -0.1],
      [-0.07, -0.72],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.08, -0.18],
      [0.92, 0.32],
      [0.48, 0.55],
      [0.08, 0.18],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.05, 0.7],
      [0.32, 0.92],
      [0.05, 0.82],
    ],
    style
  );
  poly(ctx, [
    [0, 0.55],
    [0.13, 0.95],
    [0, 0.82],
  ]);
  fillStroke(ctx, style);
};

const regionalJet: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -0.95],
      [0.065, -0.68],
      [0.075, -0.05],
      [0.06, 0.6],
      [0.04, 0.82],
      [-0.04, 0.82],
      [-0.06, 0.6],
      [-0.075, -0.05],
      [-0.065, -0.68],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.06, -0.05],
      [0.7, 0.35],
      [0.32, 0.5],
      [0.06, 0.15],
    ],
    style
  );
  poly(ctx, [
    [0, 0.5],
    [0.11, 0.9],
    [0, 0.78],
  ]);
  fillStroke(ctx, style);
};

const turboprop: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -0.9],
      [0.06, -0.6],
      [0.07, 0.1],
      [0.05, 0.7],
      [-0.05, 0.7],
      [-0.07, 0.1],
      [-0.06, -0.6],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.07, -0.06],
      [0.78, 0.02],
      [0.78, 0.16],
      [0.07, 0.14],
    ],
    style
  );
  ctx.beginPath();
  ctx.arc(0.38, 0.05, 0.08, 0, Math.PI * 2);
  fillStroke(ctx, style);
  ctx.beginPath();
  ctx.arc(-0.38, 0.05, 0.08, 0, Math.PI * 2);
  fillStroke(ctx, style);
  drawWingPair(
    ctx,
    [
      [0.05, 0.58],
      [0.28, 0.7],
      [0.05, 0.66],
    ],
    style
  );
  poly(ctx, [
    [0, 0.5],
    [0, 0.78],
    [0.08, 0.75],
  ]);
  fillStroke(ctx, style);
};

const generalAviation: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -0.88],
      [0.035, -0.6],
      [0.045, 0.45],
      [0.03, 0.78],
      [-0.03, 0.78],
      [-0.045, 0.45],
      [-0.035, -0.6],
    ],
    style
  );
  poly(ctx, [
    [-0.58, -0.03],
    [0.58, -0.03],
    [0.58, 0.06],
    [-0.58, 0.06],
  ]);
  fillStroke(ctx, style);
  poly(ctx, [
    [-0.22, 0.72],
    [0.22, 0.72],
    [0.22, 0.8],
    [-0.22, 0.8],
  ]);
  fillStroke(ctx, style);
  poly(ctx, [
    [0, 0.55],
    [0, 0.84],
    [0.08, 0.8],
  ]);
  fillStroke(ctx, style);
  ctx.beginPath();
  ctx.moveTo(0, -0.88);
  ctx.lineTo(0, -0.98);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth || 1;
  ctx.stroke();
};

function rotorDisc(ctx: CanvasRenderingContext2D, cy: number, r: number, style: SilhouetteStyle) {
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(style.lineWidth * 0.6, 0.6);
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const helicopter: DrawFn = (ctx, style) => {
  rotorDisc(ctx, -0.05, 0.85, style);
  drawFuselage(
    ctx,
    [
      [0, -0.55],
      [0.22, -0.3],
      [0.24, 0.15],
      [0.1, 0.35],
      [-0.1, 0.35],
      [-0.24, 0.15],
      [-0.22, -0.3],
    ],
    style
  );
  poly(ctx, [
    [-0.06, 0.3],
    [0.06, 0.3],
    [0.03, 0.85],
    [-0.03, 0.85],
  ]);
  fillStroke(ctx, style);
  ctx.beginPath();
  ctx.arc(0, 0.85, 0.12, 0, Math.PI * 2);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(style.lineWidth * 0.6, 0.6);
  ctx.stroke();
};

const militaryHelicopter: DrawFn = (ctx, style) => {
  rotorDisc(ctx, -0.05, 0.8, style);
  drawFuselage(
    ctx,
    [
      [0, -0.62],
      [0.18, -0.4],
      [0.22, 0.2],
      [0.12, 0.38],
      [-0.12, 0.38],
      [-0.22, 0.2],
      [-0.18, -0.4],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.14, 0.0],
      [0.46, 0.06],
      [0.46, 0.18],
      [0.14, 0.16],
    ],
    style
  );
  poly(ctx, [
    [-0.07, 0.32],
    [0.07, 0.32],
    [0.035, 0.8],
    [-0.035, 0.8],
  ]);
  fillStroke(ctx, style);
  ctx.beginPath();
  ctx.arc(0, 0.8, 0.11, 0, Math.PI * 2);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(style.lineWidth * 0.6, 0.6);
  ctx.stroke();
};

const fighter: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -0.98],
      [0.045, -0.7],
      [0.06, 0.1],
      [0.05, 0.55],
      [-0.05, 0.55],
      [-0.06, 0.1],
      [-0.045, -0.7],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.05, -0.12],
      [0.82, 0.48],
      [0.16, 0.58],
      [0.05, 0.12],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.09, 0.42],
      [0.27, 0.72],
      [0.11, 0.62],
    ],
    style
  );
};

const militaryTransport: DrawFn = (ctx, style) => {
  drawFuselage(
    ctx,
    [
      [0, -0.85],
      [0.1, -0.6],
      [0.1, 0.75],
      [0.06, 0.9],
      [-0.06, 0.9],
      [-0.1, 0.75],
      [-0.1, -0.6],
    ],
    style
  );
  drawWingPair(
    ctx,
    [
      [0.1, -0.02],
      [0.95, 0.14],
      [0.95, 0.26],
      [0.1, 0.12],
    ],
    style
  );
  poly(ctx, [
    [-0.28, 0.76],
    [0.28, 0.76],
    [0.28, 0.86],
    [-0.28, 0.86],
  ]);
  fillStroke(ctx, style);
  poly(ctx, [
    [0, 0.55],
    [0, 0.92],
    [0.1, 0.86],
  ]);
  fillStroke(ctx, style);
};

const other: DrawFn = (ctx, style) => {
  poly(ctx, [
    [0, -0.85],
    [0.5, 0.6],
    [0, 0.32],
    [-0.5, 0.6],
  ]);
  fillStroke(ctx, style);
};

export const SILHOUETTES: Record<SilhouetteType, DrawFn> = {
  JET_AIRLINER: jetAirliner,
  REGIONAL_JET: regionalJet,
  TURBOPROP: turboprop,
  GENERAL_AVIATION: generalAviation,
  HELICOPTER: helicopter,
  MILITARY_HELICOPTER: militaryHelicopter,
  FIGHTER: fighter,
  MILITARY_TRANSPORT: militaryTransport,
  OTHER: other,
};

export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  type: SilhouetteType,
  x: number,
  y: number,
  headingDeg: number,
  size: number,
  style: SilhouetteStyle
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((headingDeg * Math.PI) / 180);
  ctx.scale(size, size);
  SILHOUETTES[type](ctx, style);
  ctx.restore();
}
