"use client";

import { LoaderCircle, RefreshCcw, ShieldCheck, Siren } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";

type Urgency = "High" | "Medium" | "Low";

type VoicemailItem = {
  id: string;
  from_number: string;
  urgency: Urgency;
  summary: string;
  created_at: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function urgencyClass(urgency: Urgency): string {
  if (urgency === "High") return "border-rose-400/80 bg-rose-500/10";
  if (urgency === "Medium") return "border-amber-400/80 bg-amber-500/10";
  return "border-slate-400/80 bg-slate-500/10";
}

export default function LadderPage(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<VoicemailItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("Ladder mode standby.");

  const sortedItems = useMemo(() => {
    const rank: Record<Urgency, number> = { High: 0, Medium: 1, Low: 2 };
    return [...items].sort((a, b) => rank[a.urgency] - rank[b.urgency]);
  }, [items]);

  async function refresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      const [modeRes, feedRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, { cache: "no-store" }),
        apiFetch(`${API_BASE_URL}/api/twilio/voicemails`, { cache: "no-store" }),
      ]);

      if (!modeRes.ok || !feedRes.ok) {
        throw new Error("Unable to refresh ladder state.");
      }

      const modeData = await parseApiJson<{ enabled: boolean }>(modeRes);
      const feedData = await parseApiJson<{ items: VoicemailItem[] }>(feedRes);
      setEnabled(Boolean(modeData.enabled));
      setItems(feedData.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function onToggle(next: boolean): Promise<void> {
    setIsSaving(true);
    setMessage("Updating ladder mode...");
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const payload = (await parseApiJson<{ error?: string }>(res).catch(() => ({ error: "Failed to update ladder mode." }))) as { error?: string };
        throw new Error(payload.error ?? "Failed to update ladder mode.");
      }

      setEnabled(next);
      setMessage(next ? "Ladder Mode active. Calls route to Smart Triage." : "Ladder Mode disabled.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown ladder mode error.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-800/95 to-slate-900/95 p-5 shadow-2xl shadow-slate-950/60 backdrop-blur sm:p-7 md:p-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Sprint 3 · Gatekeeper</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Ladder Mode Dashboard</h1>
            <p className="mt-2 text-sm text-slate-300">Intercept calls while on-site and triage urgency instantly.</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing || isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-slate-500/60 bg-slate-700/70 px-4 py-2 text-sm font-medium transition hover:opacity-90 active:opacity-80 disabled:opacity-50"
          >
            {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh Feed
          </button>
        </header>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => void onToggle(!enabled)}
          disabled={isSaving || isRefreshing}
          className={[
            "group relative overflow-hidden rounded-3xl border p-6 text-left transition sm:p-8",
            enabled
              ? "border-emerald-400/80 bg-emerald-500/20 shadow-lg shadow-emerald-500/25"
              : "border-slate-500/70 bg-slate-700/40 shadow-lg shadow-slate-950/30",
            "hover:opacity-95 active:opacity-80 disabled:opacity-50",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-200/80">Ladder Mode</p>
              <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{enabled ? "ACTIVE" : "OFF"}</p>
              <p className="mt-2 text-sm text-slate-100/90">
                {enabled
                  ? "Inbound calls route to AI voicemail triage and urgency alerts."
                  : "Direct calling remains active until Ladder Mode is turned on."}
              </p>
            </div>
            <div className="rounded-2xl bg-black/30 p-3">
              {isSaving ? <LoaderCircle className="h-10 w-10 animate-spin text-emerald-300" /> : <ShieldCheck className="h-10 w-10 text-emerald-300" />}
            </div>
          </div>
        </button>

        <p className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-200">{message}</p>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold sm:text-xl">Voicemail Feed</h2>
          </div>

          {sortedItems.length === 0 ? (
            <p className="rounded-2xl border border-slate-500/70 bg-slate-800/60 p-4 text-sm text-slate-300">
              No triaged voicemails yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => (
                <li key={item.id} className={`rounded-2xl border p-4 ${urgencyClass(item.urgency)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200/90">
                      {item.from_number || "Unknown Caller"}
                    </span>
                    <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-100">
                      {item.urgency}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-medium text-slate-100">{item.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
