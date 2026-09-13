"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  ErrorEvent as MapLibreErrorEvent,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LatLon, milesToMeters, normalizeSignedDegrees } from "../lib/geo";
import { RangeMiles } from "../store/useRadarStore";

/**
 * The basemap is deliberately raster, not vector. A vector style has to
 * fetch a style document, then glyphs, then sprites, then render dozens of
 * layers — every one a way to end up staring at a black screen. Raster
 * tiles are just images: they either arrive and you see a map, or they
 * don't and we say so. The style below is defined inline, so not even the
 * style document is a network dependency.
 *
 * Labels come baked into the tiles, which is why SkyRadar no longer carries
 * its own city/neighbourhood/road layers.
 */

const BASEMAP_SOURCE_ID = "skyradar-basemap";
const BASEMAP_LAYER_ID = "skyradar-basemap-layer";
/**
 * Metres per pixel at zoom 0 on the equator.
 *
 * MapLibre lays the world out on 512px tiles, so one of its zoom levels
 * covers half the ground that the 256px scheme (Leaflet, Google, and most
 * formulas you'll find written down) does at the same number — hence
 * 78271.5, not the widely-quoted 156543.0. Using the 256px figure put the
 * camera a full zoom level too close, so the map showed half the ground the
 * radar rings claimed and every overlay landed at half its true distance
 * from the centre.
 */
const METERS_PER_PIXEL_AT_Z0 = 78271.51696;
/** How long a basemap gets to deliver its first tile before we try the next. */
const FIRST_TILE_TIMEOUT_MS = 9000;
/** Tile errors tolerated before giving up on a basemap that has shown nothing. */
const MAX_TILE_ERRORS = 8;

interface BasemapLayer {
  tiles: string[];
  tileSize: number;
  maxzoom: number;
}

interface Basemap {
  id: string;
  attribution: string;
  /** Light basemaps get dimmed so the radar overlay stays readable on top. */
  light?: boolean;
  /** Drawn in order — typically a base coat, then a transparent label coat. */
  layers: BasemapLayer[];
}

// CARTO is deliberately absent: its basemaps now stamp "API KEY REQUIRED"
// across every tile unless you sign up for one.
const BASEMAPS: Basemap[] = [
  {
    id: "esri-dark",
    attribution: "© Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    layers: [
      {
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 16,
      },
      // Place names and road labels ride on a separate transparent layer.
      {
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 16,
      },
    ],
  },
  {
    id: "osm",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    light: true,
    layers: [{ tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 }],
  },
];

function buildStyle(basemap: Basemap): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    // Painted under the tiles so the app's own background shows through
    // while they stream in, instead of flashing white.
    { id: "background", type: "background", paint: { "background-color": "#05080a" } },
  ];

  basemap.layers.forEach((layer, i) => {
    const sourceId = `${BASEMAP_SOURCE_ID}-${i}`;
    sources[sourceId] = {
      type: "raster",
      tiles: layer.tiles,
      tileSize: layer.tileSize,
      maxzoom: layer.maxzoom,
      attribution: i === 0 ? basemap.attribution : undefined,
    };
    layers.push({
      id: `${BASEMAP_LAYER_ID}-${i}`,
      type: "raster",
      source: sourceId,
      paint: basemap.light
        ? {
            // Dim a light basemap rather than inverting it — inversion turns
            // roads black and land an odd blue, which read as "broken".
            "raster-opacity": 0.8,
            "raster-brightness-max": 0.55,
            "raster-saturation": -0.35,
            "raster-contrast": 0.1,
          }
        : { "raster-opacity": 0.95 },
    });
  });

  return { version: 8, sources, layers };
}

