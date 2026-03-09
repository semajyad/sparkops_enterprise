"use client";

import dynamic from "next/dynamic";
import { Loader2, Navigation } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { getTrackingMapCache, setTrackingMapCache } from "@/lib/db";
import { formatJobDate, JobListItem } from "@/lib/jobs";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const TrackingMap = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-2xl bg-slate-800/70" />,
});

type Coordinate = { lat: number; lng: number };
type MapJob = {
  id: string;
  clientName: string;
  timeLabel: string;
  coordinate: Coordinate;
  navigateUrl: string;
};

const DEFAULT_CURRENT: Coordinate = { lat: -36.8485, lng: 174.7633 };

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseCoordsFromLocation(location: string | undefined): Coordinate | null {
  if (!location) {
    return null;
  }

  const parts = location.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return { lat, lng };
}

export default function TrackingIndexPage(): React.JSX.Element {
  const geolocationUnavailable = typeof window !== "undefined" && !navigator.geolocation;
  const [current, setCurrent] = useState<Coordinate>(DEFAULT_CURRENT);
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    geolocationUnavailable ? "Geolocation is unavailable on this device." : "Waiting for GPS lock...",
  );
  const [isReady, setIsReady] = useState<boolean>(geolocationUnavailable);

  useEffect(() => {
    let watchId: number | null = null;

    async function bootstrapFromCache(): Promise<void> {
      try {
        const cached = await getTrackingMapCache();
        if (!cached) {
          return;
        }
        setCurrent(cached.current);
        setJobs(cached.jobs);
        setStatusMessage("Showing cached dispatch map while refreshing live data...");
        setIsReady(true);
      } catch {
        // best-effort cache hydration
      }
    }

    async function loadMapJobs(): Promise<void> {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/jobs`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = await parseApiJson<JobListItem[]>(response);
        const mappedJobs = (Array.isArray(payload) ? payload : [])
          .filter((job) => String(job.status ?? "").toUpperCase() !== "DONE")
          .map((job) => {
            const rawLatitude = parseCoordinate(job.extracted_data?.latitude);
            const rawLongitude = parseCoordinate(job.extracted_data?.longitude);
            const fallbackCoords = parseCoordsFromLocation(job.extracted_data?.location || job.extracted_data?.address);

            const coordinate =
              rawLatitude !== null && rawLongitude !== null
                ? { lat: rawLatitude, lng: rawLongitude }
                : fallbackCoords;

            if (!coordinate) {
              return null;
            }

            const addressOrLocation =
              job.extracted_data?.address ||
              job.extracted_data?.location ||
              `${coordinate.lat},${coordinate.lng}`;

            return {
              id: job.id,
              clientName: job.client_name || "Unknown Client",
              timeLabel: `Scheduled ${formatJobDate(job.created_at)}`,
              coordinate,
              navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressOrLocation)}`,
            } satisfies MapJob;
          })
          .filter((job): job is MapJob => Boolean(job));

        setJobs(mappedJobs);
      } catch {
        setJobs([]);
      }
    }

    void bootstrapFromCache();
    void loadMapJobs();

    if (!navigator.geolocation) {
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextCurrent = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrent(nextCurrent);
        setAccuracy(position.coords.accuracy);
        setStatusMessage(
          position.coords.accuracy <= 5
            ? "Live GPS locked (<5m)."
            : `Tracking live with ±${position.coords.accuracy.toFixed(1)}m accuracy.`,
        );
        setIsReady(true);
      },
      () => {
        setStatusMessage("Unable to get GPS signal. Showing last known area.");
        setIsReady(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    void setTrackingMapCache({ current, jobs });
  }, [current, jobs]);

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Map Hub</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Live Dispatch View</h1>
        <p className="mt-2 text-sm text-slate-300">Track your van and active jobs in real time for faster dispatch decisions.</p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">
          <Navigation className="h-4 w-4 text-amber-400" />
          {statusMessage}
          {accuracy !== null ? <span className="ml-auto text-xs text-slate-400">±{accuracy.toFixed(1)}m</span> : null}
        </div>

        <div className="relative z-0 mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60">
          {isReady ? (
            <TrackingMap current={current} jobs={jobs} />
          ) : (
            <div className="flex h-[380px] items-center justify-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              Initializing map and GPS...
            </div>
          )}
        </div>

        {!isReady ? null : jobs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">
            No active jobs with coordinates yet. Create a job with a selected address and it will appear on the dispatch map.
          </p>
        ) : null}
      </section>
    </main>
  );
}
