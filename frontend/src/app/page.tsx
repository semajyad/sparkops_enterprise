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
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900 sm:px-6 md:px-10 md:py-14">
      <section className="mx-auto w-full max-w-6xl rounded-3xl border border-gray-200 bg-white p-8 shadow-sm md:p-12">
        <p className="text-xs uppercase tracking-[0.28em] text-orange-600">TradeOps Platform</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-900 md:text-6xl">
          The Operating System for Kiwi Trade Teams.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-gray-600 md:text-lg">
          Capture site truth once. Let TradeOps handle invoices, compliance, and proof-of-work trails while your team stays on the tools.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-700"
          >
            Start Free Signup
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-orange-500 hover:text-orange-600"
          >
            Open Dashboard
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-gray-200 bg-white p-5">
              <feature.icon className="h-5 w-5 text-orange-600" />
              <h2 className="mt-3 text-lg font-semibold text-gray-900">{feature.title}</h2>
              <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
