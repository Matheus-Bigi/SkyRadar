"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, GeoJSONSource, ErrorEvent as MapLibreErrorEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LatLon, milesToMeters, normalizeSignedDegrees } from "../lib/geo";
import { nearbyAirports } from "../lib/airports";
import { applyMapLayerVisibility, ensureAirportLayers, AIRPORTS_SOURCE_ID } from "../lib/render/mapLayers";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { RangeMiles } from "../store/useRadarStore";

// Two independent, keyless vector-tile providers: if the primary is slow,
// blocked, or down, we fall back automatically rather than leaving the
// radar without any geographic backdrop at all. The fallback is a light
// style (no free dark alternative from this provider), so it gets a CSS
// filter to invert it toward our dark aesthetic when it's the one in use.
const PRIMARY_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_LOAD_TIMEOUT_MS = 15000;
const EARTH_CIRCUMFERENCE_PX_AT_Z0 = 156543.03392;
const FALLBACK_DARKEN_FILTER = "invert(1) hue-rotate(180deg) brightness(0.82) saturate(0.6) contrast(0.9)";

function computeZoom(latitude: number, radiusMeters: number, desiredRadiusPx: number): number {
  const latRad = (latitude * Math.PI) / 180;
  const metersPerPx = radiusMeters / desiredRadiusPx;
  const zoom = Math.log2((EARTH_CIRCUMFERENCE_PX_AT_Z0 * Math.cos(latRad)) / metersPerPx);
  return Math.max(2, Math.min(18, zoom));
}

export interface MapViewProps {
  center: LatLon;
  rangeMiles: RangeMiles;
  lockCenter: boolean;
  headingUpMode: boolean;
  userHeading: number | null;
  onMapReady: (map: MapLibreMap) => void;
}

