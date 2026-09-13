# SkyRadar

**See what's flying around you.**

SkyRadar is a personal, real-time aviation radar. It combines a real
geographic map, a radar-style overlay, live airborne aircraft, aircraft
identification, a compass, "Look Here" directional guidance, and an AR
"Sky View" mode — all on one screen, centered on your current location.

This is a private/non-commercial project: no ads, accounts, subscriptions,
or analytics.

## Running it locally

```bash
npm install
npm run dev
```

Open the app on **https**, or on `localhost` (browsers exempt localhost from
the secure-context requirement) — geolocation, device orientation, and the
camera (for Sky View) all require a secure context on a real device.

No API keys are required to get the full experience: with no Flightradar24
credentials configured, SkyRadar automatically uses a built-in **live
traffic simulator** (see [Aircraft data](#aircraft-data) below) so every
feature — radar, silhouettes, categories, trails, Look Here, Sky View — works
immediately.

On first load, allow location access (and camera, if you open Sky View). If
you don't want to grant real location access while exploring, the location
screen offers a "Use demo location instead" fallback centered on Portland,
OR.

## Product philosophy

SkyRadar is deliberately **not** a smaller Flightradar24. Flightradar24 (or
whatever provider sits behind the data layer) is just a data source. SkyRadar
answers two questions Flightradar24 doesn't:

> "What is flying around me **right now**?"
> "Where do I **look** to see it?"

Everything in the design — the radar sweep, the compass, Look Here, Sky View —
serves that. See the in-app Settings/Layers panels for the full set of
controls; there is intentionally no second screen.

## Architecture

```
LocationManager      → useGeolocation (src/hooks)
HeadingManager        → useDeviceHeading (compass, iOS permission handling)
MotionManager         → useDeviceMotion / useDevicePitch (gyro/accelerometer)
AircraftDataProvider  → src/lib/aircraft/providers (FR24 | simulator)
AircraftClassifier    → src/lib/aircraft/classify.ts
AircraftPositionEngine→ src/lib/geo.ts (distance/bearing/relative bearing/elevation)
RadarRenderer /
AircraftRenderer      → src/components/RadarCanvas.tsx (single canvas: map
                        overlay, rings, sweep, trails, silhouettes, hit-testing)
MapRenderer           → src/components/MapView.tsx (MapLibre GL, dark style)
AircraftDetailCard    → src/components/AircraftCard.tsx
LookHereEngine        → src/components/LookHereOverlay.tsx
SkyViewEngine         → src/components/SkyView.tsx (camera + AR overlay)
LayerManager /
SettingsManager       → src/store/usePreferencesStore.ts (persisted)
```

**Rendering model.** The geographic map (MapLibre GL, a free CARTO Dark
Matter vector style — no API key needed) is the base layer. A single
`<canvas>` sits on top of it and draws everything else — radar rings, the
rotating sweep, aircraft silhouettes, trails, and labels — every animation
frame, using `map.project()` to convert each aircraft's real lat/lon into
screen pixels. This keeps the radar sweep and aircraft animation smooth at
60fps independent of how often new data arrives (aircraft positions are
interpolated between polls; see `src/lib/render/interpolate.ts`), and keeps
radar rings dimensionally accurate to the selected range in miles regardless
of zoom.

The canvas itself is `pointer-events: none`; aircraft selection is handled
via the map's own `click` event plus a small hit-test against each frame's
drawn marker positions, so panning/gestures on the base map are never
blocked.

**Data flow.** The browser never talks to Flightradar24 directly. It polls
`/api/aircraft?lat=&lon=&rangeMiles=` (a Next.js route handler), which asks
the configured `AircraftDataProvider` for aircraft within that radius,
normalizes the result into the app's internal `Aircraft` model, and returns
only aircraft currently airborne. Aircraft photos are looked up on demand
(only when a card is expanded) via `/api/aircraft/photo`, using the public
Planespotters.net API by registration.

## Aircraft data

```
AircraftDataProvider (src/lib/aircraft/types.ts)
    ├── Flightradar24Provider   — real FR24 API (paid), server-side only
    ├── AdsbAggregatorProvider  — adsb.lol / airplanes.live / adsb.fi (free, keyless)
    ├── OpenSkyProvider         — real OpenSky Network API (free, last resort)
    └── MockAircraftProvider    — local fake-traffic simulator (dev-only opt-in)
```

**SkyRadar's rule: it never shows an aircraft, number, or value that isn't
real and at your real location.** The simulator exists purely for local
development and is never selected automatically — see below.

With no configuration at all, `/api/aircraft` runs a **failover chain** of
real sources (`failover.ts`) and returns the first that answers, sharing one
request deadline so several attempts still fit inside a serverless budget.
The keyless community ADS-B aggregators come first: they need no account,
answer a radius query directly, and report the most real detail —
registration, ICAO type, model, owner/operator, and a military flag, all
straight off the aircraft's own transmissions, already in feet and knots.

OpenSky trails them because its anonymous tier quotas by source IP, which a
shared serverless address tends to exhaust (setting
`OPENSKY_USERNAME`/`OPENSKY_PASSWORD` raises that quota). Its free tier also
reports only position/callsign/speed/altitude/heading — no registration,
type, model, or operator — so those fields are hidden rather than guessed.

Aircraft whose position is over a minute stale, that are on the ground, or
that report no position at all are dropped: a real aircraft plotted where it
no longer is would still be a lie.

### Debugging live data

Open **`/api/aircraft/diagnostics?lat=<lat>&lon=<lon>&rangeMiles=15`** in a
browser to see what every source is doing right now — which answered, how
fast, what each failed with, how many aircraft came back, and the five
nearest with their real details. When the radar says "LIVE DATA
UNAVAILABLE", the banner also names the provider and its error directly.

Set `FR24_API_KEY` (and optionally `FR24_API_BASE_URL`) in `.env.local` to
use the real Flightradar24 API instead (richer metadata, but a paid plan)
— see `.env.example`. The key is read only inside the `/api/aircraft` route
handler and is never sent to the client. Flightradar24's API schema can
vary by plan/version; field parsing in `flightradar24.ts` is defensive
(every field optional) but double-check field names against your
account's docs if you wire up real credentials.

`MockAircraftProvider` (a small live simulation: aircraft spawn with a
plausible callsign/type/operator/altitude/speed for their category, then
move continuously and eventually "land") only ever runs if you explicitly
set `AIRCRAFT_PROVIDER=mock` — intended for developing/testing without any
network calls. The UI shows a permanent "SIMULATED DATA" watermark whenever
it's active, and this should never be set in a real deployment.

If a real provider's request fails (rate-limited, network error, etc.),
`/api/aircraft` returns an error and the app shows a "LIVE DATA UNAVAILABLE"
status — it never silently substitutes fake aircraft.

## Design language

Dark, desaturated map; restrained radar green; clean vector aircraft
silhouettes (no emoji, no generic single icon — see
`src/lib/render/silhouettes.ts`) that rotate with heading and differ by
category (airliner, regional jet, turboprop, GA, helicopter, military
helicopter, fighter, military transport); a subtle, distinct treatment for
military/government aircraft (different silhouette + small diamond
indicator + faint outline, never a giant red marker). Category is always
also conveyed by shape and label text, never by color alone.

## Privacy

Location is used only to compute what's around you. SkyRadar does not
store location history or send precise location to third parties; it
requests only the accuracy each feature needs (standard accuracy for the
radar, high accuracy only while Sky View is open). Camera access is
requested only when Sky View is opened, and camera frames never leave the
device — they're used purely as an AR background.

## Known limitations

- Sky View is a **directional AR guide**, not an optical sighting tool — it
  cannot see through clouds, buildings, or terrain. It shows where an
  aircraft's position and altitude place it relative to your current
  heading, approximated from the device's compass and orientation sensors.
- The elevation/"look up" angle and Sky View marker placement are practical
  approximations (see `src/lib/geo.ts`), not precision instruments.
- `npm audit` currently flags advisories against Next.js/`eslint-config-next`
  and a nested `glob`. Nearly all of them concern features this app doesn't
  use (Server Actions, i18n Middleware, custom servers, the Image
  Optimization API, WebSocket-upgrade proxying) or dev-only tooling
  (`eslint-config-next`'s transitive `glob`, not shipped at runtime).
  Clearing them fully means moving to Next.js 16 (a breaking major-version
  change, including a React 19 requirement) — worth doing as deliberate
  follow-up, not folded into this build.
