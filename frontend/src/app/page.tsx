import Link from "next/link";

export default function Home(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#0b132b_0%,#1c2541_50%,#3a506b_100%)] p-6 text-slate-100 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur md:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">SparkOps · Staging Console</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Voice-to-Cash + Gatekeeper Control</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          Access capture workflows, ladder mode triage, and client tracking views for staging validation.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Link href="/capture" className="rounded-2xl border border-cyan-300/40 bg-cyan-500/10 p-4 font-semibold transition hover:bg-cyan-500/20">
            Open Capture Interface
          </Link>
          <Link href="/ladder" className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4 font-semibold transition hover:bg-emerald-500/20">
            Open Ladder Mode
          </Link>
          <Link href="/tracking/demo" className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 font-semibold transition hover:bg-amber-500/20">
            Open Client Tracking
          </Link>
        </div>
      </section>
    </main>
  );
}
