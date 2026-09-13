import { NextRequest, NextResponse } from "next/server";
import { probeAircraftPhoto } from "@/lib/aircraft/photo";
import { probeFlightRoute } from "@/lib/aircraft/flightroute";

export const dynamic = "force-dynamic";

/**
 * Why is this aircraft's card missing a photo or a route — or showing the
 * wrong one?
 *
 * The sibling of /api/aircraft/diagnostics, for the two per-aircraft
 * lookups. Both fail silently by design — a card showing nothing is the
 * correct outcome when nothing real is available — which makes "no photo"
 * and "upstream timed out" look identical from the outside. This endpoint
 * tells them apart, bypassing every cache so it reports what Planespotters,
 * adsb.lol and adsbdb are saying right now.
 *
 * Example:
 *   /api/aircraft/details-diagnostics?hex=a2d0f4&registration=N487AS
 *     &callsign=ASA638&lat=45.485&lon=-122.265&altitude=2100&verticalSpeed=-704&track=299
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hex = searchParams.get("hex") ?? undefined;
  const registration = searchParams.get("registration") ?? undefined;
  const callsign = searchParams.get("callsign") ?? undefined;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const altitude = parseFloat(searchParams.get("altitude") ?? "");
  const verticalSpeed = parseFloat(searchParams.get("verticalSpeed") ?? "");
  const track = parseFloat(searchParams.get("track") ?? "");
  const aircraft =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? {
          position: { latitude: lat, longitude: lon },
          altitude: Number.isFinite(altitude) ? altitude : undefined,
          verticalSpeed: Number.isFinite(verticalSpeed) ? verticalSpeed : undefined,
          track: Number.isFinite(track) ? track : undefined,
        }
      : undefined;

  const [photo, route] = await Promise.all([
    hex || registration
      ? probeAircraftPhoto({ icao24: hex, registration })
      : Promise.resolve({ skipped: "pass ?hex= and/or ?registration=" }),
    callsign
      ? probeFlightRoute(callsign, aircraft)
      : Promise.resolve({ skipped: "pass ?callsign= (and ?lat=&lon= to check it)" }),
  ]);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      aircraftStateUsed: aircraft ?? null,
      photo,
      route,
      notes: [
        "A route is only shown if it fits what the aircraft is actually doing.",
        "Strongest test: an aircraft low and descending must be near its claimed",
        "destination (and low and climbing, near its origin) — roughly six times",
        "the 3:1 descent rule. Then corridor geometry (<=80km detour, <=150km to",
        "the side) and, once clear of both terminal areas, direction of travel.",
        "`verdict` shows every measurement behind each accept/reject.",
      ].join(" "),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
