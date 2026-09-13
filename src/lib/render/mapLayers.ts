import type { Map as MapLibreMap } from "maplibre-gl";

export const AIRPORTS_SOURCE_ID = "skyradar-airports";
export const AIRPORTS_CIRCLE_LAYER_ID = "skyradar-airports-circle";

/**
 * SkyRadar's only overlay on the basemap: a dot per nearby airport.
 *
 * Deliberately circles and not labelled symbols — a symbol layer needs the
 * style to provide glyphs, which a raster basemap has none of, and the tiles
 * already carry airport names of their own.
 *
 * Safe to call on every style load: MapLibre drops everything we added when
 * the style is replaced, and this re-adds only what's missing.
 */
export function ensureAirportLayers(map: MapLibreMap) {
  if (!map.getSource(AIRPORTS_SOURCE_ID)) {
    map.addSource(AIRPORTS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(AIRPORTS_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: AIRPORTS_CIRCLE_LAYER_ID,
      type: "circle",
      source: AIRPORTS_SOURCE_ID,
      paint: {
        "circle-radius": ["match", ["get", "size"], "major", 5, "regional", 4, 3],
        "circle-color": "#3d5a52",
        "circle-stroke-color": "#7d938c",
        "circle-stroke-width": 1,
        "circle-opacity": 0.85,
      },
    });
  }
}
