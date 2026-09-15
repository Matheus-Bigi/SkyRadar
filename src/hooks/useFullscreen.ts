"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Filling the screen, where the browser allows it.
 *
 * Feature-detected rather than assumed: Safari on an iPad will put an element
 * full screen, Safari on an iPhone will do it for video and nothing else. The
 * control is simply not offered where it would do nothing — a button that
 * silently fails is worse than no button.
 *
 * The whole document goes full screen, not one view, so the choice survives
 * opening and leaving Sky View.
 */

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface FullscreenState {
  supported: boolean;
  active: boolean;
  toggle: () => void;
}

function currentlyFullscreen(doc: FullscreenDocument): boolean {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function useFullscreen(): FullscreenState {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const canDo = Boolean(
      (doc.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
        (root.requestFullscreen || root.webkitRequestFullscreen)
    );
    setSupported(canDo);
    if (!canDo) return;

    // Leaving full screen is not always our doing — Escape, a swipe, the
    // browser deciding otherwise — so the button follows the document rather
    // than remembering what it last asked for.
    const sync = () => setActive(currentlyFullscreen(doc));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const done = currentlyFullscreen(doc)
      ? doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()
      : root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.();
    // A refusal is the browser's to make; the change listener keeps the
    // button honest either way.
    Promise.resolve(done).catch(() => {});
  }, []);

  return { supported, active, toggle };
}
