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
MotionManager         → useDeviceMotion / useDeviceAttitude (pitch + roll)
AircraftDataProvider  → src/lib/aircraft/providers (FR24 | simulator)
AircraftClassifier    → src/lib/aircraft/classify.ts
AircraftPositionEngine→ src/lib/geo.ts (distance/bearing/relative bearing/elevation)
RadarRenderer /
AircraftRenderer      → src/components/RadarCanvas.tsx (single canvas: map
                        overlay, rings, sweep, trails, silhouettes, hit-testing)
MapRenderer           → src/components/MapView.tsx (MapLibre GL, dark style)
AircraftDetailCard    → src/components/AircraftCard.tsx
LookHereEngine        → src/components/LookHereOverlay.tsx
SkyViewEngine         → src/components/SkyView.tsx (camera + guidance)
                        src/components/SkyViewCanvas.tsx (the HUD)
                        src/lib/ar/projection.ts (sky → screen)
                        src/lib/ar/attitude.ts (sensor angles → pitch/roll)
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

The slowest possible design is to start looking for a photo when someone
taps an aircraft. SkyRadar doesn't: every aircraft on the scope is queued
the moment it appears, and by the time you tap one its picture is usually
already there.

**Order matters more than volume.** On a typical scope most contacts are
general aviation, but the ones people actually tap are the airliners and the
military traffic — so those are fetched first, rotorcraft next, everything
else last, nearest first within each band. Nothing is skipped; a GA contact
still gets its photo, it just waits behind the ones more likely to be
wanted. Tapping an aircraft promotes it straight to the front of the queue,
so even one the queue hadn't reached is fetched immediately.

**The browser asks first.** Planespotters' photo API is built to be called
from a page — tar1090 does exactly that — so SkyRadar tries it directly from
the device before falling back to its own server. Going direct uses the
viewer's own address and their browser's own user agent, rather than a
serverless function's shared address and a custom agent string, which can be
the difference between being served and being throttled. It is also simply
faster: no hop through our server at all. If that route turns out to be
blocked by CORS, the first failure latches it off for the session and
everything goes through the server batch instead — which is also where the
second photo service lives.

**A miss is not final.** An empty answer can mean "this airframe has no
photo" or "that service was having a moment", and those are indistinguishable
at the time. Each aircraft gets three rounds, spaced seconds apart, with the
caches bypassed on later rounds so a retry genuinely retries. Until those are
exhausted the card shows a framed placeholder with a sweeping mark, so a
photo still on its way looks like a photo on its way rather than a bug. Only
afterwards does the card say *no photo available*, with a retry button.

One thing the server deliberately does **not** do is let the CDN cache an
empty answer. A successful lookup is worth holding for an hour; an answer
with nothing in it might just be one bad moment upstream, and caching that
would freeze it into an hour of blank cards for everyone.

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

## Recovering without a reload

Some failures are permanent for the life of a page: a photo lookup that gave
up, a basemap that exhausted its fallback chain, a feed that stopped
answering. Reloading clears all of them — which is why reloading appeared to
fix missing photos — but a reload is a blank screen, a re-acquired GPS fix, a
re-initialised map, and the loss of every photo already cached.

So SkyRadar re-runs just the parts that failed. About once a minute it
retries the photos it had given up on, brings the next aircraft poll forward,
and restarts the basemap chain if no tile ever arrived. Nothing that already
works is touched, and nothing flashes.

The cycle never fires while the app is in use. An open card, a tracked
aircraft, an open panel, or a touch in the last few seconds all count as
busy, and a refresh that came due during any of that simply waits for a quiet
moment. Returning to a backgrounded tab counts as a good moment to refresh,
since a sleeping tab has not really been idle.

**An outage clears the scope.** When the feed stops answering, the aircraft
are removed rather than left on screen. Positions are interpolated forward
between polls, so a stale snapshot didn't just sit there — it kept *moving*,
drawing aircraft on dead reckoning from a position nobody had confirmed in
minutes. An empty scope under a "LIVE DATA UNAVAILABLE" banner is the honest
picture.

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

