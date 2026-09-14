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
import CompassCalibration from "./CompassCalibration";
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
import { useReverseGeocode } from "../hooks/useReverseGeocode";
import { usePhotoPrefetch } from "../hooks/usePhotoPrefetch";
import { useAircraftStore } from "../store/useAircraftStore";
import { useRadarStore } from "../store/useRadarStore";
import { useSelectionStore } from "../store/useSelectionStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { deriveGeometry, distanceMeters, feetToMeters, milesToMeters } from "../lib/geo";
import { nearbyAirports } from "../lib/airports";
import { primeAudio } from "../lib/audio/radarBeep";
import { Aircraft } from "../lib/aircraft/types";

export default function SkyRadarApp() {
  const geo = useGeolocation(false);
  const heading = useDeviceHeading();
  const radar = useRadarStore();
  const prefs = usePreferencesStore();
  const selection = useSelectionStore();
  const aircraftStore = useAircraftStore();

  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [skyViewOpen, setSkyViewOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  useAircraftData(geo.position, radar.rangeMiles);
  const placeName = useReverseGeocode(geo.position);

  // Warm the photos of the aircraft overhead the moment they appear, so
  // tapping one shows its picture straight away instead of starting a lookup.
  usePhotoPrefetch(aircraftStore.current, geo.position);

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

  // Airports within a little beyond the current ring, so one just outside
  // the edge still gives you something to orient by.
  const airports = useMemo(() => {
    if (!geo.position) return [];
    return nearbyAirports(geo.position, milesToMeters(radar.rangeMiles * 1.25)).map((a) => ({
      latitude: a.latitude,
      longitude: a.longitude,
      label: a.iata ?? a.icao,
      major: a.size === "major",
    }));
  }, [geo.position, radar.rangeMiles]);

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

  return (
    <main className="relative h-full w-full select-none overflow-hidden bg-radar-bg">
      <MapView
        center={geo.position}
        rangeMiles={radar.rangeMiles}
        lockCenter={radar.lockCenter}
        headingUpMode={prefs.headingUpMode}
        userHeading={heading.heading}
        onMapReady={setMapInstance}
      />

      <RadarCanvas
        map={mapInstance}
        airports={airports}
        userPosition={geo.position}
        userAltitudeMeters={geo.altitudeMeters ?? 0}
        userHeading={heading.heading}
        mode={radar.mode}
        rangeMiles={radar.rangeMiles}
        categoryFilter={radar.categoryFilter}
        selectedAircraftId={selection.selectedAircraftId}
        lockCenter={radar.lockCenter}
        headingUpMode={prefs.headingUpMode}
        placeName={placeName}
        prefs={{
          radarGraphicsEnabled: prefs.radarGraphicsEnabled,
          airportsEnabled: prefs.airportsEnabled,
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
      <DataStatusBanner
        status={aircraftStore.status}
        source={aircraftStore.source}
        error={aircraftStore.error}
      />

      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
        <div className="flex-1">
          <TopBar status={aircraftStore.status} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/*
        Every control lives in this one right-hand rail. They used to sit
        across the bottom of the screen, where they covered the lower part of
        the radar — exactly where aircraft to the south appear. The rail keeps
        the whole scope clear, and scrolls if a short screen can't fit it all.
      */}
      <div className="no-scrollbar absolute bottom-3 right-3 top-16 z-20 flex w-24 flex-col items-stretch gap-2 overflow-y-auto">
        <div className="flex justify-center">
          <CompassWidget heading={heading.heading} onCalibrate={() => setCalibrationOpen((v) => !v)} />
        </div>

        {heading.supported && (
          <button
            onClick={() => {
              const next = !prefs.headingUpMode;
              prefs.set("headingUpMode", next);
              if (next && heading.permission === "unknown") heading.requestPermission();
            }}
            aria-pressed={prefs.headingUpMode}
            aria-label="Toggle heading-up rotation"
            className={clsx(
              "shrink-0 rounded-full border py-1 font-mono text-[9px] tracking-widest backdrop-blur-sm",
              prefs.headingUpMode
                ? "border-radar-green/40 bg-radar-panel/80 text-radar-green"
                : "border-radar-panelborder bg-radar-panel/80 text-radar-textdim"
            )}
          >
            {prefs.headingUpMode ? "HDG UP" : "N UP"}
          </button>
        )}

        <button
          onClick={() => radar.setLockCenter(!radar.lockCenter)}
          aria-pressed={radar.lockCenter}
          aria-label="Lock center on my location"
          className={clsx(
            "shrink-0 rounded-full border py-1 font-mono text-[9px] tracking-widest backdrop-blur-sm",
            radar.lockCenter
              ? "border-radar-green/40 bg-radar-panel/80 text-radar-green"
              : "border-radar-panelborder bg-radar-panel/80 text-radar-textdim"
          )}
        >
          {radar.lockCenter ? "LOCKED" : "FREE"}
        </button>

        <div className="shrink-0">
          <ModeToggle value={radar.mode} onChange={radar.setMode} />
        </div>

        <div className="shrink-0">
          <RangeSelector value={radar.rangeMiles} onChange={radar.setRange} />
        </div>

        <div className="shrink-0">
          <CategoryFilterBar value={radar.categoryFilter} onChange={radar.setCategoryFilter} />
        </div>

        <button
          onClick={() => setLayersOpen((v) => !v)}
          aria-pressed={layersOpen}
          className="shrink-0 rounded-lg border border-radar-panelborder bg-radar-panel/80 px-2 py-1.5 font-mono text-[11px] tracking-wide text-radar-textdim backdrop-blur-sm hover:text-radar-text"
        >
          LAYERS
        </button>

        {prefs.skyViewEnabled && (
          <button
            onClick={() => {
              primeAudio();
              setSkyViewOpen(true);
            }}
            className="shrink-0 rounded-lg bg-radar-green/90 px-2 py-1.5 font-mono text-[11px] tracking-wide text-black shadow-glow"
          >
            SKY VIEW
          </button>
        )}
      </div>

      {layersOpen && <LayersPanel onClose={() => setLayersOpen(false)} />}
      {calibrationOpen && (
        <CompassCalibration heading={heading} onClose={() => setCalibrationOpen(false)} />
      )}

      {/* Bottom-left, clear of both the scope's centre and the control rail. */}
      {selectedAircraft && geometry && !selection.lookHereActive && (
        <div className="absolute bottom-3 left-3 right-28 z-20 max-w-sm">
          <AircraftCard
            aircraft={selectedAircraft}
            geometry={geometry}
            expanded={selection.cardExpanded}
            onToggleExpand={() => selection.setExpanded(!selection.cardExpanded)}
            onClose={() => selection.select(null)}
            onLookHere={() => selection.setLookHereActive(true)}
          />
        </div>
      )}

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
