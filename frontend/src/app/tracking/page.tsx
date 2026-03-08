"use client";

import dynamic from "next/dynamic";
import { Loader2, Navigation } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const TrackingMap = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-2xl bg-slate-800/70" />,
});

type Coordinate = { lat: number; lng: number };
type EtaLookupResponse = { latitude: number; longitude: number };

const DEFAULT_CURRENT: Coordinate = { lat: -36.8485, lng: 174.7633 };
const DEFAULT_NEXT_JOB: Coordinate = { lat: -36.856, lng: 174.78 };

export default function TrackingIndexPage(): React.JSX.Element {
  const geolocationUnavailable = typeof window !== "undefined" && !navigator.geolocation;
  const [current, setCurrent] = useState<Coordinate>(DEFAULT_CURRENT);
  const [nextJob, setNextJob] = useState<Coordinate>(DEFAULT_NEXT_JOB);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    geolocationUnavailable ? "Geolocation is unavailable on this device." : "Waiting for GPS lock...",
  );
  const [isReady, setIsReady] = useState<boolean>(geolocationUnavailable);

  useEffect(() => {
    let watchId: number | null = null;

    async function loadNextJob(): Promise<void> {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/eta/lookup/demo`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = await parseApiJson<EtaLookupResponse>(response);
        setNextJob({ lat: payload.latitude, lng: payload.longitude });
      } catch {
        // Keep default job pin when demo endpoint is unavailable.
      }
    }

    void loadNextJob();

    if (!navigator.geolocation) {
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrent({ lat: position.coords.latitude, lng: position.coords.longitude });
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

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Map Hub</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Live Dispatch View</h1>
        <p className="mt-2 text-sm text-slate-300">Track your van and next job site in real time for faster ETA updates.</p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">
          <Navigation className="h-4 w-4 text-amber-400" />
          {statusMessage}
          {accuracy !== null ? <span className="ml-auto text-xs text-slate-400">±{accuracy.toFixed(1)}m</span> : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60">
          {isReady ? (
            <TrackingMap current={current} nextJob={nextJob} />
          ) : (
            <div className="flex h-[380px] items-center justify-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              Initializing map and GPS...
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
