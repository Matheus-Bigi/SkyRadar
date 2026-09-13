import { SilhouetteType } from "../aircraft/types";

/**
 * Aircraft silhouettes are traced from a reference sheet of standard
 * top-down aviation icons (commercial jet, turboprop, small aircraft,
 * helicopter, military helicopter, fighter, military transport, and a
 * blended-wing "other military" shape) rather than hand-authored vector
 * paths — that keeps every category immediately recognizable instead of
 * reading as an abstract blob at small sizes (spec #10).
 *
 * Each source image (public/aircraft/*.png) is a white silhouette on a
 * transparent background, nose pointing up. Tinting it to whatever
 * fill/stroke color a category, selection, or military-highlight state
 * calls for happens ONCE per (shape, color) pair on a small offscreen
 * canvas via `source-in` compositing, and the result is cached — flipping
 * `globalCompositeOperation` on the live, continuously-redrawn radar
 * canvas dozens of times a frame corrupts unrelated drawing later in that
 * same frame (rings/other aircraft silently stop appearing), so the
 * compositing trick is confined to a disposable canvas instead.
 */

export interface SilhouetteStyle {
  fill: string;
  stroke: string;
  lineWidth: number;
}

const IMAGE_FILES: Record<SilhouetteType, string> = {
  JET_AIRLINER: "commercial-jet.png",
  REGIONAL_JET: "commercial-jet.png",
  TURBOPROP: "turboprop.png",
  GENERAL_AVIATION: "small-aircraft.png",
  HELICOPTER: "helicopter.png",
  MILITARY_HELICOPTER: "military-helicopter.png",
  FIGHTER: "fighter.png",
  MILITARY_TRANSPORT: "military-transport.png",
  OTHER: "other-military.png",
};

const imageCache = new Map<string, HTMLImageElement>();
const loadListeners = new Map<string, Set<() => void>>();
const tintedCache = new Map<string, HTMLCanvasElement>();

function getImage(type: SilhouetteType): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const file = IMAGE_FILES[type];
  let img = imageCache.get(file);
  if (!img) {
    img = new Image();
    img.src = `/aircraft/${file}`;
    imageCache.set(file, img);
    img.onload = () => {
      loadListeners.get(file)?.forEach((cb) => cb());
    };
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Subscribes to a silhouette image finishing its (async, one-time) load.
 * Callers that draw once — rather than in a continuous animation loop —
 * use this to redraw after the image becomes available, instead of
 * showing a permanently blank icon if the first draw ran before it loaded.
 */
export function onSilhouetteReady(type: SilhouetteType, cb: () => void): () => void {
  const file = IMAGE_FILES[type];
  if (!loadListeners.has(file)) loadListeners.set(file, new Set());
  loadListeners.get(file)!.add(cb);
  return () => loadListeners.get(file)?.delete(cb);
}

/** Bakes `img` tinted to `color` onto a small cached offscreen canvas, computed once per pair. */
function getTinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const key = `${img.src}|${color}`;
  let canvas = tintedCache.get(key);
  if (canvas) return canvas;

  canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const offscreen = canvas.getContext("2d")!;
  offscreen.drawImage(img, 0, 0);
  offscreen.globalCompositeOperation = "source-in";
  offscreen.fillStyle = color;
  offscreen.fillRect(0, 0, canvas.width, canvas.height);

  tintedCache.set(key, canvas);
  return canvas;
}

export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  type: SilhouetteType,
  x: number,
  y: number,
  headingDeg: number,
  size: number,
  style: SilhouetteStyle
) {
  const img = getImage(type);
  if (!img) return; // not loaded yet — next animation frame will pick it up

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((headingDeg * Math.PI) / 180);
  ctx.scale(size, size);

  if (style.lineWidth > 0) {
    ctx.save();
    const growth = 1 + style.lineWidth * 0.07;
    ctx.scale(growth, growth);
    ctx.drawImage(getTinted(img, style.stroke), -1, -1, 2, 2);
    ctx.restore();
  }
  ctx.drawImage(getTinted(img, style.fill), -1, -1, 2, 2);

  ctx.restore();
}