## Heading-up

Heading-up turns the whole plot so the direction you're facing is at the top
of the screen. Two things have to be true for that to be honest.

**Aircraft must stay pointing where they're actually flying.** The
silhouettes are drawn nose-up at 0°, so in the default north-up plot an
aircraft's true track can be drawn directly. The instant the plot turns that
stops being true — screen-up is no longer north — and drawing the raw track
leaves every aircraft pointing somewhere it isn't going, swinging round as
you turn the device instead of staying put over the ground. Every silhouette
is drawn at `track − whatever bearing is currently up` (`screenHeadingDeg`).

That bearing is read back from the map rather than taken from the value we
asked it for: the map eases into a new bearing and ignores sub-degree
changes, so reading it keeps aircraft glued to the ground even mid-turn.

**Place names can't rotate with the map.** The basemap is raster, so its
text is pixels — rotate the map and the words rotate too, upside down along
the bottom of the screen. Nothing can straighten them. What can be done is
take them off: Esri's labels arrive as a separate transparent coat, so
heading-up hides that layer and shows them again when the plot settles
north-up. Toggling layer visibility rather than rebuilding the style keeps
every loaded tile exactly where it is, so the map never blanks.

Airports keep their labels either way — those are drawn by the radar canvas,
upright, in both modes. The one gap is the OpenStreetMap fallback, whose
labels are baked into the same tiles as the map itself and so can't be
separated; that only applies if Esri is unreachable. Names while rotating
would need a vector basemap, where labels are text the renderer can keep
upright.

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

## The control rail

Every control on the radar page lives in one rail down the right-hand side.
They used to sit across the bottom of the screen, where they covered the
lower part of the scope — exactly where aircraft to the south appear.

On a phone that rail is about a quarter of the screen's width, and the map
underneath it is the point of the app, so it folds away: **HIDE ›** at the top
of the rail tucks it off the right edge, and a **‹** tab at the screen's edge
brings it back. The choice persists, because someone who wants the map
uncovered wants it uncovered next time too.

Two details make it behave:

- **Everything beside the rail is anchored to one distance from the right
  edge**, published as a CSS custom property on the page. The aircraft card,
  the Layers panel and the compass calibration panel all read it, so folding
  the rail moves all of them together and there is a single place to get it
  right — rather than four components each guessing at the rail's width.
- **The handle lives inside the rail while it is open**, not floating beside
  it, so an open rail costs the map no more room than it already did. Only
  the folded state needs a tab of its own, and that sits hard against the
  screen edge, outside the plotted scope — a handle at mid-height would sit
  exactly where aircraft due east are drawn.

A folded rail is also hidden rather than merely slid off-screen. A control
parked out of sight is still in the tab order and still read aloud, and a
keyboard or VoiceOver user would otherwise land on buttons they cannot see.

## Sky View

Hold the device up, follow the guidance, find the aeroplane. The whole mode
rests on one decision: **it points at an area, never at a dot.**

A tablet compass is several degrees out on a good day, and an airliner has
moved a few hundred metres since the position now on screen was measured. A
tight reticle would claim a precision nobody has — and it would be wrong in
the most annoying way, confidently. So Sky View marks a patch of sky, says
how far to turn and tilt to bring it into view, and leaves the last step to
the eyes, which are far better at it than any marker.

**How big the patch is.** `searchRadiusDeg()` in `src/lib/ar/projection.ts`
combines two real errors — the compass's own (8° by default) and how far the
aircraft has flown since its last report (its ground speed times the age of
the data, as an angle at that distance) — and takes the root of the sum of
squares, clamped to 5–45°. A fast jet on stale data gets a wide circle; a
helicopter a mile away on a fresh report gets a tight one. The circle is
honest about the uncertainty rather than hiding it.

