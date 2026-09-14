import { NextRequest, NextResponse } from "next/server";
import { probeAircraftPhoto } from "@/lib/aircraft/photo";

export const dynamic = "force-dynamic";

/**
 * Why is this aircraft's card missing a photo?
 *
 * The lookup fails silently by design — a card showing nothing is the right
 * outcome when no photo exists — which makes "nothing on file" and "upstream
 * refused us" look identical from a device. This tells them apart: every
 * source's HTTP status and a raw response excerpt, so an empty photo list
 * can be distinguished from a rate-limit page or a response shape we failed
 * to read. It bypasses every cache, so it reports what those services are
 * doing right now.
 *
 * Example:
 *   /api/aircraft/details-diagnostics?hex=a2d0f4&registration=N487AS
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hex = searchParams.get("hex") ?? undefined;
  const registration = searchParams.get("registration") ?? undefined;

  if (!hex && !registration) {
    return NextResponse.json(
      { error: "pass ?hex= and/or ?registration=" },
      { status: 400 }
    );
  }

  const photo = await probeAircraftPhoto({ icao24: hex, registration });

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      photo,
      notes: [
        "Sources are tried in tiers: Planespotters (hex and registration at once),",
        "then airport-data.com. `foundPhoto: false` with a 200 and an empty list is",
        "a genuine absence; anything else — a non-200, a non-JSON body, a populated",
        "response we read as empty — is a bug or a block worth reporting.",
      ].join(" "),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
