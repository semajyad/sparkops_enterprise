"use client";

import { useEffect, useMemo, useState } from "react";

import { LadderModeToggle } from "@/components/LadderModeToggle";

type Urgency = "High" | "Medium" | "Low";

type VoicemailItem = {
  id: string;
  from_number: string;
  urgency: Urgency;
  summary: string;
  transcript: string;
  created_at: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function urgencyClass(urgency: Urgency): string {
  if (urgency === "High") return "border-rose-300 bg-rose-500/15";
  if (urgency === "Medium") return "border-amber-300 bg-amber-500/15";
  return "border-cyan-300 bg-cyan-500/15";
}

export default function LadderPage(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<VoicemailItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("Ladder mode standby.");

  const sortedItems = useMemo(() => {
    const rank: Record<Urgency, number> = { High: 0, Medium: 1, Low: 2 };
    return [...items].sort((a, b) => rank[a.urgency] - rank[b.urgency]);
  }, [items]);

  async function refresh(): Promise<void> {
    const [modeRes, feedRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/twilio/ladder-mode`, { cache: "no-store" }),
      fetch(`${API_BASE_URL}/api/twilio/voicemails`, { cache: "no-store" }),
    ]);

    if (modeRes.ok) {
      const modeData = (await modeRes.json()) as { enabled: boolean };
      setEnabled(Boolean(modeData.enabled));
    }

    if (feedRes.ok) {
      const feedData = (await feedRes.json()) as { items: VoicemailItem[] };
      setItems(feedData.items ?? []);
    }
  }

  async function onToggle(next: boolean): Promise<void> {
    setIsSaving(true);
    setMessage("Updating ladder mode...");
    try {
      const res = await fetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        throw new Error("Failed to update ladder mode.");
      }
      setEnabled(next);
      setMessage(next ? "Ladder Mode active: AI triage intercept enabled." : "Ladder Mode disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown ladder mode error.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,#0f172a_0%,#102a43_55%,#1f2937_100%)] p-6 text-slate-100 md:p-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur md:p-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">Sprint 3 · The Gatekeeper</p>
          <h1 className="text-3xl font-bold tracking-tight">Ladder Mode Smart Triage</h1>
          <p className="text-sm text-slate-300">When active, inbound calls are routed to AI voicemail triage.</p>
        </header>

        <LadderModeToggle enabled={enabled} disabled={isSaving} onChange={(next) => void onToggle(next)} />

        <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-200">{message}</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Incoming Voicemails</h2>
          {sortedItems.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">
              No voicemails yet. Trigger a Twilio callback to populate this feed.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => (
                <li key={item.id} className={`rounded-2xl border p-4 ${urgencyClass(item.urgency)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.from_number || "Unknown caller"}</span>
                    <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                      {item.urgency}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-100">{item.summary}</p>
                  <p className="mt-1 text-xs text-slate-300">{item.transcript}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
