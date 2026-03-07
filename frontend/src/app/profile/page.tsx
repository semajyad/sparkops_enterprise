"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { LadderModeToggle } from "@/components/LadderModeToggle";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type AuthMePayload = {
  id: string;
  organization_id: string;
  role: string;
  full_name?: string | null;
};

export default function ProfilePage(): React.JSX.Element {
  const { user } = useAuth();
  const [details, setDetails] = useState<AuthMePayload | null>(null);
  const [ladderEnabled, setLadderEnabled] = useState(false);
  const [isSavingLadder, setIsSavingLadder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile(): Promise<void> {
      setLoading(true);
      setMessage(null);

      try {
        const [meResponse, ladderResponse] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/auth/me`, { cache: "no-store" }),
          fetch(`${API_BASE_URL}/api/twilio/ladder-mode`, { cache: "no-store" }),
        ]);

        if (meResponse.ok) {
          const mePayload = (await meResponse.json()) as AuthMePayload;
          setDetails(mePayload);
        }

        if (ladderResponse.ok) {
          const ladderPayload = (await ladderResponse.json()) as { enabled: boolean };
          setLadderEnabled(Boolean(ladderPayload.enabled));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load profile details.");
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  async function onLadderChange(next: boolean): Promise<void> {
    setIsSavingLadder(true);
    setMessage("Updating Ladder Mode...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/twilio/ladder-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to update Ladder Mode (${response.status})`);
      }

      setLadderEnabled(next);
      setMessage(next ? "Ladder Mode activated." : "Ladder Mode disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update Ladder Mode.");
    } finally {
      setIsSavingLadder(false);
    }
  }

  const displayName = details?.full_name || user?.user_metadata?.full_name || user?.email || "Sparky";

  return (
    <main className="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50 md:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-400">Profile</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{displayName}</h1>

        {loading ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading profile...
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300 sm:grid-cols-2">
          <p><span className="font-semibold text-slate-100">Email:</span> {user?.email ?? "Unknown"}</p>
          <p><span className="font-semibold text-slate-100">Role:</span> {details?.role ?? "Unknown"}</p>
          <p className="sm:col-span-2"><span className="font-semibold text-slate-100">Organization:</span> {details?.organization_id ?? "Unknown"}</p>
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Call Handling</h2>
          <LadderModeToggle enabled={ladderEnabled} disabled={isSavingLadder} onChange={(next) => void onLadderChange(next)} />
        </section>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">{message}</p> : null}
      </section>
    </main>
  );
}