function computeZoom(latitude: number, radiusMeters: number, desiredRadiusPx: number): number {
  const latRad = (latitude * Math.PI) / 180;
  const metersPerPx = radiusMeters / desiredRadiusPx;
  const zoom = Math.log2((METERS_PER_PIXEL_AT_Z0 * Math.cos(latRad)) / metersPerPx);
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

export default function MapView({
  center,
  rangeMiles,
  lockCenter,
  headingUpMode,
  userHeading,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const basemapIndexRef = useRef(0);
  const tileLoadedRef = useRef(false);
  const tileErrorsRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(BASEMAPS[0]),
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

    const clearWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    };

    const switchBasemap = (index: number, reason: string) => {
      clearWatchdog();
      if (index >= BASEMAPS.length) {
        setMapError(
          `No map tiles available (${reason}). Radar and aircraft still work — this only affects the background map.`
        );
        return;
      }
      basemapIndexRef.current = index;
      tileLoadedRef.current = false;
      tileErrorsRef.current = 0;
      if (index > 0) setMapError(`Map source ${reason} — trying ${BASEMAPS[index].id}`);
      map.setStyle(buildStyle(BASEMAPS[index]));
      armWatchdog();
    };

    const armWatchdog = () => {
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        if (tileLoadedRef.current) return;
        switchBasemap(basemapIndexRef.current + 1, "timed out");
      }, FIRST_TILE_TIMEOUT_MS);
    };

    // A tile actually arriving is the only proof the map is really working.
    map.on("data", (e) => {
      if (e.dataType !== "source" || !e.sourceId?.startsWith(BASEMAP_SOURCE_ID)) return;
      if (!("tile" in e) || !e.tile) return;
      tileLoadedRef.current = true;
      tileErrorsRef.current = 0;
      clearWatchdog();
      setMapError(null);
    });

    map.on("error", (e: MapLibreErrorEvent & { sourceId?: string }) => {
      if (e.sourceId && !e.sourceId.startsWith(BASEMAP_SOURCE_ID)) return;
      if (tileLoadedRef.current) return; // an odd tile failing on a working map is fine
      tileErrorsRef.current += 1;
      if (tileErrorsRef.current >= MAX_TILE_ERRORS) {
        switchBasemap(basemapIndexRef.current + 1, e.error?.message?.slice(0, 80) || "failed");
      }
    });

    // Expose the map as soon as it exists rather than once tiles arrive:
    // map.project() and click handling are pure camera/DOM features, and the
    // radar overlay must never be held hostage by a tile server.
    mapRef.current = map;
    onMapReady(map);
    armWatchdog();

    return () => {
      clearWatchdog();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the map centered + scaled to the selected range whenever locked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lockCenter) return;

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

  // Heading-up (dynamic) rotation: keep the map's bearing in sync with the
  // device so its streets rotate along with the radar overlay drawn on top.
  // setBearing (not easeTo) because heading updates arrive many times a
  // second; the 1° threshold keeps jitter from forcing constant repaints.
  const lastBearingRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = headingUpMode && userHeading !== null ? userHeading : 0;
    if (Math.abs(normalizeSignedDegrees(target - lastBearingRef.current)) < 1) return;
    lastBearingRef.current = target;
    if (!headingUpMode) map.easeTo({ bearing: 0, duration: 300 });
    else map.setBearing(target);
  }, [headingUpMode, userHeading]);

  return (
    <>
      {/*
        MapLibre's own stylesheet sets `.maplibregl-map { position: relative }`
        on the element we hand it, which — depending on CSS import order — can
        outrank Tailwind's `.absolute` utility on the same element and collapse
        it to zero height. Sizing this div with explicit inline width/height
        sidesteps that cascade fight entirely.
      */}
      <div className="absolute inset-0 overflow-hidden">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} aria-hidden="true" />
      </div>
      {mapError && (
        <div className="pointer-events-none absolute left-3 right-28 top-32 z-10 rounded-md border border-radar-panelborder bg-radar-panel/85 px-3 py-1.5 text-center font-mono text-[9px] leading-tight text-radar-textdim backdrop-blur-sm">
          {mapError}
        </div>
      )}
    </>
  );
}
