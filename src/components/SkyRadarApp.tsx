"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Map as MapLibreMap } from "maplibre-gl";

import MapView from "./MapView";
import RadarCanvas from "./RadarCanvas";
import TopBar from "./TopBar";
import RangeSelector from "./RangeSelector";
import ModeToggle from "./ModeToggle";
import CategoryFilterBar from "./CategoryFilterBar";
import CompassWidget from "./CompassWidget";
import LayersPanel from "./LayersPanel";
import SettingsPanel from "./SettingsPanel";
import AircraftCard from "./AircraftCard";
import LookHereOverlay from "./LookHereOverlay";
import SkyView from "./SkyView";
import LocationGate from "./LocationGate";
import EmptyState from "./EmptyState";
import DataStatusBanner from "./DataStatusBanner";
import OverlapPicker from "./OverlapPicker";

import { useGeolocation } from "../hooks/useGeolocation";
import { useDeviceHeading } from "../hooks/useDeviceHeading";
import { useAircraftData } from "../hooks/useAircraftData";
import { useAmbientMode } from "../hooks/useAmbientMode";
import { useAircraftStore } from "../store/useAircraftStore";
import { useRadarStore } from "../store/useRadarStore";
import { useSelectionStore } from "../store/useSelectionStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { deriveGeometry, distanceMeters, feetToMeters, milesToMeters } from "../lib/geo";
import { primeAudio } from "../lib/audio/radarBeep";
import { Aircraft } from "../lib/aircraft/types";

