"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_TIMEOUT_MS = 9000;

/**
 * Idle detection powering Ambient Radar Mode (spec #36). When the user
 * stops touching/moving the pointer for `timeoutMs`, controls fade out and
 * the radar keeps running quietly underneath. Any interaction wakes it
 * back up immediately.
 */
export function useAmbientMode(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const [ambient, setAmbient] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = () => {
    setAmbient(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAmbient(true), timeoutMs);
  };

  useEffect(() => {
    wake();
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "pointermove",
      "touchstart",
      "keydown",
      "wheel",
    ];
    const handler = () => wake();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);

  return { ambient, wake };
}
