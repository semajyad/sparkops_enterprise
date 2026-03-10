"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TrackingPayload = {
  id: string;
  latitude: number;
  longitude: number;
  eta_minutes: number;
  status: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function TrackingPage({ params }: { params: { id: string } }): React.JSX.Element {
  const [payload, setPayload] = useState<TrackingPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [etaSeconds, setEtaSeconds] = useState(0);

  useEffect(() => {
    async function load(): Promise<void> {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/eta/lookup/${params.id}`, { cache: "no-store" });
        if (!res.ok) {
          setPayload(null);
          return;
        }
        const data = (await res.json()) as TrackingPayload;
        setPayload(data);
        setEtaSeconds(Math.max(0, data.eta_minutes * 60));
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [params.id]);

  useEffect(() => {
    if (etaSeconds <= 0) {
      return;
    }
    const timer = setInterval(() => setEtaSeconds((prev) => Math.max(0, prev - 1)), 1_000);
    return () => clearInterval(timer);
  }, [etaSeconds]);

  const prettyEta = useMemo(() => {
    const minutes = Math.floor(etaSeconds / 60);
    const seconds = etaSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [etaSeconds]);

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-orange-600">TradeOps Client Tracking</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your electrician is on the way</h1>
        <p className="mt-2 text-sm text-gray-600">Live arrival updates from Driving Mode dispatch.</p>

        {isLoading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-orange-600" />
            Loading live ETA...
          </div>
        ) : !payload ? (
          <p className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Tracking link is invalid or expired.
          </p>
        ) : (
          <>
            <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-3">
              <div className="relative h-72 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_20%,#fde68a_0%,#f3f4f6_45%,#e5e7eb_100%)]">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600 p-2 shadow-[0_0_25px_rgba(249,115,22,0.35)]">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <p className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-gray-700">
                  Mock GPS: {payload.latitude.toFixed(4)}, {payload.longitude.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Mock ETA Timer</p>
                <p className="mt-1 text-3xl font-bold text-orange-600">{prettyEta}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1 text-base font-medium text-gray-900">{payload.status}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
