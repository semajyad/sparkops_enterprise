"use client";

import { useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type BillingEntitlements = {
  subscription_status: string;
  licensed_seats: number;
  active_users: number;
  pending_invites: number;
  total_allocated: number;
  can_add_member: boolean;
};

export default function AdminBillingPage(): React.JSX.Element {
  const [entitlements, setEntitlements] = useState<BillingEntitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/admin/billing/entitlements`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to load entitlements (${response.status})`);
      }
      const payload = await parseApiJson<BillingEntitlements>(response);
      setEntitlements(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load billing details.");
    } finally {
      setLoading(false);
    }
  }

  async function beginCheckout(mode: "base" | "seats"): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "base" ? "/api/integrations/stripe/checkout/base" : "/api/integrations/stripe/checkout/seats";
      const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          success_url: `${window.location.origin}/admin/billing?status=success`,
          cancel_url: `${window.location.origin}/admin/billing?status=cancel`,
          quantity: 1,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to start ${mode} checkout (${response.status})`);
      }
      const payload = await parseApiJson<{ url: string }>(response);
      if (!payload.url) {
        throw new Error("Stripe checkout URL missing.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open checkout.");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/integrations/stripe/portal`, {
        method: "POST",
        body: JSON.stringify({ return_url: `${window.location.origin}/admin/billing` }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Unable to open billing portal (${response.status})`);
      }
      const payload = await parseApiJson<{ url: string }>(response);
      if (!payload.url) {
        throw new Error("Stripe portal URL missing.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open billing portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
      <p className="mt-1 text-sm text-gray-600">Base owner subscription plus paid technician seat licenses.</p>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-700">
          Status: <span className="font-semibold text-gray-900">{entitlements?.subscription_status ?? "UNKNOWN"}</span>
        </p>
        <p className="text-sm text-gray-700">
          Licensed seats: <span className="font-semibold text-gray-900">{entitlements?.licensed_seats ?? 1}</span>
        </p>
        <p className="text-sm text-gray-700">
          Seat allocation: <span className="font-semibold text-gray-900">{entitlements?.total_allocated ?? 0}</span> in use ({entitlements?.active_users ?? 0} active + {entitlements?.pending_invites ?? 0} pending)
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void beginCheckout("base")}
            disabled={loading}
            className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-orange-500 hover:text-orange-600 disabled:opacity-60"
          >
            Subscribe Base Plan
          </button>
          <button
            type="button"
            onClick={() => void beginCheckout("seats")}
            disabled={loading}
            className="min-h-11 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            Buy Technician Seat
          </button>
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={loading}
            className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-orange-500 hover:text-orange-600 disabled:opacity-60"
          >
            Open Billing Portal
          </button>
        </div>
      </section>

      {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </main>
  );
}
