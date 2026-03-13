import { NextRequest, NextResponse } from "next/server";

function getMapboxToken(): string {
  return (
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ??
    process.env.MAPBOX_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_VITE_MAPBOX_TOKEN?.trim() ??
    process.env.VITE_MAPBOX_TOKEN?.trim() ??
    ""
  );
}

type NominatimRow = {
  place_id?: string | number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
  };
};

async function fetchNominatimFallback(query: string): Promise<{ features: Array<Record<string, unknown>> }> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=nz&limit=8&addressdetails=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(nominatimUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "TradeOps/1.0 AddressAutocomplete",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return { features: [] };
  }
  const payload = (await response.json()) as NominatimRow[];
  if (!Array.isArray(payload)) {
    return { features: [] };
  }

  const features = payload
    .map((row, index) => {
      const lon = Number(row.lon);
      const lat = Number(row.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
      }
      const placeName = String(row.display_name ?? "").trim();
      const text = String(row.name ?? row.address?.road ?? placeName.split(",")[0] ?? "").trim() || placeName;
      return {
        id: `nominatim-${String(row.place_id ?? index)}`,
        place_name: placeName || text,
        text,
        center: [lon, lat],
      };
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));

  return { features };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json({ features: [] });
  }

  const mapboxToken = getMapboxToken();
  if (!mapboxToken) {
    const fallbackPayload = await fetchNominatimFallback(query);
    return NextResponse.json(fallbackPayload);
  }

  const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=nz&autocomplete=true&limit=8&language=en&types=address,street,poi,place&access_token=${mapboxToken}`;

  try {
    const response = await fetch(mapboxUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const fallbackPayload = await fetchNominatimFallback(query);
      return NextResponse.json(fallbackPayload);
    }

    const payload = (await response.json()) as { features?: unknown[] };
    const features = Array.isArray(payload.features) ? payload.features : [];
    if (features.length === 0) {
      const fallbackPayload = await fetchNominatimFallback(query);
      return NextResponse.json(fallbackPayload);
    }
    return NextResponse.json({ features });
  } catch {
    const fallbackPayload = await fetchNominatimFallback(query);
    return NextResponse.json(fallbackPayload);
  }
}
