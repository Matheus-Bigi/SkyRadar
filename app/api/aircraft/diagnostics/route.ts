import { NextRequest, NextResponse } from "next/server";
import { listAircraftProviders } from "@/lib/aircraft/providers";
import { errorText } from "@/lib/aircraft/providers/failover";
import { distanceMeters, metersToMiles, milesToMeters } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Open this in a browser to see exactly what every live data source is doing
 * right now — which ones answered, how fast, what they failed with, and a
 * sample of what came back. Debugging "no aircraft" from a deployed device
 * otherwise means guessing; this turns it into a readable report.
 *
 * Every provider is probed independently and in parallel, so one slow or
 * broken feed doesn't mask the others.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const rangeMiles = parseFloat(searchParams.get("rangeMiles") ?? "15");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      {
        error:
          "Pass your location, e.g. /api/aircraft/diagnostics?lat=45.5152&lon=-122.6784&rangeMiles=15",
      },
      { status: 400 }
    );
  }

  const radiusMeters = milesToMeters(Math.min(Math.max(rangeMiles, 1), 60));
  const center = { latitude: lat, longitude: lon };

  const results = await Promise.all(
    listAircraftProviders().map(async (provider) => {
      const startedAt = Date.now();
      try {
        const result = await provider.fetchAircraft({
          centerLatitude: lat,
          centerLongitude: lon,
          radiusMeters,
        });

        const withDistance = result.aircraft
          .map((a) => ({
            aircraft: a,
            distanceMiles: metersToMiles(
              distanceMeters(center, { latitude: a.latitude, longitude: a.longitude })
            ),
          }))
          .sort((a, b) => a.distanceMiles - b.distanceMiles);

        return {
          provider: provider.name,
          ok: true,
          elapsedMs: Date.now() - startedAt,
          totalReturned: result.aircraft.length,
          withinRange: withDistance.filter((x) => x.distanceMiles <= rangeMiles).length,
          nearest: withDistance.slice(0, 5).map((x) => ({
            id: x.aircraft.id,
            callsign: x.aircraft.callsign ?? null,
            registration: x.aircraft.registration ?? null,
            type: x.aircraft.aircraftType ?? null,
            model: x.aircraft.aircraftModel ?? null,
            operator: x.aircraft.operator ?? null,
            category: x.aircraft.category,
            altitudeFt: x.aircraft.altitude ?? null,
            groundSpeedKt: x.aircraft.groundSpeed ?? null,
            headingDeg: x.aircraft.heading ?? null,
            distanceMiles: Number(x.distanceMiles.toFixed(2)),
          })),
        };
      } catch (err) {
        return {
          provider: provider.name,
          ok: false,
          elapsedMs: Date.now() - startedAt,
          error: errorText(err),
        };
      }
    })
  );

  return NextResponse.json(
    {
      query: { lat, lon, rangeMiles, radiusMiles: metersToMiles(radiusMeters) },
      serverTime: new Date().toISOString(),
      mockModeEnabled: process.env.AIRCRAFT_PROVIDER === "mock",
      fr24KeyConfigured: Boolean(process.env.FR24_API_KEY),
      openskyCredentialsConfigured: Boolean(
        process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD
      ),
      providers: results,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
