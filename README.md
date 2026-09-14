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

**Range rings.** The scope draws three rings, at a third, two thirds and
all of the selected range. Thirds rather than quarters because every range
SkyRadar offers divides cleanly by three — 1/2/3, 3/6/9, 5/10/15, 10/20/30
miles — so each ring carries a distance you can read at a glance instead of
"6.75 MI". The labels sit just inside their own ring at a fixed screen
angle, tilted off vertical to clear the "N" marker, so they stay upright and
in place whether the plot is north-up or turning with the device.

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
only aircraft currently airborne. Two further details — the photo and the
route — are looked up per aircraft when a card opens (see [Identifying one
aircraft](#identifying-one-aircraft)).

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

### Debugging a missing photo

The lookup fails silently by design — a card showing nothing is the right
outcome when no photo exists — which makes "nothing on file" and "upstream
refused us" look identical from a device. The card itself distinguishes them
(*no photo on file* vs. a retry button), and
**`/api/aircraft/details-diagnostics?hex=&registration=`** shows every
source's HTTP status and a raw response excerpt, so an empty photo list can
be told apart from a rate-limit page or a response shape we failed to read.
It bypasses every cache.

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

## Identifying one aircraft

Tapping an aircraft asks two more questions of the outside world. Both fire
when the card opens rather than when it's expanded, so the answers are
already there by the time anyone taps MORE, and both are keyed to that
aircraft's own identity and cleared the moment the selection changes —
leaving one aircraft's photo or route on another's card would be showing
something that isn't real.

**The photo** (`/api/aircraft/photo`) is a photo of that exact airframe,
never a stock image of the type. Getting one to appear — and appear
*immediately* — comes down to four things:

- *Which identifier is asked for.* The hex is broadcast by the aircraft
  itself and is always known; the registration depends on a database lookup
  the feed may never have made. Both are asked.
- *Which field the answer is read from.* Planespotters doesn't guarantee a
  `thumbnail_large` on every photo, and reading only that field turned
  perfectly good photos into "none on file".
- *How many sources are tried.* Planespotters first, then airport-data.com,
  each by hex and registration.
- *When the asking happens.* See below — this is what makes it feel instant.

Sources are grouped into tiers, and every source in a tier is asked at once,
so a tier costs **one** round trip rather than one per identifier. The second
tier is only consulted when the first has nothing, which keeps the common
case to two parallel requests.

A non-JSON response — a rate-limit page, say — is treated as an error to
retry, never as "this airframe has no photo". A confirmed absence is cached
briefly; a failure is never cached at all.

### Photos before you ask for them

The slowest possible design is to start looking for a photo at the moment
someone taps an aircraft. So SkyRadar doesn't: as aircraft appear on the
scope, the ten nearest have their photos warmed in the background
(`usePhotoPrefetch`). Nearest first, because those are the ones overhead —
the ones this whole app exists to help you identify, and the ones you are
actually going to tap.

Those requests are coalesced by `photoClient.ts` into a single batched call
(`?ac=hex|reg,hex|reg,…`), deduplicated, and cached in the browser for the
session, so tapping an aircraft usually paints its photo on the first frame
with no request at all — and re-selecting one never costs anything. The
server holds its own 12-hour cache per identifier, and the endpoint is
cacheable by the CDN, so the fastest lookup is the one that never leaves the
device.

**There is deliberately no route.** ADS-B carries none — an aircraft
broadcasts its identity, position and movement, and nothing about its
schedule — so a route has to be looked up by callsign against a flight
database. The free ones (adsb.lol's `routeset`, adsbdb) are community
maintained callsign→route tables rather than live schedule data, and they
are wrong often enough to matter: one flight on final approach to Portland
came back as Seattle→Tucson, another over Portland as Seattle→Denver when it
was really flying Portland→Newark.

SkyRadar briefly tried to rescue that with geometry — rejecting any route
that didn't fit the aircraft's position, altitude and vertical speed. It
worked, but it was an elaborate defence against a source that shouldn't be
trusted in the first place, and it left the card showing a route sometimes
and "no confirmed route" other times. Showing nothing is better than showing
a filtered guess, so the lookup was removed entirely.

Reinstating it needs an authoritative source, not a better filter. The
Flightradar24 provider already parses `orig_iata`/`dest_iata`, so setting
`FR24_API_KEY` would bring real routes in with the position data itself, no
separate lookup and no verification — at the cost of a paid plan.

**The airline name** comes from the callsign. An airliner's ADS-B callsign
*is* its operator's registered ICAO designator plus a flight number — DAL2411
is "Delta 2411" — so `airlines.ts` resolves the designator to the operator's
name. That's reading a published identifier, not inferring one; an
unrecognised designator shows nothing rather than a guess. This is
deliberately separate from the `Owner/Operator` field, which is the
airframe's registered owner and is often a leasing company or a regional
partner flying under a mainline callsign.

## The basemap

The background map is deliberately **raster**, not vector, and its style is
defined inline in `MapView.tsx` rather than fetched. A vector style has to
pull a style document, then glyphs, then sprites, then render dozens of
layers — every one of those a way to end up staring at a black screen.
Raster tiles are just images: they either arrive and you see a map, or they
don't and the app says so.

Sources are tried in order — Esri Dark Gray (a base coat plus a transparent
label coat), then OpenStreetMap, dimmed since it's a light basemap —
advancing when a basemap produces no tile within a few seconds or errors
repeatedly. A tile actually arriving is the only thing treated as proof the
map works. CARTO is deliberately absent: its basemaps now stamp "API KEY
REQUIRED" across every tile.

Place names, roads and landmarks come baked into the tiles, so SkyRadar
carries no city/neighbourhood/road layers of its own — and no overlays at
all. Airports are drawn by the radar canvas instead (see below), which can
label them; a raster style ships no glyphs to render text with.

### Keeping the overlay glued to the map

Anything with a real position — aircraft, airports, the range rings — is
placed through `map.project()` whenever a map exists, so it cannot drift
away from the ground feature it sits over. The polar bearing/distance plot
remains only for when there is no map at all; `map.project()` is camera
arithmetic and needs no tiles, so this stays independent of tile servers.

Drawing a polar plot *alongside* a Mercator map means trusting two
independent scale calculations to agree, and they didn't: the camera zoom
was derived with the 256px-tile constant (156543.0) while MapLibre lays the
world out on 512px tiles (78271.5). That put the map a full zoom level too
close, so every overlay landed at half its true distance from centre — the
error growing with distance, which is why the centred "you are here" marker
looked perfect while the airports were miles out.

## Compass

Phone and tablet magnetometers drift, and cases, speakers and car dashboards
throw them off further. Two things address that:

- **Screen-orientation correction.** Both `webkitCompassHeading` and the
  `alpha` fallback report where the device's *natural top edge* points. Hold
  an iPad in landscape and that's no longer the top of what you're looking
  at, so the reading is a clean 90° out until the page's rotation is
  subtracted.
- **Manual calibration.** Tap the compass dial to open a panel showing the
  raw sensor reading, the screen angle, the applied offset and the resulting
  heading, with nudge buttons to line the radar up with what's actually out
  the window. The offset persists.

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
