import { NextRequest, NextResponse } from "next/server";
import { lookupAircraftPhoto } from "@/lib/aircraft/photo";

export const dynamic = "force-dynamic";

/**
 * On-demand aircraft photo lookup, called only when a user expands an
 * aircraft card (spec #22 — "additional information can load
 * asynchronously"). Kept separate from the main polling endpoint so photo
 * lookups never slow down the live radar refresh loop.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registration = searchParams.get("registration");
  if (!registration) {
    return NextResponse.json({ imageUrl: null, attribution: null });
  }

  const { imageUrl, attribution } = await lookupAircraftPhoto(registration);
  return NextResponse.json(
    { imageUrl: imageUrl ?? null, attribution: attribution ?? null },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
