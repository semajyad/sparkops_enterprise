"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function debounce<TArgs extends unknown[]>(func: (...args: TArgs) => void, delay: number): (...args: TArgs) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: TArgs) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

type AddressSuggestion = {
  id: string;
  text: string;
  place_name: string;
  address: string;
  lat: number;
  lng: number;
};

type MapboxFeature = {
  id: string;
  place_type?: string[];
  place_name?: string;
  text?: string;
  address?: string;
  center?: [number, number];
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    address?: string;
  };
  context?: Array<{
    id?: string;
    text?: string;
  }>;
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

function getMapboxToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
  console.log("[AddressAutocomplete] getMapboxToken() called, token exists:", !!token, "token length:", token.length);
  // Also log the raw env var for debugging
  console.log("[AddressAutocomplete] Raw NEXT_PUBLIC_MAPBOX_TOKEN:", process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  return token;
}

type AddressAutocompleteProps = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onSelect: (selection: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
};

function pickFirstString(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function isBlockedComponent(value: string | undefined): boolean {
  return typeof value === "string" && /(council|government)/i.test(value);
}

function sanitizeAddressComponent(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || isBlockedComponent(trimmed)) {
    return "";
  }
  return trimmed;
}

function buildMapboxLabel(feature: MapboxFeature): string {
  const houseNumber = sanitizeAddressComponent(pickFirstString(feature.address, feature.properties?.address));
  const street = sanitizeAddressComponent(pickFirstString(feature.text));
  const locality = pickFirstString(
    ...(feature.context ?? [])
      .filter((entry) => {
        const id = String(entry.id ?? "").toLowerCase();
        return id.startsWith("locality") || id.startsWith("neighborhood");
      })
      .map((entry) => sanitizeAddressComponent(entry.text))
  );
  const placeFallback = pickFirstString(
    ...(feature.context ?? [])
      .filter((entry) => String(entry.id ?? "").toLowerCase().startsWith("place"))
      .map((entry) => sanitizeAddressComponent(entry.text))
  );
  const location = locality || placeFallback;

  const streetLine = houseNumber ? `${houseNumber} ${street}`.trim() : street;
  if (streetLine && location) {
    return `${streetLine}, ${location}`;
  }

  if (streetLine) {
    return streetLine;
  }

  if (location) {
    return location;
  }

  return sanitizeAddressComponent(feature.place_name) || "Unknown address";
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder = "Search address",
  className,
}: AddressAutocompleteProps): React.JSX.Element {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const suppressFetchRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  console.log("[AddressAutocomplete] Component mounted with props:", { id, value, placeholder });

  const debouncedFetch = useMemo(
    () =>
      debounce((value: string) => {
        console.log("[AddressAutocomplete] debouncedFetch called with value:", value);
        if (suppressFetchRef.current) {
          console.log("[AddressAutocomplete] Fetch suppressed");
          suppressFetchRef.current = false;
          return;
        }

        const query = value.trim();
        if (query.length < 3) {
          console.log("[AddressAutocomplete] Query too short:", query.length);
          return;
        }

        const mapboxToken = getMapboxToken().trim();
        console.log("[AddressAutocomplete] Query:", query, "Token exists:", !!mapboxToken, "Token length:", mapboxToken.length);
        if (!mapboxToken) {
          console.log("[AddressAutocomplete] No Mapbox token available, skipping address lookup");
          return;
        }

        const fetchSuggestions = async (): Promise<void> => {
          setIsLoading(true);
          try {
            const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=nz&types=address,poi&access_token=${mapboxToken}`;
            console.log("[AddressAutocomplete] Calling Mapbox geocoder", {
              query,
              url: mapboxUrl,
            });
            const mapboxResponse = await fetch(mapboxUrl, {
              method: "GET",
              headers: { Accept: "application/json" },
            });

            if (!mapboxResponse.ok) {
              throw new Error(`Address lookup failed (${mapboxResponse.status})`);
            }

            const payload = (await mapboxResponse.json()) as MapboxResponse;
            console.log("[AddressAutocomplete] Mapbox geocoding response", payload);
            if (!payload || !Array.isArray(payload.features)) {
              console.warn("[AddressAutocomplete] Invalid payload from Mapbox", payload);
              setSuggestions([]);
              setOpen(false);
              return;
            }
            const rows = payload.features;
            if (rows.length === 0) {
              console.warn("[AddressAutocomplete] Mapbox returned an empty features array for query:", query);
            }

            const mapped = rows
              .map((feature) => {
                const coordinates = feature.geometry?.coordinates ?? feature.center;
                const lng = typeof coordinates?.[0] === "number" ? coordinates[0] : null;
                const lat = typeof coordinates?.[1] === "number" ? coordinates[1] : null;
                if (lat === null || lng === null) {
                  return null;
                }

                const placeName = sanitizeAddressComponent(feature.place_name);
                const text = sanitizeAddressComponent(feature.text);
                const label = placeName || buildMapboxLabel(feature);
                if (!label || label === "Unknown address") {
                  return null;
                }

                return {
                  id: feature.id,
                  text: text || label,
                  place_name: label,
                  address: label,
                  lat,
                  lng,
                } satisfies AddressSuggestion;
              })
              .filter((row): row is AddressSuggestion => Boolean(row));

            setSuggestions(mapped);
            setOpen(mapped.length > 0);
          } catch {
            setSuggestions([]);
            setOpen(false);
          } finally {
            setIsLoading(false);
          }
        };

        void fetchSuggestions();
      }, 300),
    []
  );

  useEffect(() => {
    debouncedFetch(value);
  }, [value, debouncedFetch]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent): void {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const showDropdown = open && suggestions.length > 0;
  const inputClassName = useMemo(
    () =>
      className ??
      "mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-600 focus:outline-none",
    [className]
  );

  return (
    <div className="relative z-[9999]" ref={containerRef}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          if (next.trim().length < 3) {
            setSuggestions([]);
            setOpen(false);
          }
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
      />

      {isLoading ? (
        <span className="pointer-events-none absolute right-3 top-[calc(50%+0.2rem)] -translate-y-1/2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : null}

      {showDropdown && value.trim().length >= 3 ? (
        <ul className="absolute z-[9999] mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => {
                  suppressFetchRef.current = true;
                  console.log("[AddressAutocomplete] Selected suggestion", {
                    place_name: suggestion.place_name,
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                  });
                  onChange(suggestion.place_name);
                  onSelect({
                    ...suggestion,
                    address: suggestion.place_name,
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                  });
                  setSuggestions([]);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-orange-50 hover:text-orange-700"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span>{suggestion.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