**Where the sky maps onto the screen.** The aircraft's bearing and elevation
become a unit vector in east/north/up; the device's heading and pitch give a
camera basis; a pinhole projection with `focal = (width/2) / tan(hfov/2)`
turns that into a pixel, and roll rotates the result into the screen's frame.
A target behind you is reported as such rather than projected to a nonsense
point. The camera's field of view is an estimate (63°) because cameras don't
report it — the search area is wide enough that a few degrees either way
changes nothing.

**Which way to turn.** The guidance bar gives one instruction per axis:
`TURN LEFT 40° · LOOK UP 25°`. When an axis rounds to zero it says `ON
BEARING` / `ON ELEVATION` instead — "TURN LEFT 0°" is a direction that isn't
one. More than 150° off and it simply says the aircraft is behind you, which
is more use than a number.

**When the target is off screen** a solid arrow slides out from the aim point
in the target's true direction, labelled with the callsign and how far off
aim it is. Aircraft are usually *above* you, so this is the ordinary case,
not the exotic one. The arrow is confined to the band of screen that is
actually visible: the HUD is painted underneath the top bar and the target
card, and an arrow drawn in those bands — as the "it's below you" arrow once
was — is an arrow nobody sees. That band is measured from the live card
rather than assumed, because the card grows with the aircraft it describes.

**Which way up the picture is.** Roll comes from gravity — `beta`/`gamma`
give world-up in the device's own frame, and its angle from the screen's up
direction is the tilt of the horizon. Turning that into the *page's* frame
needs to know how far the page is rotated, and `screen.orientation.angle` is
treated as a hint rather than an answer: it measures the page against the
device's *natural* orientation, and on some tablets that is landscape, while
`beta`/`gamma` arrive in a portrait-fixed frame regardless. On such a device
the two disagree by a quarter turn, and taking the browser at its word drew
the horizon vertical and inverted every movement — which is exactly what an
iPad did, held in landscape reporting `beta 0, gamma -90` with an angle of 0.

Gravity settles it. The browser rotates the page to whichever quarter turn
leaves it most upright, and that decision is itself made from gravity, so
gravity can be asked directly. The browser's number is still used wherever it
agrees with a plausibly-held device, and the quarter turn in use is sticky,
so leaning the tablet reports the lean rather than snapping the horizon round.

