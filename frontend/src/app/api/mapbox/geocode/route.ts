import { NextRequest, NextResponse } from "next/server";

function getMapboxToken(): string {
  return (
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ??
    process.env.MAPBOX_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ??
    ""
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json({ features: [] });
  }

  const mapboxToken = getMapboxToken();
  if (!mapboxToken) {
    return NextResponse.json({ error: "Mapbox token not configured." }, { status: 503 });
  }

  const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=nz&autocomplete=true&limit=8&language=en&types=address,street,poi,place&access_token=${mapboxToken}`;

  try {
    const response = await fetch(mapboxUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json({ error: details || "Mapbox request failed." }, { status: response.status });
    }

    const payload = (await response.json()) as { features?: unknown[] };
    return NextResponse.json({ features: Array.isArray(payload.features) ? payload.features : [] });
  } catch {
    return NextResponse.json({ error: "Mapbox request failed." }, { status: 502 });
  }
}
