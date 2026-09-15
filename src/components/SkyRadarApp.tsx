"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useWakeLock } from "../hooks/useWakeLock";
import { useFullscreen } from "../hooks/useFullscreen";
import { useAircraftData } from "../hooks/useAircraftData";
import { useReverseGeocode } from "../hooks/useReverseGeocode";
import { usePhotoPrefetch } from "../hooks/usePhotoPrefetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { retryUnavailablePhotos } from "../lib/aircraft/photoClient";
import { useAircraftStore } from "../store/useAircraftStore";
import { useRadarStore, categoryFilterMatches, ALL_CATEGORIES } from "../store/useRadarStore";
import { useSelectionStore } from "../store/useSelectionStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { deriveGeometry, distanceMeters, feetToMeters, milesToMeters } from "../lib/geo";
import { nearbyAirports } from "../lib/airports";
import { primeAudio } from "../lib/audio/radarBeep";
import { Aircraft, AircraftCategory } from "../lib/aircraft/types";

/** How long a selected aircraft may be missing before the card lets go. */
const SELECTION_GRACE_MS = 15_000;

export default function SkyRadarApp() {
  const geo = useGeolocation(false);
  const heading = useDeviceHeading();
  // Held for as long as the app is on screen, entry screen included. Watching
  // for aircraft is mostly standing still and looking up, which is exactly
  // what a phone reads as idle.
  useWakeLock();
  const fullscreen = useFullscreen();
  const radar = useRadarStore();
  const prefs = usePreferencesStore();
  const selection = useSelectionStore();
  const aircraftStore = useAircraftStore();

  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skyViewOpen, setSkyViewOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  const refreshAircraftData = useAircraftData(geo.position, radar.rangeMiles);
  const placeName = useReverseGeocode(geo.position);
  const [mapRetryNonce, setMapRetryNonce] = useState(0);

  // Warm the photos of the aircraft overhead the moment they appear, so
  // tapping one shows its picture straight away instead of starting a lookup.
  usePhotoPrefetch(aircraftStore.current, geo.position);

  /**
   * Quietly re-runs whatever failed earlier, at a moment nobody is looking.
   *
   * Things that fail once tend to stay failed for the life of a page: a
   * photo lookup that gave up, a basemap that exhausted its fallbacks, a
   * feed that stopped answering. Reloading fixes all of it, which is why
   * reloading appeared to help — but it also means a blank screen, a
   * re-acquired GPS fix and the loss of every photo already cached. This
   * does the recovery without any of that.
   */
  const softRefresh = useCallback(() => {
    retryUnavailablePhotos();
    refreshAircraftData();
    setMapRetryNonce((n) => n + 1);
  }, [refreshAircraftData]);

  // Anything the user is reading or tracking defers the cycle to a quieter
  // moment — and recent touches count, so it never fires mid-gesture.
  const busy =
    Boolean(selection.selectedAircraftId) ||
    selection.lookHereActive ||
    skyViewOpen ||
    settingsOpen ||
    calibrationOpen ||
    Boolean(selection.overlapChoices);

  useAutoRefresh({ busy, onRefresh: softRefresh });

  // How many aircraft of each category are within the selected range.
  //
  // Deliberately independent of the category filter: the point of these
  // numbers is to say what you would get if you ticked a category, which has
  // nothing to do with what is ticked now. Derived from the data store rather
  // than from canvas rendering, so they stay right even if the map's tiles
  // are slow or fail — data presence and visual rendering are independent.
  const categoryCounts = useMemo(() => {
    const counts = {
      AIRLINE: 0,
      MILITARY: 0,
      HELICOPTER: 0,
      GENERAL_AVIATION: 0,
      OTHER: 0,
    } as Record<AircraftCategory, number>;
    if (!geo.position) return counts;
    // The same 5% headroom the scope draws with, so the count agrees with
    // what is on screen rather than with the outer ring.
    const rangeMetersLimit = milesToMeters(radar.rangeMiles) * 1.05;
    for (const a of aircraftStore.current) {
      const within =
        distanceMeters(geo.position, { latitude: a.latitude, longitude: a.longitude }) <=
        rangeMetersLimit;
      if (within) counts[a.category] += 1;
    }
    return counts;
  }, [aircraftStore, geo.position, radar.rangeMiles]);

  // What is actually on the scope right now: the categories being shown,
  // added up. Summing the same figures the rail displays is what keeps the
  // two honest with each other — ALL always equals the sum of the five, and
  // the on-screen total always equals the sum of the ticked ones.
  const visibleAircraftCount = useMemo(
    () =>
      ALL_CATEGORIES.reduce(
        (n, c) => n + (categoryFilterMatches(radar.categoryFilter, c) ? categoryCounts[c] : 0),
        0
      ),
    [categoryCounts, radar.categoryFilter]
  );

  /** Everything in range, whatever is ticked — the number ALL stands for. */
  const inRangeAircraftCount = useMemo(
    () => ALL_CATEGORIES.reduce((n, c) => n + categoryCounts[c], 0),
    [categoryCounts]
  );

  const selectedAircraft = useMemo<Aircraft | null>(() => {
    if (!selection.selectedAircraftId) return null;
    return aircraftStore.current.find((a) => a.id === selection.selectedAircraftId) ?? null;
  }, [selection.selectedAircraftId, aircraftStore]);

  /*
   * Drop a selection whose aircraft has genuinely gone.
   *
   * Without this the card simply vanished when an aircraft left range while
   * selected — and worse, the stale id kept suppressing the CLEAR SKY
   * message, leaving a completely blank scope with no explanation. Real
   * feeds also drop an aircraft for a poll or two and bring it straight
   * back, so this waits before letting go rather than dumping the card at
   * the first gap.
   */
  const lastSeenRef = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    const id = selection.selectedAircraftId;
    if (!id) {
      lastSeenRef.current = null;
      return;
    }
    const present = aircraftStore.current.some((a) => a.id === id);
    const now = Date.now();
    if (present || lastSeenRef.current?.id !== id) {
      lastSeenRef.current = { id, at: now };
      return;
    }
    if (now - lastSeenRef.current.at > SELECTION_GRACE_MS) {
      selection.select(null);
    }
    // Re-checked on every snapshot, which is what `aircraftStore` changing means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selectedAircraftId, aircraftStore.current, aircraftStore.currentAt]);

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
      (a) => categoryFilterMatches(radar.categoryFilter, a.category)
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

  // Everything that sits beside the rail — the aircraft card, the Layers
  // panel, the compass calibration panel, the rail's own handle — is anchored
  // to this one distance from the right edge, so folding the rail away moves
  // all of them together and there is a single place to get it right.
  const railCollapsed = prefs.controlRailCollapsed;

  return (
    <main
      className="relative h-full w-full select-none overflow-hidden bg-radar-bg"
      style={{ "--rail-inset": railCollapsed ? "0.75rem" : "8rem" } as React.CSSProperties}
    >
      <MapView
        center={geo.position}
        rangeMiles={radar.rangeMiles}
        lockCenter={radar.lockCenter}
        headingUpMode={prefs.headingUpMode}
        userHeading={heading.heading}
        retryNonce={mapRetryNonce}
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
          <TopBar
            status={aircraftStore.status}
            aircraftCount={visibleAircraftCount}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </div>

      {/*
        Every control lives in this one right-hand rail. They used to sit
        across the bottom of the screen, where they covered the lower part of
        the radar — exactly where aircraft to the south appear. The rail keeps
        the whole scope clear, and scrolls if a short screen can't fit it all.
      */}
      <div
        id="control-rail"
        className={clsx(
          // w-28 rather than w-24: the category rows now carry a count, and a
          // busy 30 mile scope near a hub runs to three digits. At the old
          // width "MILITARY 196" overflowed its row by a few pixels and the
          // number was clipped — a count you cannot read is worse than none.
          "no-scrollbar absolute bottom-3 right-3 top-16 z-20 flex w-28 flex-col items-stretch gap-2 overflow-y-auto",
          "transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none",
          // `invisible` rather than only sliding it off: a control parked
          // off-screen is still in the tab order and still read out, and a
          // keyboard or VoiceOver user would land on buttons they cannot see.
          // Visibility flips at the end of the transition, so the slide still
          // plays out.
          railCollapsed && "pointer-events-none invisible translate-x-[calc(100%+0.75rem)]"
        )}
      >
        {/*
          Part of the rail rather than floating beside it: an open rail then
          costs the map no more room than it already did. Sticky, because the
          rail scrolls on a short screen and a handle that scrolls out of
          reach is no handle at all.
        */}
        <button
          onClick={() => prefs.set("controlRailCollapsed", true)}
          aria-expanded
          aria-controls="control-rail"
          aria-label="Hide controls"
          title="Hide controls"
          className="sticky top-0 z-10 flex shrink-0 items-center justify-end gap-1 rounded-lg border border-radar-panelborder bg-radar-panel/90 px-2 py-1 font-mono text-[9px] leading-none tracking-widest text-radar-textdim backdrop-blur-sm hover:text-radar-text"
        >
          HIDE <span className="text-xs">{"\u203a"}</span>
        </button>

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
          <ModeToggle
            value={radar.mode}
            onChange={radar.setMode}
            skyViewAvailable={prefs.skyViewEnabled}
            skyViewActive={skyViewOpen}
            onSkyView={() => {
              primeAudio();
              setSkyViewOpen(true);
            }}
          />
        </div>

        <div className="shrink-0">
          <RangeSelector value={radar.rangeMiles} onChange={radar.setRange} />
        </div>

        <div className="shrink-0">
          <CategoryFilterBar
            value={radar.categoryFilter}
            counts={categoryCounts}
            totalInRange={inRangeAircraftCount}
            onToggle={radar.toggleCategory}
            onShowAll={radar.showAllCategories}
          />
        </div>

        {fullscreen.supported && (
          <button
            onClick={fullscreen.toggle}
            aria-pressed={fullscreen.active}
            aria-label={fullscreen.active ? "Leave full screen" : "Fill the screen"}
            className={clsx(
              "shrink-0 rounded-lg border px-2 py-1.5 font-mono text-[10px] tracking-wide backdrop-blur-sm",
              fullscreen.active
                ? "border-radar-green/40 bg-radar-panel/80 text-radar-green"
                : "border-radar-panelborder bg-radar-panel/80 text-radar-textdim hover:text-radar-text"
            )}
          >
            {fullscreen.active ? "EXIT FULL" : "FULLSCREEN"}
          </button>
        )}

      </div>

      {calibrationOpen && (
        <CompassCalibration heading={heading} onClose={() => setCalibrationOpen(false)} />
      )}

      {/*
        The way back in, shown only while the rail is folded. Rendered after
        the panels it shares a layer with, so whatever else is open, the
        control that brings the rail back is never the thing underneath. At
        the very edge of the screen it sits outside the plotted scope, unlike
        a handle parked at mid-height — which is exactly where aircraft due
        east are drawn.
      */}
      {railCollapsed && (
        <button
          onClick={() => prefs.set("controlRailCollapsed", false)}
          aria-expanded={false}
          aria-controls="control-rail"
          aria-label="Show controls"
          title="Show controls"
          className="absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-lg border border-r-0 border-radar-panelborder bg-radar-panel/90 py-4 pl-2 pr-1.5 font-mono text-xs leading-none text-radar-textdim backdrop-blur-sm hover:text-radar-text"
        >
          {"\u2039"}
        </button>
      )}

      {/* Bottom-left, clear of both the scope's centre and the control rail. */}
      {selectedAircraft && geometry && !selection.lookHereActive && (
        <div className="absolute bottom-3 left-3 right-[var(--rail-inset,8rem)] z-20 max-w-sm transition-[right] duration-200 ease-out motion-reduce:transition-none">
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
          rangeMiles={radar.rangeMiles}
          onSelect={(id) => selection.select(id)}
          onExit={() => setSkyViewOpen(false)}
          fullscreen={fullscreen}
          prefs={{ arLabelsEnabled: prefs.arLabelsEnabled, arDistanceDisplay: prefs.arDistanceDisplay }}
        />
      )}
    </main>
  );
}
