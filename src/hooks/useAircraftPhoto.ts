"use client";

import { useEffect, useState } from "react";

interface PhotoResult {
  imageUrl: string | null;
  attribution: string | null;
  loading: boolean;
}

/** Fetches an aircraft photo only when needed (spec #22/#24) — call with `enabled=false` until the card expands. */
export function useAircraftPhoto(registration: string | undefined, enabled: boolean): PhotoResult {
  const [state, setState] = useState<PhotoResult>({ imageUrl: null, attribution: null, loading: false });

  useEffect(() => {
    if (!enabled || !registration) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetch(`/api/aircraft/photo?registration=${encodeURIComponent(registration)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setState({ imageUrl: data.imageUrl ?? null, attribution: data.attribution ?? null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ imageUrl: null, attribution: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [registration, enabled]);

  return state;
}
