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
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-800/95 to-slate-900/95 p-6 shadow-2xl shadow-slate-950/60 sm:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-emerald-300/80">SparkOps Client Tracking</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your electrician is on the way</h1>
        <p className="mt-2 text-sm text-slate-300">Live arrival updates from Ladder Mode dispatch.</p>

        {isLoading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-600/70 bg-slate-800/65 p-4 text-sm">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
            Loading live ETA...
          </div>
        ) : !payload ? (
          <p className="mt-8 rounded-2xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">
            Tracking link is invalid or expired.
          </p>
        ) : (
          <>
            <div className="mt-8 rounded-3xl border border-slate-500/60 bg-slate-800/60 p-3">
              <div className="relative h-72 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_20%,#22d3ee_0%,#334155_40%,#0f172a_100%)]">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 p-2 shadow-[0_0_35px_rgba(16,185,129,0.55)]">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <p className="absolute bottom-3 left-3 rounded-lg bg-black/40 px-3 py-1 text-xs font-medium">
                  Mock GPS: {payload.latitude.toFixed(4)}, {payload.longitude.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-500/60 bg-slate-800/55 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-300">Mock ETA Timer</p>
                <p className="mt-1 text-3xl font-bold text-emerald-400">{prettyEta}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-300">Status</p>
                <p className="mt-1 text-base font-medium text-slate-100">{payload.status}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
