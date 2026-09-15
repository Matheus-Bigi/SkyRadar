"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the screen awake while the app is on screen.
 *
 * Watching for aircraft is mostly waiting and looking up — the exact shape of
 * "idle" a phone dims and locks for. Losing the scope mid-approach because
 * nobody had touched the glass for thirty seconds is the one thing this app
 * cannot afford to do.
 */

export interface WakeLockState {
  /** Whether this browser offers the lock at all. */
  supported: boolean;
  /** Whether the screen is being held awake right now. */
  active: boolean;
}

export function useWakeLock(enabled = true): WakeLockState {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // The typings promise this is always there; older Safari and every
    // desktop browser before 2020 disagree, so it is checked at runtime.
    const wakeLock: WakeLock | undefined =
      typeof navigator === "undefined" ? undefined : navigator.wakeLock;
    if (typeof window === "undefined" || !wakeLock) {
      setSupported(false);
      return;
    }
    setSupported(true);
    if (!enabled) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const held = sentinelRef.current;
      if (held && !held.released) return;
      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener("release", () => setActive(false));
      } catch {
        // Refused, or the page stopped being visible mid-request. Nothing to
        // report: the screen simply behaves the way it normally would.
        setActive(false);
      }
    };

    // The browser takes the lock back whenever the page is hidden — a tab
    // switch, a call, the app going to the background — and does not hand it
    // back on its own, so it is asked for again on the way in.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    // And again on the first touch, for browsers that will only grant it off
    // the back of something the user did.
    const onInteract = () => void acquire();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onInteract, { passive: true });
    void acquire();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onInteract);
      const held = sentinelRef.current;
      sentinelRef.current = null;
      if (held && !held.released) void held.release().catch(() => {});
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}
