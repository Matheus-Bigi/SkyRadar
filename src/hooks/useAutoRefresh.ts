"use client";

import { useEffect, useRef } from "react";

/**
 * Periodically gives the app a chance to recover from things that failed
 * earlier, without ever interrupting the person using it.
 *
 * Some failures are permanent for the life of a page: a photo lookup that
 * gave up, a basemap whose tiles never arrived, a feed that stopped
 * answering. Reloading the page clears all of them, which is why reloading
 * appeared to fix things — but a reload is a blank screen, a re-acquired
 * GPS fix, a re-initialised map, and the loss of every photo already
 * cached. Re-running just the parts that failed gets the same recovery and
 * costs nothing visible.
 *
 * The cycle never fires while the app is in use. Anything on screen that
 * someone is reading — an open card, a tracked aircraft, a panel — counts
 * as busy, and so does having touched the screen recently. A refresh that
 * came due during any of that waits for a quiet moment instead.
 */
export interface AutoRefreshOptions {
  /** How often to attempt a refresh, when idle. */
  intervalMs?: number;
  /** Quiet time required after the last interaction before refreshing. */
  idleMs?: number;
  /** True while the user is reading or tracking something. */
  busy: boolean;
  onRefresh: () => void;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_MS = 8_000;
/** How often to re-check whether a due refresh may finally run. */
const TICK_MS = 2_000;

const INTERACTION_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "touchmove",
] as const;

export function useAutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
  idleMs = DEFAULT_IDLE_MS,
  busy,
  onRefresh,
}: AutoRefreshOptions) {
  const lastInteractionRef = useRef(0);
  const lastRefreshRef = useRef(Date.now());
  const busyRef = useRef(busy);
  const onRefreshRef = useRef(onRefresh);

  busyRef.current = busy;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const mark = () => {
      lastInteractionRef.current = Date.now();
    };
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, mark, { passive: true });
    }

    // A tab that was in the background hasn't been "idle" in a useful sense —
    // it has been asleep. Treat returning to it as a good moment to refresh.
    const onVisible = () => {
      if (document.visibilityState === "visible") lastRefreshRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVisible);

    const tick = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState !== "visible") return;
      if (now - lastRefreshRef.current < intervalMs) return;
      // Due, but the moment isn't right — try again on the next tick.
      if (busyRef.current) return;
      if (now - lastInteractionRef.current < idleMs) return;

      lastRefreshRef.current = now;
      onRefreshRef.current();
    }, TICK_MS);

    return () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, mark);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [intervalMs, idleMs]);
}
