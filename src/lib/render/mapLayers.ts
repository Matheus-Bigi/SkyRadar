import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Heuristic classification of base-style layers so city/neighborhood/road
 * labels can be toggled without depending on one specific vector tile
 * schema's exact layer ids (spec #15, #51 — map layer toggles).
 */
function layerGroup(id: string): "road" | "neighborhood" | "city" | "other" {
  const lower = id.toLowerCase();
  if (/neighbourhood|neighborhood|suburb|quarter/.test(lower)) return "neighborhood";
  if (/place|city|town|village/.test(lower)) return "city";
  if (/road|street|highway|bridge|tunnel|transit/.test(lower)) return "road";
  return "other";
}

export function applyMapLayerVisibility(
  map: MapLibreMap,
  prefs: { roads: boolean; cities: boolean; neighborhoods: boolean }
) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    const group = layerGroup(layer.id);
    let visible: boolean | null = null;
    if (group === "road") visible = prefs.roads;
    if (group === "city") visible = prefs.cities;
    if (group === "neighborhood") visible = prefs.neighborhoods;
    if (visible === null) continue;
    try {
      map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
    } catch {
      // Layer doesn't support visibility toggling — ignore.
    }
  }
}

export const AIRPORTS_SOURCE_ID = "skyradar-airports";
export const AIRPORTS_CIRCLE_LAYER_ID = "skyradar-airports-circle";
export const AIRPORTS_LABEL_LAYER_ID = "skyradar-airports-label";

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
        "circle-radius": ["match", ["get", "size"], "major", 4, "regional", 3, 2],
        "circle-color": "#3d5a52",
        "circle-stroke-color": "#7d938c",
        "circle-stroke-width": 1,
        "circle-opacity": 0.85,
      },
    });
  }
  if (!map.getLayer(AIRPORTS_LABEL_LAYER_ID)) {
    map.addLayer({
      id: AIRPORTS_LABEL_LAYER_ID,
      type: "symbol",
      source: AIRPORTS_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-offset": [0, 1],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": "#7d938c",
        "text-halo-color": "#05080a",
        "text-halo-width": 1.2,
      },
    });
  }
}
