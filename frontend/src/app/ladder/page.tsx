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
  if (urgency === "High") return "border-red-300 bg-red-50";
  if (urgency === "Medium") return "border-orange-300 bg-orange-50";
  return "border-gray-300 bg-gray-50";
}

export default function LadderPage(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<VoicemailItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("Driving mode standby.");

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
    setMessage("Updating Driving Mode...");
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const payload = (await parseApiJson<{ error?: string }>(res).catch(() => ({ error: "Failed to update Driving Mode." }))) as { error?: string };
        throw new Error(payload.error ?? "Failed to update Driving Mode.");
      }

      setEnabled(next);
      setMessage(next ? "Driving Mode active. Calls route to Smart Triage." : "Driving Mode disabled.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown driving mode error.");
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
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 sm:p-6 md:p-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-[2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-7 md:p-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-600">Sprint 3 · Gatekeeper</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Driving Mode Dashboard</h1>
            <p className="mt-2 text-sm text-gray-600">Intercept calls while on-site and triage urgency instantly.</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing || isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-orange-500 hover:text-orange-600 active:opacity-80 disabled:opacity-50"
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
              ? "border-green-300 bg-green-50"
              : "border-gray-300 bg-white",
            "hover:opacity-95 active:opacity-80 disabled:opacity-50",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Driving Mode</p>
              <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{enabled ? "ACTIVE" : "OFF"}</p>
              <p className="mt-2 text-sm text-gray-700">
                {enabled
                  ? "Inbound calls route to AI voicemail triage and urgency alerts."
                  : "Direct calling remains active until Driving Mode is turned on."}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-100 p-3">
              {isSaving ? <LoaderCircle className="h-10 w-10 animate-spin text-orange-600" /> : <ShieldCheck className="h-10 w-10 text-orange-600" />}
            </div>
          </div>
        </button>

        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">{message}</p>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold sm:text-xl">Voicemail Feed</h2>
          </div>

          {sortedItems.length === 0 ? (
            <p className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
              No triaged voicemails yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => (
                <li key={item.id} className={`rounded-2xl border p-4 ${urgencyClass(item.urgency)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">
                      {item.from_number || "Unknown Caller"}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-700">
                      {item.urgency}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-medium text-gray-900">{item.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
