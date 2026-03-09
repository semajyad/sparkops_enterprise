"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

type AddressAutocompleteProps = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onSelect: (selection: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
};

function buildLabel(properties: PhotonFeature["properties"] | undefined): string {
  if (!properties) {
    return "Unknown address";
  }

  const orderedParts = [
    properties.name,
    properties.street,
    properties.city,
    properties.state,
    properties.postcode,
    properties.country,
  ];

  const parts = orderedParts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "Unknown address";
  }

  return parts.join(", ");
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressFetchRef = useRef(false);

  useEffect(() => {
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&bbox=166.0,-47.5,179.0,-34.0`;
      void fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Address lookup failed (${response.status})`);
          }

          const payload = (await response.json()) as PhotonResponse;
          const rows = Array.isArray(payload.features) ? payload.features : [];
          const mapped = rows
            .map((feature, index) => {
              const coords = feature.geometry?.coordinates;
              const longitude = typeof coords?.[0] === "number" ? coords[0] : null;
              const latitude = typeof coords?.[1] === "number" ? coords[1] : null;
              if (latitude === null || longitude === null) {
                return null;
              }

              return {
                id: `${latitude}:${longitude}:${index}`,
                label: buildLabel(feature.properties),
                latitude,
                longitude,
              } satisfies AddressSuggestion;
            })
            .filter((row): row is AddressSuggestion => Boolean(row));

          setSuggestions(mapped);
          setOpen(mapped.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

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
      "mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none",
    [className]
  );

  return (
    <div className="relative" ref={containerRef}>
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
        <ul className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-2xl shadow-black/40">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => {
                  suppressFetchRef.current = true;
                  onChange(suggestion.label);
                  onSelect(suggestion);
                  setSuggestions([]);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-amber-500/15 hover:text-amber-100"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
