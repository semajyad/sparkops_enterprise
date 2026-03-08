import Link from "next/link";
import { FileCheck2, Gauge, MapPin } from "lucide-react";

const FEATURES = [
  {
    icon: Gauge,
    title: "Zero-Touch Invoicing",
    description: "Turn receipts and job notes into invoice-ready payloads synced to your workflow.",
  },
  {
    icon: FileCheck2,
    title: "Compliance on Autopilot",
    description: "COCs and ESC evidence is structured and ready without admin rework.",
  },
  {
    icon: MapPin,
    title: "GPS-Locked Evidence",
    description: "Prove you tested that earth peg with traceable, field-ready proof.",
  },
];

export default function Home(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 md:px-10 md:py-14">
      <section className="mx-auto w-full max-w-6xl rounded-3xl border border-emerald-600/40 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-8 shadow-2xl shadow-black/40 md:p-12">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SparkOps Platform</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-6xl">
          The Operating System for Kiwi Sparkies.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
          Capture site truth once. Let SparkOps handle invoices, compliance, and proof-of-work trails while your team stays on the tools.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400"
          >
            Start Free Signup
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-500 px-5 py-3 text-sm font-bold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Open Dashboard
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
              <feature.icon className="h-5 w-5 text-emerald-300" />
              <h2 className="mt-3 text-lg font-semibold text-white">{feature.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