export default function SkyRadarApp() {
  const geo = useGeolocation(false);
  const heading = useDeviceHeading();
  const radar = useRadarStore();
  const prefs = usePreferencesStore();
  const selection = useSelectionStore();
  const aircraftStore = useAircraftStore();
  const ambient = useAmbientMode(9000);

  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [skyViewOpen, setSkyViewOpen] = useState(false);

  useAircraftData(geo.position, radar.rangeMiles);

  // Derived directly from the data store (not from canvas rendering) so the
  // empty state stays correct even if the map's tiles are slow or fail to
  // load — data presence and visual rendering are independent concerns.
  const visibleAircraftCount = useMemo(() => {
    if (!geo.position) return 0;
    const rangeMetersLimit = milesToMeters(radar.rangeMiles) * 1.05;
    return aircraftStore.current.filter(
      (a) =>
        (radar.categoryFilter === "ALL" || a.category === radar.categoryFilter) &&
        distanceMeters(geo.position!, { latitude: a.latitude, longitude: a.longitude }) <= rangeMetersLimit
    ).length;
  }, [aircraftStore, geo.position, radar.rangeMiles, radar.categoryFilter]);

  const selectedAircraft = useMemo<Aircraft | null>(() => {
    if (!selection.selectedAircraftId) return null;
    return aircraftStore.current.find((a) => a.id === selection.selectedAircraftId) ?? null;
  }, [selection.selectedAircraftId, aircraftStore]);

  const overlapAircraft = useMemo<Aircraft[]>(() => {
    if (!selection.overlapChoices) return [];
    return selection.overlapChoices
      .map((id) => aircraftStore.current.find((a) => a.id === id))
      .filter((a): a is Aircraft => Boolean(a));
  }, [selection.overlapChoices, aircraftStore]);

  const geometry = useMemo(() => {
    if (!selectedAircraft || !geo.position) return null;
    return deriveGeometry(
      geo.position,
      geo.altitudeMeters ?? 0,
      heading.heading ?? 0,
      { latitude: selectedAircraft.latitude, longitude: selectedAircraft.longitude },
      feetToMeters(selectedAircraft.altitude ?? 0)
    );
  }, [selectedAircraft, geo.position, geo.altitudeMeters, heading.heading]);

  const skyViewAircraft = useMemo(() => {
    return aircraftStore.current.filter(
      (a) => radar.categoryFilter === "ALL" || a.category === radar.categoryFilter
    );
  }, [aircraftStore, radar.categoryFilter]);

  if (!geo.position) {
    return (
      <LocationGate
        status={geo.status}
        error={geo.error}
        onRequest={geo.request}
        onUseDemo={geo.useDemoLocation}
      />
    );
  }

  const chromeHidden = ambient.ambient && !selection.selectedAircraftId && !settingsOpen && !layersOpen;

  return (
    <main className="relative h-full w-full select-none overflow-hidden bg-radar-bg">
      <MapView center={geo.position} rangeMiles={radar.rangeMiles} lockCenter={radar.lockCenter} onMapReady={setMapInstance} />

      <RadarCanvas
        map={mapInstance}
        userPosition={geo.position}
        userAltitudeMeters={geo.altitudeMeters ?? 0}
        userHeading={heading.heading}
        mode={radar.mode}
        rangeMiles={radar.rangeMiles}
        categoryFilter={radar.categoryFilter}
        selectedAircraftId={selection.selectedAircraftId}
        lockCenter={radar.lockCenter}
        prefs={{
          radarGraphicsEnabled: prefs.radarGraphicsEnabled,
          aircraftTrailsEnabled: prefs.aircraftTrailsEnabled,
          showCallsigns: prefs.showCallsigns,
          militaryHighlighting: prefs.militaryHighlighting,
          visualRangeHighlight: prefs.visualRangeHighlight,
          radarSoundEnabled: prefs.radarSoundEnabled,
        }}
        onSelect={(id) => selection.select(id)}
        onOverlapChoices={(ids) => selection.setOverlapChoices(ids)}
      />

      {aircraftStore.status === "ready" && visibleAircraftCount === 0 && !selection.selectedAircraftId && (
        <EmptyState rangeMiles={radar.rangeMiles} />
      )}
      <DataStatusBanner status={aircraftStore.status} />

      <div
        className={clsx(
          "absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 transition-opacity duration-700",
          chromeHidden && "pointer-events-none opacity-0"
        )}
      >
        <div className="flex-1">
          <TopBar status={aircraftStore.status} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      <div
        className={clsx(
          "absolute right-3 top-16 flex flex-col items-end gap-2 transition-opacity duration-700",
          ambient.ambient ? "opacity-50" : "opacity-100"
        )}
      >
        <CompassWidget heading={heading.heading} />
        <button
          onClick={() => radar.setLockCenter(!radar.lockCenter)}
          aria-pressed={radar.lockCenter}
          aria-label="Lock center on my location"
          className={clsx(
            "rounded-full border px-2 py-1 font-mono text-[9px] tracking-widest backdrop-blur-sm",
            radar.lockCenter
              ? "border-radar-green/40 bg-radar-panel/80 text-radar-green"
              : "border-radar-panelborder bg-radar-panel/80 text-radar-textdim"
          )}
        >
          {radar.lockCenter ? "LOCKED" : "FREE"}
        </button>
      </div>

      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 transition-opacity duration-700",
          chromeHidden && "pointer-events-none opacity-0"
        )}
      >
        {selectedAircraft && geometry && !selection.lookHereActive && (
          <AircraftCard
            aircraft={selectedAircraft}
            geometry={geometry}
            expanded={selection.cardExpanded}
            onToggleExpand={() => selection.setExpanded(!selection.cardExpanded)}
            onClose={() => selection.select(null)}
            onLookHere={() => selection.setLookHereActive(true)}
          />
        )}

        <div className="w-full max-w-md">
          <CategoryFilterBar value={radar.categoryFilter} onChange={radar.setCategoryFilter} />
        </div>

        <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-2">
          <RangeSelector value={radar.rangeMiles} onChange={radar.setRange} />
          <ModeToggle value={radar.mode} onChange={radar.setMode} />
          <div className="relative">
            <button
              onClick={() => setLayersOpen((v) => !v)}
              className="rounded-lg border border-radar-panelborder bg-radar-panel/80 px-3 py-1.5 font-mono text-[11px] tracking-wide text-radar-textdim backdrop-blur-sm hover:text-radar-text"
            >
              LAYERS
            </button>
            {layersOpen && <LayersPanel onClose={() => setLayersOpen(false)} />}
          </div>
          {prefs.skyViewEnabled && (
            <button
              onClick={() => {
                primeAudio();
                setSkyViewOpen(true);
              }}
              className="rounded-lg bg-radar-green/90 px-4 py-1.5 font-mono text-[11px] tracking-wide text-black shadow-glow"
            >
              SKY VIEW
            </button>
          )}
        </div>
      </div>

      {selection.lookHereActive && selectedAircraft && geometry && (
        <LookHereOverlay
          aircraft={selectedAircraft}
          geometry={geometry}
          onClose={() => selection.setLookHereActive(false)}
        />
      )}

      {overlapAircraft.length > 0 && (
        <OverlapPicker
          aircraft={overlapAircraft}
          onPick={(id) => selection.select(id)}
          onDismiss={() => selection.setOverlapChoices(null)}
        />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {skyViewOpen && geo.position && (
        <SkyView
          aircraft={skyViewAircraft}
          userPosition={geo.position}
          userAltitudeMeters={geo.altitudeMeters ?? 0}
          selectedAircraftId={selection.selectedAircraftId}
          onSelect={(id) => selection.select(id)}
          onExit={() => setSkyViewOpen(false)}
          prefs={{ arLabelsEnabled: prefs.arLabelsEnabled, arDistanceDisplay: prefs.arDistanceDisplay }}
        />
      )}
    </main>
  );
}
