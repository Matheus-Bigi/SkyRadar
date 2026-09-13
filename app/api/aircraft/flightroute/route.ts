import { NextRequest, NextResponse } from "next/server";
import { lookupFlightRoute } from "@/lib/aircraft/flightroute";

export const dynamic = "force-dynamic";

/**
 * Per-aircraft route lookup ("where is it coming from, where is it going"),
 * called when a card opens.
 *
 * This can't ride along with /api/aircraft: ADS-B carries no route at all,
 * so it takes one database request per callsign — fine for the one aircraft
 * a user tapped, ruinous for every aircraft on the scope every few seconds.
 *
 * The aircraft's position, altitude, vertical speed and track all ride
 * along, because that is what the route is checked against. Altitude and
 * vertical speed matter most: an aircraft descending through 2,000 feet is
 * minutes from a runway, so a claimed destination a thousand miles away is
 * impossible no matter how well the route lines up on a map. An unconfirmed
 * route is returned empty rather than displayed.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callsign = searchParams.get("callsign");
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const altitude = parseFloat(searchParams.get("altitude") ?? "");
  const verticalSpeed = parseFloat(searchParams.get("verticalSpeed") ?? "");
  const track = parseFloat(searchParams.get("track") ?? "");

  if (!callsign || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ origin: null, destination: null });
  }

  const route = await lookupFlightRoute(callsign, {
    position: { latitude: lat, longitude: lon },
    altitude: Number.isFinite(altitude) ? altitude : undefined,
    verticalSpeed: Number.isFinite(verticalSpeed) ? verticalSpeed : undefined,
    track: Number.isFinite(track) ? track : undefined,
  });

  return NextResponse.json(
    {
      origin: route.origin ?? null,
      originName: route.originName ?? null,
      destination: route.destination ?? null,
      destinationName: route.destinationName ?? null,
      airline: route.airline ?? null,
      source: route.source ?? null,
    },
    { headers: { "Cache-Control": "public, max-age=600" } }
  );
}
