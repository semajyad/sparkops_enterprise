"use client";

import { FileCheck2, RadioTower, UploadCloud } from "lucide-react";

import { useSync } from "@/components/SyncProvider";

const RECENT_ACTIVITY = [
  "Invoice INV-1042 sent to Henderson Renovations",
  "Invoice INV-1041 sent to Shoreline Fitouts",
  "Invoice INV-1040 sent to Kingsland Dental",
];

export default function Home(): React.JSX.Element {
  const { pendingCount } = useSync();

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-700 bg-slate-800 p-6 shadow-2xl shadow-slate-950/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-emerald-300/80">SparkOps Dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Kia Ora, Dave.</h1>
        <p className="mt-2 text-sm text-slate-300">Your live operations snapshot for today.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-slate-300">
              <UploadCloud className="h-4 w-4 text-emerald-400" />
              <p className="text-xs uppercase tracking-[0.18em]">Pending Uploads</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-emerald-400">{pendingCount}</p>
          </article>
          <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-slate-300">
              <RadioTower className="h-4 w-4 text-emerald-400" />
              <p className="text-xs uppercase tracking-[0.18em]">Active Jobs</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-emerald-400">3</p>
          </article>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <FileCheck2 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold">Recent Activity</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {RECENT_ACTIVITY.map((item) => (
              <li key={item} className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
