import { NextRequest, NextResponse } from "next/server";
import { probeAircraftPhoto } from "@/lib/aircraft/photo";
import { probeFlightRoute } from "@/lib/aircraft/flightroute";

export const dynamic = "force-dynamic";

/**
 * Why is this aircraft's card missing a photo or a route?
 *
 * The sibling of /api/aircraft/diagnostics, for the two per-aircraft
 * lookups. Both fail silently by design — a card showing nothing is the
 * correct outcome when nothing real is available — which makes "no photo"
 * and "upstream timed out" look identical from the outside. This endpoint
 * tells them apart, bypassing every cache so it reports what Planespotters,
 * adsb.lol and adsbdb are saying right now.
 *
 * Example:
 *   /api/aircraft/details-diagnostics?hex=a2d0f4&registration=N273AK
 *     &callsign=ASA642&lat=45.60&lon=-122.35
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hex = searchParams.get("hex") ?? undefined;
  const registration = searchParams.get("registration") ?? undefined;
  const callsign = searchParams.get("callsign") ?? undefined;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const position =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? { latitude: lat, longitude: lon }
      : undefined;

  const [photo, route] = await Promise.all([
    hex || registration
      ? probeAircraftPhoto({ icao24: hex, registration })
      : Promise.resolve({ skipped: "pass ?hex= and/or ?registration=" }),
    callsign
      ? probeFlightRoute(callsign, position)
      : Promise.resolve({ skipped: "pass ?callsign= (and ?lat=&lon= to check it)" }),
  ]);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      positionUsed: position ?? null,
      photo,
      route,
      notes: [
        "A route is only shown if it fits where the aircraft actually is: flying it",
        "via the aircraft's position must add no more than 80km, and the aircraft",
        "must be within 150km of the direct path. `verdict` shows the measurements",
        "behind each accept/reject.",
      ].join(" "),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
