import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Reverse geocoding for the small "you are here" place-name label (spec
 * #15/#16 — cities/neighborhoods, confirming the user's actual location).
 * Backed by OpenStreetMap Nominatim, called server-side only so we control
 * the required User-Agent and can cache results — Nominatim's usage policy
 * asks for a descriptive User-Agent, no bulk/high-frequency querying, and
 * caching where possible. The client throttles requests to one per
 * meaningful move (see useReverseGeocode), so real traffic here is very low.
 */

interface CacheEntry {
  name: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
const FETCH_TIMEOUT_MS = 5000;

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

function pickName(address: NominatimAddress): string | null {
  return (
    address.neighbourhood ??
    address.suburb ??
    address.quarter ??
    address.city_district ??
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.county ??
    address.state ??
    null
  );
}

function gridKey(lat: number, lon: number): string {
  // Round to ~1.1km grid cells so nearby requests share a cache entry.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat and lon query parameters are required" }, { status: 400 });
  }

  const key = gridKey(lat, lon);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ name: cached.name }, { headers: { "Cache-Control": "no-store" } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SkyRadar/1.0 (personal aviation radar app; non-commercial)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as { address?: NominatimAddress };
    const name = data.address ? pickName(data.address) : null;

    cache.set(key, { name, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ name }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ name: null }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