export default function MapView({ center, rangeMiles, lockCenter, headingUpMode, userHeading, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleLoadedRef = useRef(false);
  const styleAttemptRef = useRef<"primary" | "fallback">("primary");
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefs = usePreferencesStore();
  const [mapError, setMapError] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<"primary" | "fallback">("primary");

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: PRIMARY_STYLE_URL,
      center: [center.longitude, center.latitude],
      zoom: 10,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();
    map.dragPan.disable();

    const clearStyleTimeout = () => {
      if (styleTimeoutRef.current) clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    };
    const armStyleTimeout = () => {
      clearStyleTimeout();
      styleTimeoutRef.current = setTimeout(() => handleStyleFailure("timed out loading"), STYLE_LOAD_TIMEOUT_MS);
    };
    const handleStyleFailure = (reason: string) => {
      if (styleLoadedRef.current) return; // a style already loaded — ignore later, unrelated errors
      if (styleAttemptRef.current === "primary") {
        styleAttemptRef.current = "fallback";
        setMapError(`Primary map style ${reason} — trying fallback`);
        armStyleTimeout();
        map.setStyle(FALLBACK_STYLE_URL);
      } else {
        clearStyleTimeout();
        setMapError(`Map unavailable (${reason}). Radar and aircraft still work — this only affects the background map.`);
      }
    };

    map.on("error", (e: MapLibreErrorEvent) => {
      if (styleLoadedRef.current) return;
      handleStyleFailure(e.error?.message?.slice(0, 120) || "failed to load");
    });

    // Expose the map as soon as it exists, not once the style/tiles finish
    // loading: `map.project()`/`map.on('click', ...)` are pure camera-transform
    // and DOM-interaction features that work immediately, and the radar
    // overlay (rings/sweep/aircraft/user marker) must never be held hostage
    // by a slow or unreachable tile CDN. Only style-dependent setup (adding
    // the airports source/layers, toggling layer visibility) waits for the
    // style to actually finish loading.
    mapRef.current = map;
    onMapReady(map);
    armStyleTimeout();

    // 'style.load' — unlike 'load', which only ever fires once for a Map
    // instance's whole lifetime — fires every time a style successfully
    // finishes loading, including after our own setStyle(fallback) call.
    // Relying on 'load' here left the error banner stuck (and airports/layer
    // toggles broken) whenever the *fallback* was the one that actually
    // succeeded, because 'load' had nothing left to fire for.
    map.on("style.load", () => {
      clearStyleTimeout();
      styleLoadedRef.current = true;
      setMapError(null);
      setActiveStyle(styleAttemptRef.current);
      ensureAirportLayers(map);
      applyMapLayerVisibility(map, {
        roads: prefs.roadsEnabled,
        cities: prefs.citiesEnabled,
        neighborhoods: prefs.neighborhoodsEnabled,
      });
    });
    return () => {
      clearStyleTimeout();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the map centered + scaled to the selected range whenever locked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!lockCenter) return;

    const container = containerRef.current;
    const minDim = container ? Math.min(container.clientWidth, container.clientHeight) : 600;
    const desiredRadiusPx = minDim * 0.42;
    const zoom = computeZoom(center.latitude, milesToMeters(rangeMiles), desiredRadiusPx);

    map.easeTo({ center: [center.longitude, center.latitude], zoom, duration: 500 });
  }, [center.latitude, center.longitude, rangeMiles, lockCenter]);

  // Re-enable/disable manual panning based on lock state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lockCenter) map.dragPan.disable();
    else map.dragPan.enable();
  }, [lockCenter]);

  // Heading-up (dynamic) rotation: keep the map's own bearing in sync with
  // the device heading so its tiles/roads/airports rotate along with the
  // radar overlay drawn on top (RadarCanvas does the equivalent math for its
  // own polar plot). Applied with setBearing (no animation) since heading
  // updates can arrive many times a second — only skip tiny jitter so we
  // aren't forcing a repaint every frame for a fraction of a degree.
  const lastBearingRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = headingUpMode && userHeading !== null ? userHeading : 0;
    if (Math.abs(normalizeSignedDegrees(target - lastBearingRef.current)) < 1) return;
    lastBearingRef.current = target;
    if (!headingUpMode) {
      map.easeTo({ bearing: 0, duration: 300 });
    } else {
      map.setBearing(target);
    }
  }, [headingUpMode, userHeading]);

  // Layer visibility toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyMapLayerVisibility(map, {
      roads: prefs.roadsEnabled,
      cities: prefs.citiesEnabled,
      neighborhoods: prefs.neighborhoodsEnabled,
    });
  }, [prefs.roadsEnabled, prefs.citiesEnabled, prefs.neighborhoodsEnabled]);

  // Airports data, refreshed as center/range/toggle change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(AIRPORTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (!prefs.airportsEnabled) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const contextRadiusMeters = milesToMeters(rangeMiles * 1.4);
    const airports = nearbyAirports(center, contextRadiusMeters).filter(
      (a) => rangeMiles >= 15 || a.size !== "major" || a.distanceMeters < milesToMeters(rangeMiles * 1.4)
    );

    source.setData({
      type: "FeatureCollection",
      features: airports.map((a) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.longitude, a.latitude] },
        properties: { label: a.iata ?? a.icao, size: a.size, name: a.name },
      })),
    });
  }, [center, rangeMiles, prefs.airportsEnabled]);

  return (
    <>
      {/*
        MapLibre's own stylesheet sets `.maplibregl-map { position: relative }`
        on the element we hand it, which — depending on CSS import order — can
        outrank Tailwind's `.absolute` utility on the very same element and
        collapse it to zero height. Sizing this div with explicit inline
        width/height (rather than relying on `position: absolute` + `inset-0`
        to stretch it) sidesteps that cascade fight entirely.
      */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            filter: activeStyle === "fallback" ? FALLBACK_DARKEN_FILTER : undefined,
          }}
          aria-hidden="true"
        />
      </div>
      {/* Kept clear of the right-hand control stack (compass / orientation /
          lock), which this used to sit on top of and hide. */}
      {mapError && (
        <div className="pointer-events-none absolute left-3 right-28 top-32 z-10 rounded-md border border-radar-panelborder bg-radar-panel/85 px-3 py-1.5 text-center font-mono text-[9px] leading-tight text-radar-textdim backdrop-blur-sm">
          {mapError}
        </div>
      )}
    </>
  );
}
