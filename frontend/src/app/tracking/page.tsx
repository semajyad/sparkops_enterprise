import Link from "next/link";

export default function TrackingIndexPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Map</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Tracking Console</h1>
        <p className="mt-3 text-sm text-slate-300">
          Open a client tracking link by job token. This keeps navigation thumb-friendly while route tracking remains under
          <code className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-amber-300">/tracking/[id]</code>.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm text-slate-300">Use an existing token to open a live map simulation:</p>
          <Link
            href="/tracking/demo"
            className="mt-4 inline-flex items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Open Demo Tracking
          </Link>
        </div>
      </section>
    </main>
  );
}
