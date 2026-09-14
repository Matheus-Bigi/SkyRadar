import { NextRequest, NextResponse } from "next/server";
import { lookupAircraftPhotos } from "@/lib/aircraft/photo";

export const dynamic = "force-dynamic";

/** Guards the URL length and the load placed on free, volunteer-run APIs. */
const MAX_AIRCRAFT_PER_REQUEST = 12;

/**
 * Aircraft photo lookup, for one aircraft or a screenful.
 *
 * Batching exists for speed rather than tidiness: the app warms the photos
 * of the aircraft nearest the user as soon as they appear on the radar, so
 * that tapping one shows its picture immediately instead of starting a
 * lookup. One request carrying twelve aircraft beats twelve requests from a
 * tablet on mobile data.
 *
 *   ?ac=a2d0f4|N487AS,ab1842|N814AK,c0ffee|
 *
 * Each entry is `hex|registration`; either side may be empty. The response
 * is keyed by the exact entry string that was asked for, so the caller never
 * has to guess which identifier answered.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Single-aircraft form, kept because it reads clearly in a browser bar.
  const singleHex = searchParams.get("hex");
  const singleReg = searchParams.get("registration");
  const raw = searchParams.get("ac");

  const entries = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : singleHex || singleReg
      ? [`${singleHex ?? ""}|${singleReg ?? ""}`]
      : [];

  if (entries.length === 0) {
    return NextResponse.json({ photos: {} });
  }

  const queries = entries.slice(0, MAX_AIRCRAFT_PER_REQUEST).map((key) => {
    const [hex, registration] = key.split("|");
    return { key, icao24: hex || undefined, registration: registration || undefined };
  });

  const resolved = await lookupAircraftPhotos(queries);

  const photos: Record<string, { imageUrl: string | null; attribution: string | null }> = {};
  for (const { key } of queries) {
    const photo = resolved[key] ?? {};
    photos[key] = { imageUrl: photo.imageUrl ?? null, attribution: photo.attribution ?? null };
  }

  // A photo of a given airframe doesn't change minute to minute, so let the
  // CDN and the browser hold it — the fastest lookup is the one not made.
  return NextResponse.json(
    { photos },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
