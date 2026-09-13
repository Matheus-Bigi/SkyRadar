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
 * transparent background, nose pointing up. At draw time it's tinted to
 * whatever fill/stroke color the category (or selection/military state)
 * calls for via canvas `source-in` compositing, so one asset per shape
 * serves every color state.
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

/** Draws `img` (already positioned via the caller's transform) tinted to a solid color. */
function drawTinted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, color: string) {
  ctx.drawImage(img, -1, -1, 2, 2);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.globalCompositeOperation = "source-over";
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
    drawTinted(ctx, img, style.stroke);
    ctx.restore();
  }
  drawTinted(ctx, img, style.fill);

  ctx.restore();
}
