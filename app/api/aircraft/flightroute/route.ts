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
 * The aircraft's position is passed through so the upstream source can tell
 * us whether the route it found is plausible for where the aircraft actually
 * is. An unconfirmed route is returned as empty rather than displayed.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callsign = searchParams.get("callsign");
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");

  if (!callsign) {
    return NextResponse.json({ origin: null, destination: null });
  }

  const route = await lookupFlightRoute(
    callsign,
    Number.isFinite(lat) ? lat : undefined,
    Number.isFinite(lon) ? lon : undefined
  );

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
