"use client";

import { useEffect, useRef } from "react";
import { SilhouetteType } from "../lib/aircraft/types";
import { drawSilhouette, onSilhouetteReady } from "../lib/render/silhouettes";
import { THEME } from "../lib/render/theme";

export default function SilhouetteIcon({
  type,
  size = 28,
  military = false,
}: {
  type: SilhouetteType;
  size?: number;
  military?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawSilhouette(ctx, type, size / 2, size / 2, 0, size * 0.42, {
        fill: military ? THEME.military : THEME.aircraft,
        stroke: military ? THEME.militaryAccent : THEME.aircraftStroke,
        lineWidth: 1,
      });
    };

    draw();
    // The silhouette image loads asynchronously; if it wasn't ready on this
    // first draw, redraw once it is instead of leaving the icon blank.
    return onSilhouetteReady(type, draw);
  }, [type, size, military]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