**Silhouettes are drawn nose-up**, deliberately not rotated by the aircraft's
track. In the sky you are looking at a three-dimensional object from an
arbitrary angle; rotating the icon would be a claim about its attitude from
where you stand, which the data does not support. (On the radar plot, where
you are looking at a plan view, the silhouette *is* rotated — see
[Heading-up](#heading-up).)

**Labels get out of each other's way.** On a busy afternoon half a dozen
aircraft sit within a few degrees of each other. Labels are placed after
every silhouette is down: the chosen target first, which always keeps its
label, then the rest nearest-first, each taking the first of four placements
(below, above, right, left) that collides with nothing already drawn. A label
with nowhere to go is dropped — the silhouette still speaks for itself, and
one readable box beats three stacked on the same patch of sky. Only the
target gets a search ring, for the same reason.

**The pitch ladder turns with the world; its numbers stay upright.** The
ladder is an artificial horizon and belongs to the sky, but text that rolls
over with the device is text nobody can read at a glance.

Everything on the HUD carries a dark halo (`shadowBlur` on a near-black
shadow) because in daylight the camera image is close to white, and a white
HUD on a white sky is no HUD at all.

## The entry screen

Before any permission is granted there is nothing real to show, so the screen
shows the instrument instead of a splash. Aircraft cross the dark trailing
fading tracks, each carrying a callsign, an altitude and a speed, drawn with
the radar's own silhouette sprites, its own trail falloff, its own label
stack and its own green. A fighter crosses in seconds; a helicopter takes
most of a minute. That spread is the point — it shows, before you have
granted anything, that this app knows the difference.

**Nothing there is real.** Those are invented aircraft (`AmbientTraffic`) on
a decorative canvas, shown only on the entry screen, before any location is
known and where there is no scope to confuse them with. The callsigns are
deliberately fictional — SKR is not an assigned ICAO designator — and none of
it can reach the radar, which draws only from live ADS-B.

Keeping the mark, the buttons and the byline crisp is done by fading each
contact as it nears them, not by laying a dark pool over the middle. The pool
was the obvious approach and it was wrong twice: it swallowed the traffic,
and at these near-black values the gradient banded into visible rings.
Fading per contact leaves the background perfectly flat.

**Keeping three or four in view is a budget, not a count.** Plenty of
contacts are invisible at any moment — fading in at an edge, or crossing the
clear zone behind the logo — so capping the number *aloft* was the wrong
control: on a phone, where the content covers most of the width, the pool
filled with contacts stuck in the dimmed middle, the cap was reached, and
nothing new could spawn. The screen sat empty with nine aircraft in the air.
The budget now counts what can actually be seen, at the opacity a contact
actually reads at, and tops up when it runs short. A phone gets a lower floor
on purpose: forcing four into the narrow bands above and below its content
would crowd the screen rather than improve it.

Three things decide whether that budget is ever met:

- **The shape of the clear zone.** A fixed 64-pixel fade around the content's
  own box, not a fraction of the box's size. As a fraction it over-reached on
  a phone — where the content is nearly as wide as the display, the far edge
  of the fade fell off the side of the screen, so no part of that band was
  ever fully clear and the backdrop ran empty however many aircraft were
  aloft. A box rather than an ellipse also keeps the corners of a wide screen
  usable.
- **Where arrivals are aimed.** The whole crossing is scored, not just the
  doorway. Checking only the entry point let a contact come in somewhere
  clear and then fly straight behind the content, present in the count and
  absent from the screen.
- **How a gap is refilled.** Aircraft still fading in count towards the floor
  in proportion to how close they are to being seen, rather than a flat share
  each — a flat share let a trough last the whole length of a fade, because
  aircraft that had only just spawned made up most of the budget. Arrivals are
  spaced a fraction of a second apart so a sudden exodus is answered by a
  stream rather than a formation.

Nothing is ever drawn over the mark, the button or the byline: inside the
content's box the opacity is exactly zero. Each trail segment is faded by
whichever of its two ends is least clear — judging a segment by one end let a
fast contact stroke a line right across the wordmark between two samples — and
each label is faded where the *text* lands rather than where its aircraft is.

With `prefers-reduced-motion`, the traffic holds still as a composed tableau
rather than disappearing — the screen stays populated, nothing moves.

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
- The size of the Sky View search area is a calculated estimate of the error,
  not a guarantee. It accounts for the compass and for how stale the position
  is; it does not account for a miscalibrated device, magnetic interference
  from a car or a case, or an aircraft that manoeuvred since its last report.
  Tap the compass dial on the radar page to correct a known offset.
- Sky View works out which way up the page is from gravity rather than from
  the browser, for the reason above. The cost is the uncommon case of a reader
  who has locked rotation *and* turned the device on its side: the horizon is
  then drawn level with the page instead of with the world. Unlocking rotation
  restores it.
- The camera's field of view is assumed to be 63° horizontal. Browsers do not
  report the real figure, so on a device with a notably wider or narrower
  lens the marked area will be slightly the wrong size — by less than the
  search radius itself, which is why the mode points at an area.
- `npm audit` currently flags advisories against Next.js/`eslint-config-next`
  and a nested `glob`. Nearly all of them concern features this app doesn't
  use (Server Actions, i18n Middleware, custom servers, the Image
  Optimization API, WebSocket-upgrade proxying) or dev-only tooling
  (`eslint-config-next`'s transitive `glob`, not shipped at runtime).
  Clearing them fully means moving to Next.js 16 (a breaking major-version
  change, including a React 19 requirement) — worth doing as deliberate
  follow-up, not folded into this build.
