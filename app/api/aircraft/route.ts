import { NextRequest, NextResponse } from "next/server";
import { getAircraftProvider } from "@/lib/aircraft/providers";
import { errorText } from "@/lib/aircraft/providers/failover";
import { milesToMeters } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Secure backend/proxy for live aircraft data (spec #43). The browser never
 * talks to Flightradar24 (or holds its credentials) directly — it only ever
 * calls this route, which normalizes whatever provider is configured into
 * the app's internal Aircraft model and returns only airborne aircraft
 * within the requested radius.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const rangeMiles = parseFloat(searchParams.get("rangeMiles") ?? "9");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query parameters are required" },
      { status: 400 }
    );
  }

  const radiusMeters = milesToMeters(Math.min(Math.max(rangeMiles, 1), 60));

  try {
    const provider = getAircraftProvider();
    const result = await provider.fetchAircraft({
      centerLatitude: lat,
      centerLongitude: lon,
      radiusMeters,
    });

    return NextResponse.json(
      {
        aircraft: result.aircraft,
        source: result.source,
        fetchedAt: result.fetchedAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/aircraft] provider error", err);
    // Pass the real reason through — a vague "unavailable" makes a live
    // outage indistinguishable from a bug when debugging on a real device.
    return NextResponse.json(
      { error: "Aircraft data temporarily unavailable", detail: errorText(err) },
      { status: 502 }
    );
  }
}
