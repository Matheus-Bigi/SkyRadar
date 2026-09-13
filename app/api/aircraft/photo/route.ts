import { NextRequest, NextResponse } from "next/server";
import { lookupAircraftPhoto } from "@/lib/aircraft/photo";

export const dynamic = "force-dynamic";

/**
 * Per-aircraft photo lookup, called when a card opens. Kept separate from
 * the main polling endpoint so photo lookups never slow down the live radar
 * refresh loop.
 *
 * Accepts the ICAO 24-bit address as well as the registration: the hex is
 * broadcast by every aircraft, while the registration depends on a database
 * lookup the feed may not have been able to make.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registration = searchParams.get("registration") ?? undefined;
  const icao24 = searchParams.get("hex") ?? undefined;

  if (!registration && !icao24) {
    return NextResponse.json({ imageUrl: null, attribution: null, link: null });
  }

  const { imageUrl, attribution, link } = await lookupAircraftPhoto({ registration, icao24 });
  return NextResponse.json(
    { imageUrl: imageUrl ?? null, attribution: attribution ?? null, link: link ?? null },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
